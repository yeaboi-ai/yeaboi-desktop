'use client';

// Sessions — the second way to work: a one-off run of one mode, unscoped.
// The left column starts one; the right lists what has run, with anything
// scheduled above it. Ceremonies, provenance and spend are reached from the
// foot. The tip duck lives here, where the modes are.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAudience } from '@/components/providers/audience-provider';
import { useAgentStamps } from '@/hooks/yeaboi/use-agent-stamps';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { GlimpseList } from '@/components/yeaboi/glimpse-list';
import { ModeList } from '@/components/yeaboi/mode-list';
import { Scheduled } from '@/components/yeaboi/scheduled';
import { TipCompanion } from '@/components/yeaboi/tip-companion';
import { DOOR_MASCOT } from '@/lib/audience/worlds';
import { SESSIONS_FOOT_LINKS } from '@/lib/nav/sections';
import { apiGet } from '@/lib/yeaboi/api';
import {
  allCards,
  loadCapabilities,
  runModesFor,
  type Capabilities,
} from '@/lib/yeaboi/capabilities';
import {
  SESSIONS_UNSUPPORTED,
  agentGlimpse,
  sessionRows,
  sessionsEmpty,
} from '@/lib/yeaboi/glimpse';
import { loadCeremonies, type CeremonyRow } from '@/lib/yeaboi/ops';
import { loadRecentSessions, shapeSessions, type RecentSession } from '@/lib/yeaboi/sessions';
import { MODE_ROUTES, startRouteFor, tipsForAudience, type Tip } from '@/lib/yeaboi/tips';

const RECENT_LIMIT = 12;

function SessionsBody() {
  const router = useRouter();
  const { audience } = useAudience();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [tips, setTips] = useState<Tip[]>([]);
  const [sessions, setSessions] = useState<RecentSession[] | null | 'error'>([]);
  const [ceremonies, setCeremonies] = useState<CeremonyRow[]>([]);
  const workspace = audience !== 'agents';
  const Mascot = DOOR_MASCOT[audience].sessions;
  const now = new Date();

  useEffect(() => {
    loadCapabilities().then(setCaps, (e: Error) => setError(e.message));
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!workspace) return;
    loadRecentSessions({ limit: RECENT_LIMIT }).then(setSessions, () => setSessions('error'));
    loadCeremonies().then(
      (page) => setCeremonies(page.ceremonies.filter((row) => row.enabled)),
      () => setCeremonies([]),
    );
  }, [workspace]);

  const agentCards = workspace ? [] : (caps?.agents ?? []);
  const stamps = useAgentStamps(agentCards.map((card) => card.key));

  if (error) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The mode inventory could not be read: {error}
      </p>
    );
  }
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const cards = allCards(caps);
  const recent = workspace
    ? Array.isArray(sessions)
      ? sessionRows(shapeSessions(sessions, cards, now))
      : []
    : agentGlimpse(agentCards, stamps, MODE_ROUTES, now);
  const recentEmpty =
    sessions === null
      ? SESSIONS_UNSUPPORTED
      : sessions === 'error'
        ? 'The recent runs could not be read.'
        : sessionsEmpty(audience);

  return (
    <>
      <header className="animate-slide-up stagger-1">
        <div className="flex items-center gap-4">
          <Mascot size={40} />
          <h1 className="font-display italic text-[40px] leading-none text-foreground">Sessions</h1>
        </div>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          One mode, one run. Nothing is read in from a project and nothing is carried over.
        </p>
      </header>

      <div className="mt-10 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2 animate-slide-up stagger-2">
        <section aria-labelledby="sessions-start">
          <h2
            id="sessions-start"
            className="mb-1 text-[16px] font-body font-medium text-foreground"
          >
            Start a session
          </h2>
          <ModeList cards={runModesFor(caps, audience)} hrefFor={startRouteFor} />
        </section>

        <section aria-labelledby="sessions-recent">
          <h2
            id="sessions-recent"
            className="mb-3 text-[16px] font-body font-medium text-foreground"
          >
            Recent
          </h2>
          <Scheduled rows={ceremonies} className="mb-6" />
          <GlimpseList rows={recent} empty={recentEmpty} />
        </section>
      </div>

      {workspace && (
        <footer className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-body">
          {SESSIONS_FOOT_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </footer>
      )}

      <TipCompanion
        tips={tipsForAudience(tips, audience)}
        cards={cards}
        onNavigate={(route) => router.push(route)}
      />
    </>
  );
}

export default function SessionsPage() {
  return (
    <BackendGate>
      {/* The tip dock and Niko's pill float over the bottom of the window; the
          padding keeps the last row reachable under them. */}
      <div className="mx-auto max-w-5xl px-6 py-14 pb-64">
        <SessionsBody />
      </div>
    </BackendGate>
  );
}
