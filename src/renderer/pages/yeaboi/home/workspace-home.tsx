'use client';

// The workspace worlds' landing — Solo and Team share it. The page is the mode
// grid: pick what you want to run. The audience decides which modes are on it
// (Solo has no retro/poker/performance) and, for Solo, whether the day's strip
// sits above them.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '@/lib/yeaboi/api';
import { TipCompanion } from '@/components/yeaboi/tip-companion';
import { TodayStrip } from '@/components/yeaboi/today-strip';
import { type ModeCard } from '@/components/yeaboi/mode-card-grid';
import { HomeDashboard } from './dashboard';
import { MODE_ROUTES, type Tip, tipsForAudience } from '@/lib/yeaboi/tips';

interface Capabilities {
  /** The Solo menu. Absent on a sidecar that predates the Solo world. */
  solo?: ModeCard[];
  /** The Team menu (the key predates the Solo world). */
  modes: ModeCard[];
  agents: ModeCard[];
}

/** The cards a one-off run can be: the run-modes alone. Planning is the
 *  project door's whole world, and usage/settings are live views, not runs. */
const NOT_ONE_OFF = new Set(['project-planning', 'usage', 'settings']);

/** Old-sidecar fallback: the Team cards Solo deliberately does not carry. */
const SOLO_EXCLUDED = new Set(['retro', 'poker', 'performance']);

export function WorkspaceHome({ audience }: { audience: 'solo' | 'team' }) {
  const router = useRouter();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Capabilities>('/api/meta/capabilities').then(setCaps, (e: Error) => setError(e.message));
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
  }, []);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the mode inventory: {error}
      </p>
    );
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const menu =
    audience === 'solo'
      ? (caps.solo ?? caps.modes.filter((card) => !SOLO_EXCLUDED.has(card.key)))
      : caps.modes;
  const runModes = menu.filter((card) => !NOT_ONE_OFF.has(card.key));
  const open = (key: string) => {
    const route = MODE_ROUTES[key];
    if (route) router.push(route);
  };

  return (
    <>
      {/* Where the work stands. The modes are one scroll away in the deck, so
          this surface answers what happened and what is next rather than
          listing what can be launched. */}
      <HomeDashboard audience={audience} />

      <TipCompanion
        tips={tipsForAudience(tips, audience)}
        cards={runModes}
        onNavigate={(route) => router.push(route)}
      />
    </>
  );
}
