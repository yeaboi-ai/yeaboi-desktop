'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { ThemePreviewBar } from './theme-preview-bar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

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
  if (status === 'loading') {
    return (
      <div className="flex min-h-screen">
        <div className="w-[56px] md:w-[180px] shrink-0 border-r border-border/60 bg-background" />
        <main className="flex-1" />
      </div>
    );
  }

  if (!session) {
    return <>{children}</>;
  }

  // The sidebar is position: fixed — the margin, not a flex row, is what
  // keeps content clear of it.
  return (
    <>
      {/* The window has no title bar, so this is the only thing left to drag it
          by. Above the sidebar so the strip is unbroken across the top edge;
          the traffic lights sit inside it and the OS draws them over the top. */}
      <div
        className="titlebar-drag fixed top-0 left-0 right-0 z-50 h-[var(--titlebar-h)]"
        aria-hidden="true"
      />
      <Sidebar />
      <main className="min-h-screen ml-[56px] md:ml-[180px] pt-[var(--titlebar-h)]">
        {children}
      </main>
      <ThemePreviewBar />
    </>
  );
}
