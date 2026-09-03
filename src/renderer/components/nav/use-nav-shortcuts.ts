'use client';

// The keyboard half of the nav, lifted out of the sidebar it used to live in.
// Nothing here draws anything — which is the point: the rail and the dock are
// two small components now, and neither of them wants a keydown listener.

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

/** Cmd+letter jumps. The letters are the routes' own initials where they can
 *  be; Cmd+D and Cmd+A are deliberately not taken, being too close to the
 *  browser's own. */
const CMD_SHORTCUTS: Record<string, string> = {
  p: '/projects',
  b: '/board',
  s: '/settings',
};

/**
 * Cmd+letter jumps, Cmd+Arrow cycling, and whether Cmd is being held.
 *
 * `routes` is the cycle order — the rail's items followed by settings — so the
 * arrows walk the nav in the order it is drawn.
 */
export function useNavShortcuts(routes: string[]): { cmdHeld: boolean } {
  const router = useRouter();
  const pathname = usePathname();
  const [cmdHeld, setCmdHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setCmdHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setCmdHeld(false);
    };
    const blur = () => setCmdHeld(false);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const href = CMD_SHORTCUTS[e.key.toLowerCase()];
      if (href) {
        e.preventDefault();
        router.push(href);
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (routes.length === 0) return;
        const found = routes.findIndex((route) => pathname?.startsWith(route));
        const index = found === -1 ? 0 : found;
        const next =
          e.key === 'ArrowDown'
            ? (index + 1) % routes.length
            : (index - 1 + routes.length) % routes.length;
        router.push(routes[next]!);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router, pathname, routes]);

  return { cmdHeld };
}

/**
 * Which nav item the current route belongs to.
 *
 * Longest prefix wins, so /projects/new/from-roadmap lights Roadmap and not
 * Projects as well.
 */
export function useActiveHref(hrefs: string[]): string | undefined {
  const pathname = usePathname();
  return hrefs
    .filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
