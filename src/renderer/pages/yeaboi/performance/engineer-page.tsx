'use client';

// One engineer's file: the three workflows, the notes, and what is on record.
//
// The workflows go through the MCP tools — each is a single LLM call with no
// progress or cancel seam, so there is nothing to stream and a spinner is the
// honest affordance.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'react-router';
import { maskText } from '@/lib/yeaboi/boards';
import {
  type EngineerFile,
  addNote,
  completeOneOnOne,
  loadEngineer,
  runPrep,
  runReview,
} from '@/lib/yeaboi/modes';
import { appendSpoken } from '@/lib/yeaboi/voice';
import { MicButton } from '@/components/yeaboi/mic-button';
import { ResultActions } from '@/components/yeaboi/result-actions';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

type Busy = '' | 'prep' | 'complete' | 'review' | 'note';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

const inputClass =
  'rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40';

function EngineerBody({ name }: { name: string }) {
  const [file, setFile] = useState<EngineerFile | null>(null);
  const [busy, setBusy] = useState<Busy>('');
  const [transcript, setTranscript] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [mask, setMask] = useState<[string, string][]>([]);
  const [anonNote, setAnonNote] = useState('');

  const reload = useCallback(
    () => loadEngineer(name).then(setFile, (e: Error) => setError(e.message)),
    [name],
  );

  useEffect(() => {
    if (name) void reload();
    // reload closes over `name`, which is the only thing it depends on.
  }, [name, reload]);

  if (!name) return <Notice title="No engineer" items={['Pick someone from the roster first.']} />;
  if (error && !file) return <Notice title={`Nothing on file for ${name}`} items={[error]} />;
  if (!file) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  async function act(
    kind: Busy,
    call: () => Promise<{ ok: boolean; error?: { message: string } }>,
  ) {
    if (busy) return;
    setBusy(kind);
    setMessage('');
    setError('');
    try {
      const envelope = await call();
      if (!envelope.ok) setError(envelope.error?.message ?? 'The run failed.');
      else {
        setMessage('Done.');
        await reload();
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  const latest = file.latest;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">{maskText(name, mask)}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {latest ? maskText(latest.title, mask) : 'Nothing on file yet.'}
          </p>
        </div>
        <Link
          href="/team/performance"
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back
        </Link>
      </header>

      {anonNote && <Notice title={anonNote} items={['Review before sharing.']} />}
      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}
      {error && <Notice title="That did not work" items={[error]} />}

      <div className="flex items-center gap-2">
        <Button disabled={Boolean(busy)} onClick={() => void act('prep', () => runPrep(name, ''))}>
          {busy === 'prep' ? 'Preparing…' : '1:1 Prep'}
        </Button>
        <Button
          variant="secondary"
          disabled={Boolean(busy)}
          onClick={() => void act('review', () => runReview(name, ''))}
        >
          {busy === 'review' ? 'Reviewing…' : '6-month review'}
        </Button>
      </div>

      {latest && (
        <Section title="Latest artifact">
          <p className="text-[12px] text-muted-foreground">{maskText(latest.title, mask)}</p>
          <ResultActions
            refer={{ kind: 'performance', session_id: name, run_id: 0 }}
            mode="performance"
            anonNote={anonNote}
            onAnonymize={(replacements, text) => {
              setMask(replacements);
              setAnonNote(text);
            }}
          />
        </Section>
      )}

      {file.open_actions.length > 0 && (
        <Section title="Open 1:1 actions">
          <ul className="space-y-1.5">
            {file.open_actions.map((action, i) => (
              <li key={`${action}-${i}`} className="text-[13px] text-muted-foreground">
                {maskText(action, mask)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Complete a 1:1">
        <p className="text-[12px] text-muted-foreground mb-2">
          Paste the notes or the transcript; yeaboi summarises it and closes the open actions.
        </p>
        <textarea
          rows={6}
          value={transcript}
          placeholder="What you talked about…"
          onChange={(e) => setTranscript(e.target.value)}
          className={`${inputClass} w-full resize-y`}
        />
        <div className="mt-3 flex items-center gap-2">
          <MicButton onText={(text) => setTranscript((prior) => appendSpoken(prior, text))} />
          <Button
            variant="secondary"
            disabled={Boolean(busy) || !transcript.trim()}
            onClick={() =>
              void act('complete', () => completeOneOnOne(name, transcript, '')).then(() =>
                setTranscript(''),
              )
            }
          >
            {busy === 'complete' ? 'Summarising…' : 'Complete'}
          </Button>
        </div>
      </Section>

      <Section title="Notes">
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={note}
            placeholder="Something worth remembering"
            onChange={(e) => setNote(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <Button
            variant="secondary"
            disabled={Boolean(busy) || !note.trim()}
            onClick={() => void act('note', () => addNote(name, note)).then(() => setNote(''))}
          >
            Add
          </Button>
        </div>
        <ul className="space-y-1.5">
          {file.notes.map((row, i) => (
            <li key={`${row.created_at}-${i}`} className="text-[13px] text-muted-foreground">
              <strong className="text-foreground">{row.created_at?.slice(0, 10)}</strong>{' '}
              {maskText(row.note ?? '', mask)}
            </li>
          ))}
        </ul>
      </Section>

      {file.history.length > 0 && (
        <Section title="History">
          <ul className="space-y-1.5">
            {file.history.map((row, i) => (
              <li key={i} className="text-[13px] text-muted-foreground">
                <strong className="text-foreground">{String(row.kind ?? '')}</strong>{' '}
                {String(row.date ?? row.created_at ?? '')}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export default function EngineerPage() {
  const [searchParams] = useSearchParams();
  /** The engineer named in `/team/performance/engineer?name=…`. */
  const name = searchParams.get('name') ?? '';
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EngineerBody name={name} />
      </div>
    </BackendGate>
  );
}
