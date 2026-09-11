'use client';

import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Sidebar } from './sidebar';
import { ThemePreviewBar } from './theme-preview-bar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Full-screen pages — no sidebar. Explicit, not a substring test: the
  // session workspace at /sessions/:id keeps the frame; only the room and the
  // recap are bare.
  const isFullScreen = /^\/sessions\/[^/]+\/(room|completed)$/.test(pathname ?? '');
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
      <div className="flex min-h-[var(--page-min-h)]">
        <div className="w-[var(--rail-w)] shrink-0 border-r border-border/60 bg-background" />
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
      <Sidebar />
      <main className="min-h-[var(--page-min-h)] ml-[var(--rail-w)]">{children}</main>
      <ThemePreviewBar />
    </>
  );
}
