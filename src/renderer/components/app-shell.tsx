'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { AppNav } from './nav/app-nav';
import { Deck } from './nav/deck';
import { TipCompanion } from './yeaboi/tip-companion';
import { useSmoothScroll } from '@/hooks/use-smooth-scroll';
import { ThemePreviewBar } from './theme-preview-bar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  // A wheel notch glides whatever box it is over, rather than jumping it.
  useSmoothScroll();

  // Full-screen pages — no sidebar
  const isFullScreen = pathname?.includes('/sessions/') && !pathname?.endsWith('/new');
  const isAuth = pathname?.startsWith('/auth');
  const isInvite = pathname?.startsWith('/invite');
  const isOnboarding = pathname?.startsWith('/onboarding');
  const isLanding = pathname === '/';

  if (isFullScreen || isAuth || isInvite || isOnboarding || isLanding) {
    return <>{children}</>;
  }

  // Wait for session status before rendering layout to prevent content flash
  if (status === 'loading') return <div className="min-h-screen" />;

  if (!session) {
    return <>{children}</>;
  }

  // The nav floats over the page rather than taking a column out of it, so
  // the padding here is only enough to keep content clear of the collapsed
  // rail — it does not track the rail's width, because the rail expands over
  // the page rather than pushing it.
  return (
    <>
      {/* The window has no title bar, so this is the only thing left to drag it
          by. The traffic lights sit inside this strip and the OS draws them
          over the top. */}
      <div
        className="titlebar-drag fixed top-0 left-0 right-0 z-50 h-[var(--titlebar-h)]"
        aria-hidden="true"
      />
      <AppNav />
      <main>
        <Deck>{children}</Deck>
      </main>
      {/* The duck belongs to the shell, not to a page. Outside the deck so a
          page turn neither unmounts him nor shrinks him with the card — he is
          the one thing on screen that stays put while the surfaces move. */}
      <TipCompanion />
      <ThemePreviewBar />
    </>
  );
}
