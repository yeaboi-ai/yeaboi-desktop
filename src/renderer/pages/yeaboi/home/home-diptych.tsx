'use client';

// The home: two words either side of the pond. Projects on the left, Sessions
// on the right — the whole product idea is that these are the two ways to
// work, so the home's one job is to make that choice and show what each
// already holds. The pond between them is the picture of the choice: two
// lobes that are opposites and make one whole, the duck on the line, and the
// boundary running on as the river between the two lists. A project row
// carries a trace of the runs inside it; a session row is one line, because a
// session is one run. The word and its foot line open the list; the rows open
// the thing itself; the pond's lobes open the list too.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAudience } from '@/components/providers/audience-provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAgentStamps } from '@/hooks/yeaboi/use-agent-stamps';
import { buttonVariants } from '@/components/ui/button';
import { GlimpseList } from '@/components/yeaboi/glimpse-list';
import { Pond, type PondHandle } from '@/components/yeaboi/pond';
import { RunTrace } from '@/components/yeaboi/run-trace';
import { DISC_PAD, MAX_RADIUS, type Side } from '@/lib/home/pond-scene';
import { allCards, loadCapabilities, type Capabilities } from '@/lib/yeaboi/capabilities';
import {
  SESSIONS_UNSUPPORTED,
  agentGlimpse,
  homeCopy,
  projectRows,
  sessionGlimpse,
  startLinks,
  traceSentence,
  type GlimpseProject,
  type HomeHalfCopy,
  type ProjectRow,
} from '@/lib/yeaboi/home';
import {
  loadRecentSessions,
  oneOffRuns,
  runsByProject,
  shapeSessions,
  type RecentSession,
} from '@/lib/yeaboi/sessions';
import { MODE_ROUTES } from '@/lib/yeaboi/tips';

const FOOT_LINK = 'text-[13px] font-body text-primary hover:underline';

/** The pond column's width; the disc fills it, so its foot is a known place. */
const POND_WIDTH = 280;
const DISC_FOOT = DISC_PAD + 2 * Math.min(MAX_RADIUS, POND_WIDTH / 2 - DISC_PAD);

function Half({
  copy,
  side,
  onReach,
  foot,
  children,
  className,
}: {
  copy: HomeHalfCopy;
  side: Side;
  /** The pointer is over this half, or has left it. */
  onReach: (side: Side | null) => void;
  foot: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={className}
      aria-labelledby={`home-${copy.word}`}
      onMouseEnter={() => onReach(side)}
      onMouseLeave={() => onReach(null)}
    >
      <Link href={copy.href} className="group inline-block">
        <h2
          id={`home-${copy.word}`}
          className="font-display italic text-[64px] leading-none text-foreground transition-colors group-hover:text-primary"
        >
          {copy.word}
        </h2>
      </Link>
      <p className="mt-4 text-[16px] font-body font-medium text-foreground">{copy.tagline}</p>
      <p className="mt-1.5 max-w-xs text-[14px] leading-relaxed text-muted-foreground">
        {copy.lead}
      </p>
      <div className="mt-8">{children}</div>
      <div className="mt-6">{foot}</div>
    </section>
  );
}

function ProjectList({
  rows,
  empty,
  traced,
}: {
  rows: ProjectRow[];
  empty: string;
  /** Whether runs are traced here; the Agents world's reports leave no trace. */
  traced: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{empty}</p>
        {traced && <RunTrace ghost dots={[]} title="No runs yet" className="mt-3" />}
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border/50">
      {rows.map((row) => {
        const sentence = traceSentence(row.trace);
        return (
          <li key={row.key}>
            <Link href={row.href} className="group block py-3 transition-colors">
              <span className="flex items-baseline justify-between gap-6 font-body">
                <span className="min-w-0 truncate text-[14px] font-medium text-foreground group-hover:text-primary">
                  {row.name}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {row.when}
                </span>
              </span>
              {traced && (
                <span className="mt-2 flex items-center gap-3">
                  <RunTrace
                    dots={row.trace.dots}
                    ghost={row.trace.count === 0}
                    title={sentence}
                    className="shrink-0"
                  />
                  <span className="text-[12px] font-body text-muted-foreground">{sentence}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function HomeDiptych() {
  const { audience } = useAudience();
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [projects, setProjects] = useState<GlimpseProject[]>([]);
  const [runs, setRuns] = useState<RecentSession[] | null | 'error'>([]);
  const pond = useRef<PondHandle>(null);
  const copy = homeCopy(audience);
  const now = new Date();
  const agents = audience === 'agents';

  useEffect(() => {
    loadCapabilities().then(setCaps, () => setCaps(null));
  }, []);

  useEffect(() => {
    if (!ready) return;
    authFetch('/api/projects')
      .then((resp) => (resp.ok ? resp.json() : []))
      .then((rows: GlimpseProject[]) => setProjects(rows))
      .catch(() => setProjects([]));
  }, [ready, authFetch, teamVersion]);

  // Every run, once: the scoped ones become the project traces, the rest are
  // the Sessions half. The Agents world's reports are not runs on this wire.
  useEffect(() => {
    if (agents) return;
    loadRecentSessions({ limit: 0 }).then(setRuns, () => setRuns('error'));
  }, [agents]);

  const agentCards = agents ? (caps?.agents ?? []) : [];
  const stamps = useAgentStamps(agentCards.map((card) => card.key));

  const runList = Array.isArray(runs) ? runs : [];
  const cards = caps ? allCards(caps) : [];
  const sessionRows = agents
    ? agentGlimpse(agentCards, stamps, MODE_ROUTES, now)
    : sessionGlimpse(shapeSessions(oneOffRuns(runList), cards, now));
  const sessionsEmpty =
    runs === null
      ? SESSIONS_UNSUPPORTED
      : runs === 'error'
        ? 'The recent runs could not be read. Open Sessions to start one.'
        : copy.sessions.empty;
  const links = startLinks(caps, audience);
  const reach = (side: Side | null): void => pond.current?.lean(side);

  return (
    <div className="grid grid-cols-1 gap-y-12 md:grid-cols-[1fr_280px_1fr] md:gap-x-10 md:gap-y-0">
      <Half
        copy={copy.projects}
        side="projects"
        onReach={reach}
        className="animate-slide-up stagger-2 md:order-1"
        foot={
          <div className="flex items-center gap-5">
            {copy.projects.action && (
              <Link href={copy.projects.action.href} className={buttonVariants({ size: 'sm' })}>
                {copy.projects.action.label}
              </Link>
            )}
            <Link href={copy.projects.href} className={FOOT_LINK}>
              {copy.projects.foot}
            </Link>
          </div>
        }
      >
        <ProjectList
          rows={projectRows(projects, runsByProject(runList), now, audience)}
          empty={copy.projects.empty}
          traced={!agents}
        />
      </Half>

      <div
        className="relative order-first mx-auto h-[340px] w-[280px] md:order-2 md:mx-0 md:h-auto md:self-stretch"
        style={{ width: POND_WIDTH }}
      >
        <Pond
          ref={pond}
          hrefs={{ projects: copy.projects.href, sessions: copy.sessions.href }}
          className="absolute inset-0 h-full w-full"
        />
        <h1
          className="pointer-events-none absolute inset-x-0 text-center font-display italic text-[15px] leading-none text-muted-foreground"
          style={{ top: DISC_FOOT + 16 }}
        >
          {copy.question}
        </h1>
      </div>

      <Half
        copy={copy.sessions}
        side="sessions"
        onReach={reach}
        className="animate-slide-up stagger-3 md:order-3"
        foot={
          <div>
            {links.length > 0 && (
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] font-body">
                <span className="text-muted-foreground">{copy.startLabel}</span>
                {links.map((link) => (
                  <Link key={link.key} href={link.href} className="text-primary hover:underline">
                    {link.label}
                  </Link>
                ))}
              </p>
            )}
            <Link
              href={copy.sessions.href}
              className={`${FOOT_LINK} ${links.length > 0 ? 'mt-3 inline-block' : ''}`}
            >
              {copy.sessions.foot}
            </Link>
          </div>
        }
      >
        <GlimpseList rows={sessionRows} empty={sessionsEmpty} />
      </Half>
    </div>
  );
}
