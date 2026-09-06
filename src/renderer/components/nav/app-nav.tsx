'use client';

// The nav, assembled. Three floating surfaces and the keyboard, which is the
// only thing they share — the rail's routes plus settings are the cycle order,
// so the arrows walk the nav in the order it is drawn.

import { useMemo } from 'react';

import { useAudience } from '@/components/providers/audience-provider';
import { railSections } from '@/lib/nav/sections';
import { ScrollRail } from '@/components/ui/scroll-rail';
import { DockControls } from './dock-controls';
import { TeamRail } from './team-rail';
import { useNavShortcuts } from './use-nav-shortcuts';

export function AppNav() {
  const { audience } = useAudience();
  const routes = useMemo(
    () => [...railSections(audience).flatMap((s) => s.items.map((i) => i.href)), '/settings'],
    [audience],
  );
  const { cmdHeld } = useNavShortcuts(routes);

  return (
    <>
      <TeamRail cmdHeld={cmdHeld} />
      <DockControls cmdHeld={cmdHeld} />
      {/* The right-hand answer to the rail: where in the page you are. It
          belongs to the chrome so it can slide off when a page that scrolls is
          left, rather than going with it. */}
      <ScrollRail />
    </>
  );
}
