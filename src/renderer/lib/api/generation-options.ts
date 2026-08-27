/**
 * Org-level generation granularity + modifier client — shared between the
 * Studio editors, the wizard's CustomizeBody, and the preset editor panel.
 *
 * `BUILTIN_*` fallbacks mirror the backend's seed lists so the first paint
 * isn't empty and the picker still renders if the GET fetch fails.
 */

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export type GranularityDTO = {
  id: string;
  slug: string;
  label: string;
  blurb: string | null;
  prompt_fragment: string;
  sort_order: number;
  is_system: boolean;
};

export type ModifierCategory = 'shape' | 'quality' | 'risk' | 'methodology';

export type ModifierDTO = {
  id: string;
  slug: string;
  label: string;
  blurb: string | null;
  category: ModifierCategory;
  prompt_fragment: string;
  sort_order: number;
  is_system: boolean;
};

export const MODIFIER_CATEGORIES: ReadonlyArray<{
  key: ModifierCategory;
  label: string;
  hint: string;
}> = [
  { key: 'shape', label: 'Shape', hint: 'How tickets are framed.' },
  { key: 'quality', label: 'Production readiness', hint: 'Tests, docs, observability, deploy.' },
  { key: 'risk', label: 'Risk & compliance', hint: 'Known risks, compliance surface, a11y.' },
  { key: 'methodology', label: 'Methodology', hint: 'Sequencing and ceremony preferences.' },
];

// ── Fallbacks (first paint + fetch failure) ─────────────────────────────────

export const BUILTIN_GRANULARITIES: ReadonlyArray<GranularityDTO> = [
  {
    id: 'builtin:balanced',
    slug: 'balanced',
    label: 'Balanced',
    blurb: '8–20 tickets · 1–3 days each. The well-rounded default.',
    prompt_fragment: '',
    sort_order: 0,
    is_system: true,
  },
  {
    id: 'builtin:minimal',
    slug: 'minimal',
    label: 'Minimal',
    blurb: '3–6 larger tickets, merged across concerns.',
    prompt_fragment: '',
    sort_order: 1,
    is_system: true,
  },
  {
    id: 'builtin:many_small',
    slug: 'many_small',
    label: 'Many small',
    blurb: '20–40 tiny tickets, ≤1 day each. Easy to parallelise.',
    prompt_fragment: '',
    sort_order: 2,
    is_system: true,
  },
];

export const BUILTIN_MODIFIERS: ReadonlyArray<ModifierDTO> = [
  // shape
  {
    id: 'builtin:vertical_slices',
    slug: 'vertical_slices',
    label: 'Vertical slices',
    blurb: 'Each ticket spans UI + API + DB so it ships as one PR.',
    category: 'shape',
    prompt_fragment: '',
    sort_order: 0,
    is_system: true,
  },
  {
    id: 'builtin:story_driven',
    slug: 'story_driven',
    label: 'User stories',
    blurb: '"As a … I want …" titles.',
    category: 'shape',
    prompt_fragment: '',
    sort_order: 1,
    is_system: true,
  },
  {
    id: 'builtin:spike_first',
    slug: 'spike_first',
    label: 'Spike-first',
    blurb: 'Investigation tickets before unknowns.',
    category: 'shape',
    prompt_fragment: '',
    sort_order: 2,
    is_system: true,
  },
  {
    id: 'builtin:wave_optimised',
    slug: 'wave_optimised',
    label: 'Wave-optimised',
    blurb: 'Maximise wave-0 parallelism.',
    category: 'shape',
    prompt_fragment: '',
    sort_order: 3,
    is_system: true,
  },
  {
    id: 'builtin:follow_practices',
    slug: 'follow_practices',
    label: 'Follow your practices',
    blurb: "Mirror your linked GitHub repo's conventions.",
    category: 'shape',
    prompt_fragment: '',
    sort_order: 4,
    is_system: true,
  },
  // quality
  {
    id: 'builtin:test_driven',
    slug: 'test_driven',
    label: 'Test-driven',
    blurb: 'Tests required on every ticket.',
    category: 'quality',
    prompt_fragment: '',
    sort_order: 5,
    is_system: true,
  },
  {
    id: 'builtin:docs_bundled',
    slug: 'docs_bundled',
    label: 'Docs bundled',
    blurb: 'Docs updates land with user-facing changes.',
    category: 'quality',
    prompt_fragment: '',
    sort_order: 6,
    is_system: true,
  },
  {
    id: 'builtin:observability_first',
    slug: 'observability_first',
    label: 'Observability-first',
    blurb: 'Logging / metrics AC on every ticket.',
    category: 'quality',
    prompt_fragment: '',
    sort_order: 7,
    is_system: true,
  },
  {
    id: 'builtin:release_ready',
    slug: 'release_ready',
    label: 'Release-ready',
    blurb: 'Final wave covers deploy + flag + rollback.',
    category: 'quality',
    prompt_fragment: '',
    sort_order: 8,
    is_system: true,
  },
  // risk
  {
    id: 'builtin:risk_mitigated',
    slug: 'risk_mitigated',
    label: 'Risk-mitigated',
    blurb: 'Mitigation tickets for known risks.',
    category: 'risk',
    prompt_fragment: '',
    sort_order: 9,
    is_system: true,
  },
  {
    id: 'builtin:compliance_aware',
    slug: 'compliance_aware',
    label: 'Compliance-aware',
    blurb: 'Audit, encryption, access-control tickets.',
    category: 'risk',
    prompt_fragment: '',
    sort_order: 10,
    is_system: true,
  },
  {
    id: 'builtin:accessibility',
    slug: 'accessibility',
    label: 'Accessibility',
    blurb: 'a11y AC on UI tickets; audit per surface.',
    category: 'risk',
    prompt_fragment: '',
    sort_order: 11,
    is_system: true,
  },
  // methodology
  {
    id: 'builtin:mvp_first',
    slug: 'mvp_first',
    label: 'MVP-first',
    blurb: 'Waves 0-1 ship a deployable v0.',
    category: 'methodology',
    prompt_fragment: '',
    sort_order: 12,
    is_system: true,
  },
  {
    id: 'builtin:gherkin_ac',
    slug: 'gherkin_ac',
    label: 'Gherkin AC',
    blurb: 'Given/When/Then acceptance criteria.',
    category: 'methodology',
    prompt_fragment: '',
    sort_order: 13,
    is_system: true,
  },
  {
    id: 'builtin:api_contract_first',
    slug: 'api_contract_first',
    label: 'API-contract-first',
    blurb: 'Schema tickets before implementation.',
    category: 'methodology',
    prompt_fragment: '',
    sort_order: 14,
    is_system: true,
  },
  {
    id: 'builtin:demo_waves',
    slug: 'demo_waves',
    label: 'Demo-able waves',
    blurb: 'Each wave produces a demoable artifact.',
    category: 'methodology',
    prompt_fragment: '',
    sort_order: 15,
    is_system: true,
  },
];

// ── Fetchers ────────────────────────────────────────────────────────────────

export async function fetchOrgGranularities(authFetch: AuthFetch): Promise<GranularityDTO[]> {
  const resp = await authFetch('/api/generation-granularities');
  if (!resp.ok) {
    console.warn('[generation-options] fetchOrgGranularities non-ok, using builtins', resp.status);
    return [...BUILTIN_GRANULARITIES];
  }
  const data = (await resp.json()) as GranularityDTO[];
  return data.length > 0 ? data : [...BUILTIN_GRANULARITIES];
}

export async function fetchOrgModifiers(authFetch: AuthFetch): Promise<ModifierDTO[]> {
  const resp = await authFetch('/api/generation-modifiers');
  if (!resp.ok) {
    console.warn('[generation-options] fetchOrgModifiers non-ok, using builtins', resp.status);
    return [...BUILTIN_MODIFIERS];
  }
  const data = (await resp.json()) as ModifierDTO[];
  return data.length > 0 ? data : [...BUILTIN_MODIFIERS];
}

// ── CRUD for the Studio editors ─────────────────────────────────────────────

export async function createGranularity(
  authFetch: AuthFetch,
  body: {
    label: string;
    slug?: string;
    blurb?: string | null;
    prompt_fragment?: string;
    sort_order?: number;
  },
): Promise<GranularityDTO> {
  const resp = await authFetch('/api/generation-granularities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function patchGranularity(
  authFetch: AuthFetch,
  id: string,
  body: Partial<{
    label: string;
    blurb: string | null;
    prompt_fragment: string;
    sort_order: number;
  }>,
): Promise<GranularityDTO> {
  const resp = await authFetch(`/api/generation-granularities/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function resetGranularity(authFetch: AuthFetch, id: string): Promise<GranularityDTO> {
  const resp = await authFetch(`/api/generation-granularities/${id}/reset`, { method: 'POST' });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function deleteGranularity(authFetch: AuthFetch, id: string): Promise<void> {
  const resp = await authFetch(`/api/generation-granularities/${id}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) throw new Error(await resp.text());
}

export async function createModifier(
  authFetch: AuthFetch,
  body: {
    label: string;
    slug?: string;
    blurb?: string | null;
    category: ModifierCategory;
    prompt_fragment?: string;
    sort_order?: number;
  },
): Promise<ModifierDTO> {
  const resp = await authFetch('/api/generation-modifiers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function patchModifier(
  authFetch: AuthFetch,
  id: string,
  body: Partial<{
    label: string;
    blurb: string | null;
    category: ModifierCategory;
    prompt_fragment: string;
    sort_order: number;
  }>,
): Promise<ModifierDTO> {
  const resp = await authFetch(`/api/generation-modifiers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function resetModifier(authFetch: AuthFetch, id: string): Promise<ModifierDTO> {
  const resp = await authFetch(`/api/generation-modifiers/${id}/reset`, { method: 'POST' });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function deleteModifier(authFetch: AuthFetch, id: string): Promise<void> {
  const resp = await authFetch(`/api/generation-modifiers/${id}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) throw new Error(await resp.text());
}
