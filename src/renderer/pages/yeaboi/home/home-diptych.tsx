'use client';

// The home: the world's mascot and one question, then two words split by one
// rule in the world's accent. Projects on the left, Sessions on the right —
// the whole product idea is that these are the two ways to work, so the
// home's one job is to make that choice and show what each already holds.
// A project row carries a trace of the runs inside it; a session row is one
// line, because a session is one run. The word and its foot line open the
// list; the rows open the thing itself.

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAudience } from '@/components/providers/audience-provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAgentStamps } from '@/hooks/yeaboi/use-agent-stamps';
import { buttonVariants } from '@/components/ui/button';
import { GlimpseList } from '@/components/yeaboi/glimpse-list';
import { RunTrace } from '@/components/yeaboi/run-trace';
import { WORLD_MASCOT } from '@/lib/audience/worlds';
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

function Half({
  copy,
  foot,
  children,
  className,
  style,
}: {
  copy: HomeHalfCopy;
  foot: ReactNode;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={className} style={style} aria-labelledby={`home-${copy.word}`}>
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
  const copy = homeCopy(audience);
  const now = new Date();
  const agents = audience === 'agents';
  const Mascot = WORLD_MASCOT[audience];

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

  return (
    <div>
      <header className="animate-slide-up flex items-center gap-4">
        <Mascot size={48} />
        <h1 className="font-display italic text-[26px] leading-none text-foreground">
          {copy.question}
        </h1>
      </header>
      <div className="mt-12 grid grid-cols-1 md:grid-cols-2">
        <Half
          copy={copy.projects}
          className="animate-slide-up stagger-1 md:pr-12"
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
        <Half
          copy={copy.sessions}
          className="animate-slide-up stagger-2 mt-12 border-t pt-12 md:mt-0 md:border-t-0 md:border-l md:pl-12 md:pt-0"
          style={{ borderColor: 'var(--audience-accent)' }}
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
    </div>
  );
}
