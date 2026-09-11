'use client';

// Projects — the durable way to work. Every run inside one reads what the
// runs before it left behind. The page is one ledger: the New project
// composer as its first ruled line, a head row that says what each step
// leaves, then a line per project carrying its name, a dot per flow step
// (filled where that mode has run inside) and a date, Completed under them,
// and the other ways in at the foot. With no projects yet, the sheet is the
// composer alone and one line offering to suggest projects; pressing it
// unfolds what this machine's connections suggest starting
// (components/projects/suggested-projects.tsx), and choosing one fills the
// composer. Every row opens its project; hovering one (or right-clicking it)
// offers rename, Mark done or Reopen, and delete, so a project is resumed,
// renamed or removed from here. The duck in the header band's right half
// explains projects in three lines, above the sheet and never on it.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocation } from 'react-router';
import { Check, Lightbulb, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { GhostSkeleton } from '@/components/projects/ghost-skeleton';
import { LedgerFlowList, LedgerHead } from '@/components/projects/ledger-head';
import { usePlanningInterview } from '@/hooks/use-planning-interview';
import { ProjectGuide } from '@/components/projects/project-guide';
import { RunTrace } from '@/components/projects/run-trace';
import { SuggestedProjects } from '@/components/projects/suggested-projects';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAudience } from '@/components/providers/audience-provider';
import { DOOR_MASCOT } from '@/lib/audience/worlds';
import { glideText } from '@/lib/motion/glide';
import { PROJECTS_HEADER_LINKS, type PageLink } from '@/lib/nav/sections';
import { allCards, loadCapabilities, menuFor, type Capabilities } from '@/lib/yeaboi/capabilities';
import {
  ALL_DONE_LINE,
  COMPLETED_WORD,
  DELETE_LABEL,
  DELETE_PROJECT_MESSAGE,
  DELETE_PROJECT_TITLE,
  IN_PROGRESS_WORD,
  LEDGER_ROW,
  NOT_ALLOWED_LINE,
  NOT_ALLOWED_TITLE,
  OTHER_WAYS_WORD,
  UNREACHABLE_LINE,
  ledgerColumns,
  ledgerSections,
  projectCount,
  rowActions,
  type RowAction,
} from '@/lib/yeaboi/ledger';
import {
  isDone,
  nextStatus,
  runsByEngineProject,
  traceFor,
  traceSentence,
} from '@/lib/yeaboi/projects';
import { REFERENCE_COPY, type ProjectReference } from '@/lib/yeaboi/references';
import { cn } from '@/lib/utils';
import { fallbackFlowKeys, flowFor, type FlowStep } from '@/lib/yeaboi/reads';
import { loadRecentSessions, relativeDay } from '@/lib/yeaboi/sessions';
import { HIDE_SUGGESTIONS_LABEL, SUGGEST_LABEL, SUGGEST_PROMPT } from '@/lib/yeaboi/suggestions';
import { logger } from '@/lib/logger';
import { PageShell } from '@/components/page-shell';

/** Enough runs to trace every project on a desktop; the list is read once. */
const TRACE_LIMIT = 200;

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at?: string;
  status?: string;
  /** The engine project runs inside this one share context through; minted on the first run. */
  yeaboi_project_id?: string | null;
  references?: ProjectReference[];
}

interface RowHandlers {
  onRename: (project: Project, name: string) => Promise<void>;
  onToggleStatus: (project: Project) => Promise<void>;
  onDelete: (project: Project) => Promise<void>;
}

const ACTION_ICONS = { rename: Pencil, delete: Trash2 } as const;

function LedgerRow({
  project,
  now,
  steps,
  colors,
  ran,
  onRename,
  onToggleStatus,
  onDelete,
}: {
  project: Project;
  now: Date;
  steps: FlowStep[];
  colors: Record<string, string>;
  ran: Map<string, Set<string>>;
} & RowHandlers) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(project.name);
  const trace = traceFor(
    steps,
    project.yeaboi_project_id ? ran.get(project.yeaboi_project_id) : undefined,
  );
  // Escape unmounts the focused input, which still fires blur; the flag is what
  // keeps that blur from committing the rename Escape just cancelled.
  const cancelled = useRef(false);
  const actions = rowActions(project.status);
  const run = (key: RowAction['key']) => {
    if (key === 'rename') {
      cancelled.current = false;
      setDraft(project.name);
      setEditing(true);
    } else if (key === 'status') {
      void onToggleStatus(project);
    } else {
      void onDelete(project);
    }
  };
  const commitRename = () => {
    setEditing(false);
    if (cancelled.current) return;
    const name = draft.trim();
    if (name && name !== project.name) void onRename(project, name);
  };
  const iconFor = (key: RowAction['key']) =>
    key === 'status' ? (isDone(project) ? RotateCcw : Check) : ACTION_ICONS[key];
  const description = project.description && (
    <span className="mt-0.5 block truncate text-[13px] font-body text-muted-foreground">
      {project.description}
    </span>
  );
  const labelled = trace.length > 0 && (
    <span className="mt-1.5 block md:hidden">
      <RunTrace trace={trace} colors={colors} variant="labelled" />
    </span>
  );
  const date = relativeDay(project.updated_at ?? project.created_at, now);
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<li className="group relative" />}>
        {editing ? (
          <div className={LEDGER_ROW}>
            <span className="min-w-0">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRename();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelled.current = true;
                    setDraft(project.name);
                    setEditing(false);
                  }
                }}
                aria-label={`Rename ${project.name}`}
                className="w-full border-0 border-b border-border bg-transparent px-0 py-0 font-display text-[18px] leading-tight text-foreground outline-none"
              />
              {description}
              {labelled}
            </span>
            <span className="hidden md:contents">
              <RunTrace trace={trace} colors={colors} variant="dots" />
            </span>
            <span className="text-[12px] font-body tabular-nums text-muted-foreground md:text-right">
              {date}
            </span>
          </div>
        ) : (
          <Link
            href={`/projects/${project.id}`}
            className={LEDGER_ROW}
            aria-label={`${project.name}. ${traceSentence(trace)}`}
          >
            <span className="min-w-0">
              <span className="block truncate font-display text-[18px] leading-tight text-foreground decoration-1 underline-offset-[3px] group-hover:underline">
                {project.name}
              </span>
              {description}
              {labelled}
            </span>
            <span className="hidden md:contents">
              <RunTrace trace={trace} colors={colors} variant="dots" />
            </span>
            <span className="text-[12px] font-body tabular-nums text-muted-foreground transition-opacity md:text-right md:group-hover:opacity-0 md:group-focus-within:opacity-0">
              {date}
            </span>
          </Link>
        )}
        {!editing && (
          <span className="absolute inset-y-0 right-0 hidden items-center gap-0.5 group-hover:flex group-focus-within:flex">
            {actions.map((action) => {
              const Icon = iconFor(action.key);
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => run(action.key)}
                  aria-label={`${action.label} ${project.name}`}
                  title={action.label}
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded text-muted-foreground/50 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
                    action.key === 'delete' && 'hover:bg-destructive/10 hover:text-destructive',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </span>
        )}
      </ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((action) => (
          <ContextMenuItem
            key={action.key}
            variant={action.key === 'delete' ? 'destructive' : 'default'}
            onClick={() => run(action.key)}
          >
            {action.label}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** The one line an empty sheet offers in place of rows; the button unfolds them. */
function SuggestLine({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-5 pb-3 text-[13px] font-body leading-snug text-muted-foreground">
      <span>{SUGGEST_PROMPT}</span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="suggested-projects"
        className="inline-flex items-center gap-1.5 text-foreground/80 transition-colors hover:text-foreground"
      >
        <Lightbulb aria-hidden className="h-3 w-3" />
        {open ? HIDE_SUGGESTIONS_LABEL : SUGGEST_LABEL}
      </button>
    </p>
  );
}

function SheetWord({ children, tail }: { children: string; tail?: string }) {
  return (
    <p className="flex items-baseline gap-3 pt-5 pb-1 leading-none">
      <span className="font-display italic text-[18px] text-muted-foreground">{children}</span>
      {tail && <span className="text-[12px] font-body text-muted-foreground/70">{tail}</span>}
    </p>
  );
}

function WayInRow({ link }: { link: PageLink }) {
  return (
    <li>
      <Link
        href={link.href}
        className="group grid gap-x-4 gap-y-0.5 py-2.5 md:grid-cols-[10rem_minmax(0,1fr)] md:items-baseline"
      >
        <span className="font-display text-[16px] leading-tight text-foreground decoration-1 underline-offset-[3px] group-hover:underline">
          {link.label}
        </span>
        {link.fact && (
          <span className="text-[12px] font-body leading-snug text-muted-foreground">
            {link.fact}
          </span>
        )}
      </Link>
    </li>
  );
}

export default function ProjectsPage() {
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const { audience } = useAudience();
  const Mascot = DOOR_MASCOT[audience].projects;
  const router = useRouter();
  const { search } = useLocation();
  const confirm = useConfirm();
  // One PATCH per row action; a refusal is said in a dialog and the row keeps its state.
  const patchProject = useCallback(
    async (project: Project, body: Record<string, unknown>, title: string): Promise<boolean> => {
      let detail = UNREACHABLE_LINE;
      try {
        const resp = await authFetch(`/api/projects/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) return true;
        const data = await resp.json().catch(() => ({}));
        detail = data?.detail || `The change was refused (${resp.status}).`;
      } catch {
        // unreachable: the default line says so
      }
      await confirm({
        title,
        message: detail,
        variant: 'warning',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
      return false;
    },
    [authFetch, confirm],
  );
  const renameProject = useCallback(
    async (project: Project, name: string) => {
      if (!(await patchProject(project, { name }, 'Name unchanged'))) return;
      logger.info('project renamed', { id: project.id });
      setProjects((current) => current.map((p) => (p.id === project.id ? { ...p, name } : p)));
    },
    [patchProject],
  );
  const toggleStatus = useCallback(
    async (project: Project) => {
      const status = nextStatus(project.status);
      if (!(await patchProject(project, { status }, 'Status unchanged'))) return;
      logger.info('project status set', { id: project.id, status });
      const updated_at = new Date().toISOString();
      setProjects((current) =>
        current.map((p) => (p.id === project.id ? { ...p, status, updated_at } : p)),
      );
    },
    [patchProject],
  );
  const deleteProject = useCallback(
    async (project: Project) => {
      const ok = await confirm({
        title: DELETE_PROJECT_TITLE,
        message: DELETE_PROJECT_MESSAGE,
        variant: 'danger',
        confirmLabel: DELETE_LABEL,
      });
      if (!ok) return;
      let title = 'Delete failed';
      let detail = UNREACHABLE_LINE;
      try {
        const resp = await authFetch(`/api/projects/${project.id}`, { method: 'DELETE' });
        if (resp.ok || resp.status === 204) {
          logger.info('project deleted', { id: project.id });
          setProjects((current) => current.filter((p) => p.id !== project.id));
          return;
        }
        if (resp.status === 403) {
          title = NOT_ALLOWED_TITLE;
          detail = NOT_ALLOWED_LINE;
        } else {
          const data = await resp.json().catch(() => ({}));
          detail = data?.detail || `Delete failed with status ${resp.status}.`;
        }
      } catch {
        // unreachable: the default line says so
      }
      await confirm({
        title,
        message: detail,
        variant: 'warning',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
    },
    [authFetch, confirm],
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  // null while the sidecar is being asked, or when it cannot be; the ledger
  // never waits on it.
  const [caps, setCaps] = useState<Capabilities | null>(null);
  // Which modes have run inside each engine project; empty until the sidecar
  // answers, and empty for good on one without the route.
  const [ran, setRan] = useState<Map<string, Set<string>>>(() => new Map());
  // The suggested rows stay folded until asked for, so an empty sheet is the
  // composer and one line, and no connection is read behind the reader's back.
  const [suggesting, setSuggesting] = useState(false);
  // Render nothing until we know the user has finished onboarding. Otherwise
  // the projects page paints for one frame before the redirect fires, which
  // shows up as a flash of the wrong UI right after first-time sign-in.
  const [gate, setGate] = useState<'checking' | 'redirecting' | 'ok'>('checking');

  useEffect(() => {
    loadCapabilities().then(setCaps, () => setCaps(null));
    loadRecentSessions({ limit: TRACE_LIMIT }).then(
      (sessions) => setRan(runsByEngineProject(sessions ?? [])),
      () => setRan(new Map()),
    );
  }, []);

  useEffect(() => {
    if (!ready) return;

    authFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        void me; // onboarding gate is a web-app concern; desktop goes straight in
        setGate('ok');
      })
      .catch(() => {
        logger.warn('Failed to check onboarding status');
        setGate('ok');
      });

    // Fetch projects (includes X-Team-Id header) — runs in parallel so when
    // the gate clears the page is already populated.
    setLoading(true);
    authFetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [ready, authFetch, teamVersion]);

  const steps = useMemo(
    () =>
      flowFor(
        audience,
        caps ? menuFor(caps, audience).map((card) => card.key) : fallbackFlowKeys(audience),
      ),
    [audience, caps],
  );
  const colors = useMemo(
    () => Object.fromEntries((caps ? allCards(caps) : []).map((card) => [card.key, card.color])),
    [caps],
  );

  // Niko asks what the page used to ask in a text field, a moment after the
  // page settles. `rows` is what it offers to carry on from, so it waits for
  // them rather than opening on a page it has not read.
  const inProgress = ledgerSections(projects).rows[0];
  const carryOn = inProgress ? { id: inProgress.id, title: inProgress.name } : undefined;
  usePlanningInterview({
    carryOn,
    ready: gate === 'ok' && !loading,
    onOpen: (id) =>
      router.push(id === 'roadmap' ? '/projects/new/from-roadmap' : `/projects/${id}`),
    onCreated: () => {
      authFetch('/api/projects')
        .then((r) => (r.ok ? r.json() : []))
        .then(setProjects)
        .catch(() => undefined);
    },
  });

  if (gate !== 'ok') {
    return <div className="min-h-[var(--page-min-h)] bg-background" aria-busy="true" />;
  }

  const now = new Date();
  const { rows, completed } = ledgerSections(projects);
  const empty = !loading && rows.length === 0 && completed.length === 0;
  // After Create the app opens the project; the old view is where the work is.
  const openCreated = (created: { id: string }) => router.push(`/projects/${created.id}`);

  const pickExample = (from: HTMLElement, text: string) => {
    const target = field.current;
    if (!target) return;
    glideText(from, target, () => {
      setDescription(text);
      target.focus();
    });
  };
  const rowProps = {
    now,
    steps,
    colors,
    ran,
    onRename: renameProject,
    onToggleStatus: toggleStatus,
    onDelete: deleteProject,
  };
  // The column heads label rows; the unfolded suggestions bring their own.
  const headed = loading || !empty;
  const sheetStyle = { '--ledger-cols': ledgerColumns(steps.length) } as CSSProperties;

  return (
    <PageShell width="full">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 animate-slide-up stagger-1">
        <div>
          <div className="flex items-center gap-4">
            <Mascot size={40} />
            <h1 className="font-display italic text-[40px] leading-none text-foreground">
              Projects
            </h1>
          </div>
          <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
            Every run inside a project reads what the runs before it left.
          </p>
        </div>
        <ProjectGuide steps={steps} colors={colors} />
      </header>

      <section
        aria-label="Projects"
        // No sheet under it: the ledger's own rules already separate the rows,
        // and a card behind a list of two lines is a box drawn round a box.
        className="mt-10 animate-slide-up stagger-2 py-5"
        style={sheetStyle}
      >
        {!loading && rows.length > 0 && (
          <SheetWord tail={projectCount(rows.length)}>{IN_PROGRESS_WORD}</SheetWord>
        )}

        {headed && <LedgerHead steps={steps} colors={colors} />}

        {loading ? (
          <GhostSkeleton steps={steps} />
        ) : empty ? (
          <>
            <SuggestLine open={suggesting} onToggle={() => setSuggesting((open) => !open)} />
            {suggesting && (
              <div id="suggested-projects">
                <SuggestedProjects steps={steps} colors={colors} onPick={pickExample} />
              </div>
            )}
          </>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="py-3 text-[13px] font-body leading-relaxed text-muted-foreground">
                {ALL_DONE_LINE}
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {rows.map((project) => (
                  <LedgerRow key={project.id} project={project} {...rowProps} />
                ))}
              </ul>
            )}
            {completed.length > 0 && (
              <>
                <SheetWord>{COMPLETED_WORD}</SheetWord>
                <ul className="divide-y divide-border/50">
                  {completed.map((project) => (
                    <LedgerRow key={project.id} project={project} {...rowProps} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {headed && <LedgerFlowList steps={steps} colors={colors} />}

        <div className="mt-5 border-t border-border">
          <SheetWord>{OTHER_WAYS_WORD}</SheetWord>
          <ul className="divide-y divide-border/50">
            {PROJECTS_HEADER_LINKS.map((link) => (
              <WayInRow key={link.href} link={link} />
            ))}
          </ul>
        </div>
      </section>
    </PageShell>
  );
}
