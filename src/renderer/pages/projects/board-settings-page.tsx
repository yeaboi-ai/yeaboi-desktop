'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronDown, Layers, Loader2 } from 'lucide-react';
import { use, useEffect, useState } from 'react';

import { BoardSettingsContent } from '@/components/kanban/board-settings-content';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useBoard } from '@/hooks/use-board';
import { callTool } from '@/lib/yeaboi/api';
import { PageShell } from '@/components/page-shell';
import {
  BUILTIN_PRESETS,
  fetchOrgPresets,
  ICON_BY_NAME,
  type PresetDTO,
} from '@/lib/api/generation-presets';

interface PageProps {
  params: Promise<{ id: string }>;
}

// Keep slugs in sync with backend/src/app/services/generation_styles.py.
// Duplicated rather than imported because the wizard constants are internal.
const GRANULARITY_OPTIONS: ReadonlyArray<{ slug: string; label: string; blurb: string }> = [
  { slug: 'balanced', label: 'Balanced', blurb: '8–20 tickets, 1–3 days each.' },
  { slug: 'minimal', label: 'Minimal', blurb: '3–6 larger tickets.' },
  { slug: 'many_small', label: 'Many small', blurb: '20–40 tiny tickets, ≤1 day each.' },
];

type ModifierCategory = 'shape' | 'quality' | 'risk' | 'methodology';

const MODIFIER_OPTIONS: ReadonlyArray<{
  slug: string;
  category: ModifierCategory;
  label: string;
  blurb: string;
  requiresRepo?: boolean;
}> = [
  // shape
  {
    slug: 'vertical_slices',
    category: 'shape',
    label: 'Vertical slices',
    blurb: 'End-to-end value per ticket.',
  },
  {
    slug: 'story_driven',
    category: 'shape',
    label: 'User stories',
    blurb: '"As a … I want …" titles.',
  },
  {
    slug: 'spike_first',
    category: 'shape',
    label: 'Spike-first',
    blurb: 'Investigation tickets before unknowns.',
  },
  {
    slug: 'wave_optimised',
    category: 'shape',
    label: 'Wave-optimised',
    blurb: 'Maximise wave-0 parallelism.',
  },
  {
    slug: 'follow_practices',
    category: 'shape',
    label: 'Follow your practices',
    blurb: 'Mirror your linked repo.',
    requiresRepo: true,
  },
  // quality
  {
    slug: 'test_driven',
    category: 'quality',
    label: 'Test-driven',
    blurb: 'Test AC on every ticket; paired test tickets.',
  },
  {
    slug: 'docs_bundled',
    category: 'quality',
    label: 'Docs bundled',
    blurb: 'Docs updates land with user-facing changes.',
  },
  {
    slug: 'observability_first',
    category: 'quality',
    label: 'Observability-first',
    blurb: 'Logging/metrics AC on every ticket.',
  },
  {
    slug: 'release_ready',
    category: 'quality',
    label: 'Release-ready',
    blurb: 'Final wave covers deploy + flag + rollback.',
  },
  // risk
  {
    slug: 'risk_mitigated',
    category: 'risk',
    label: 'Risk-mitigated',
    blurb: 'Mitigation tickets for known risks.',
  },
  {
    slug: 'compliance_aware',
    category: 'risk',
    label: 'Compliance-aware',
    blurb: 'Audit, encryption, access-control tickets.',
  },
  {
    slug: 'accessibility',
    category: 'risk',
    label: 'Accessibility',
    blurb: 'a11y AC on UI tickets; audit per surface.',
  },
  // methodology
  {
    slug: 'mvp_first',
    category: 'methodology',
    label: 'MVP-first',
    blurb: 'Waves 0-1 ship a deployable v0.',
  },
  {
    slug: 'gherkin_ac',
    category: 'methodology',
    label: 'Gherkin AC',
    blurb: 'Given/When/Then acceptance criteria.',
  },
  {
    slug: 'api_contract_first',
    category: 'methodology',
    label: 'API-contract-first',
    blurb: 'Schema tickets before implementation.',
  },
  {
    slug: 'demo_waves',
    category: 'methodology',
    label: 'Demo-able waves',
    blurb: 'Each wave produces a demoable artifact.',
  },
];

const MODIFIER_CATEGORIES: ReadonlyArray<{ key: ModifierCategory; label: string }> = [
  { key: 'shape', label: 'Shape' },
  { key: 'quality', label: 'Production readiness' },
  { key: 'risk', label: 'Risk & compliance' },
  { key: 'methodology', label: 'Methodology' },
];

/** Render a lucide icon by name via static map property access (avoids the
 * react-hooks/static-components lint rule that flags function-returned components). */
function NamedIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_BY_NAME[name] ?? Layers;
  return <Icon className={className} />;
}

/** Find the org-preset whose (granularity, modifiers) matches the current
 * project defaults exactly. Returns null when the saved combo is bespoke. */
function detectActivePreset(
  presets: ReadonlyArray<PresetDTO>,
  g: string | null,
  m: string[],
): string | null {
  if (!g) return null;
  const sortedM = [...m].sort();
  for (const p of presets) {
    if (p.granularity !== g) continue;
    if (p.modifiers.length !== m.length) continue;
    const sortedP = [...p.modifiers].sort();
    if (sortedP.every((slug, i) => slug === sortedM[i])) return p.slug;
  }
  return null;
}

export default function BoardSettingsPage({ params }: PageProps) {
  const { id: projectId } = use(params);
  const { authFetch } = useAuthFetch();
  const { board, loading, error, createColumn, updateColumn, deleteColumn, reorderColumns } =
    useBoard(projectId, authFetch);

  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectRepoUrl, setProjectRepoUrl] = useState<string | null>(null);
  const [defaultGranularity, setDefaultGranularity] = useState<string | null>(null);
  const [defaultModifiers, setDefaultModifiers] = useState<string[]>([]);
  const [savingStyle, setSavingStyle] = useState(false);
  const [styleError, setStyleError] = useState<string | null>(null);
  // Customize starts collapsed (presets-first); auto-opens if the saved
  // defaults are bespoke (don't exactly match any preset) so the user can
  // see what's actually configured rather than a vague "Custom" label.
  const [showCustomize, setShowCustomize] = useState(false);
  // Org's preset definitions, fetched on mount. Pre-seeded with the built-in
  // 4 so first paint isn't empty and the picker still works if fetch fails.
  const [presets, setPresets] = useState<PresetDTO[]>([...BUILTIN_PRESETS]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchOrgPresets(authFetch);
        if (!cancelled && data.length > 0) setPresets(data);
      } catch {
        // best-effort — falls back to BUILTIN_PRESETS
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await authFetch(`/api/sessions/${projectId}`);
        if (!resp.ok) return;
        const proj = await resp.json();
        if (cancelled) return;
        setProjectName(proj.name ?? null);
        setProjectRepoUrl((proj.repo_url ?? null) as string | null);
        const gran = (proj.default_generation_style ?? null) as string | null;
        const mods = (proj.default_modifiers ?? []) as string[];
        setDefaultGranularity(gran);
        setDefaultModifiers(mods);
        // If saved combo doesn't match a preset, open Customize so the user
        // sees what's configured rather than an unexplained "Custom" state.
        // Note: matched against `presets` state at fetch time — falls back to
        // BUILTIN_PRESETS if the org-preset fetch hasn't landed yet, which is
        // the same set that shipped in iteration 4 so behaviour stays stable.
        if ((gran || mods.length > 0) && !detectActivePreset(presets, gran, mods)) {
          setShowCustomize(true);
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, projectId]);

  async function patchDefaults(partial: {
    default_generation_style?: string | null;
    default_modifiers?: string[];
  }) {
    setSavingStyle(true);
    setStyleError(null);
    try {
      const resp = await authFetch(`/api/sessions/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      if (!resp.ok) {
        const detail = await resp.text();
        throw new Error(detail || `HTTP ${resp.status}`);
      }
      const updated = await resp.json();
      setDefaultGranularity((updated.default_generation_style ?? null) as string | null);
      setDefaultModifiers((updated.default_modifiers ?? []) as string[]);
    } catch (e) {
      setStyleError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingStyle(false);
    }
  }

  function pickGranularity(slug: string | null) {
    void patchDefaults({ default_generation_style: slug });
  }

  function toggleModifier(slug: string) {
    const next = defaultModifiers.includes(slug)
      ? defaultModifiers.filter((m) => m !== slug)
      : [...defaultModifiers, slug];
    void patchDefaults({ default_modifiers: next });
  }

  /** Bulk-set both axes from a preset in one PATCH so the round-trip stays atomic. */
  function pickPreset(preset: PresetDTO) {
    void patchDefaults({
      default_generation_style: preset.granularity,
      default_modifiers: preset.modifiers,
    });
  }

  /** Clear both axes — wizard will start at the global default. */
  function clearDefaults() {
    void patchDefaults({ default_generation_style: null, default_modifiers: [] });
  }

  const activePreset = detectActivePreset(presets, defaultGranularity, defaultModifiers);

  return (
    <>
      <header className="border-b border-border/60 bg-card/60 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-[var(--page-w)] items-center justify-between gap-4 px-6">
          <div className="min-w-0">
            <Link
              href="/board"
              className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to board
            </Link>
            <h1 className="text-xl font-semibold text-foreground/90">
              Board settings
              {projectName && (
                <span className="ml-2 font-normal text-muted-foreground">— {projectName}</span>
              )}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Customize columns, WIP limits, and lifecycle roles. Changes broadcast to other viewers
              in real time.
            </p>
          </div>
        </div>
      </header>

      <PageShell>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {board && (
          <BoardSettingsContent
            board={board}
            layout="page"
            onCreateColumn={createColumn}
            onUpdateColumn={updateColumn}
            onDeleteColumn={deleteColumn}
            onReorderColumns={reorderColumns}
          />
        )}

        {/* Ticket-generation defaults — preset-first, with the dual-axis picker
            behind a Customize expander. Mirrors the wizard's PresetPickerGate. */}
        <section className="mt-10 rounded-lg border border-border/60 bg-card/40 p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground/90">
              Ticket generation defaults
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pre-select what the Completion Wizard starts with on this session. Users can still
              override per generation.
            </p>
          </div>

          {/* Preset cards (default view) */}
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {presets.map((preset) => {
                const isSelected = activePreset === preset.slug;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => !savingStyle && pickPreset(preset)}
                    disabled={savingStyle}
                    aria-pressed={isSelected}
                    className={`group text-left rounded-lg border p-3.5 transition-colors flex flex-col gap-2 ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                        : 'border-border bg-card/40 hover:border-border/80 hover:bg-card/60'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-start gap-2">
                      <NamedIcon
                        name={preset.icon}
                        className={`h-4 w-4 shrink-0 mt-0.5 ${
                          isSelected ? 'text-primary' : 'text-foreground/60'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium ${
                            isSelected ? 'text-primary' : 'text-foreground/90'
                          }`}
                        >
                          {preset.label}
                        </div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">
                          {GRANULARITY_OPTIONS.find((g) => g.slug === preset.granularity)?.label ??
                            preset.granularity}
                          {preset.modifiers.length > 0
                            ? ` · ${preset.modifiers.length} modifier${preset.modifiers.length === 1 ? '' : 's'}`
                            : ' · no modifiers'}
                        </div>
                      </div>
                    </div>
                    {preset.blurb && (
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {preset.blurb}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={clearDefaults}
                disabled={savingStyle || (!defaultGranularity && defaultModifiers.length === 0)}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Clear defaults
              </button>
              {!activePreset && (defaultGranularity || defaultModifiers.length > 0) && (
                <span className="text-muted-foreground">
                  Current: <span className="text-foreground/80">custom</span>
                </span>
              )}
            </div>
          </div>

          {/* Customize expander */}
          <div className="border-t border-border/40 pt-4">
            <button
              type="button"
              onClick={() => setShowCustomize(!showCustomize)}
              aria-expanded={showCustomize}
              className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${showCustomize ? 'rotate-0' : '-rotate-90'}`}
              />
              {showCustomize ? 'Hide customisation' : 'Customize…'}
            </button>
            {showCustomize && (
              <div className="mt-4 space-y-5">
                {/* Granularity */}
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Number of tickets
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => pickGranularity(null)}
                      disabled={savingStyle}
                      aria-pressed={defaultGranularity === null}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                        defaultGranularity === null
                          ? 'bg-primary/15 text-primary border-primary/40'
                          : 'bg-background/60 text-foreground/70 border-border hover:text-foreground'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      No default
                    </button>
                    {GRANULARITY_OPTIONS.map((opt) => {
                      const selected = defaultGranularity === opt.slug;
                      return (
                        <button
                          key={opt.slug}
                          type="button"
                          onClick={() => !savingStyle && pickGranularity(opt.slug)}
                          disabled={savingStyle}
                          title={opt.blurb}
                          aria-pressed={selected}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                            selected
                              ? 'bg-primary/15 text-primary border-primary/40'
                              : 'bg-background/60 text-foreground/70 border-border hover:text-foreground'
                          } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Modifiers, grouped by category */}
                <div className="space-y-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Approach{' '}
                    <span className="font-normal lowercase text-muted-foreground/70">
                      (toggle any)
                    </span>
                  </div>
                  {MODIFIER_CATEGORIES.map((cat) => {
                    const catOpts = MODIFIER_OPTIONS.filter((o) => o.category === cat.key);
                    if (catOpts.length === 0) return null;
                    return (
                      <div key={cat.key}>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5">
                          {cat.label}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {catOpts.map((opt) => {
                            const repoMissing = opt.requiresRepo && !projectRepoUrl;
                            const isDisabled = savingStyle || repoMissing;
                            const selected = defaultModifiers.includes(opt.slug);
                            return (
                              <button
                                key={opt.slug}
                                type="button"
                                onClick={() => !isDisabled && toggleModifier(opt.slug)}
                                disabled={isDisabled}
                                title={
                                  repoMissing
                                    ? 'Link a GitHub repo on the project to use this.'
                                    : opt.blurb
                                }
                                aria-pressed={selected}
                                className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors ${
                                  selected
                                    ? 'bg-primary/15 text-primary border-primary/40'
                                    : 'bg-background/60 text-foreground/70 border-border hover:text-foreground'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {styleError && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {styleError}
            </div>
          )}
        </section>
      </PageShell>
    </>
  );
}
