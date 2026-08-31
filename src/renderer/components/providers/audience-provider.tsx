'use client';

// The audience world the shell lives in: Solo, Team or Agents. Main holds the
// persisted answer; this provider mirrors it, flips it instantly on switch,
// and keeps `data-audience` on <html> so the world's accent tokens (globals
// .css) follow. A deep link into a route the current world does not own
// switches the world — a link the user clicked is an expressed intent, and
// the sidebar switcher makes flipping back one click. Solo and Team share the
// workspace routes, so a Solo user opening a shared page stays Solo.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { resolveAudience, type Audience } from '@shared/audience';

interface AudienceContextValue {
  /** The active world. 'team' until the question is answered. */
  audience: Audience;
  /** False while the chooser is still owed (never asked). */
  chosen: boolean;
  setAudience: (audience: Audience) => void;
}

const AudienceContext = createContext<AudienceContextValue>({
  audience: 'team',
  chosen: true,
  setAudience: () => {},
});

export function useAudience(): AudienceContextValue {
  return useContext(AudienceContext);
}

export function AudienceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | Audience | null>('loading');
  const pathname = usePathname();

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

  const chosen = state !== 'loading' && state !== null;
  const audience: Audience = chosen ? (state as Audience) : 'team';

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
    const next = resolveAudience(pathname, audience);
    if (next) setAudience(next);
  }, [pathname, audience, chosen, setAudience]);

  if (state === 'loading') return null;

  return (
    <AudienceContext.Provider value={{ audience, chosen, setAudience }}>
      {children}
    </AudienceContext.Provider>
  );
}
