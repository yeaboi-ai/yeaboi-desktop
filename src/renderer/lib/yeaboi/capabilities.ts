// The mode inventory /api/meta/capabilities serves — the TUI's own cards,
// verbatim, so the desktop can never drift from the terminal — and the pure
// rules over it: which cards a world offers as a one-off run.

import { apiGet } from './api';

export interface ModeCard {
  key: string;
  title: string;
  description: string;
  available: boolean;
  color: string;
}

export interface CategoryCard {
  key: string;
  title: string;
  verb: string;
  capabilities?: string[];
  color: string;
}

export interface Capabilities {
  categories: CategoryCard[];
  /** The Solo menu. Absent on a sidecar that predates the Solo world. */
  solo?: ModeCard[];
  /** The Team menu (the key predates the Solo world). */
  modes: ModeCard[];
  agents: ModeCard[];
}

/** The cards a one-off run can be: the run-modes alone. Planning is the
 *  project's whole world, and usage/settings are live views, not runs. */
export const NOT_ONE_OFF: ReadonlySet<string> = new Set(['project-planning', 'usage', 'settings']);

/** Old-sidecar fallback: the Team cards Solo deliberately does not carry. */
export const SOLO_EXCLUDED: ReadonlySet<string> = new Set(['retro', 'poker', 'performance']);

/** The world's menu, as the sidecar serves it. */
export function menuFor(caps: Capabilities, audience: string): ModeCard[] {
  if (audience === 'agents') return caps.agents;
  if (audience === 'solo') {
    return caps.solo ?? caps.modes.filter((card) => !SOLO_EXCLUDED.has(card.key));
  }
  return caps.modes;
}

/** The modes a session can be, in the world. */
export function runModesFor(caps: Capabilities, audience: string): ModeCard[] {
  return menuFor(caps, audience).filter((card) => !NOT_ONE_OFF.has(card.key));
}

/** Every card the sidecar knows, once each — for titles and accents by key. */
export function allCards(caps: Capabilities): ModeCard[] {
  const seen = new Map<string, ModeCard>();
  for (const card of [...caps.modes, ...(caps.solo ?? []), ...caps.agents]) {
    if (!seen.has(card.key)) seen.set(card.key, card);
  }
  return [...seen.values()];
}

/** The world's category card; `humans` is the pre-rename key an older sidecar
 *  still serves for Team. */
export function categoryFor(caps: Capabilities, audience: string): CategoryCard | undefined {
  return (
    caps.categories.find((c) => c.key === audience) ??
    (audience === 'team' ? caps.categories.find((c) => c.key === 'humans') : undefined)
  );
}

export const loadCapabilities = (): Promise<Capabilities> => apiGet('/api/meta/capabilities');
