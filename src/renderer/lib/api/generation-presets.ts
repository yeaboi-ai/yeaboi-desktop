/**
 * Org-level generation preset client — shared between the Studio editor,
 * the wizard's PresetPickerGate, and the board-settings default picker.
 *
 * `BUILTIN_PRESETS` mirrors the backend's SYSTEM_GENERATION_PRESETS so we
 * can render something sensible on first paint (before the org's presets
 * have come back from /api/generation-presets) and as a graceful fallback
 * if the fetch fails — neither path should leave the wizard empty.
 */

import {
  Accessibility,
  Activity,
  BookOpen,
  Compass,
  FileCode2,
  Flag,
  FlaskConical,
  GitBranch,
  Grid3x3,
  Layers,
  Layers3,
  ListChecks,
  Minimize2,
  MonitorPlay,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type PresetDTO = {
  id: string;
  slug: string;
  label: string;
  blurb: string | null;
  icon: string;
  granularity: string;
  modifiers: string[];
  sort_order: number;
  is_system: boolean;
};

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

/** Lucide icons admins can pick. Keep in sync with backend ALLOWED_ICONS
 * in services/preset_service.py — additions need to land in both places. */
export const ICON_BY_NAME: Record<string, LucideIcon> = {
  Flag,
  Layers,
  ShieldCheck,
  MonitorPlay,
  Rocket,
  Sparkles,
  Compass,
  GitBranch,
  Grid3x3,
  Layers3,
  Minimize2,
  User: UserIcon,
  Waves,
  Activity,
  BookOpen,
  FileCode2,
  FlaskConical,
  ListChecks,
  Accessibility,
  ShieldAlert,
};

/** Ordered list of icon names available in the editor's icon picker. */
export const ICON_NAMES: ReadonlyArray<string> = Object.keys(ICON_BY_NAME);

/** Resolve an icon name to its component, with a safe fallback so a malformed
 * server-saved icon string doesn't blow up the renderer. */
export function iconForName(name: string): LucideIcon {
  return ICON_BY_NAME[name] ?? Layers;
}

/** First-paint / fetch-failure fallback. Same 4 presets the backend seeds.
 * Synthesised DTOs (no real id) so the wizard can render them as if they came
 * from the API; once the real fetch lands they get replaced. */
export const BUILTIN_PRESETS: ReadonlyArray<PresetDTO> = [
  {
    id: 'builtin:quick_prototype',
    slug: 'quick_prototype',
    label: 'Quick prototype',
    blurb: 'Solo dev wanting a deployable v0 fast.',
    icon: 'Flag',
    granularity: 'minimal',
    modifiers: ['mvp_first', 'vertical_slices'],
    sort_order: 0,
    is_system: true,
  },
  {
    id: 'builtin:standard_sprint',
    slug: 'standard_sprint',
    label: 'Standard sprint',
    blurb: 'The safe default — well-rounded backlog with no special framing.',
    icon: 'Layers',
    granularity: 'balanced',
    modifiers: [],
    sort_order: 1,
    is_system: true,
  },
  {
    id: 'builtin:production_grade',
    slug: 'production_grade',
    label: 'Production-grade',
    blurb: 'Multi-person team shipping to real users. Tests + docs + observability + release.',
    icon: 'ShieldCheck',
    granularity: 'balanced',
    modifiers: ['test_driven', 'docs_bundled', 'observability_first', 'release_ready'],
    sort_order: 2,
    is_system: true,
  },
  {
    id: 'builtin:stakeholder_demo',
    slug: 'stakeholder_demo',
    label: 'Stakeholder demo',
    blurb: 'Each wave produces a demoable, user-story-shaped artifact.',
    icon: 'MonitorPlay',
    granularity: 'balanced',
    modifiers: ['vertical_slices', 'demo_waves', 'story_driven'],
    sort_order: 3,
    is_system: true,
  },
];

export async function fetchOrgPresets(authFetch: AuthFetch): Promise<PresetDTO[]> {
  const resp = await authFetch('/api/generation-presets');
  if (!resp.ok) return [...BUILTIN_PRESETS];
  const data = (await resp.json()) as PresetDTO[];
  return data.length > 0 ? data : [...BUILTIN_PRESETS];
}

export async function createPreset(
  authFetch: AuthFetch,
  body: {
    label: string;
    blurb?: string | null;
    icon?: string;
    granularity: string;
    modifiers: string[];
    sort_order?: number;
  },
): Promise<PresetDTO> {
  const resp = await authFetch('/api/generation-presets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function patchPreset(
  authFetch: AuthFetch,
  presetId: string,
  body: Partial<{
    label: string;
    blurb: string | null;
    icon: string;
    granularity: string;
    modifiers: string[];
    sort_order: number;
  }>,
): Promise<PresetDTO> {
  const resp = await authFetch(`/api/generation-presets/${presetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function resetPreset(authFetch: AuthFetch, presetId: string): Promise<PresetDTO> {
  const resp = await authFetch(`/api/generation-presets/${presetId}/reset`, {
    method: 'POST',
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function deletePreset(authFetch: AuthFetch, presetId: string): Promise<void> {
  const resp = await authFetch(`/api/generation-presets/${presetId}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) throw new Error(await resp.text());
}
