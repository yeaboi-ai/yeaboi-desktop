'use client';

// The home: two words split by one rule in the world's accent. Projects on
// the left, Sessions on the right — the whole product idea is that these are
// the two ways to work, so the home's one job is to make that choice and show
// what each already holds. The word and its foot line open the list; the
// three rows under each open the thing itself.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAudience } from '@/components/providers/audience-provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAgentStamps } from '@/hooks/yeaboi/use-agent-stamps';
import { RoboMark } from '@/components/brand/robo';
import { GlimpseList } from '@/components/yeaboi/glimpse-list';
import { allCards, loadCapabilities, type Capabilities } from '@/lib/yeaboi/capabilities';
import {
  SESSIONS_UNSUPPORTED,
  agentGlimpse,
  homeCopy,
  projectGlimpse,
  sessionGlimpse,
  type GlimpseProject,
  type GlimpseRow,
  type HomeHalfCopy,
} from '@/lib/yeaboi/home';
import { loadRecentSessions, shapeSessions, type RecentSession } from '@/lib/yeaboi/sessions';
import { MODE_ROUTES } from '@/lib/yeaboi/tips';

function Half({
  copy,
  rows,
  empty,
  mark,
  className,
  style,
}: {
  copy: HomeHalfCopy;
  rows: GlimpseRow[];
  /** The sentence for an empty half; the foot line is its action. */
  empty: string;
  mark?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <section className={className} style={style} aria-labelledby={`home-${copy.word}`}>
      <Link href={copy.href} className="group inline-flex items-center gap-4">
        {mark}
        <h2
          id={`home-${copy.word}`}
          className="font-display italic text-[64px] leading-none text-foreground transition-colors group-hover:text-primary"
        >
          {copy.word}
        </h2>
      </Link>
      <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-muted-foreground">{copy.lead}</p>
      <div className="mt-8">
        <GlimpseList rows={rows} empty={empty} />
      </div>
      <Link
        href={copy.href}
        className="mt-4 inline-block text-[13px] font-body text-primary hover:underline"
      >
        {copy.foot}
      </Link>
    </section>
  );
}

export function HomeDiptych() {
  const { audience } = useAudience();
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [projects, setProjects] = useState<GlimpseProject[]>([]);
  const [sessions, setSessions] = useState<RecentSession[] | null | 'error'>([]);
  const copy = homeCopy(audience);
  const now = new Date();

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

  useEffect(() => {
    if (audience === 'agents') return;
    loadRecentSessions({ limit: 3 }).then(setSessions, () => setSessions('error'));
  }, [audience]);

  const agentCards = audience === 'agents' ? (caps?.agents ?? []) : [];
  const stamps = useAgentStamps(agentCards.map((card) => card.key));

  const sessionRows =
    audience === 'agents'
      ? agentGlimpse(agentCards, stamps, MODE_ROUTES, now)
      : Array.isArray(sessions)
        ? sessionGlimpse(shapeSessions(sessions, caps ? allCards(caps) : [], now))
        : [];
  const sessionsEmpty =
    sessions === null
      ? SESSIONS_UNSUPPORTED
      : sessions === 'error'
        ? 'The recent runs could not be read. Open Sessions to start one.'
        : copy.sessions.empty;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2">
      <h1 className="sr-only">Home</h1>
      <Half
        copy={copy.projects}
        rows={projectGlimpse(projects, now, audience)}
        empty={copy.projects.empty}
        mark={audience === 'agents' ? <RoboMark size={40} /> : undefined}
        className="animate-slide-up stagger-1 md:pr-12"
      />
      <Half
        copy={copy.sessions}
        rows={sessionRows}
        empty={sessionsEmpty}
        className="animate-slide-up stagger-2 mt-12 border-t pt-12 md:mt-0 md:border-t-0 md:border-l md:pl-12 md:pt-0"
        style={{ borderColor: 'var(--audience-accent)' }}
      />
    </div>
  );
}
