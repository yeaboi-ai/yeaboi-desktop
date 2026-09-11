'use client';

// Home: the mode menu — the terminal's own cards, in its order, the duck with
// a tip beside them — and under it what has run, narrowed by mode. A card
// opens its mode's hub. The paper moved to /news, reached from the foot.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAudience } from '@/components/providers/audience-provider';
import { PageShell } from '@/components/page-shell';
import { ModeMenu } from '@/components/home/mode-menu';
import { RecentList } from '@/components/home/recent-list';
import { GhostSkeleton } from '@/components/ui/ghost-skeleton';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Scheduled } from '@/components/yeaboi/scheduled';
import { TipCompanion } from '@/components/yeaboi/tip-companion';
import { WORLD_MASCOT } from '@/lib/audience/worlds';
import { ALL_MODES, menuCards } from '@/lib/home/menu';
import { nextVisit } from '@/lib/home/wardrobe';
import { HOME_FOOT_LINKS } from '@/lib/nav/sections';
import { WORLD_COPY } from '@shared/audience';
import { apiGet } from '@/lib/yeaboi/api';
import { allCards, loadCapabilities, type Capabilities } from '@/lib/yeaboi/capabilities';
import { SESSIONS_UNSUPPORTED, SESSIONS_EMPTY } from '@/lib/yeaboi/glimpse';
import { loadCeremonies, type CeremonyRow } from '@/lib/yeaboi/ops';
import {
  loadRecentSessions,
  shapeSessions,
  visibleSessions,
  type RecentSession,
} from '@/lib/yeaboi/sessions';
import { MODE_ROUTES, tipsForAudience, type Tip } from '@/lib/yeaboi/tips';

const RECENT_LIMIT = 12;

function HomeBody() {
  const router = useRouter();
  const { audience, soloEnabled } = useAudience();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [error, setError] = useState('');
  const [tips, setTips] = useState<Tip[]>([]);
  const [sessions, setSessions] = useState<RecentSession[] | null | 'error' | 'loading'>('loading');
  const [ceremonies, setCeremonies] = useState<CeremonyRow[]>([]);
  const [filter, setFilter] = useState(ALL_MODES);
  const Mascot = WORLD_MASCOT[audience];
  const now = new Date();

  // The persona changes quietly on each visit to the home, never mid-visit.
  useEffect(() => {
    nextVisit();
  }, []);

  useEffect(() => {
    loadCapabilities().then(setCaps, (e: Error) => setError(e.message));
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    loadRecentSessions({ limit: RECENT_LIMIT }).then(setSessions, () => setSessions('error'));
    loadCeremonies().then(
      (page) => setCeremonies(page.ceremonies.filter((row) => row.enabled)),
      () => setCeremonies([]),
    );
  }, []);

  if (error) {
    return (
      <p className="text-[13px] text-muted-foreground">
        The mode inventory could not be read: {error}
      </p>
    );
  }
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const cards = allCards(caps);
  const recent = Array.isArray(sessions)
    ? visibleSessions(shapeSessions(sessions, cards, now), soloEnabled)
    : [];
  const recentEmpty =
    sessions === null
      ? SESSIONS_UNSUPPORTED
      : sessions === 'error'
        ? 'The recent runs could not be read.'
        : SESSIONS_EMPTY;

  return (
    <>
      <header className="flex items-center gap-4 animate-slide-up stagger-1">
        <Mascot size={40} />
        <h1 className="font-display italic text-[40px] leading-none text-foreground">
          {WORLD_COPY[audience].verb}
        </h1>
      </header>

      <section aria-label="Modes" className="mt-10 animate-slide-up stagger-2">
        <ModeMenu cards={menuCards(caps, audience)} hrefFor={(key) => MODE_ROUTES[key] ?? null} />
        <div className="mt-8 h-px" style={{ background: 'var(--audience-accent)' }} />
      </section>

      <section aria-labelledby="home-recent" className="mt-8 animate-slide-up stagger-3">
        <h2 id="home-recent" className="mb-3 text-[16px] font-body font-medium text-foreground">
          Recent
        </h2>
        <Scheduled rows={ceremonies} className="mb-6" />
        {sessions === 'loading' ? (
          <GhostSkeleton caption="Reading recent runs" />
        ) : (
          <RecentList
            rows={recent}
            cards={cards}
            filter={filter}
            onFilter={setFilter}
            empty={recentEmpty}
          />
        )}
      </section>

      <footer className="mt-14 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-body">
        {HOME_FOOT_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </footer>

      <TipCompanion
        tips={tipsForAudience(tips, audience)}
        cards={cards}
        onNavigate={(route) => router.push(route)}
      />
    </>
  );
}

export default function HomePage() {
  // The tip dock floats over the bottom of the window above Niko's pill; the
  // extra padding keeps the last row reachable under both.
  return (
    <PageShell className="pb-36">
      <BackendGate>
        <HomeBody />
      </BackendGate>
    </PageShell>
  );
}
