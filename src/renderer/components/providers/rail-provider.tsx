'use client';

// The rail's icons per world, read from and written to the main process. One
// provider, so the rail and the editor that arranges it see the same list;
// edits are discrete (add, rename, move, remove) so each one is written as it
// happens. Main is still the authority: it clamps what arrives and returns
// what it stored, and only the answer to the latest write is adopted.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AUDIENCES, type Audience } from '@shared/audience';
import {
  RAIL_DEFAULTS,
  RAIL_LIMITS,
  newRailItemId,
  normalizeRailItems,
  railDefaultsFor,
  type RailItem,
  type RailPrefs,
} from '@shared/rail';
import { railRouteSet } from '@/lib/nav/rail-catalogue';
import { useAudience } from '@/components/providers/audience-provider';
import { logger } from '@/lib/logger';

interface RailContextValue {
  prefs: RailPrefs;
  /** The current world's items, in rail order. */
  items: RailItem[];
  loaded: boolean;
  addItem: (item: Omit<RailItem, 'id'>) => void;
  updateItem: (id: string, patch: Partial<Omit<RailItem, 'id'>>) => void;
  removeItem: (id: string) => void;
  moveItem: (id: string, delta: -1 | 1) => void;
  resetWorld: () => void;
}

const RailContext = createContext<RailContextValue>({
  prefs: RAIL_DEFAULTS,
  items: RAIL_DEFAULTS.team,
  loaded: false,
  addItem: () => {},
  updateItem: () => {},
  removeItem: () => {},
  moveItem: () => {},
  resetWorld: () => {},
});

export function useRail(): RailContextValue {
  return useContext(RailContext);
}

/** Clamp a stored blob world by world, each against the pages it may hold. */
function clampPrefs(raw: unknown): RailPrefs {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const prefs = {} as RailPrefs;
  for (const audience of AUDIENCES) {
    prefs[audience] = normalizeRailItems(source[audience], audience, railRouteSet(audience));
  }
  return prefs;
}

export function RailProvider({ children }: { children: ReactNode }) {
  const { audience } = useAudience();
  const [prefs, setPrefs] = useState<RailPrefs>(RAIL_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(prefs);
  latest.current = prefs;
  const writes = useRef(0);

  useEffect(() => {
    // A dev session hot-reloads the renderer under a preload built before
    // this bridge method existed; the defaults draw and nothing persists.
    if (typeof window.yeaboi?.getRailPrefs !== 'function') {
      setLoaded(true);
      return;
    }
    window.yeaboi
      .getRailPrefs()
      .then((stored) => setPrefs(clampPrefs(stored)))
      .catch(() => logger.warn('Failed to read the rail'))
      .finally(() => setLoaded(true));
  }, []);

  const write = useCallback((world: Audience, edit: (items: RailItem[]) => RailItem[]) => {
    const next = normalizeRailItems(edit(latest.current[world]), world, railRouteSet(world));
    const prefsNext = { ...latest.current, [world]: next };
    latest.current = prefsNext;
    setPrefs(prefsNext);
    if (typeof window.yeaboi?.setRailPrefs !== 'function') return;
    const ticket = (writes.current += 1);
    window.yeaboi
      .setRailPrefs({ [world]: next })
      .then((stored) => {
        if (ticket === writes.current) setPrefs(clampPrefs(stored));
      })
      .catch(() => logger.warn('Failed to save the rail'));
  }, []);

  const value = useMemo<RailContextValue>(
    () => ({
      prefs,
      items: prefs[audience],
      loaded,
      addItem: (item) =>
        write(audience, (items) =>
          items.length >= RAIL_LIMITS.items || items.some((i) => i.route === item.route)
            ? items
            : [...items, { ...item, id: newRailItemId() }],
        ),
      updateItem: (id, patch) =>
        write(audience, (items) => items.map((i) => (i.id === id ? { ...i, ...patch } : i))),
      removeItem: (id) => write(audience, (items) => items.filter((i) => i.id !== id)),
      moveItem: (id, delta) =>
        write(audience, (items) => {
          const from = items.findIndex((i) => i.id === id);
          const to = from + delta;
          if (from === -1 || to < 0 || to >= items.length) return items;
          const next = [...items];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved!);
          return next;
        }),
      resetWorld: () => write(audience, () => railDefaultsFor(audience)),
    }),
    [prefs, audience, loaded, write],
  );

  return <RailContext.Provider value={value}>{children}</RailContext.Provider>;
}
