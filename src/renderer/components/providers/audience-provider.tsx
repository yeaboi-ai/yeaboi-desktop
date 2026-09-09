'use client';

// The audience world the shell lives in: Solo or Team. Main holds the
// persisted answer; this provider mirrors it, flips it instantly on switch,
// and keeps `data-audience` on <html> so the world's accent tokens (globals
// .css) follow. A deep link into a route the current world does not own
// switches the world — a link the user clicked is an expressed intent, and
// the sidebar switcher makes flipping back one click. Solo and Team share the
// workspace routes, so a Solo user opening a shared page stays Solo.
//
// Whether Solo is on offer at all comes from the sidecar (main asks). With it
// off the effective world is Team whatever is stored — the stored answer is
// never erased, so turning the world back on restores it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  audiencesForRoute,
  audiencesShown,
  resolveAudience,
  type Audience,
} from '@shared/audience';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';

interface AudienceContextValue {
  /** The active world. 'team' until the question is answered. */
  audience: Audience;
  /** False while the chooser is still owed (never asked). */
  chosen: boolean;
  /** Whether the build offers the Solo world at all. */
  soloEnabled: boolean;
  /** False until the sidecar has answered — hold, do not redirect. */
  soloKnown: boolean;
  setAudience: (audience: Audience) => void;
}

const AudienceContext = createContext<AudienceContextValue>({
  audience: 'team',
  chosen: true,
  soloEnabled: false,
  soloKnown: false,
  setAudience: () => {},
});

export function useAudience(): AudienceContextValue {
  return useContext(AudienceContext);
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | Audience | null>('loading');
  const [solo, setSolo] = useState<boolean | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    // A dev renderer can hot-reload under a preload built before this bridge
    // method existed. Treat that as a resolved "no": the world stays hidden and
    // the router redirects rather than hanging on a page it cannot decide.
    if (typeof window.yeaboi?.getSolo !== 'function') {
      setSolo(false);
      return;
    }
    window.yeaboi.getSolo().then(
      (enabled) => setSolo(enabled),
      () => setSolo(false),
    );
    window.yeaboi.onSolo(setSolo);
  }, []);

  useEffect(() => {
    // A dev session hot-reloads the renderer under a preload built before
    // this bridge method existed; treat that like an unanswered question
    // rather than crashing the window.
    if (typeof window.yeaboi?.getAudience !== 'function') {
      setState(null);
      return;
    }
    window.yeaboi.getAudience().then(
      (stored) => setState(stored),
      () => setState(null),
    );
  }, []);

  const setAudience = useCallback((audience: Audience) => {
    setState(audience);
    // A failed persist only means the wrong preselect next launch; the
    // session it steers proceeds either way.
    try {
      void window.yeaboi.setAudience(audience).catch(() => {});
    } catch {
      // Stale preload without the method — the in-memory flip still holds.
    }
  }, []);

  // The menu bar's World menu: main already persisted it. A page the new
  // world does not own would be orphaned from the rail, so go home instead.
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  useEffect(() => {
    if (typeof window.yeaboi?.onAudience !== 'function') return;
    window.yeaboi.onAudience((next) => {
      setState(next);
      const current = pathnameRef.current;
      const worlds = current ? audiencesForRoute(current) : [];
      if (worlds.length > 0 && !worlds.includes(next)) router.push(DEFAULT_ROUTE);
    });
  }, [router]);

  const soloEnabled = solo === true;
  const soloKnown = solo !== null;
  const chosen = state !== 'loading' && state !== null;
  const stored: Audience = chosen ? (state as Audience) : 'team';
  // Clamped, not erased: settings.json keeps `solo` and the world comes back
  // whole the moment the sidecar offers it again.
  const audience: Audience = audiencesShown(soloEnabled).includes(stored) ? stored : 'team';

  // The world's accent tokens key off this attribute (globals.css).
  useEffect(() => {
    document.documentElement.dataset['audience'] = audience;
  }, [audience]);

  // Deep links (tray, pet, Cmd+P/B) may land in the other world's routes.
  // Only a pathname *change* switches the world — flipping the audience while
  // standing on the other world's route must not be fought back.
  const lastPathname = useRef<string | null>(null);
  useEffect(() => {
    if (!chosen || !pathname || lastPathname.current === pathname) return;
    lastPathname.current = pathname;
    if (!soloEnabled) return; // one world — nothing to switch into
    const next = resolveAudience(pathname, audience);
    if (next) setAudience(next);
  }, [pathname, audience, chosen, soloEnabled, setAudience]);

  if (state === 'loading') return null;

  return (
    <AudienceContext.Provider value={{ audience, chosen, soloEnabled, soloKnown, setAudience }}>
      {children}
    </AudienceContext.Provider>
  );
}
