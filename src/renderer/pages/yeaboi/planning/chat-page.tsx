'use client';

// The planning chat — the transcript, the stage rail, and one composer.
//
// A turn is an NDJSON stream: tokens animate a pending bubble, the finished
// reply replaces it, and `done` carries the new stage. The reducer that turns
// lines into bubbles lives in lib/yeaboi/chat.ts so it can be tested without
// a DOM.
//
// Slash commands never reach the model: they are parsed here and either become
// a local action or a literal the intake node consumes. That is the terminal's
// security invariant, and it holds here for the same reason — there is nothing
// to guard when no text is sent.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSearchParams } from 'react-router';
import { Duck } from '@design/primitives/Duck';
import {
  type Bubble,
  type ChatLine,
  type QuestionView,
  STAGE_RAIL,
  type Stage,
  attachImage,
  bubblesOf,
  cancelTurn,
  loadChat,
  reduceTurn,
  sendTurn,
  stageLabel,
  switchSize,
} from '@/lib/yeaboi/chat';
import {
  completionFor,
  matchingCommands,
  parseCommand,
  unknownCommandNotice,
} from '@/lib/yeaboi/commands';
import { getAmbience, setAmbience } from '@/lib/yeaboi/ambience';
import { openShortcuts } from '@/lib/yeaboi/palette';
import { appendSpoken, toBase64 } from '@/lib/yeaboi/voice';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { MicButton } from '@/components/yeaboi/mic-button';
import { QuestionsPanel } from '@/components/yeaboi/questions-panel';
import { Button } from '@/components/ui/button';

const ARTIFACT_TITLES: Record<string, string> = {
  intake_summary: 'Your answers',
  prior_art: 'Prior art',
  analysis: 'Project analysis',
  epic: 'Project epic',
  features: 'Epics',
  stories: 'User stories',
  tasks: 'Tasks',
  sprints: 'Sprint plan',
  recap: 'The plan',
};

function ChatBody({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [question, setQuestion] = useState<QuestionView | null>(null);
  const [stage, setStage] = useState<Stage>('intake');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [opId, setOpId] = useState('');
  const [error, setError] = useState('');
  // A dim local line — what the terminal calls a note. Never a graph turn.
  const [notice, setNotice] = useState('');
  const [questions, setQuestions] = useState(false);
  // Paths in the order they were pasted; their `[image #N]` chips name them.
  const [attachments, setAttachments] = useState<string[]>([]);
  const [duckOn, setDuckOn] = useState(true);
  const foot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) {
      setError('No conversation was named — start one from Planning.');
      return;
    }
    loadChat(projectId).then(
      (view) => {
        setBubbles(bubblesOf(view.transcript));
        setQuestion(view.question);
        setStage(view.stage);
        // A conversation opened from Planning still owes its first turn: the
        // description has to reach the graph as messages[0] or the intake has
        // nothing to plan.
        if (view.opening) void send(view.opening);
      },
      (e: Error) => setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' });
  }, [bubbles, pending]);

  useEffect(() => {
    getAmbience().then(
      (state) => setDuckOn(state.duck.enabled),
      () => undefined,
    );
  }, []);

  /**
   * A screenshot pasted into the box.
   *
   * The image is kept backend-side and what lands in the text is its chip, so
   * deleting the chip detaches the image — the terminal's rule, and the reason
   * the whole attachment list travels with every turn.
   */
  async function paste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.clipboardData?.items ?? [])
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile();
    if (!file) return; // ordinary text — let the browser paste it
    event.preventDefault();
    setNotice('Pasting image…');
    try {
      const encoded = await toBase64(file);
      const { path, chip } = await attachImage(
        projectId,
        encoded,
        file.type,
        attachments.length + 1,
      );
      setAttachments((prior) => [...prior, path]);
      setDraft((prior) => (prior ? `${prior} ${chip}` : chip));
      setNotice('');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  /** A composer submission: a command runs locally, anything else is a turn. */
  async function submit(text: string) {
    const intent = parseCommand(text);
    if (!intent) return send(text);
    setDraft('');
    setNotice('');
    switch (intent.kind) {
      case 'shortcuts':
        return openShortcuts();
      case 'export':
        router.push(`/humans/planning/plan?id=${encodeURIComponent(projectId)}`);
        return;
      case 'questions':
        setQuestions(true);
        return;
      case 'summary':
        // The card the terminal pushes: the answers so far, opened in full
        // from the plan rather than reprinted into the transcript.
        setBubbles((prior) => [...prior, { role: 'card', text: '', kind: 'intake_summary' }]);
        return;
      case 'duck':
        return duck();
      case 'size':
        return size(intent.mode);
      case 'send':
        return send(intent.text);
      default:
        setNotice(unknownCommandNotice(intent.name));
    }
  }

  async function duck() {
    try {
      const state = await setAmbience({ duck_enabled: !duckOn });
      setDuckOn(state.duck.enabled);
      setNotice(state.duck.enabled ? 'The duck has its voice back.' : 'Duck muted.');
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function size(mode: 'small_project' | 'smart') {
    const label = mode === 'small_project' ? 'Small' : 'Large';
    try {
      const result = await switchSize(projectId, mode);
      if (!result.changed) {
        setNotice(`Already planning ${label}.`);
        return;
      }
      setNotice(`Switched to ${label} — I kept all your answers.`);
      // The switch reopens the intake for the new mode, so one empty turn
      // gets the first question for it — the terminal's re-entry, unchanged.
      if (result.reopened) await send('', { synthetic: true });
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  /** `synthetic` sends an empty turn — the graph re-entry a size switch needs. */
  async function send(text: string, { synthetic = false }: { synthetic?: boolean } = {}) {
    if (busy) return;
    if (!text.trim() && !attachments.length && !synthetic) return;
    setBusy(true);
    setError('');
    setNotice('');
    setDraft('');
    const sent = attachments;
    setAttachments([]);
    if (text) setBubbles((prior) => [...prior, { role: 'user', text }]);
    const lines: ChatLine[] = [];
    let streamed = '';
    try {
      await sendTurn(
        projectId,
        text,
        (line) => {
          lines.push(line);
          if (line.type === 'op') setOpId(line.op_id);
          else if (line.type === 'token') {
            streamed += line.text;
            setPending(streamed);
          }
        },
        sent,
      );
    } catch (e) {
      setError((e as Error).message);
    }
    const turn = reduceTurn(lines);
    setPending('');
    setOpId('');
    setBusy(false);
    if (turn.error) setError(turn.error);
    if (turn.cancelled) setError('Cancelled — nothing was changed.');
    if (turn.bubbles.length) setBubbles((prior) => [...prior, ...turn.bubbles]);
    if (turn.stage) setStage(turn.stage);
    // The question view (choices, progress, the phase label) is derived from
    // the state the turn just produced, so it is re-read rather than guessed.
    loadChat(projectId).then(
      (view) => setQuestion(view.question),
      () => undefined,
    );
  }

  const choices = !busy && question?.choices ? question.choices : null;
  // The /-menu, on the same rule the terminal uses: a leading slash on the
  // first line. A slash anywhere else is prose ("http://…", "and/or").
  const menu = busy || draft.includes('\n') ? [] : matchingCommands(draft);

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col">
      <header className="border-b border-border/60 px-6 py-3">
        <div className="flex items-center gap-1.5">
          {STAGE_RAIL.map((step) => (
            <span
              key={step.stage}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-body ${
                step.stage === stage
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'text-muted-foreground/60'
              }`}
            >
              {step.label}
            </span>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {question?.progress || stageLabel(stage)}
          {question?.phase_label ? ` · ${question.phase_label}` : ''}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {bubbles.map((bubble, index) => (
          <Row
            key={`${index}-${bubble.role}-${bubble.kind ?? ''}`}
            bubble={bubble}
            projectId={projectId}
          />
        ))}
        {pending && (
          <div className="max-w-[75%] rounded-2xl bg-card ring-1 ring-border/60 px-4 py-2.5">
            <p className="text-[13px] text-foreground whitespace-pre-wrap">{pending}</p>
          </div>
        )}
        {busy && !pending && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Duck state="idle" size={22} />
            <span className="text-[12px]">Thinking…</span>
          </div>
        )}
        <div ref={foot} />
      </div>

      {error && <p className="px-6 text-[12px] text-destructive">{error}</p>}
      {notice && <p className="px-6 text-[12px] text-muted-foreground">{notice}</p>}

      {choices && (
        <div className="flex flex-wrap gap-1.5 px-6 pb-2">
          {choices.map(([label], index) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              onClick={() => void send(label)}
              className="rounded-full bg-secondary/60 px-3 py-1 text-[12px] text-foreground transition-colors hover:bg-primary/15 hover:text-primary"
            >
              <span className="mr-1.5 text-muted-foreground/70">{index + 1}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="border-t border-border/60 px-6 py-3">
        {menu.length > 0 && (
          <ul className="mb-2 overflow-hidden rounded-xl bg-card ring-1 ring-border/60">
            {menu.map((command, index) => (
              <li key={command.name}>
                <button
                  type="button"
                  onClick={() => void submit(`/${command.name}`)}
                  className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left transition-colors hover:bg-secondary/50 ${
                    index === 0 ? 'bg-secondary/30' : ''
                  }`}
                >
                  <span className="font-mono text-[12px] text-primary">/{command.name}</span>
                  <span className="text-[11px] text-muted-foreground">{command.help}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          rows={3}
          placeholder={
            busy
              ? 'Working — your message sends when this finishes…'
              : 'Message yeaboi… (/ for commands)'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={(e) => void paste(e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              // A half-typed verb completes rather than submitting.
              const complete = completionFor(draft);
              if (complete) setDraft(`/${complete.name}`);
              else void submit(draft);
            } else if (e.key === 'Escape' && menu.length) {
              e.preventDefault();
              setDraft('');
            }
          }}
          className="w-full rounded-2xl bg-card ring-1 ring-border/60 px-4 py-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-primary/40"
        />
        <div className="mt-2 flex items-center gap-3">
          <MicButton
            disabled={busy}
            onText={(text) => setDraft((prior) => appendSpoken(prior, text))}
          />
          <span className="flex-1 text-[11px] text-muted-foreground/70">
            Enter sends · Shift+Enter for a new line · / for commands
            {attachments.length
              ? ` · ${attachments.length} image${attachments.length > 1 ? 's' : ''} attached`
              : ''}
          </span>
          {busy && opId ? (
            <Button variant="outline" size="sm" onClick={() => void cancelTurn(opId)}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={!draft.trim() && !attachments.length}
              onClick={() => void submit(draft)}
            >
              Send
            </Button>
          )}
        </div>
      </div>

      {questions && (
        <QuestionsPanel
          projectId={projectId}
          busy={busy}
          onAsk={(number) => void send(`edit ${number}`)}
          onClose={() => setQuestions(false)}
        />
      )}
    </div>
  );
}

function Row({ bubble, projectId }: { bubble: Bubble; projectId: string }) {
  if (bubble.role === 'card') {
    return (
      <div className="max-w-[75%] rounded-2xl bg-primary/5 ring-1 ring-primary/25 px-4 py-2.5">
        <strong className="block text-[12px] font-body font-medium text-foreground">
          {ARTIFACT_TITLES[bubble.kind ?? ''] ?? bubble.kind}
        </strong>
        <Link
          href={`/humans/planning/plan?id=${encodeURIComponent(projectId)}`}
          className="text-[11px] text-primary hover:underline"
        >
          Open the plan to read this in full →
        </Link>
      </div>
    );
  }
  const mine = bubble.role === 'user';
  return (
    <div className={mine ? 'flex justify-end' : ''}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
          mine ? 'bg-primary/15 text-foreground' : 'bg-card ring-1 ring-border/60'
        }`}
      >
        <p className="text-[13px] text-foreground whitespace-pre-wrap">{bubble.text}</p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('id') ?? '';
  return (
    <BackendGate>
      {/* Keyed so switching conversations remounts with clean state. */}
      <ChatBody key={projectId} projectId={projectId} />
    </BackendGate>
  );
}
