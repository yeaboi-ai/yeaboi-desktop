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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-[56px] md:ml-[180px]">{children}</main>
      <ThemePreviewBar />
    </div>
  );
}
