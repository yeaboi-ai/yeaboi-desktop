'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Kanban,
  Loader2,
  MessageSquare,
  Sparkles,
  Users,
} from 'lucide-react';

import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { RecapDoc, type ClientChapter } from '@/components/session/recap-doc';
import { FeedbackButtons } from '@/components/ui/feedback-buttons';
import { RecapScreen, buildRecapEntries } from '@/components/session/recap-screen';
import { SessionReview } from '@/components/blueprint/session-review';
import { AGENT_STATUS_STYLES } from '@/components/kanban/card';

type Card = {
  id: string;
  title?: string | null;
  status?: string | null;
  agent_status?: string | null;
  session_id?: string | null;
  wave?: number | null;
  depends_on?: string[];
  related_to?: string[];
};
type BoardColumn = { cards?: Card[] };
type BoardResponse = { columns?: BoardColumn[] };

type Participant = {
  id: string;
  user_id: string;
  role: string;
  user_name?: string | null;
  user_email?: string | null;
};

type SessionResp = {
  id: string;
  title?: string | null;
  status?: string | null;
  updated_at?: string | null;
  participants?: Participant[];
  blueprint_review_status?: 'none' | 'pending' | 'completed';
};

type Message = {
  id: string;
  content: string;
  message_type: string;
  user_id: string | null;
  speaker_name?: string | null;
  created_at: string;
  attachments?: Array<Record<string, unknown>> | null;
};

type SnapshotListItem = {
  id: string;
  version_number: number;
  session_id?: string | null;
  changed_sections?: string[];
  created_at: string;
};

type SnapshotDetail = {
  id: string;
  version_number: number;
  content: Record<string, string>;
};

const SECTION_LABELS: Record<string, string> = {
  problem: 'Problem',
  users_personas: 'Users & Personas',
  solution: 'Solution',
  scope: 'Scope',
  tech_stack: 'Tech Stack',
  ui_ux: 'UI / UX',
  metrics: 'Metrics',
  risks: 'Risks',
  open_questions: 'Open Questions',
};

function prettySection(slug: string): string {
  return SECTION_LABELS[slug] || slug.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function SessionCompletedPage({ params }: { params: Promise<{ id: string }> }) {
  // One session is the workspace and the conversation, so one id serves both.
  const { id } = use(params);
  const projectId = id;
  const sessionId = id;
  const { authFetch } = useAuthFetch();
  const [session, setSession] = useState<SessionResp | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [linkedCards, setLinkedCards] = useState<Card[]>([]);
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [waveCount, setWaveCount] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotDetail | null>(null);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [recapOpen, setRecapOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [sessResp, msgResp, boardResp, snapsResp] = await Promise.all([
        authFetch(`/api/sessions/${sessionId}`).then((r) => (r.ok ? r.json() : null)),
        authFetch(`/api/sessions/${sessionId}/messages`).then((r) => (r.ok ? r.json() : [])),
        authFetch(`/api/sessions/${projectId}/board`).then((r) => (r.ok ? r.json() : null)),
        authFetch(`/api/sessions/${projectId}/blueprint/snapshots?limit=200`).then((r) =>
          r.ok ? r.json() : [],
        ),
      ]);

      if (cancelled) return;

      if (sessResp) setSession(sessResp as SessionResp);
      if (Array.isArray(msgResp)) setMessages(msgResp as Message[]);

      if (boardResp && (boardResp as BoardResponse).columns) {
        const cards: Card[] = (boardResp as BoardResponse).columns!.flatMap((c) => c.cards || []);
        const sessionCards = cards.filter((c) => c.session_id === sessionId);
        const useCards = sessionCards.length > 0 ? sessionCards : cards;
        setTaskCount(useCards.length);
        const waves = new Set<number>();
        for (const c of useCards) if (c.wave != null) waves.add(c.wave);
        setWaveCount(waves.size || null);
        // Linked-cards section only renders cards explicitly attributed to this
        // session — the project-wide fallback above is only for the headline count.
        setLinkedCards(sessionCards);
      }

      if (Array.isArray(snapsResp)) {
        const list = snapsResp as SnapshotListItem[];
        const match = list.find((s) => s.session_id === sessionId);
        if (match) {
          setSnapshotMeta(match);
          const detailResp = await authFetch(
            `/api/sessions/${projectId}/blueprint/snapshots/${match.id}`,
          );
          if (detailResp.ok && !cancelled) {
            const detail = (await detailResp.json()) as SnapshotDetail;
            setSnapshot(detail);
          }
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, sessionId, authFetch]);

  const messageCount = messages.length;
  const { callStartedAt, durationSeconds } = useMemo(() => {
    if (messages.length === 0) return { callStartedAt: 0, durationSeconds: 0 };
    const first = new Date(messages[0].created_at).getTime();
    const last = new Date(messages[messages.length - 1].created_at).getTime();
    return {
      callStartedAt: first,
      durationSeconds: Math.max(0, Math.round((last - first) / 1000)),
    };
  }, [messages]);

  // Client-derived chapters from "Switched to **X**" markers in the message
  // history. Mirrors the derivation in `RecapScreen` so the inline doc on
  // this page shows the same chapter list as the full-screen recap.
  const recapChapters = useMemo<ClientChapter[]>(() => {
    const entries = buildRecapEntries(messages);
    const markers: Array<{ idx: number; label: string }> = [];
    entries.forEach((e, idx) => {
      if (!e.speaker_name && e.text.startsWith('Switched to ')) {
        const label = e.text
          .replace(/^Switched to /, '')
          .replace(/\*\*/g, '')
          .trim();
        markers.push({ idx, label });
      }
    });
    if (markers.length === 0) return [];
    return markers.map((m, i) => {
      const start = entries[m.idx]?.created_at ?? entries[0]?.created_at ?? '';
      const nextIdx = markers[i + 1]?.idx ?? entries.length - 1;
      const end = entries[nextIdx]?.created_at ?? start;
      return { id: `chapter-${i}`, label: m.label, startTs: start, endTs: end };
    });
  }, [messages]);

  const completedDate = formatDate(session?.updated_at);
  const participants = session?.participants ?? [];

  // Auto-open recap when arriving via ?recap=1 (project page recap shortcut).
  // Mirrors the same deep-link pattern used by the live session page so the
  // shortcut behaves identically whether the session is live or completed.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('recap') && messages.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecapOpen(true);
      params.delete('recap');
      const qs = params.toString();
      const next = window.location.pathname + (qs ? `?${qs}` : '');
      window.history.replaceState({}, '', next);
    }
  }, [messages.length]);

  return (
    <div className="min-h-screen w-screen bg-background flex flex-col border-t-2 border-success/30">
      <div className="border-b border-border px-6 py-5 shrink-0">
        <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-1.5">
          Session Complete
        </p>
        <div className="flex items-baseline gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <h1 className="font-display text-2xl italic leading-tight text-foreground">
            {session?.title || 'Planning session'}
          </h1>
          <span className="text-[10px] uppercase tracking-wider text-success/80 px-2 py-0.5 rounded bg-success/10 border border-success/20">
            wrapped up
          </span>
        </div>

        {/* Metadata row */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-3 text-[11px] font-body text-muted-foreground">
            {messageCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {messageCount} {messageCount === 1 ? 'message' : 'messages'}
              </span>
            )}
            {durationSeconds > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDuration(durationSeconds)}
              </span>
            )}
            {participants.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {participants.length} {participants.length === 1 ? 'participant' : 'participants'}
              </span>
            )}
            {completedDate && (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                completed {completedDate}
              </span>
            )}
          </div>

          {participants.length > 0 && (
            <div className="flex -space-x-1.5">
              {participants.slice(0, 5).map((p) => (
                <span
                  key={p.id}
                  title={p.user_name || p.user_email || 'Participant'}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[9px] font-medium text-foreground/70 border border-background"
                >
                  {initials(p.user_name, p.user_email)}
                </span>
              ))}
              {participants.length > 5 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[9px] font-medium text-muted-foreground border border-background">
                  +{participants.length - 5}
                </span>
              )}
            </div>
          )}

          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setRecapOpen(true)}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground bg-foreground/[0.05] hover:bg-foreground/[0.08] ring-1 ring-border/70 transition-colors"
              title="View transcript"
            >
              <ClipboardList className="h-3 w-3" />
              View transcript
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading summary…
          </div>
        ) : (
          <>
            <SessionReview
              projectId={projectId}
              sessionId={sessionId}
              initialStatus={session?.blueprint_review_status ?? 'none'}
              onCompleted={() => {
                // After review completes, refresh the session so the header
                // can stop calling it "pending."
                authFetch(`/api/sessions/${sessionId}`)
                  .then((r) => (r.ok ? r.json() : null))
                  .then((s) => {
                    if (s) setSession(s as SessionResp);
                  });
              }}
            />

            {taskCount != null && taskCount > 0 && (
              <div className="rounded-xl border border-success/20 bg-success/5 p-5 flex items-center gap-4">
                <Sparkles className="h-5 w-5 text-success shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {taskCount} {taskCount === 1 ? 'task' : 'tasks'} generated
                    {waveCount ? ` across ${waveCount} ${waveCount === 1 ? 'wave' : 'waves'}` : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Open the board to see them, reorder, or kick off the orchestrator.
                  </p>
                </div>
              </div>
            )}

            {linkedCards.length > 0 && (
              <div>
                <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
                  Tasks from this session
                </p>
                <div className="rounded-lg border border-border bg-card divide-y divide-border/50">
                  {linkedCards.slice(0, 6).map((c) => {
                    const styles =
                      c.agent_status && AGENT_STATUS_STYLES[c.agent_status]
                        ? AGENT_STATUS_STYLES[c.agent_status]
                        : null;
                    return (
                      <Link
                        key={c.id}
                        href={`/sessions/${projectId}/board`}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-card/60 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                              styles?.dot ?? 'bg-muted-foreground/40'
                            }`}
                          />
                          <span className="text-xs font-body text-foreground truncate">
                            {c.title || 'Untitled task'}
                          </span>
                        </div>
                        {styles && (
                          <span className="text-[10px] font-body text-muted-foreground/70 shrink-0">
                            {styles.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                  {linkedCards.length > 6 && (
                    <Link
                      href={`/sessions/${projectId}/board`}
                      className="block px-3 py-2 text-[11px] font-body text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
                    >
                      +{linkedCards.length - 6} more on the board →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {snapshot && snapshotMeta && (
              <div>
                <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
                  Blueprint snapshot
                </p>
                <Link
                  href={`/sessions/${projectId}/blueprint`}
                  className="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 hover:bg-card/80 transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">
                      Blueprint v{snapshot.version_number}
                    </span>
                    {snapshotMeta.changed_sections && snapshotMeta.changed_sections.length > 0 && (
                      <div className="flex flex-wrap gap-1 ml-2">
                        {snapshotMeta.changed_sections.slice(0, 4).map((s) => (
                          <span
                            key={s}
                            className="text-[9px] uppercase tracking-wider text-muted-foreground/80 px-1.5 py-0.5 rounded bg-muted/40 border border-border/40"
                          >
                            {prettySection(s)}
                          </span>
                        ))}
                        {snapshotMeta.changed_sections.length > 4 && (
                          <span className="text-[9px] text-muted-foreground/60">
                            +{snapshotMeta.changed_sections.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                    <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto group-hover:text-primary transition-colors" />
                  </div>
                  {(() => {
                    const firstSection = Object.entries(snapshot.content || {}).find(
                      ([, v]) => typeof v === 'string' && v.trim().length > 0,
                    );
                    if (!firstSection) return null;
                    const [slug, text] = firstSection;
                    return (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
                          {prettySection(slug)}
                        </p>
                        <p className="text-xs font-body text-muted-foreground line-clamp-3">
                          {text.trim()}
                        </p>
                      </div>
                    );
                  })()}
                </Link>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <SummaryCard
                href={`/sessions/${projectId}/board`}
                Icon={Kanban}
                label="Open board"
                description={taskCount ? `${taskCount} new tasks` : 'View kanban'}
                tone="primary"
              />
              <SummaryCard
                href={`/sessions/${projectId}/blueprint`}
                Icon={FileText}
                label="View blueprint"
                description="Locked snapshot of this iteration"
                tone="default"
              />
              <SummaryCard
                href={`/sessions/${projectId}`}
                Icon={ArrowRight}
                label="Back to session"
                description="All sessions and outputs"
                tone="default"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground">
                  Recap
                </p>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRecapOpen(true)}
                    className="text-[11px] font-body text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Open full recap →
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-border bg-card/40">
                <RecapDoc
                  sessionId={sessionId}
                  chapters={recapChapters}
                  onSeekTo={() => setRecapOpen(true)}
                  canRegenerate
                  containerClassName="px-6 py-6"
                />
              </div>
            </div>

            <div className="border-t border-border pt-5 flex items-center gap-3">
              <span className="text-xs font-body text-muted-foreground">How was this session?</span>
              <FeedbackButtons
                targetType="session"
                targetId={sessionId}
                sessionId={sessionId}
                agentType="voice"
                compact={false}
              />
            </div>
          </>
        )}
      </div>

      {recapOpen && messages.length > 0 && (
        <RecapScreen
          open
          sessionId={sessionId}
          callStartedAt={callStartedAt}
          durationSeconds={durationSeconds}
          entries={buildRecapEntries(messages)}
          title={session?.title ?? null}
          onClose={() => setRecapOpen(false)}
        />
      )}
    </div>
  );
}

function SummaryCard({
  href,
  Icon,
  label,
  description,
  tone,
}: {
  href: string;
  Icon: typeof Kanban;
  label: string;
  description: string;
  tone: 'primary' | 'default';
}) {
  return (
    <Link
      href={href}
      className={`group rounded-lg border p-4 transition-colors flex items-start gap-3 ${
        tone === 'primary'
          ? 'border-primary/30 bg-primary/5 hover:border-primary/50 hover:bg-primary/10'
          : 'border-border bg-card hover:border-primary/30 hover:bg-card/80'
      }`}
    >
      <Icon
        className={`h-4 w-4 mt-0.5 ${tone === 'primary' ? 'text-primary' : 'text-muted-foreground'}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
          {label}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
    </Link>
  );
}
