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
// composer. The duck in the header band's right half explains projects in
// three lines, above the sheet and never on it.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocation } from 'react-router';
import { Lightbulb } from 'lucide-react';
import { GhostSkeleton } from '@/components/projects/ghost-skeleton';
import { LedgerFlowList, LedgerHead } from '@/components/projects/ledger-head';
import { ProjectComposer } from '@/components/projects/project-composer';
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
  LEDGER_ROW,
  OTHER_WAYS_WORD,
  ledgerColumns,
  ledgerSections,
} from '@/lib/yeaboi/ledger';
import { runsByEngineProject, traceFor, traceSentence } from '@/lib/yeaboi/projects';
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
}

function LedgerRow({
  project,
  now,
  steps,
  colors,
  ran,
}: {
  project: Project;
  now: Date;
  steps: FlowStep[];
  colors: Record<string, string>;
  ran: Map<string, Set<string>>;
}) {
  const trace = traceFor(
    steps,
    project.yeaboi_project_id ? ran.get(project.yeaboi_project_id) : undefined,
  );
  return (
    <li>
      <Link
        href={`/projects/${project.id}`}
        className={`group ${LEDGER_ROW}`}
        aria-label={`${project.name}. ${traceSentence(trace)}`}
      >
        <span className="min-w-0">
          <span className="block truncate font-display text-[18px] leading-tight text-foreground decoration-1 underline-offset-[3px] group-hover:underline">
            {project.name}
          </span>
          {project.description && (
            <span className="mt-0.5 block truncate text-[13px] font-body text-muted-foreground">
              {project.description}
            </span>
          )}
          {trace.length > 0 && (
            <span className="mt-1.5 block md:hidden">
              <RunTrace trace={trace} colors={colors} variant="labelled" />
            </span>
          )}
        </span>
        <span className="hidden md:contents">
          <RunTrace trace={trace} colors={colors} variant="dots" />
        </span>
        <span className="text-[12px] font-body tabular-nums text-muted-foreground md:text-right">
          {relativeDay(project.updated_at ?? project.created_at, now)}
        </span>
      </Link>
    </li>
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

function SheetWord({ children }: { children: string }) {
  return (
    <p className="pt-5 pb-1 font-display italic text-[18px] leading-none text-muted-foreground">
      {children}
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
  // Was a Next server action; the desktop talks to FastAPI directly.
  const createProject = useCallback(
    async (data: { description: string; name?: string }) => {
      const resp = await authFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        // The composer renders this verbatim, so prefer the backend's wording.
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Couldn't create the project (${resp.status}).`);
      }
      return (await resp.json()) as { id: string };
    },
    [authFetch],
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
  const rowProps = { now, steps, colors, ran };
  // The column heads label rows; the unfolded suggestions bring their own.
  const headed = loading || !empty;
  const sheetStyle = { '--ledger-cols': ledgerColumns(steps.length) } as CSSProperties;

  return (
    <PageShell>
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 animate-slide-up stagger-1">
        <div>
          <div className="flex items-center gap-4">
            <Mascot size={40} />
            <h1 className="font-display italic text-[40px] leading-none text-foreground">
              Projects
            </h1>
          </div>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Every run inside a project reads what the runs before it left.
          </p>
        </div>
        <ProjectGuide steps={steps} colors={colors} />
      </header>

      <section
        aria-label="Projects"
        className="mt-10 rounded-lg border border-border bg-card px-8 py-5 animate-slide-up stagger-2"
        style={sheetStyle}
      >
        <ProjectComposer
          value={description}
          onChange={setDescription}
          onCreate={createProject}
          onCreated={openCreated}
          autoFocus={empty || new URLSearchParams(search).has('new')}
          fieldRef={field}
        />

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
