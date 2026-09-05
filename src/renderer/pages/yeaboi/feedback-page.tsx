'use client';

// Feedback — a bug, a request, or a complaint, filed as a GitHub issue.
//
// Two panes, because there are two things to see. The left is the issue you are
// writing, set as a document rather than a form. The right is the filing slip:
// the repository, the title GitHub will show, the labels, what is attached, and
// which of the two submission paths Submit will take — stated before it is
// pressed rather than discovered after.
//
// AI Polish rewrites the draft and hands it back for comparison; it never
// submits, and it never replaces what you wrote until you say so. Submit files
// it: through the API when a GitHub token is configured, and otherwise by
// opening a pre-filled issue form in the browser, since the repository is public.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bug,
  ChevronDown,
  CircleDot,
  ExternalLink,
  FolderOpen,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Wand2,
} from 'lucide-react';
import {
  getFeedbackOptions,
  polishFeedback,
  submitFeedback,
  type FeedbackResult,
} from '@/lib/yeaboi/ambience';
import { attachmentPaths, submitLabel, type FeedbackOptions } from '@/lib/yeaboi/feedback';
import { toast } from '@/components/ui/toast';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';
import { FilingSlip, toneFor } from '@/components/feedback/filing-slip';
import {
  AttachmentTray,
  DropVeil,
  filesFrom,
  useAttachments,
} from '@/components/feedback/attachment-tray';
import { PolishPreview, type Polished } from '@/components/feedback/polish-preview';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** A mark per feedback type. The wire carries the vocabulary, never the icon. */
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bug: Bug,
  Feature: Sparkles,
  Improvement: TrendingUp,
  Other: MessageCircle,
};

const EMPTY_OPTIONS: FeedbackOptions = { types: [], areas: [], repo: '' };

interface Notice {
  tone: 'info' | 'error';
  text: string;
}

function TypePicker({
  types,
  active,
  onPick,
  disabled,
}: {
  types: string[];
  active: string;
  onPick: (type: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
      {types.map((type) => {
        const Icon = TYPE_ICONS[type] ?? CircleDot;
        const on = type === active;
        const tone = toneFor(type);
        return (
          <button
            key={type}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onPick(type)}
            style={on ? { color: tone, boxShadow: `inset 0 0 0 1px ${tone}` } : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-body text-[12px]',
              'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
              'disabled:opacity-50',
              on
                ? 'bg-secondary/40'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {type}
          </button>
        );
      })}
    </div>
  );
}

function AreaPicker({
  options,
  area,
  onPick,
  disabled,
}: {
  options: FeedbackOptions;
  area: string;
  onPick: (area: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const color = options.area_colors?.[area];

  // A popover, not a `<select>`. The native menu is drawn by the OS in the
  // OS's own style — it lands on a pale list looking like a system dialog that
  // wandered in, and none of the app's tokens reach it.
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-body text-[12px] text-muted-foreground">in</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              aria-label="Area"
              className={cn(
                'inline-flex items-center gap-2 rounded-full bg-secondary/60 py-1.5 pr-2.5 pl-3',
                'font-body text-[12px] text-foreground transition-colors',
                'hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
                disabled && 'pointer-events-none opacity-50',
              )}
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: color ?? 'var(--muted-foreground)' }}
              />
              {area}
              <ChevronDown aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent side="bottom" align="start" className="w-44 p-1">
          <div role="menu" aria-label="Area" className="flex flex-col gap-0.5">
            {options.areas.map((option) => {
              const on = option === area;
              return (
                <button
                  key={option}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  onClick={() => {
                    setOpen(false);
                    onPick(option);
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-body text-[12px] transition-colors duration-150',
                    on
                      ? 'bg-secondary/60 text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: options.area_colors?.[option] ?? 'var(--muted-foreground)',
                    }}
                  />
                  <span className="truncate">{option}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

function Outcome({
  result,
  filed,
  onAgain,
}: {
  result: FeedbackResult;
  filed: string[];
  onAgain: () => void;
}) {
  const heading = !result.ok
    ? 'Not filed yet'
    : result.via === 'api'
      ? 'Filed'
      : 'Opened in your browser';

  return (
    <section className="animate-slide-up max-w-xl space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border/60 motion-reduce:animate-none">
      <h2 className="font-display text-2xl text-foreground">{heading}</h2>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{result.message}</p>
      {result.url && (
        <a
          href={result.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-[12px] break-all text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {result.url}
        </a>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {result.ok && filed.length > 0 && (
          // The issue body names these files and asks for them to be dragged on.
          // Finding them is the part the app can actually help with — and they
          // share a directory, so revealing one reveals them all.
          <Button
            variant="outline"
            size="sm"
            onClick={() => void window.yeaboi.revealPath(filed[0]).catch(() => undefined)}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {filed.length === 1 ? 'Show the file' : 'Show the files'}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onAgain}>
          Write another
        </Button>
      </div>
    </section>
  );
}

function Skeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <span className="sr-only">Loading the feedback form…</span>
      <div className="space-y-4" aria-hidden>
        <div className="h-8 w-64 animate-pulse rounded-full bg-secondary/50" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-secondary/50" />
        <div className="h-64 w-full animate-pulse rounded-2xl bg-secondary/50" />
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-secondary/50" aria-hidden />
    </div>
  );
}

function FeedbackBody() {
  const [options, setOptions] = useState<FeedbackOptions | null>(null);
  const [kind, setKind] = useState('Bug');
  const [area, setArea] = useState('general');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState('');
  const [proposal, setProposal] = useState<Polished | null>(null);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [filed, setFiled] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [error, setError] = useState('');

  useEffect(() => {
    getFeedbackOptions().then(setOptions, (e: Error) => setError(e.message));
  }, []);

  const refuse = useCallback((text: string) => setNotice({ tone: 'error', text }), []);
  // A stable stand-in before the options land, so the tray's callbacks do not
  // churn on every render of a page that has not loaded yet.
  const { attachments, uploading, accept, remove } = useAttachments(
    options ?? EMPTY_OPTIONS,
    refuse,
  );

  const header = (
    <header className="mb-8">
      <p className="font-body text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        Bugs, requests and complaints
      </p>
      <h1 className="font-display mt-0.5 text-3xl text-foreground">Feedback</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Goes to a public issue tracker. Nothing leaves this machine until you send it.
      </p>
    </header>
  );

  if (error)
    return (
      <>
        {header}
        <p className="text-[13px] text-muted-foreground">
          Could not open the feedback form: {error}
        </p>
      </>
    );

  if (!options)
    return (
      <>
        {header}
        <Skeleton />
      </>
    );

  const ready = title.trim().length > 0 && description.trim().length > 0;
  // Two levels: a polish or submit in flight takes the whole form, but an
  // upload must not disable the textarea the screenshot was just pasted into.
  const sending = busy !== '';
  const working = sending || uploading > 0;
  const draft = { kind, area, title, description, ...attachmentPaths(attachments) };

  function polish(): void {
    setBusy('polish');
    setNotice(null);
    polishFeedback(draft)
      .then(
        (answer) => {
          if (answer.polished) setProposal(answer.polished);
          else setNotice({ tone: 'info', text: answer.status });
        },
        (e: Error) => refuse(e.message),
      )
      .finally(() => setBusy(''));
  }

  function send(): void {
    setBusy('submit');
    setNotice(null);
    const sent = [...draft.image_paths, ...draft.text_paths];
    submitFeedback(draft)
      .then(
        (answer) => {
          setResult(answer);
          setFiled(sent);
          // The panel behind the toast carries the whole message; repeating it
          // here would say the same thing twice.
          if (answer.ok)
            toast.show({
              title: answer.via === 'api' ? 'Filed' : 'Opened in your browser',
              variant: 'success',
            });
        },
        (e: Error) => refuse(e.message),
      )
      .finally(() => setBusy(''));
  }

  if (result)
    return (
      <>
        {header}
        <Outcome
          result={result}
          filed={filed}
          onAgain={() => {
            setResult(null);
            setTitle('');
            setDescription('');
            setNotice(null);
            for (const a of attachments) remove(a.path);
          }}
        />
      </>
    );

  // Stacked under the composer on a narrow window, the slip keeps its shape
  // rather than stretching to the full width of the page.
  const slip = (
    <FilingSlip
      options={options}
      kind={kind}
      area={area}
      title={title}
      attachments={attachments}
      className="animate-slide-up max-w-sm lg:sticky lg:top-10 lg:max-w-none motion-reduce:animate-none"
      actions={
        proposal ? null : (
          <>
            <Button className="w-full" disabled={!ready || working} onClick={send}>
              {busy === 'submit' ? 'Sending…' : submitLabel(options.has_github_token)}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={!ready || working}
              onClick={polish}
            >
              <Wand2 className="h-3.5 w-3.5" />
              {busy === 'polish' ? 'Polishing…' : 'AI Polish'}
            </Button>
          </>
        )
      }
    />
  );

  return (
    <>
      {header}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {proposal ? (
          <PolishPreview
            mine={{ title, description }}
            polished={proposal}
            onUse={() => {
              setTitle(proposal.title);
              setDescription(proposal.description);
              setProposal(null);
            }}
            onKeep={() => setProposal(null)}
          />
        ) : (
          <div
            className="animate-slide-up relative space-y-5 motion-reduce:animate-none"
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              if (event.dataTransfer.types.includes('Files')) setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              accept(filesFrom(event.dataTransfer));
            }}
            onPaste={(event) => {
              const files = filesFrom(event.clipboardData);
              if (files.length === 0) return;
              event.preventDefault();
              accept(files);
            }}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && ready && !working)
                send();
            }}
          >
            {dragging && <DropVeil label="Drop to attach a screenshot or a log" />}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <TypePicker types={options.types} active={kind} onPick={setKind} disabled={working} />
              <AreaPicker options={options} area={area} onPick={setArea} disabled={working} />
            </div>

            {/* The sheet the issue is written on. The fields keep no chrome of
                their own — the rules between them are what separates one from
                the next, as they would on the issue itself. */}
            <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/60">
              <div className="border-b border-border/50 px-5 py-4">
                <label htmlFor="feedback-title" className="sr-only">
                  Title
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={title}
                  disabled={sending}
                  placeholder="What went wrong, in one line"
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full border-0 bg-transparent font-body text-[19px] leading-snug font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/45"
                />
              </div>

              <div className="px-5 py-4">
                <label htmlFor="feedback-description" className="sr-only">
                  What happened
                </label>
                <textarea
                  id="feedback-description"
                  rows={12}
                  value={description}
                  disabled={sending}
                  placeholder="What you did. What you expected. What happened instead."
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full resize-none border-0 bg-transparent text-[13.5px] leading-relaxed text-foreground/95 outline-none placeholder:text-muted-foreground/45"
                />
              </div>

              <div className="border-t border-border/50 bg-secondary/25 px-5 py-3.5">
                <AttachmentTray
                  options={options}
                  attachments={attachments}
                  uploading={uploading}
                  onAccept={accept}
                  onRemove={remove}
                  disabled={working}
                />
              </div>
            </div>

            <p aria-live="polite" className="min-h-[1rem] text-[12px]">
              {notice && (
                <span
                  className={notice.tone === 'error' ? 'text-destructive' : 'text-muted-foreground'}
                >
                  {notice.text}
                </span>
              )}
            </p>
          </div>
        )}
        {slip}
      </div>
    </>
  );
}

export default function FeedbackPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-5xl px-6 pt-10 pb-28">
        <FeedbackBody />
      </div>
    </BackendGate>
  );
}
