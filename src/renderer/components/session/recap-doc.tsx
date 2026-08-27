'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ListChecks,
  HelpCircle,
  Quote,
  BookOpen,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

import { useAuthFetch } from '@/hooks/use-auth-fetch';

export interface ExtractedItem {
  text: string;
  ts: string | null;
}

export interface Highlight {
  quote: string;
  speaker: string | null;
  ts: string | null;
}

export interface ChapterSummary {
  label: string;
  start_ts: string | null;
  end_ts: string | null;
  summary: string;
}

export interface SessionExtraction {
  summary: string;
  highlights: Highlight[];
  decisions: ExtractedItem[];
  action_items: ExtractedItem[];
  open_questions: ExtractedItem[];
  chapter_summaries: ChapterSummary[];
}

/** Client-derived chapter (from "Switched to **X**" markers in the live
 *  message stream). Used to render the Chapters section when the backend
 *  hasn't produced AI summaries yet (or for older sessions). */
export interface ClientChapter {
  id: string;
  label: string;
  startTs: string;
  endTs: string;
}

interface RecapDocProps {
  sessionId: string;
  chapters: ClientChapter[];
  onSeekTo: (isoTs: string) => void;
  canRegenerate?: boolean;
  /** Fired when the extraction loads/regenerates so the parent can grab a
   *  fresh copy (e.g. for the "Copy as Markdown" action). */
  onDataLoaded?: (data: SessionExtraction) => void;
  /** Override the default outer container styling. The default
   *  (`mx-auto max-w-[820px] px-8 py-10`) suits the full-screen recap modal.
   *  Inline embeds (e.g. the completed-session summary page) can pass an
   *  empty string or their own padding to fit the surrounding layout. */
  containerClassName?: string;
}

const SECTION_IDS = {
  tldr: 'recap-tldr',
  moments: 'recap-moments',
  decisions: 'recap-decisions',
  actions: 'recap-actions',
  questions: 'recap-questions',
  chapters: 'recap-chapters',
} as const;

const EMPTY_EXTRACTION: SessionExtraction = {
  summary: '',
  highlights: [],
  decisions: [],
  action_items: [],
  open_questions: [],
  chapter_summaries: [],
};

export function RecapDoc({
  sessionId,
  chapters,
  onSeekTo,
  canRegenerate,
  onDataLoaded,
  containerClassName = 'mx-auto max-w-[820px] px-8 py-10',
}: RecapDocProps) {
  const { authFetch, ready } = useAuthFetch();
  const [data, setData] = useState<SessionExtraction>(EMPTY_EXTRACTION);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await authFetch(`/api/sessions/${sessionId}/extraction`);
        if (!cancelled && resp.ok) {
          const fresh = (await resp.json()) as SessionExtraction;
          setData(fresh);
          onDataLoaded?.(fresh);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessionId]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const resp = await authFetch(`/api/sessions/${sessionId}/extraction/regenerate`, {
        method: 'POST',
      });
      if (resp.ok) {
        const fresh = (await resp.json()) as SessionExtraction;
        setData(fresh);
        onDataLoaded?.(fresh);
      }
    } finally {
      setRegenerating(false);
    }
  };

  // Merge backend chapter summaries with client-derived chapter ranges. Keys
  // off label + start_ts so we still display the chapter even when AI didn't
  // produce a summary for it.
  const mergedChapters = useMemo(() => {
    const summaryByLabel = new Map(data.chapter_summaries.map((c) => [c.label.toLowerCase(), c]));
    return chapters.map((c) => {
      const match = summaryByLabel.get(c.label.toLowerCase());
      return {
        ...c,
        summary: match?.summary ?? '',
      };
    });
  }, [chapters, data.chapter_summaries]);

  const totalItems =
    data.decisions.length +
    data.action_items.length +
    data.open_questions.length +
    data.highlights.length +
    (data.summary ? 1 : 0);

  return (
    <div className={containerClassName}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground/70">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading recap…
        </div>
      ) : totalItems === 0 && mergedChapters.length === 0 ? (
        <EmptyRecap
          onRegenerate={canRegenerate ? regenerate : undefined}
          regenerating={regenerating}
        />
      ) : (
        <article className="space-y-12">
          {data.summary && <TldrSection summary={data.summary} />}
          {data.highlights.length > 0 && (
            <HighlightsSection highlights={data.highlights} onSeekTo={onSeekTo} />
          )}
          <ItemsSection
            id={SECTION_IDS.decisions}
            label="Decisions"
            Icon={CheckCircle2}
            tone="text-success"
            items={data.decisions}
            onSeekTo={onSeekTo}
          />
          <ItemsSection
            id={SECTION_IDS.actions}
            label="Action items"
            Icon={ListChecks}
            tone="text-warning"
            items={data.action_items}
            onSeekTo={onSeekTo}
            bulletStyle="checkbox"
          />
          <ItemsSection
            id={SECTION_IDS.questions}
            label="Open questions"
            Icon={HelpCircle}
            tone="text-info"
            items={data.open_questions}
            onSeekTo={onSeekTo}
          />
          {mergedChapters.length > 0 && (
            <ChaptersSection chapters={mergedChapters} onSeekTo={onSeekTo} />
          )}
          {canRegenerate && (
            <div className="pt-4 border-t border-border/40">
              <button
                type="button"
                onClick={regenerate}
                disabled={regenerating}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-foreground/90 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${regenerating ? 'animate-spin' : ''}`} />
                Regenerate recap
              </button>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Re-runs extraction over the full transcript. Use this if the recap looks stale.
              </p>
            </div>
          )}
        </article>
      )}
    </div>
  );
}

function TldrSection({ summary }: { summary: string }) {
  return (
    <section id={SECTION_IDS.tldr}>
      <SectionHeading Icon={Sparkles} tone="text-foreground/80">
        TL;DR
      </SectionHeading>
      <p className="text-[17px] leading-[1.7] text-foreground/90">{summary}</p>
    </section>
  );
}

function HighlightsSection({
  highlights,
  onSeekTo,
}: {
  highlights: Highlight[];
  onSeekTo: (ts: string) => void;
}) {
  return (
    <section id={SECTION_IDS.moments}>
      <SectionHeading Icon={Quote} tone="text-purple-400">
        Key moments <Count n={highlights.length} />
      </SectionHeading>
      <ul className="space-y-4">
        {highlights.map((h, i) => (
          <li
            key={i}
            className="rounded-lg border-l-2 border-purple-400/50 bg-foreground/[0.03] pl-5 pr-4 py-3"
          >
            <p className="text-[15px] leading-[1.65] text-foreground/95 italic">
              &ldquo;{h.quote}&rdquo;
            </p>
            <div className="mt-2 flex items-center gap-2.5 text-[12px] text-muted-foreground/80">
              {h.speaker && <span className="font-medium">{h.speaker}</span>}
              {h.ts && <TimestampChip ts={h.ts} onSeekTo={onSeekTo} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemsSection({
  id,
  label,
  Icon,
  tone,
  items,
  onSeekTo,
  bulletStyle,
}: {
  id: string;
  label: string;
  Icon: typeof CheckCircle2;
  tone: string;
  items: ExtractedItem[];
  onSeekTo: (ts: string) => void;
  bulletStyle?: 'checkbox';
}) {
  return (
    <section id={id}>
      <SectionHeading Icon={Icon} tone={tone}>
        {label} <Count n={items.length} />
      </SectionHeading>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground/50 pl-1">— None captured</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-3">
              <Bullet style={bulletStyle} />
              <button
                type="button"
                onClick={() => it.ts && onSeekTo(it.ts)}
                disabled={!it.ts}
                className="text-[15px] leading-[1.55] text-foreground/90 hover:text-foreground text-left transition-colors disabled:cursor-default flex-1"
              >
                {it.text}
                {it.ts && (
                  <span className="ml-2 text-[11px] text-muted-foreground/55 tabular-nums">
                    {formatTimeChip(it.ts)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ChaptersSection({
  chapters,
  onSeekTo,
}: {
  chapters: Array<ClientChapter & { summary: string }>;
  onSeekTo: (ts: string) => void;
}) {
  return (
    <section id={SECTION_IDS.chapters}>
      <SectionHeading Icon={BookOpen} tone="text-info">
        Chapters <Count n={chapters.length} />
      </SectionHeading>
      <ol className="space-y-5">
        {chapters.map((c, i) => (
          <li key={c.id} className="flex gap-4">
            <span className="text-[13px] text-muted-foreground/50 tabular-nums shrink-0 pt-1 font-mono">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSeekTo(c.startTs)}
                className="text-[15px] font-semibold text-foreground/95 hover:text-foreground text-left transition-colors"
              >
                {c.label}
                <span className="ml-2.5 text-[11px] text-muted-foreground/55 tabular-nums font-normal">
                  {formatTimeChip(c.startTs)}
                </span>
              </button>
              {c.summary && (
                <p className="mt-1 text-[14px] leading-[1.65] text-foreground/75">{c.summary}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SectionHeading({
  Icon,
  tone,
  children,
}: {
  Icon: typeof CheckCircle2;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      className={`mb-4 flex items-center gap-2.5 text-[13px] uppercase tracking-[0.12em] font-semibold ${tone}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </h3>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ml-0.5 text-muted-foreground/40 font-normal">({n})</span>;
}

function Bullet({ style }: { style?: 'checkbox' }) {
  if (style === 'checkbox') {
    return (
      <span
        aria-hidden
        className="mt-1.5 h-3 w-3 rounded-sm border border-warning/50 bg-warning/5 shrink-0"
      />
    );
  }
  return <span aria-hidden className="mt-2 h-1 w-1 rounded-full bg-muted-foreground/40 shrink-0" />;
}

function TimestampChip({ ts, onSeekTo }: { ts: string; onSeekTo: (ts: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSeekTo(ts)}
      className="rounded px-1.5 py-0.5 bg-foreground/[0.05] hover:bg-foreground/[0.10] tabular-nums transition-colors"
      title="Jump to this moment in the transcript"
    >
      {formatTimeChip(ts)}
    </button>
  );
}

function formatTimeChip(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function EmptyRecap({
  onRegenerate,
  regenerating,
}: {
  onRegenerate?: () => void;
  regenerating: boolean;
}) {
  const previewSections: Array<{
    Icon: typeof CheckCircle2;
    tone: string;
    label: string;
    lines: number;
  }> = [
    { Icon: Sparkles, tone: 'text-foreground/40', label: 'TL;DR', lines: 2 },
    { Icon: Quote, tone: 'text-purple-400/50', label: 'Key moments', lines: 3 },
    { Icon: CheckCircle2, tone: 'text-success/60', label: 'Decisions', lines: 2 },
    { Icon: ListChecks, tone: 'text-warning/60', label: 'Action items', lines: 2 },
    { Icon: HelpCircle, tone: 'text-info/60', label: 'Open questions', lines: 1 },
    { Icon: BookOpen, tone: 'text-info/50', label: 'Chapters', lines: 2 },
  ];

  return (
    <div className="space-y-10">
      {/* Hero card */}
      <div className="rounded-2xl border border-border/60 bg-foreground/[0.02] px-8 py-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/[0.05]">
          <Sparkles className="h-6 w-6 text-foreground/60 animate-pulse" />
        </div>
        <p className="text-lg font-semibold text-foreground/90 mb-1.5">Recap is being prepared</p>
        <p className="text-[14px] text-muted-foreground/75 max-w-md mx-auto leading-relaxed">
          We&apos;re reading through the conversation to surface decisions, key moments, action
          items, open questions, and chapter summaries.
        </p>
        {onRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-info/15 px-4 py-2 text-[13px] font-medium text-info ring-1 ring-info/30 hover:bg-info/20 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            {regenerating ? 'Running extraction…' : 'Run extraction now'}
          </button>
        )}
      </div>

      {/* Skeleton preview — communicates the layout the user will see when ready. */}
      <div className="space-y-10 opacity-50">
        {previewSections.map((s) => (
          <section key={s.label}>
            <SectionHeading Icon={s.Icon} tone={s.tone}>
              {s.label}
            </SectionHeading>
            <div className="space-y-2.5">
              {Array.from({ length: s.lines }).map((_, i) => (
                <div
                  key={i}
                  className="h-3.5 rounded-md bg-foreground/[0.05]"
                  style={{ width: `${75 + ((i * 7) % 20)}%` }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/** Sticky mini-table-of-contents for the recap doc. Rendered on `xl+` screens
 *  alongside the doc; clicks scroll-to anchor via the section IDs. Always
 *  shows the full layout (even before extraction completes) so the empty
 *  state communicates what's coming. */
export function RecapToc({ data }: { data: SessionExtraction | null }) {
  const entries: Array<{ id: string; label: string; Icon: typeof CheckCircle2; tone: string }> = [
    { id: SECTION_IDS.tldr, label: 'TL;DR', Icon: Sparkles, tone: 'text-foreground/70' },
    { id: SECTION_IDS.moments, label: 'Key moments', Icon: Quote, tone: 'text-purple-400' },
    { id: SECTION_IDS.decisions, label: 'Decisions', Icon: CheckCircle2, tone: 'text-success' },
    { id: SECTION_IDS.actions, label: 'Action items', Icon: ListChecks, tone: 'text-warning' },
    { id: SECTION_IDS.questions, label: 'Open questions', Icon: HelpCircle, tone: 'text-info' },
    { id: SECTION_IDS.chapters, label: 'Chapters', Icon: BookOpen, tone: 'text-info' },
  ];

  const counts: Record<string, number> = data
    ? {
        [SECTION_IDS.tldr]: data.summary ? 1 : 0,
        [SECTION_IDS.moments]: data.highlights.length,
        [SECTION_IDS.decisions]: data.decisions.length,
        [SECTION_IDS.actions]: data.action_items.length,
        [SECTION_IDS.questions]: data.open_questions.length,
        [SECTION_IDS.chapters]: data.chapter_summaries.length,
      }
    : {};

  return (
    <nav className="sticky top-6 space-y-1">
      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60 font-semibold mb-3">
        Recap
      </p>
      {entries.map((e) => {
        const n = counts[e.id] ?? 0;
        return (
          <a
            key={e.id}
            href={`#${e.id}`}
            className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground/80 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
          >
            <e.Icon className={`h-3.5 w-3.5 ${e.tone}`} />
            <span className="flex-1">{e.label}</span>
            {data && n > 0 && (
              <span className="text-[11px] text-muted-foreground/50 tabular-nums">{n}</span>
            )}
          </a>
        );
      })}
    </nav>
  );
}
