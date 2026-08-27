'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Accessibility,
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  FileCode2,
  Flag,
  FlaskConical,
  GitBranch,
  Grid3x3,
  HelpCircle,
  Layers,
  Layers3,
  ListChecks,
  Loader2,
  Minimize2,
  MonitorPlay,
  Pencil,
  RefreshCw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  User as UserIcon,
  Waves,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import {
  BUILTIN_PRESETS,
  fetchOrgPresets,
  ICON_BY_NAME,
  type PresetDTO,
} from '@/lib/api/generation-presets';
import {
  BUILTIN_GRANULARITIES,
  BUILTIN_MODIFIERS,
  fetchOrgGranularities,
  fetchOrgModifiers,
  MODIFIER_CATEGORIES,
  type GranularityDTO,
  type ModifierDTO,
} from '@/lib/api/generation-options';
import { TemplateBadge } from '@/components/tickets/template-badge';
import {
  clearCachedStories,
  computeDependentsByIdx,
  findOrphanedDependents,
  formatWaveHeader,
  groupTasksByWave,
  readCachedStories,
  writeCachedStories,
} from './completion-wizard-helpers';
import { GeneratingTasksLoader } from './generating-tasks-loader';

export type WizardTask = {
  title: string;
  description?: string | null;
  priority?: string;
  story_points?: number | null;
  labels?: string[];
  acceptance_criteria?: string[];
  depends_on_indices?: number[];
  related_to_indices?: number[];
  wave?: number | null;
  sequence?: number | null;
  template_slug?: string | null;
  custom_fields?: Record<string, unknown> | null;
  children?: Array<{
    title: string;
    description?: string | null;
    priority?: string;
    story_points?: number | null;
    labels?: string[];
    acceptance_criteria?: string[];
    depends_on_indices?: number[];
  }>;
};

type TemplateMeta = { slug: string; name: string };

interface CompletionWizardProps {
  projectId: string;
  /** Used to scope the localStorage cache so a refresh / tab-close during the
   * stories step doesn't lose the AI preview + the user's edits. */
  sessionId: string;
  onCancel: () => void;
  /** Persist the user-approved task list and finalise the session. The wizard
   * awaits this when the user clicks "Looks good — generate board" and shows
   * a loading state until it resolves; the parent is expected to navigate
   * away on success. Should throw on failure so the wizard surfaces the
   * error in its built-in error UI. */
  onCommit: (approvedTasks: WizardTask[]) => Promise<void>;
}

const SECTION_LABELS: Record<string, string> = {
  project_overview: 'Project Overview',
  goals_constraints: 'Goals & Constraints',
  users_personas: 'Users & Personas',
  team_capacity: 'Team & Capacity',
  architecture: 'Architecture',
  tech_stack: 'Tech Stack',
  api_integrations: 'API & Integrations',
  ui_ux: 'UI / UX',
  security_compliance: 'Security & Compliance',
  infrastructure: 'Infrastructure',
  risks_unknowns: 'Risks & Unknowns',
  out_of_scope: 'Out of Scope',
  open_questions: 'Open Questions',
};

const SECTION_HINTS: Record<string, string> = {
  project_overview: "A 1-2 sentence summary of what you're building",
  goals_constraints: 'What success looks like and any non-negotiables',
  users_personas: "Who'll use this and what they need",
  team_capacity: 'Team size, roles, and time available',
  architecture: 'How the major pieces fit together',
  tech_stack: 'Frontend, backend, and database choices',
  api_integrations: "External services and APIs you'll call",
  ui_ux: 'Style direction and key user flows',
  security_compliance: 'Auth approach and data sensitivity',
  infrastructure: 'Hosting, deploys, and CI',
  risks_unknowns: "What could break, what's still unclear",
  out_of_scope: "What you're explicitly not building",
  open_questions: 'Things to revisit later',
};

type StepKey = 'gaps' | 'defaults' | 'stories';
type StepDef = { key: StepKey; label: string };

// Two orthogonal axes. Keep slug values in sync with
// backend/src/app/services/generation_styles.py.
//
// Axis 1 (single-select, required): number of tickets / size each.
// Axis 2 (multi-select, 0+): functional shape — these stack independently
// so a user can ask for "many small + spike-first + user stories" together.
export type Granularity = 'minimal' | 'balanced' | 'many_small';
export type Modifier =
  // shape
  | 'vertical_slices'
  | 'story_driven'
  | 'spike_first'
  | 'wave_optimised'
  | 'follow_practices'
  // quality / production-readiness
  | 'test_driven'
  | 'docs_bundled'
  | 'observability_first'
  | 'release_ready'
  // risk & compliance
  | 'risk_mitigated'
  | 'compliance_aware'
  | 'accessibility'
  // methodology
  | 'mvp_first'
  | 'gherkin_ac'
  | 'api_contract_first'
  | 'demo_waves';

type ModifierCategory = 'shape' | 'quality' | 'risk' | 'methodology';

type GranularityOption = {
  slug: Granularity;
  label: string;
  signature: string;
  blurb: string;
  icon: LucideIcon;
};

type ModifierOption = {
  slug: Modifier;
  category: ModifierCategory;
  label: string;
  signature: string;
  blurb: string;
  icon: LucideIcon;
  requiresRepo?: boolean;
};

const GRANULARITY_OPTIONS: ReadonlyArray<GranularityOption> = [
  {
    slug: 'balanced',
    label: 'Balanced',
    signature: '8–20 tickets · 1–3 days each',
    blurb: 'Well-rounded backlog for a typical sprint.',
    icon: Layers,
  },
  {
    slug: 'minimal',
    label: 'Minimal',
    signature: '3–6 tickets · 3–5 days each',
    blurb: 'Few larger tickets, merged across concerns.',
    icon: Minimize2,
  },
  {
    slug: 'many_small',
    label: 'Many small',
    signature: '20–40 tickets · ≤1 day each',
    blurb: 'Aggressively split. Easy to parallelise.',
    icon: Grid3x3,
  },
];

const MODIFIER_OPTIONS: ReadonlyArray<ModifierOption> = [
  // ── shape ─────────────────────────────────────────────────────────────
  {
    slug: 'vertical_slices',
    category: 'shape',
    label: 'Vertical slices',
    signature: 'End-to-end per ticket',
    blurb: 'Each ticket spans UI + API + DB so it ships as one PR.',
    icon: Layers3,
  },
  {
    slug: 'story_driven',
    category: 'shape',
    label: 'User stories',
    signature: 'As a … I want …',
    blurb: 'Titles framed as user outcomes.',
    icon: UserIcon,
  },
  {
    slug: 'spike_first',
    category: 'shape',
    label: 'Spike-first',
    signature: 'Investigate unknowns',
    blurb: 'Insert time-boxed spikes ahead of unknowns and ambiguity.',
    icon: Compass,
  },
  {
    slug: 'wave_optimised',
    category: 'shape',
    label: 'Wave-optimised',
    signature: 'Max parallel wave 0',
    blurb: 'Minimise dependencies so the orchestrator runs flat.',
    icon: Waves,
  },
  {
    slug: 'follow_practices',
    category: 'shape',
    label: 'Follow your practices',
    signature: 'Mirror your repo',
    blurb: 'Reads your linked GitHub repo and matches its conventions.',
    icon: GitBranch,
    requiresRepo: true,
  },
  // ── quality / production-readiness ────────────────────────────────────
  {
    slug: 'test_driven',
    category: 'quality',
    label: 'Test-driven',
    signature: 'Tests required',
    blurb: 'Test AC on every ticket; paired test tickets for non-trivial features.',
    icon: FlaskConical,
  },
  {
    slug: 'docs_bundled',
    category: 'quality',
    label: 'Docs bundled',
    signature: 'Docs updated as we go',
    blurb: 'Every user-facing change includes a docs touch; new surfaces get docs tickets.',
    icon: BookOpen,
  },
  {
    slug: 'observability_first',
    category: 'quality',
    label: 'Observability-first',
    signature: 'Logs · metrics · traces',
    blurb: 'Every ticket includes logging/metric AC; new services get observability tickets.',
    icon: Activity,
  },
  {
    slug: 'release_ready',
    category: 'quality',
    label: 'Release-ready',
    signature: 'Deploy + flag + rollback',
    blurb: 'Final wave includes explicit deploy, flag, monitoring, and rollback tickets.',
    icon: Rocket,
  },
  // ── risk & compliance ─────────────────────────────────────────────────
  {
    slug: 'risk_mitigated',
    category: 'risk',
    label: 'Risk-mitigated',
    signature: 'Concrete mitigations',
    blurb: 'Emit a mitigation ticket for each KNOWN risk in the blueprint.',
    icon: ShieldAlert,
  },
  {
    slug: 'compliance_aware',
    category: 'risk',
    label: 'Compliance-aware',
    signature: 'Audit · encrypt · access',
    blurb: 'Dedicated compliance tickets when the blueprint has security/compliance content.',
    icon: ShieldCheck,
  },
  {
    slug: 'accessibility',
    category: 'risk',
    label: 'Accessibility',
    signature: 'a11y AC on UI tickets',
    blurb: 'Force a11y AC on UI tickets; at least one a11y audit ticket per surface.',
    icon: Accessibility,
  },
  // ── methodology ───────────────────────────────────────────────────────
  {
    slug: 'mvp_first',
    category: 'methodology',
    label: 'MVP-first',
    signature: 'Deployable v0 first',
    blurb: 'Order so waves 0–1 ship a usable v0; later waves are enhancements.',
    icon: Flag,
  },
  {
    slug: 'gherkin_ac',
    category: 'methodology',
    label: 'Gherkin AC',
    signature: 'Given / When / Then',
    blurb: 'BDD-shaped acceptance criteria. Composes with User stories.',
    icon: ListChecks,
  },
  {
    slug: 'api_contract_first',
    category: 'methodology',
    label: 'API-contract-first',
    signature: 'Schema before code',
    blurb: 'OpenAPI/schema tickets land BEFORE any implementation that consumes them.',
    icon: FileCode2,
  },
  {
    slug: 'demo_waves',
    category: 'methodology',
    label: 'Demo-able waves',
    signature: 'Each wave demos',
    blurb: 'Every wave ends with a stakeholder-demoable artifact.',
    icon: MonitorPlay,
  },
];

const GRANULARITY_BY_SLUG: Record<Granularity, GranularityOption> = GRANULARITY_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.slug] = opt;
    return acc;
  },
  {} as Record<Granularity, GranularityOption>,
);

const MODIFIER_BY_SLUG: Record<Modifier, ModifierOption> = MODIFIER_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.slug] = opt;
    return acc;
  },
  {} as Record<Modifier, ModifierOption>,
);

const DEFAULT_GRANULARITY: Granularity = 'balanced';

// ── Presets ────────────────────────────────────────────────────────────────
// Preset DEFINITIONS now live on the backend at /api/generation-presets
// (org-level, editable in the Studio). Iteration 5 lifted them out of this
// file. We still rely on the shared client util for the BUILTIN fallback +
// the icon-name → LucideIcon map.

/** Return the preset slug whose (granularity, modifiers) exactly matches the
 * current selection, or null if the combo is bespoke (= Custom). Order-
 * independent on modifiers since they're a set, not a sequence. Caller
 * supplies the candidate presets — typically the org's fetched list. */
function detectActivePreset(
  presets: ReadonlyArray<PresetDTO>,
  g: Granularity,
  m: Modifier[],
): string | null {
  const sortedM = [...m].sort();
  for (const p of presets) {
    if (p.granularity !== g) continue;
    if (p.modifiers.length !== m.length) continue;
    const sortedP = [...p.modifiers].sort();
    if (sortedP.every((slug, i) => slug === sortedM[i])) return p.slug;
  }
  return null;
}

/** Cheap client-side heuristic over blueprint section content. Returns the
 * preset slug we think best fits this project. Falls back to the first
 * preset by sort_order if the heuristic-picked slug isn't in the org's set
 * (e.g. an admin renamed or deleted "stakeholder_demo"). */
function recommendPreset(
  presets: ReadonlyArray<PresetDTO>,
  blueprint: Record<string, string>,
): string | null {
  if (presets.length === 0) return null;
  const has = (key: string) => (blueprint[key] || '').trim().length > 0;
  const filled = Object.values(blueprint).filter((v) => (v || '').trim().length > 0).length;
  let preferred: string;
  if (filled <= 2) preferred = 'quick_prototype';
  else if (has('security_compliance')) preferred = 'production_grade';
  else if (has('users_personas')) preferred = 'stakeholder_demo';
  else preferred = 'standard_sprint';
  return presets.some((p) => p.slug === preferred) ? preferred : presets[0].slug;
}

const ALL_STEPS: readonly StepDef[] = [
  { key: 'gaps', label: 'Check coverage' },
  { key: 'defaults', label: 'Review defaults' },
  { key: 'stories', label: 'Preview tasks' },
];

/** Build the visible step list. The defaults step is skipped when there are no
 * empty sections — thin sections are handled inline via the per-card Improve
 * action, so a separate "review defaults" page would be empty. */
function buildSteps(hasEmptySections: boolean): StepDef[] {
  return ALL_STEPS.filter((s) => s.key !== 'defaults' || hasEmptySections);
}

type Coverage = {
  scores: Record<string, number>;
  gaps: string[];
  overall?: number;
};

type DefaultDecision = 'accepted' | 'declined';

type DefaultRow = {
  section: string;
  suggestion: string;
  edited: string;
  decision: DefaultDecision;
  isEdited: boolean;
};

export function CompletionWizard({
  projectId,
  sessionId,
  onCancel,
  onCommit,
}: CompletionWizardProps) {
  const { authFetch } = useAuthFetch();
  const [step, setStep] = useState<StepKey>('gaps');
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [blueprint, setBlueprint] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<DefaultRow[]>([]);
  const [tasks, setTasks] = useState<WizardTask[]>([]);
  const [templatesBySlug, setTemplatesBySlug] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [expandedTaskIdx, setExpandedTaskIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const cardRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  // Job-id from /stories/preview-async + polling status. Cleared between
  // sessions so a stale job from a previous wizard mount doesn't leak in.
  const [jobId, setJobId] = useState<string | null>(null);
  const [wavesComplete, setWavesComplete] = useState(0);
  const [jobStatus, setJobStatus] = useState<
    'pending' | 'running' | 'complete' | 'failed' | 'cancelled' | null
  >(null);
  // Per-thin-card improve state.
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [improveDraft, setImproveDraft] = useState<string>('');
  const [improveSuggesting, setImproveSuggesting] = useState(false);
  const [improveSaving, setImproveSaving] = useState(false);
  // Regenerate-with-feedback dialog state.
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  // Two-axis style picker state. Granularity is single-select (drives the
  // per-wave count target); modifiers stack 0+ functional shape choices.
  // Seeded from project defaults on mount. `projectRepoUrl` gates the
  // follow_practices modifier; `genWarning` carries the non-fatal warning
  // the backend returns when follow_practices fails and gets dropped.
  const [granularity, setGranularity] = useState<Granularity>(DEFAULT_GRANULARITY);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [projectRepoUrl, setProjectRepoUrl] = useState<string | null>(null);
  const [genWarning, setGenWarning] = useState<string | null>(null);
  // Snapshot of the granularity actually sent on the in-flight job, used by
  // the loader to decide which phase copy to show ("Reading your repo's
  // conventions…" only matters when follow_practices is in modifiers).
  const requestedModifiersRef = useRef<Modifier[]>([]);
  // Gate that prevents auto-firing the AI call when the user enters the
  // stories step. Generation only starts after the user clicks Generate.
  // A cached preview (page refresh / re-entry) bypasses the gate since the
  // user already made a choice in the prior visit.
  const [generationStarted, setGenerationStarted] = useState(false);
  // Whether the Customize panel inside the preset gate is expanded. Auto-opens
  // when the user's project defaults resolve to a bespoke (non-preset) combo
  // so they can see what's actually selected.
  const [showCustomize, setShowCustomize] = useState(false);
  // Org's preset definitions, fetched on mount. Pre-seeded with the built-in
  // 4 so the first paint isn't empty and the picker still renders if the
  // backend fetch fails. Replaced by the real list once it lands.
  const [presets, setPresets] = useState<PresetDTO[]>([...BUILTIN_PRESETS]);
  // Iteration 6: same pattern for the granularity + modifier menus themselves.
  // Admins can edit / add / reorder these in /studio → Tickets → Granularities
  // (or Modifiers). The wizard reflects their edits on the next mount.
  const [granularities, setGranularities] = useState<GranularityDTO[]>([...BUILTIN_GRANULARITIES]);
  const [modifierOpts, setModifierOpts] = useState<ModifierDTO[]>([...BUILTIN_MODIFIERS]);

  // Fetch the org's preset + granularity + modifier definitions in parallel
  // on mount. Each replaces its BUILTIN_* fallback once the real list lands.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [presetsData, gransData, modsData] = await Promise.all([
          fetchOrgPresets(authFetch),
          fetchOrgGranularities(authFetch),
          fetchOrgModifiers(authFetch),
        ]);
        if (cancelled) return;
        if (presetsData.length > 0) setPresets(presetsData);
        if (gransData.length > 0) setGranularities(gransData);
        if (modsData.length > 0) setModifierOpts(modsData);
      } catch (e) {
        // Best-effort — wizard keeps using BUILTIN_* fallbacks. Still log
        // so an expired session or backend outage is visible in the console.
        console.warn('[completion-wizard] failed to load org generation options', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // Fetch the project so we can seed both axes from its saved defaults and
  // know whether to disable follow_practices. Fire-and-forget; failure
  // leaves the picker at the global defaults.
  //
  // Initial preset resolution:
  //   1. Saved project defaults that match a preset → seed that preset, leave
  //      Customize collapsed.
  //   2. Saved project defaults that are bespoke (no matching preset) → seed
  //      the saved combo, auto-OPEN Customize so the user can see what's set.
  //   3. No saved defaults → leave granularity/modifiers at their initial
  //      state (DEFAULT_GRANULARITY + []), let the recommend heuristic pick
  //      which preset card gets the "Recommended" pill once the blueprint
  //      loads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch(`/api/projects/${projectId}`);
        if (!r.ok || cancelled) return;
        const proj = await r.json();
        if (cancelled) return;
        setProjectRepoUrl((proj?.repo_url ?? null) as string | null);
        const defGran = proj?.default_generation_style as string | null | undefined;
        const defModsRaw = (proj?.default_modifiers ?? []) as string[];
        // Validate saved defaults against the CURRENTLY-LOADED options. If
        // org-fetched options haven't landed yet, this falls back to BUILTIN_*
        // — same set the user would have seen pre-iteration-6, so the
        // saved-default behaviour stays consistent.
        const validMods = defModsRaw.filter((m): m is Modifier =>
          modifierOpts.some((o) => o.slug === m),
        );
        const validGran =
          defGran && granularities.some((o) => o.slug === defGran)
            ? (defGran as Granularity)
            : null;
        if (validGran) setGranularity(validGran);
        if (validMods.length > 0) setModifiers(validMods);
        // Auto-open Customize when the saved defaults don't exactly match any
        // preset — otherwise the user would see a "Custom" indicator with no
        // explanation of what's actually selected.
        const effGran = validGran ?? DEFAULT_GRANULARITY;
        // Note: we match against the CURRENT presets state at the time the
        // project fetch completes. If the org's presets are still loading,
        // this falls back to BUILTIN_PRESETS — same set the user would have
        // seen on the previous (hardcoded) version of the wizard, so the
        // auto-open behaviour stays consistent.
        const matched = detectActivePreset(presets, effGran, validMods);
        if ((validGran || validMods.length > 0) && !matched) {
          setShowCustomize(true);
        }
      } catch (e) {
        // Best-effort — picker stays at defaults. Log so an expired
        // session or transient backend error is visible.
        console.warn('[completion-wizard] failed to load project meta', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, projectId]);

  // Blueprint-aware recommendation: cheap client-side heuristic over
  // section content. Only recomputed when the blueprint changes — picking a
  // preset doesn't shuffle the recommendation badge under the user.
  const recommendedPreset = useMemo(
    () => recommendPreset(presets, blueprint),
    [presets, blueprint],
  );

  const emptySectionKeys = useMemo(() => {
    if (!coverage) return [];
    return (coverage.gaps || []).filter((s) => (coverage.scores?.[s] ?? 0) === 0);
  }, [coverage]);
  const steps = useMemo(() => buildSteps(emptySectionKeys.length > 0), [emptySectionKeys.length]);
  const filledBlueprintSections = useMemo(
    () => Object.values(blueprint).filter((v) => v && v.trim().length > 0).length,
    [blueprint],
  );

  // ── Step 1: load coverage + blueprint content; if no gaps, jump to stories.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      authFetch(`/api/projects/${projectId}/blueprint/coverage`).then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`coverage ${r.status}`)),
      ),
      authFetch(`/api/projects/${projectId}/blueprint`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([cov, bp]: [Coverage, { content?: Record<string, string> } | null]) => {
        if (cancelled) return;
        setCoverage(cov);
        if (bp?.content) setBlueprint(bp.content);
        if (!cov.gaps || cov.gaps.length === 0) {
          setStep('stories');
        }
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, authFetch]);

  // ── Step 3: load tasks when entering the stories step.
  // Note: authFetch is reconstructed on every render of useAuthFetch, so we
  // intentionally exclude loadTasks from the effect deps to prevent runaway
  // re-fires (which previously triggered 10+ parallel 60-second AI calls).
  const tasksLoadedRef = useRef(false);
  // True once we've hydrated from cache or from /stories/preview. The
  // cache-write effect only fires after this so an empty initial render
  // doesn't clobber a freshly-hydrated cache.
  const hydratedRef = useRef(false);

  // The currently-active job id, mirrored as a ref so loadTasks() can read it
  // without re-creating its closure every time the state changes.
  const jobIdRef = useRef<string | null>(null);
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  const loadTasks = useCallback(
    async (
      opts: {
        force?: boolean;
        feedback?: string;
        dislikedTitles?: string[];
        granularity?: Granularity;
        modifiers?: Modifier[];
      } = {},
    ) => {
      setLoading(true);
      setError(null);

      // Hydrate from localStorage when not forcing a fresh AI call.
      if (!opts.force) {
        const cached = readCachedStories(sessionId);
        if (cached) {
          setTasks(cached.tasks);
          setTemplatesBySlug(cached.templatesBySlug);
          setRemoved(new Set(cached.removed));
          setExpandedTaskIdx(null);
          setHoveredIdx(null);
          hydratedRef.current = true;
          setLoading(false);
          return;
        }
      }

      // Cancel any in-flight job before starting a new one (regenerate path).
      const stale = jobIdRef.current;
      if (opts.force && stale) {
        try {
          await authFetch(`/api/jobs/${stale}/cancel`, { method: 'POST' });
        } catch (e) {
          console.warn('[completion-wizard] stale-job cancel failed', e);
          // Best-effort cancel; if it fails the old job will eventually die on
          // its own. Don't block the new request.
        }
      }

      // Reset wave/task state for the fresh job.
      setTasks([]);
      setRemoved(new Set());
      setExpandedTaskIdx(null);
      setHoveredIdx(null);
      setWavesComplete(0);
      setJobStatus('pending');
      setJobId(null);

      try {
        const chosenGranularity = (opts.granularity ?? granularity) as Granularity;
        const chosenModifiers = (opts.modifiers ?? modifiers) as Modifier[];
        requestedModifiersRef.current = chosenModifiers;
        setGenWarning(null);
        const body = {
          feedback: opts.feedback?.trim() || null,
          disliked_titles: opts.dislikedTitles ?? [],
          granularity: chosenGranularity,
          modifiers: chosenModifiers,
        };
        const init: RequestInit = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        };
        const r = await authFetch(`/api/projects/${projectId}/stories/preview-async`, init);
        if (!r.ok) {
          const detail = await extractErrorDetail(r);
          throw new Error(detail);
        }
        const data = await r.json();
        if (!data.job_id) throw new Error('No job_id returned from preview-async');
        setJobId(data.job_id);
        if (data.warning && typeof data.warning === 'string') {
          setGenWarning(data.warning);
        }
        // Loading stays true; the polling effect flips it false on terminal status.
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    },
    [projectId, sessionId, authFetch, granularity, modifiers],
  );

  // Poll the job endpoint while a job is active. Stops when status reaches a
  // terminal state (complete, failed, cancelled) or the component unmounts.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const r = await authFetch(`/api/jobs/${jobId}`);
        if (cancelled) return;
        if (!r.ok) {
          const detail = await extractErrorDetail(r);
          setError(detail);
          setLoading(false);
          return;
        }
        const data = await r.json();
        if (cancelled) return;

        setTasks(data.partial_tasks || []);
        setWavesComplete(data.waves_complete || 0);
        setJobStatus(data.status);

        // Templates only land after the worker has loaded them from the org.
        // Only update if we got non-empty entries to avoid flashing the
        // template-badge fallback on early polls.
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          const lookup: Record<string, string> = {};
          for (const t of data.templates as TemplateMeta[]) {
            if (t?.slug) lookup[t.slug] = t.name || t.slug;
          }
          setTemplatesBySlug(lookup);
        }

        if (data.status === 'complete') {
          hydratedRef.current = true;
          // Seed the cache so a tab refresh doesn't trigger a fresh job.
          const finalTasks: WizardTask[] = data.partial_tasks || [];
          const lookup: Record<string, string> = {};
          for (const t of (data.templates || []) as TemplateMeta[]) {
            if (t?.slug) lookup[t.slug] = t.name || t.slug;
          }
          writeCachedStories(sessionId, {
            tasks: finalTasks,
            templatesBySlug: lookup,
            removed: [],
          });
          setLoading(false);
          return;
        }
        if (data.status === 'failed' || data.status === 'cancelled') {
          setError(data.error || `Task generation ${data.status}`);
          setLoading(false);
          return;
        }
        // pending or running — keep polling.
        timeoutId = setTimeout(poll, 2000);
      } catch (e) {
        if (cancelled) return;
        // Transient network error — retry once after a backoff. If the
        // session has actually gone away, the next poll will surface a real
        // error from the server.
        timeoutId = setTimeout(poll, 2500);
        void e;
      }
    };

    // Kick off the first poll right away — Wave 0 typically lands in ~15-25s
    // so an extra 2s delay before the first read is unnecessary lag.
    timeoutId = setTimeout(poll, 200);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [jobId, authFetch, sessionId]);

  // Mirror in-progress edits to localStorage so refresh / tab-close doesn't
  // throw away the user's removed-set or inline-edited fields.
  useEffect(() => {
    if (!hydratedRef.current || tasks.length === 0) return;
    writeCachedStories(sessionId, {
      tasks,
      templatesBySlug,
      removed: Array.from(removed),
    });
  }, [tasks, removed, templatesBySlug, sessionId]);

  useEffect(() => {
    if (step !== 'stories') {
      tasksLoadedRef.current = false;
      setGenerationStarted(false);
      return;
    }
    if (tasksLoadedRef.current) return;
    // Refresh / re-entry: if the user already generated on a prior visit,
    // the cached preview hydrates immediately and the gate is skipped.
    const cached = readCachedStories(sessionId);
    if (cached) {
      tasksLoadedRef.current = true;
      setGenerationStarted(true);
      loadTasks();
    }
    // No cache → leave gate up. User picks a style, clicks Generate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionId]);

  const startGeneration = useCallback(() => {
    tasksLoadedRef.current = true;
    setGenerationStarted(true);
    loadTasks({ force: true });
  }, [loadTasks]);

  // ── Step 2: fetch and shape defaults when entering defaults step.
  // Only empty sections — thin sections are improved inline on the gaps pane
  // via the per-card "Improve" action.
  const loadDefaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await authFetch(`/api/projects/${projectId}/blueprint/suggest-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: emptySectionKeys }),
      });
      if (!r.ok) {
        const detail = await extractErrorDetail(r);
        throw new Error(detail);
      }
      const data = await r.json();
      const rows: DefaultRow[] = Object.entries(data.suggestions || {}).map(
        ([section, suggestion]) => ({
          section,
          suggestion: String(suggestion),
          edited: String(suggestion),
          decision: 'accepted',
          isEdited: false,
        }),
      );
      setDefaults(rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, authFetch, emptySectionKeys]);

  const advanceFromGaps = () => {
    if (emptySectionKeys.length > 0) {
      setStep('defaults');
      loadDefaults();
    } else {
      setStep('stories');
    }
  };

  // ── Per-thin-card improve handlers ───────────────────────────────────────
  const startImprove = (section: string) => {
    setExpandedSection(section);
    setImproveDraft(blueprint[section] || '');
  };
  const cancelImprove = () => {
    setExpandedSection(null);
    setImproveDraft('');
    setImproveSuggesting(false);
  };
  const requestSuggestion = async () => {
    if (!expandedSection) return;
    setImproveSuggesting(true);
    try {
      const r = await authFetch(`/api/projects/${projectId}/blueprint/suggest-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: [expandedSection] }),
      });
      if (!r.ok) {
        const detail = await extractErrorDetail(r);
        throw new Error(detail);
      }
      const data = await r.json();
      const suggestion = data.suggestions?.[expandedSection];
      if (suggestion) setImproveDraft(String(suggestion));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImproveSuggesting(false);
    }
  };
  const saveImprove = async () => {
    if (!expandedSection || !improveDraft.trim()) return;
    setImproveSaving(true);
    try {
      const r = await authFetch(
        `/api/projects/${projectId}/blueprint/sections/${expandedSection}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: improveDraft.trim() }),
        },
      );
      if (!r.ok) {
        const detail = await extractErrorDetail(r);
        throw new Error(detail);
      }
      // Optimistic local update: mark this section as covered (score 100), drop from gaps.
      setCoverage((prev) =>
        prev
          ? {
              ...prev,
              scores: { ...prev.scores, [expandedSection]: 100 },
              gaps: (prev.gaps || []).filter((s) => s !== expandedSection),
            }
          : prev,
      );
      setBlueprint((prev) => ({ ...prev, [expandedSection]: improveDraft.trim() }));
      cancelImprove();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImproveSaving(false);
    }
  };

  const persistAcceptedDefaults = async () => {
    setSavingDefaults(true);
    try {
      const accepted = defaults.filter((d) => d.decision === 'accepted' && d.edited.trim());
      for (const row of accepted) {
        await authFetch(`/api/projects/${projectId}/blueprint/sections/${row.section}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: row.edited.trim() }),
        });
      }
      setStep('stories');
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingDefaults(false);
    }
  };

  const grouped = useMemo(() => groupTasksByWave(tasks, removed), [tasks, removed]);
  const orphanedDeps = useMemo(() => findOrphanedDependents(tasks, removed), [tasks, removed]);
  const dependentsByIdx = useMemo(() => computeDependentsByIdx(tasks), [tasks]);

  const scrollAndFlash = useCallback((idx: number) => {
    const el = cardRefs.current.get(idx);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashIdx(idx);
    setTimeout(() => setFlashIdx((cur) => (cur === idx ? null : cur)), 1200);
  }, []);

  // Inline edits in the expanded card flow back into `tasks` state, which
  // is what /stories/commit ultimately serializes — so user edits sync.
  const updateTask = useCallback((idx: number, patch: Partial<WizardTask>) => {
    setTasks((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }, []);

  // Per-card "Regenerate this ticket" — replaces the task in-place with the
  // AI's rewrite of the requested fields. Throws on failure so the dialog
  // can show the error.
  const regenerateOneTask = useCallback(
    async (idx: number, fields: string[], feedback: string) => {
      const target = tasks[idx];
      if (!target) throw new Error('Task no longer exists');
      const contextTitles = tasks
        .filter((_, i) => i !== idx && !removed.has(i))
        .map((t) => t.title);
      const r = await authFetch(`/api/projects/${projectId}/stories/preview/regenerate-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: target,
          fields,
          feedback: feedback.trim() || null,
          context_titles: contextTitles,
        }),
      });
      if (!r.ok) {
        const detail = await extractErrorDetail(r);
        throw new Error(detail);
      }
      const data = await r.json();
      const newTask = data.task as WizardTask | undefined;
      if (!newTask) throw new Error('Regenerate response missing `task` field');
      setTasks((prev) => prev.map((t, i) => (i === idx ? newTask : t)));
    },
    [tasks, removed, projectId, authFetch],
  );

  const [committing, setCommitting] = useState(false);
  const finish = async () => {
    if (committing) return;
    // Belt-and-suspenders: if the wave-generation job is still in flight,
    // cancel it before committing so the worker doesn't keep producing
    // (and billing for) waves that won't reach the board. The commit-button
    // disabled-state should normally prevent reaching this branch, but a
    // race at completion could slip through.
    const inflight = jobIdRef.current;
    if (inflight && (jobStatus === 'pending' || jobStatus === 'running')) {
      try {
        await authFetch(`/api/jobs/${inflight}/cancel`, { method: 'POST' });
      } catch (e) {
        console.warn('[completion-wizard] in-flight cancel failed', e);
        // Best-effort — commit proceeds either way.
      }
    }
    const approved = tasks.filter((_, i) => !removed.has(i));
    setCommitting(true);
    setError(null);
    try {
      await onCommit(approved);
      // success: parent navigates away; we deliberately leave `committing`
      // true so the wizard stays in its loading state until the unmount.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCommitting(false);
    }
  };

  if (loading && !coverage && step === 'gaps') {
    return (
      <WizardShell
        title="Checking blueprint coverage…"
        currentStep="gaps"
        steps={steps}
        onCancel={onCancel}
      >
        <LoadingBlock />
      </WizardShell>
    );
  }

  if (error) {
    const retry = step === 'stories' ? loadTasks : step === 'defaults' ? loadDefaults : undefined;
    return (
      <WizardShell
        title="Something went wrong"
        currentStep={step}
        steps={steps}
        onCancel={onCancel}
      >
        <div className="px-8 py-8 max-w-2xl">
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5">
            <p className="text-xs font-medium text-destructive/90 mb-1.5 tracking-wide uppercase">
              Request failed
            </p>
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
              {error}
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2">
            {retry && (
              <button
                onClick={() => {
                  setError(null);
                  retry();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Try again
              </button>
            )}
            <button
              onClick={onCancel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to session
            </button>
          </div>
        </div>
      </WizardShell>
    );
  }

  // ── GAPS PANE ────────────────────────────────────────────────────────────
  if (step === 'gaps') {
    const allSections = Object.keys(SECTION_LABELS);
    const scores = coverage?.scores || {};
    const gaps = coverage?.gaps || [];
    const gapSet = new Set(gaps);
    const filled = allSections.filter((s) => !gapSet.has(s));
    const overall = coverage?.overall ?? 0;
    const fullyCoveredCount = allSections.length - gaps.length;
    const hasSomeContentCount = allSections.filter((s) => (scores[s] ?? 0) > 0).length;
    const emptyCount = emptySectionKeys.length;
    const thinCount = gaps.length - emptyCount;

    let subtitle: string;
    if (gaps.length === 0) {
      subtitle = 'Every section is covered. Continue to preview the kanban tasks.';
    } else if (emptyCount > 0 && thinCount > 0) {
      subtitle = `${emptyCount} ${emptyCount === 1 ? 'section is' : 'sections are'} empty (we'll fill those next), and ${thinCount} could use a bit more detail — improve any of them inline below.`;
    } else if (emptyCount > 0) {
      subtitle = `${emptyCount} ${emptyCount === 1 ? 'section is' : 'sections are'} empty. We can suggest defaults — you'll review each one before it's saved.`;
    } else {
      subtitle = `${thinCount} ${thinCount === 1 ? 'section' : 'sections'} could use a bit more detail. Improve any inline, or continue to preview the tasks when you're ready.`;
    }

    return (
      <WizardShell
        title={
          gaps.length === 0 ? 'Your blueprint is in great shape' : "Let's review your blueprint"
        }
        subtitle={subtitle}
        currentStep="gaps"
        steps={steps}
        onCancel={onCancel}
      >
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-px bg-border/40">
          {/* LEFT: progress + covered sections */}
          <div className="bg-background overflow-y-auto p-6">
            <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-4">
              Coverage
            </p>
            <div className="mb-6">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-display text-4xl italic text-foreground tabular-nums">
                  {overall}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
              <div className="h-1 w-full bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-700"
                  style={{ width: `${overall}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                {fullyCoveredCount}/{allSections.length} fully covered
                {hasSomeContentCount > fullyCoveredCount && (
                  <span className="text-muted-foreground/60">
                    {' · '}
                    {hasSomeContentCount}/{allSections.length} have some content
                  </span>
                )}
              </p>
            </div>

            {filled.length > 0 && (
              <>
                <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
                  Already covered
                </p>
                <ul className="space-y-1.5">
                  {filled.map((s) => (
                    <li key={s} className="flex items-center gap-2 text-xs text-foreground/70">
                      <Check className="h-3 w-3 text-success/80 shrink-0" />
                      <span className="truncate">{SECTION_LABELS[s] || s}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
                        {scores[s] ?? 0}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          {/* RIGHT: gap cards */}
          <div className="bg-background overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
                Needs attention · {gaps.length}
                {emptyCount > 0 && thinCount > 0 && (
                  <span className="text-muted-foreground/60 normal-case tracking-normal ml-2">
                    ({emptyCount} empty, {thinCount} thin)
                  </span>
                )}
              </p>
            </div>

            {gaps.length === 0 ? (
              <div className="rounded-xl border border-success/20 bg-success/5 p-6 flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-success shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Everything is filled in.</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click Preview tasks to see the kanban board that will be generated.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {gaps.map((s) => {
                  const score = scores[s] ?? 0;
                  const isEmpty = score === 0;
                  const severity = isEmpty ? 'empty' : score < 40 ? 'low' : 'thin';
                  const isExpanded = expandedSection === s;
                  return (
                    <div
                      key={s}
                      className={`group rounded-lg border bg-card transition-colors ${
                        isExpanded
                          ? 'border-primary/40 md:col-span-2'
                          : 'border-border hover:border-primary/30'
                      }`}
                    >
                      <div className="p-3.5">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium text-foreground">
                            {SECTION_LABELS[s] || s}
                          </span>
                          <span
                            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                              isEmpty
                                ? 'bg-destructive/15 text-destructive'
                                : severity === 'low'
                                  ? 'bg-warning/15 text-warning'
                                  : 'bg-muted-foreground/60/15 text-muted-foreground'
                            }`}
                          >
                            {severity}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {isEmpty
                            ? `${SECTION_HINTS[s] || ''} · auto-fill in the next step`
                            : SECTION_HINTS[s] || ''}
                        </p>
                        <div className="mt-2 h-0.5 w-full bg-border/40 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isEmpty
                                ? 'bg-destructive/40'
                                : severity === 'low'
                                  ? 'bg-warning/50'
                                  : 'bg-muted-foreground/40/40'
                            }`}
                            style={{ width: `${Math.max(score, 4)}%` }}
                          />
                        </div>

                        {/* Per-thin-card actions: only thin/low get Improve. */}
                        {!isEmpty && !isExpanded && (
                          <button
                            onClick={() => startImprove(s)}
                            className="mt-3 flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-primary/90 hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Sparkles className="h-3 w-3" />
                            Improve this section
                          </button>
                        )}
                      </div>

                      {/* Inline improve editor (only one open at a time) */}
                      {isExpanded && (
                        <div className="border-t border-border/60 px-3.5 py-3 bg-background/40">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                            Edit content
                          </p>
                          <textarea
                            value={improveDraft}
                            onChange={(e) => setImproveDraft(e.target.value)}
                            rows={5}
                            placeholder={SECTION_HINTS[s] || 'Add content for this section…'}
                            className="w-full text-xs font-body bg-card border border-border rounded p-2 text-foreground resize-y focus:outline-none focus:border-primary/40"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              onClick={requestSuggestion}
                              disabled={improveSuggesting}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-primary/90 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                            >
                              {improveSuggesting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              {improveSuggesting
                                ? 'Generating…'
                                : improveDraft.trim()
                                  ? 'Suggest replacement'
                                  : 'Suggest content'}
                            </button>
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                onClick={cancelImprove}
                                disabled={improveSaving}
                                className="px-2.5 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveImprove}
                                disabled={improveSaving || !improveDraft.trim()}
                                className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-primary text-primary-foreground hover:bg-primary/85 transition-colors disabled:opacity-40"
                              >
                                {improveSaving ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" />
                                )}
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <WizardFooter>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to session
          </button>
          {emptyCount > 0 ? (
            <button
              onClick={advanceFromGaps}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Fill {emptyCount} empty {emptyCount === 1 ? 'section' : 'sections'}
            </button>
          ) : (
            <button
              onClick={() => setStep('stories')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Preview tasks
            </button>
          )}
        </WizardFooter>
      </WizardShell>
    );
  }

  // ── DEFAULTS PANE ────────────────────────────────────────────────────────
  if (step === 'defaults') {
    const acceptedCount = defaults.filter((d) => d.decision === 'accepted').length;
    const declinedCount = defaults.length - acceptedCount;
    const editedCount = defaults.filter((d) => d.decision === 'accepted' && d.isEdited).length;
    const setAll = (decision: DefaultDecision) =>
      setDefaults((prev) => prev.map((r) => ({ ...r, decision })));

    return (
      <WizardShell
        title="Review the suggested defaults"
        subtitle={
          defaults.length === 0
            ? 'No defaults to suggest. Skip to the task preview.'
            : `Defaults are accepted by default — uncheck the ones you don't want, or click ${'✎'} to tweak.`
        }
        currentStep="defaults"
        steps={steps}
        onCancel={onCancel}
      >
        {loading ? (
          <LoadingBlock label="Generating defaults…" />
        ) : defaults.length === 0 ? (
          <div className="px-8 py-12 text-center text-sm text-muted-foreground">
            No defaults to suggest. Skip to the task preview.
          </div>
        ) : (
          <>
            {/* Bulk-action toolbar */}
            <div className="px-8 py-3 border-b border-border flex items-center gap-3 shrink-0 bg-card/30">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-foreground tabular-nums font-medium">{acceptedCount}</span>
                <span className="text-muted-foreground">of {defaults.length} will be saved</span>
                {editedCount > 0 && (
                  <span className="text-warning/80 ml-1">· {editedCount} edited</span>
                )}
                {declinedCount > 0 && (
                  <span className="text-muted-foreground/60 ml-1">· {declinedCount} skipped</span>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setAll('accepted')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-success hover:bg-success/10 transition-colors"
                >
                  <Check className="h-3 w-3" />
                  Accept all
                </button>
                <button
                  onClick={() => setAll('declined')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-3 w-3" />
                  Decline all
                </button>
              </div>
            </div>

            {/* 2-column grid of compact cards */}
            <div className="flex-1 overflow-y-auto px-8 py-5">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {defaults.map((row, i) => (
                  <DefaultRowCard
                    key={row.section}
                    row={row}
                    onChange={(next) =>
                      setDefaults((prev) => prev.map((r, j) => (j === i ? next : r)))
                    }
                  />
                ))}
              </div>
            </div>
          </>
        )}

        <WizardFooter>
          <button
            onClick={() => setStep('gaps')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <button
            onClick={persistAcceptedDefaults}
            disabled={savingDefaults}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {savingDefaults ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Save {acceptedCount > 0 ? `${acceptedCount} ` : ''}and preview tasks
          </button>
        </WizardFooter>
      </WizardShell>
    );
  }

  // ── STORIES PANE ─────────────────────────────────────────────────────────
  return (
    <WizardShell
      title={
        generationStarted ? 'Preview your kanban tasks' : 'How should the AI break down your plan?'
      }
      subtitle={
        generationStarted
          ? 'Grouped by execution wave. Click a card to see its full content. Hover to highlight what it blocks and depends on.'
          : 'Pick a ticket style below. You can change it and regenerate at any time.'
      }
      currentStep="stories"
      steps={steps}
      onCancel={onCancel}
    >
      {generationStarted && (
        <StyleSummaryBar
          presets={presets}
          granularityOpts={granularities}
          modifierOpts={modifierOpts}
          granularity={granularity}
          modifiers={modifiers}
          warning={genWarning}
          onChange={() => setGenerationStarted(false)}
          disabled={loading || committing}
        />
      )}
      {!generationStarted ? (
        <PresetPickerGate
          presets={presets}
          granularityOpts={granularities}
          modifierOpts={modifierOpts}
          granularity={granularity}
          modifiers={modifiers}
          onChangeGranularity={setGranularity}
          onToggleModifier={(m) =>
            setModifiers((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]))
          }
          onPickPreset={(slug) => {
            const p = presets.find((x) => x.slug === slug);
            if (!p) return;
            setGranularity(p.granularity as Granularity);
            setModifiers([...p.modifiers] as Modifier[]);
          }}
          recommendedPreset={recommendedPreset}
          showCustomize={showCustomize}
          setShowCustomize={setShowCustomize}
          repoUrl={projectRepoUrl}
          loading={loading}
          onGenerate={startGeneration}
        />
      ) : loading && wavesComplete === 0 ? (
        <GeneratingTasksLoader
          estimatedWaves={Math.max(2, Math.min(5, Math.ceil(filledBlueprintSections / 3))) || 3}
          // Loader prepends the repo-reading phase only when the user
          // actually requested follow_practices for this run.
          style={
            requestedModifiersRef.current.includes('follow_practices')
              ? 'follow_practices'
              : undefined
          }
        />
      ) : tasks.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-muted-foreground">
          No tasks were generated. Go back and add more detail to the blueprint.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {/* Hover legend — explains what the highlighting actually means. */}
          <div className="px-8 py-2.5 border-b border-border/60 flex items-center gap-4 text-[10px] text-muted-foreground bg-card/20">
            <span className="uppercase tracking-wider text-muted-foreground/70">Hover a card</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive/70" />
              <span>blocks the hovered task</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-info/70" />
              <span>depends on the hovered task</span>
            </span>
            <span className="ml-auto text-muted-foreground/60">click any card to expand</span>
          </div>

          <div className="px-8 py-5 space-y-5">
            {(jobStatus === 'running' || jobStatus === 'pending') && wavesComplete > 0 && (
              <div className="flex items-center gap-2 text-[11px] text-primary/80">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 rounded-full bg-primary/60 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                Generating wave {wavesComplete + 1}…
              </div>
            )}
            {grouped.map(([wave, entries], waveIdx) => (
              <div key={wave} className="relative">
                {/* Sticky-ish wave header with a stronger visual */}
                <div className="flex items-baseline gap-3 mb-2.5 pb-1.5 border-b border-border/40">
                  <span className="flex items-center justify-center h-5 min-w-[1.75rem] px-1.5 rounded bg-primary/15 text-primary text-[11px] font-medium tabular-nums">
                    W{wave}
                  </span>
                  <span className="text-[11px] font-medium text-foreground/80">
                    {formatWaveHeader(waveIdx === 0 ? 0 : wave, entries.length)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {entries.map(({ task, idx }) => (
                    <TaskCardRow
                      key={idx}
                      task={task}
                      index={idx}
                      isOrphan={orphanedDeps.has(idx)}
                      removedSet={removed}
                      onRemove={() => setRemoved((s) => new Set(s).add(idx))}
                      tasks={tasks}
                      templatesBySlug={templatesBySlug}
                      dependentsByIdx={dependentsByIdx}
                      expandedTaskIdx={expandedTaskIdx}
                      setExpandedTaskIdx={setExpandedTaskIdx}
                      hoveredIdx={hoveredIdx}
                      setHoveredIdx={setHoveredIdx}
                      flashIdx={flashIdx}
                      scrollAndFlash={scrollAndFlash}
                      cardRefs={cardRefs}
                      onUpdateTask={updateTask}
                      onRegenerateOne={regenerateOneTask}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <WizardFooter>
        <div className="text-[11px] text-muted-foreground mr-auto">
          {generationStarted ? (
            <>
              {tasks.length - removed.size} tasks · {grouped.length} waves
              {removed.size > 0 ? ` · ${removed.size} removed` : ''}
            </>
          ) : null}
        </div>
        <button
          onClick={() => (coverage?.gaps?.length ? setStep('defaults') : onCancel())}
          disabled={committing}
          className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        {/* Regenerate + commit only make sense once tasks have been generated.
            In the gate state the body's "Generate tasks with X" CTA is the
            only action — showing disabled regenerate/commit buttons here
            duelled with it visually. */}
        {generationStarted && (
          <>
            <button
              onClick={() => setRegenerateOpen(true)}
              disabled={loading || committing || tasks.length === 0}
              title="Tell the AI what to change, then regenerate"
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Regenerate
            </button>
            <button
              onClick={finish}
              disabled={loading || committing || tasks.length - removed.size === 0}
              title={loading ? 'Wait for all waves to finish generating' : undefined}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {committing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {committing ? 'Generating board…' : 'Looks good — generate board'}
            </button>
          </>
        )}
      </WizardFooter>

      {regenerateOpen && (
        <RegenerateDialog
          tasks={tasks}
          removed={removed}
          onCancel={() => setRegenerateOpen(false)}
          onSubmit={({ feedback, dislikedTitles }) => {
            setRegenerateOpen(false);
            clearCachedStories(sessionId);
            hydratedRef.current = false;
            tasksLoadedRef.current = true;
            loadTasks({ force: true, feedback, dislikedTitles });
          }}
        />
      )}
    </WizardShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents

function WizardShell({
  title,
  subtitle,
  currentStep,
  steps,
  onCancel,
  children,
}: {
  title: string;
  subtitle?: string;
  currentStep: StepKey;
  steps: StepDef[];
  onCancel: () => void;
  children: React.ReactNode;
}) {
  const currentIdx = steps.findIndex((s) => s.key === currentStep);
  return (
    <div className="h-screen w-screen bg-background flex flex-col">
      {/* Top strip: stepper + close */}
      <div className="border-b border-border px-8 py-4 flex items-center gap-6 shrink-0">
        <span className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground shrink-0">
          Wrap Up Session
        </span>
        <Stepper steps={steps} currentIdx={currentIdx} />
        <button
          onClick={onCancel}
          className="ml-auto text-muted-foreground hover:text-foreground p-1.5 rounded hover:bg-secondary transition-colors shrink-0"
          title="Cancel — return to the live session"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Title block */}
      <div className="border-b border-border px-8 py-6 shrink-0">
        <h1 className="font-display text-3xl italic leading-tight text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
    </div>
  );
}

function Stepper({ steps, currentIdx }: { steps: StepDef[]; currentIdx: number }) {
  return (
    <ol className="flex items-center gap-0 flex-1 max-w-2xl">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.key} className="flex items-center gap-3 flex-1 last:flex-initial">
            <div className="flex items-center gap-2.5 shrink-0">
              <span
                className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-medium tabular-nums transition-all ${
                  done
                    ? 'bg-success/20 text-success border border-success/30'
                    : active
                      ? 'bg-primary text-primary-foreground shadow-[0_0_0_3px_rgba(245,158,11,0.15)]'
                      : 'bg-card text-muted-foreground/60 border border-border'
                }`}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={`text-[11px] font-medium tracking-wide transition-colors ${
                  active
                    ? 'text-foreground'
                    : done
                      ? 'text-foreground/50'
                      : 'text-muted-foreground/50'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                className={`flex-1 h-px transition-colors min-w-[20px] ${
                  done ? 'bg-success/30' : 'bg-border'
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WizardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-t border-border px-6 py-4 flex items-center justify-end gap-2 shrink-0 mt-auto">
      {children}
    </div>
  );
}

function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function DefaultRowCard({
  row,
  onChange,
}: {
  row: DefaultRow;
  onChange: (next: DefaultRow) => void;
}) {
  const [editing, setEditing] = useState(false);
  const accepted = row.decision === 'accepted';
  const toggle = () => onChange({ ...row, decision: accepted ? 'declined' : 'accepted' });

  return (
    <div
      className={`group rounded-lg border bg-card transition-all ${
        accepted
          ? 'border-border hover:border-primary/30'
          : 'border-border/40 opacity-50 hover:opacity-80'
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        {/* Accept toggle */}
        <button
          onClick={toggle}
          title={accepted ? 'Click to decline' : 'Click to accept'}
          className={`mt-0.5 flex items-center justify-center h-4 w-4 rounded border-1.5 shrink-0 transition-colors ${
            accepted
              ? 'bg-success/80 border-success/80'
              : 'bg-transparent border-border hover:border-foreground/40'
          }`}
        >
          {accepted && <Check className="h-3 w-3 text-background" strokeWidth={3} />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-foreground/80">
              {SECTION_LABELS[row.section] || row.section}
            </span>
            {row.isEdited && accepted && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning/15 text-warning/90">
                edited
              </span>
            )}
          </div>
          {editing ? (
            <textarea
              autoFocus
              value={row.edited}
              onChange={(e) =>
                onChange({ ...row, edited: e.target.value, decision: 'accepted', isEdited: true })
              }
              onBlur={() => setEditing(false)}
              rows={3}
              className="w-full text-xs font-body bg-background border border-primary/40 rounded p-2 text-foreground resize-y focus:outline-none"
            />
          ) : (
            <p
              className={`text-xs font-body leading-relaxed whitespace-pre-wrap ${
                accepted ? 'text-muted-foreground' : 'text-muted-foreground/60 line-through'
              }`}
            >
              {row.edited}
            </p>
          )}
        </div>

        {/* Edit pencil — quiet until hover */}
        <button
          onClick={() => setEditing((v) => !v)}
          title="Edit"
          className={`shrink-0 mt-0.5 p-1 rounded transition-all opacity-0 group-hover:opacity-100 ${
            editing
              ? 'bg-secondary text-foreground opacity-100'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function TaskCardRow({
  task,
  index,
  isOrphan,
  removedSet,
  onRemove,
  tasks,
  templatesBySlug,
  dependentsByIdx,
  expandedTaskIdx,
  setExpandedTaskIdx,
  hoveredIdx,
  setHoveredIdx,
  flashIdx,
  scrollAndFlash,
  cardRefs,
  onUpdateTask,
  onRegenerateOne,
}: {
  task: WizardTask;
  index: number;
  isOrphan: boolean;
  removedSet: Set<number>;
  onRemove: () => void;
  tasks: WizardTask[];
  templatesBySlug: Record<string, string>;
  dependentsByIdx: Map<number, number[]>;
  expandedTaskIdx: number | null;
  setExpandedTaskIdx: (idx: number | null) => void;
  hoveredIdx: number | null;
  setHoveredIdx: (idx: number | null) => void;
  flashIdx: number | null;
  scrollAndFlash: (idx: number) => void;
  cardRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  onUpdateTask: (idx: number, patch: Partial<WizardTask>) => void;
  onRegenerateOne: (idx: number, fields: string[], feedback: string) => Promise<void>;
}) {
  const liveDeps = (task.depends_on_indices || []).filter((j) => !removedSet.has(j));
  const liveRels = (task.related_to_indices || []).filter((j) => !removedSet.has(j));
  const liveDependents = (dependentsByIdx.get(index) || []).filter((j) => !removedSet.has(j));
  const isExpanded = expandedTaskIdx === index;
  const isFlashing = flashIdx === index;
  const customFieldEntries = Object.entries(task.custom_fields || {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== '',
  );
  const [regenOpen, setRegenOpen] = useState(false);

  // Hover highlight: this card glows when it's the hovered one OR when the
  // hovered card depends on us OR when we depend on the hovered card. Cards
  // with no relationship get dimmed so the connected ones really pop.
  let hoverState: 'self' | 'blocker' | 'dependent' | 'unrelated' | null = null;
  if (hoveredIdx !== null && hoveredIdx !== index) {
    const hovered = tasks[hoveredIdx];
    if (hovered) {
      if ((hovered.depends_on_indices || []).includes(index)) hoverState = 'blocker';
      else if ((task.depends_on_indices || []).includes(hoveredIdx)) hoverState = 'dependent';
      else hoverState = 'unrelated';
    }
  } else if (hoveredIdx === index) {
    hoverState = 'self';
  }

  const cardClass = isFlashing
    ? 'ring-2 ring-primary ring-offset-2 ring-offset-background border-primary'
    : hoverState === 'self'
      ? 'ring-1 ring-primary/60 border-primary/60 bg-primary/[0.04]'
      : hoverState === 'blocker'
        ? 'ring-1 ring-destructive/70 border-destructive/40 bg-destructive/[0.06]'
        : hoverState === 'dependent'
          ? 'ring-1 ring-info/70 border-info/40 bg-info/[0.06]'
          : hoverState === 'unrelated'
            ? 'opacity-30 hover:opacity-60'
            : '';

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      ref={(el) => {
        cardRefs.current.set(index, el);
      }}
      onMouseEnter={() => setHoveredIdx(index)}
      onMouseLeave={() => setHoveredIdx(null)}
      onClick={() => setExpandedTaskIdx(isExpanded ? null : index)}
      className={`group rounded-md border bg-card/70 transition-all cursor-pointer ${
        isExpanded ? 'border-primary/40' : 'border-border hover:border-primary/30'
      } ${cardClass}`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-3">
          <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums mt-0.5 shrink-0 w-6">
            #{index}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-foreground/90 font-medium">{task.title}</span>
              <TemplateBadge
                slug={task.template_slug}
                name={task.template_slug ? templatesBySlug[task.template_slug] : null}
                variant="pill"
              />
              {task.priority && (
                <span
                  className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    task.priority === 'critical'
                      ? 'bg-destructive/15 text-destructive'
                      : task.priority === 'high'
                        ? 'bg-orange-500/15 text-orange-400'
                        : task.priority === 'low'
                          ? 'bg-muted-foreground/60/15 text-muted-foreground'
                          : 'bg-info/15 text-info'
                  }`}
                >
                  {task.priority}
                </span>
              )}
              {task.story_points != null && (
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {task.story_points} pts
                </span>
              )}
              {isOrphan && (
                <span
                  title="A task this depended on was removed — it may need re-sequencing"
                  className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning/15 text-warning"
                >
                  dep removed
                </span>
              )}
              {/* Contextual chip during hover-highlight — makes the relationship explicit */}
              {hoverState === 'blocker' && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">
                  ↑ blocks #{hoveredIdx}
                </span>
              )}
              {hoverState === 'dependent' && (
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-info/20 text-info font-medium">
                  ↓ needs #{hoveredIdx}
                </span>
              )}
            </div>
            {(liveDeps.length > 0 || liveRels.length > 0) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-muted-foreground">
                {liveDeps.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1">
                    <span>↳ depends on:</span>
                    {liveDeps.map((j, k) => (
                      <DepChip
                        key={j}
                        idx={j}
                        title={tasks[j]?.title}
                        tone="blocker"
                        onClick={(e) => {
                          stop(e);
                          scrollAndFlash(j);
                        }}
                        comma={k < liveDeps.length - 1}
                      />
                    ))}
                  </span>
                )}
                {liveRels.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1 text-muted-foreground/60">
                    <span>∼ related:</span>
                    {liveRels.map((j, k) => (
                      <DepChip
                        key={j}
                        idx={j}
                        title={tasks[j]?.title}
                        tone="related"
                        onClick={(e) => {
                          stop(e);
                          scrollAndFlash(j);
                        }}
                        comma={k < liveRels.length - 1}
                      />
                    ))}
                  </span>
                )}
              </div>
            )}
            {task.children && task.children.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 pl-4 border-l border-border/40">
                {task.children.map((c, ci) => (
                  <li key={ci} className="text-[11px] text-muted-foreground/80">
                    · {c.title}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground/50 mt-1 shrink-0 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
          <button
            onClick={(e) => {
              stop(e);
              onRemove();
            }}
            title="Remove this task"
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded hover:bg-secondary transition-all shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div
          onClick={stop}
          className="border-t border-border/60 px-4 py-4 bg-background/40 cursor-default grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-x-6 gap-y-4"
        >
          {/* LEFT — content */}
          <div className="space-y-4">
            <FieldGroup label="Description">
              <textarea
                value={task.description || ''}
                onChange={(e) => onUpdateTask(index, { description: e.target.value })}
                placeholder="Describe the task…"
                rows={3}
                className="w-full text-xs font-body bg-card border border-border rounded p-2 text-foreground/90 leading-relaxed resize-y focus:outline-none focus:border-primary/40"
              />
            </FieldGroup>

            <FieldGroup
              label="Acceptance criteria"
              rightSlot={
                <button
                  onClick={() =>
                    onUpdateTask(index, {
                      acceptance_criteria: [...(task.acceptance_criteria || []), ''],
                    })
                  }
                  className="text-[10px] uppercase tracking-wider text-primary/80 hover:text-primary"
                >
                  + Add
                </button>
              }
            >
              {!task.acceptance_criteria || task.acceptance_criteria.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 italic">No criteria yet.</p>
              ) : (
                <ul className="space-y-1">
                  {task.acceptance_criteria.map((c, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-muted-foreground/40 shrink-0">·</span>
                      <input
                        value={c}
                        onChange={(e) => {
                          const next = [...(task.acceptance_criteria || [])];
                          next[i] = e.target.value;
                          onUpdateTask(index, { acceptance_criteria: next });
                        }}
                        className="flex-1 text-xs font-body bg-transparent border-b border-border/40 hover:border-border focus:border-primary/40 focus:outline-none px-1 py-0.5"
                      />
                      <button
                        onClick={() => {
                          const next = (task.acceptance_criteria || []).filter((_, j) => j !== i);
                          onUpdateTask(index, { acceptance_criteria: next });
                        }}
                        className="text-muted-foreground/60 hover:text-destructive p-0.5"
                        title="Delete criterion"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FieldGroup>

            {customFieldEntries.length > 0 && (
              <FieldGroup label="Custom fields">
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
                  {customFieldEntries.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground/70">{k}</dt>
                      <dd className="text-foreground/80 whitespace-pre-wrap">
                        {typeof v === 'string' ? v : JSON.stringify(v)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </FieldGroup>
            )}

            {/* Dependency context — read-only summary at the bottom of the main column */}
            <FieldGroup label="Relations">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mb-2">
                <span>
                  <span className="text-foreground/80 tabular-nums">{liveDeps.length}</span> blocked
                  by
                </span>
                <span>
                  <span className="text-foreground/80 tabular-nums">{liveDependents.length}</span>{' '}
                  blocks
                </span>
                <span className="text-muted-foreground/60">wave {task.wave ?? 0}</span>
              </div>
              {liveDependents.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Blocks:
                  </span>
                  {liveDependents.map((j) => (
                    <DepChip
                      key={j}
                      idx={j}
                      title={tasks[j]?.title}
                      tone="dependent"
                      onClick={(e) => {
                        stop(e);
                        scrollAndFlash(j);
                      }}
                    />
                  ))}
                </div>
              )}
            </FieldGroup>
          </div>

          {/* RIGHT — sidebar properties */}
          <div className="space-y-4 lg:border-l lg:border-border/40 lg:pl-6">
            <FieldGroup label="Type">
              <select
                value={task.template_slug || ''}
                onChange={(e) => onUpdateTask(index, { template_slug: e.target.value || null })}
                className="w-full text-xs bg-card border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:border-primary/40"
              >
                <option value="">No type</option>
                {Object.entries(templatesBySlug).map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </FieldGroup>

            <FieldGroup label="Priority">
              <div className="flex flex-wrap gap-1">
                {(['critical', 'high', 'medium', 'low'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => onUpdateTask(index, { priority: p })}
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border transition-colors ${
                      task.priority === p
                        ? p === 'critical'
                          ? 'bg-destructive/15 text-destructive border-destructive/40'
                          : p === 'high'
                            ? 'bg-orange-500/15 text-orange-300 border-orange-400/40'
                            : p === 'low'
                              ? 'bg-muted-foreground/60/15 text-foreground/90 border-zinc-400/40'
                              : 'bg-info/15 text-info border-info/40'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground/80'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Story points">
              <div className="flex flex-wrap gap-1">
                {[1, 2, 3, 5, 8, 13, 21].map((pts) => (
                  <button
                    key={pts}
                    onClick={() => onUpdateTask(index, { story_points: pts })}
                    className={`min-w-[1.75rem] h-7 rounded text-[11px] font-medium tabular-nums border transition-colors ${
                      task.story_points === pts
                        ? 'bg-primary/15 text-primary border-primary/40'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground/80'
                    }`}
                  >
                    {pts}
                  </button>
                ))}
              </div>
            </FieldGroup>

            <FieldGroup label="Labels">
              <div className="flex flex-wrap gap-1">
                {(task.labels || []).map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-secondary/60 text-foreground/80"
                  >
                    {label}
                    <button
                      onClick={() =>
                        onUpdateTask(index, {
                          labels: (task.labels || []).filter((l) => l !== label),
                        })
                      }
                      className="text-muted-foreground/60 hover:text-destructive"
                      title="Remove label"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <LabelInput
                  onAdd={(value) => {
                    const trimmed = value.trim();
                    if (!trimmed || (task.labels || []).includes(trimmed)) return;
                    onUpdateTask(index, { labels: [...(task.labels || []), trimmed] });
                  }}
                />
              </div>
            </FieldGroup>

            <div className="pt-3 border-t border-border/30">
              <button
                onClick={() => setRegenOpen(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border text-[11px] font-medium text-foreground/70 hover:text-foreground hover:bg-secondary hover:border-primary/30 transition-colors"
                title="Tell the AI which parts of this ticket to rewrite"
              >
                <RefreshCw className="h-3 w-3" />
                Regenerate this ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {regenOpen && (
        <SingleTaskRegenerateDialog
          task={task}
          onCancel={() => setRegenOpen(false)}
          onSubmit={async ({ fields, feedback }) => {
            await onRegenerateOne(index, fields, feedback);
            setRegenOpen(false);
          }}
        />
      )}
    </div>
  );
}

function DepChip({
  idx,
  title,
  tone,
  onClick,
  comma,
}: {
  idx: number;
  title: string | undefined;
  tone: 'blocker' | 'related' | 'dependent';
  onClick: (e: React.MouseEvent) => void;
  comma?: boolean;
}) {
  const toneClass =
    tone === 'blocker'
      ? 'text-foreground/80 hover:bg-destructive/10 hover:text-destructive'
      : tone === 'dependent'
        ? 'text-foreground/80 hover:bg-info/10 hover:text-info'
        : 'text-muted-foreground hover:bg-secondary hover:text-foreground';
  return (
    <>
      <button
        onClick={onClick}
        title={title || `Task #${idx}`}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${toneClass}`}
      >
        <span className="truncate max-w-[14rem]">{title || 'Untitled'}</span>
        <span className="text-muted-foreground/60 font-mono tabular-nums">#{idx}</span>
      </button>
      {comma && <span className="text-muted-foreground/40">,</span>}
    </>
  );
}

async function extractErrorDetail(r: Response): Promise<string> {
  try {
    const data = await r.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail))
      return data.detail
        .map((d: { msg?: string }) => d?.msg || '')
        .filter(Boolean)
        .join('; ');
  } catch {
    // not JSON
  }
  return `Request failed with status ${r.status}`;
}

function FieldGroup({
  label,
  rightSlot,
  children,
}: {
  label: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        {rightSlot}
      </div>
      {children}
    </div>
  );
}

function LabelInput({ onAdd }: { onAdd: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && value.trim()) {
          e.preventDefault();
          onAdd(value);
          setValue('');
        }
      }}
      placeholder="+ label"
      className="text-[10px] bg-transparent border-b border-border/40 focus:border-primary/40 focus:outline-none px-1 py-0.5 w-16"
    />
  );
}

function RegenerateDialog({
  tasks,
  removed,
  onCancel,
  onSubmit,
}: {
  tasks: WizardTask[];
  removed: Set<number>;
  onCancel: () => void;
  onSubmit: (input: { feedback: string; dislikedTitles: string[] }) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [dislikedIdx, setDislikedIdx] = useState<Set<number>>(new Set());
  const liveTasks = tasks
    .map((t, idx) => ({ task: t, idx }))
    .filter(({ idx }) => !removed.has(idx));
  const allLiveSelected =
    liveTasks.length > 0 && liveTasks.every(({ idx }) => dislikedIdx.has(idx));

  const toggle = (idx: number) =>
    setDislikedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  const selectAllOrNone = () =>
    setDislikedIdx(allLiveSelected ? new Set() : new Set(liveTasks.map(({ idx }) => idx)));

  const submit = () => {
    const dislikedTitles = liveTasks
      .filter(({ idx }) => dislikedIdx.has(idx))
      .map(({ task }) => task.title);
    onSubmit({ feedback, dislikedTitles });
  };

  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="px-6 py-5 border-b border-border shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            Regenerate with feedback
          </p>
          <h2 className="font-display text-xl italic text-foreground">
            Tell the AI what to change
          </h2>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Optional — helps the next attempt fit what you actually want. Skip both fields and click
            Regenerate to just retry from scratch.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
              What didn&apos;t work about these tasks?
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Too granular — give me bigger chunks. Or: Missed our payment integration. Or: Wrong tech stack — we use Postgres, not MongoDB."
              rows={4}
              maxLength={2000}
              autoFocus
              className="w-full text-sm font-body bg-background border border-border rounded p-3 text-foreground/90 leading-relaxed resize-y focus:outline-none focus:border-primary/40"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1 text-right tabular-nums">
              {feedback.length} / 2000
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Mark specific tasks the AI got wrong
              </p>
              <button
                onClick={selectAllOrNone}
                className="text-[10px] uppercase tracking-wider text-primary/80 hover:text-primary"
              >
                {allLiveSelected ? 'Clear all' : 'Select all'}
              </button>
            </div>
            {liveTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 italic">No tasks to mark.</p>
            ) : (
              <ul className="space-y-0.5 max-h-[28vh] overflow-y-auto rounded border border-border/60 bg-background/40 p-1.5">
                {liveTasks.map(({ task, idx }) => {
                  const checked = dislikedIdx.has(idx);
                  return (
                    <li key={idx}>
                      <button
                        onClick={() => toggle(idx)}
                        className={`flex items-start gap-2 w-full text-left px-2 py-1.5 rounded transition-colors ${
                          checked
                            ? 'bg-destructive/10 text-foreground'
                            : 'hover:bg-secondary/40 text-foreground/80'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex items-center justify-center h-3.5 w-3.5 rounded border shrink-0 transition-colors ${
                            checked ? 'bg-destructive/70 border-destructive/70' : 'border-border'
                          }`}
                        >
                          {checked && (
                            <Check className="h-2.5 w-2.5 text-background" strokeWidth={3} />
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums shrink-0 mt-0.5 w-6">
                          #{idx}
                        </span>
                        <span className={`text-xs flex-1 ${checked ? 'line-through' : ''}`}>
                          {task.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {dislikedIdx.size > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {dislikedIdx.size} task{dislikedIdx.size === 1 ? '' : 's'} marked — the AI will
                avoid generating anything similar.
              </p>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </button>
        </div>
      </div>
    </div>
  );
}

const REGEN_FIELD_OPTIONS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'title', label: 'Title', hint: 'Rewrite the headline' },
  { key: 'description', label: 'Description', hint: 'Restate what this task does' },
  {
    key: 'acceptance_criteria',
    label: 'Acceptance criteria',
    hint: "Replace the bullets (uses your template's AC pattern)",
  },
  { key: 'template_slug', label: 'Type', hint: 'Reclassify against your studio templates' },
  { key: 'priority', label: 'Priority', hint: 'Re-evaluate critical / high / medium / low' },
  { key: 'story_points', label: 'Story points', hint: 'Re-estimate the effort' },
  { key: 'labels', label: 'Labels', hint: 'Re-tag the area chips' },
  {
    key: 'custom_fields',
    label: 'Custom fields',
    hint: "Refill the template's custom-field values",
  },
];

function SingleTaskRegenerateDialog({
  task,
  onCancel,
  onSubmit,
}: {
  task: WizardTask;
  onCancel: () => void;
  onSubmit: (input: { fields: string[]; feedback: string }) => Promise<void>;
}) {
  // Default to the two fields users most often want regenerated.
  const [selected, setSelected] = useState<Set<string>>(
    new Set(['description', 'acceptance_criteria']),
  );
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async () => {
    if (selected.size === 0) {
      setError('Pick at least one field to regenerate.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ fields: Array.from(selected), feedback });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (!submitting) onCancel();
      }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl max-h-[80vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl"
      >
        <div className="px-6 py-5 border-b border-border shrink-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            Regenerate ticket
          </p>
          <h2 className="font-display text-xl italic text-foreground line-clamp-2">{task.title}</h2>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            Pick the parts you want rewritten. The dependency graph (what this task blocks / depends
            on) stays untouched.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-2">
              Which parts to regenerate?
            </p>
            <ul className="space-y-0.5">
              {REGEN_FIELD_OPTIONS.map(({ key, label, hint }) => {
                const checked = selected.has(key);
                return (
                  <li key={key}>
                    <button
                      onClick={() => toggle(key)}
                      className={`flex items-start gap-2.5 w-full text-left px-2 py-1.5 rounded transition-colors ${
                        checked ? 'bg-primary/10' : 'hover:bg-secondary/40'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex items-center justify-center h-3.5 w-3.5 rounded border shrink-0 transition-colors ${
                          checked ? 'bg-primary border-primary' : 'border-border'
                        }`}
                      >
                        {checked && (
                          <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />
                        )}
                      </span>
                      <span className="flex-1">
                        <span className="text-xs text-foreground/90 font-medium block">
                          {label}
                        </span>
                        <span className="text-[11px] text-muted-foreground/70">{hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
              What was wrong with these?{' '}
              <span className="text-muted-foreground/50 normal-case tracking-normal">
                (optional)
              </span>
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="e.g. Acceptance criteria were too vague. Or: this should be a spike, not a feature."
              rows={3}
              maxLength={2000}
              className="w-full text-sm font-body bg-background border border-border rounded p-3 text-foreground/90 leading-relaxed resize-y focus:outline-none focus:border-primary/40"
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1 text-right tabular-nums">
              {feedback.length} / 2000
            </p>
          </div>

          {error && (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {submitting
              ? 'Regenerating…'
              : `Regenerate ${selected.size} field${selected.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Full-page picker shown BEFORE the user clicks Generate.
 *
 * Presets-first UX:
 *  - Default view: a small grid of named PRESET cards (each bundles a
 *    granularity + curated modifier set). One is flagged "Recommended for
 *    this project" via a cheap blueprint heuristic.
 *  - "Customize" toggle expands the full dual-axis picker (granularity row
 *    + 4 categorised modifier sub-grids) pre-filled with the active preset's
 *    contents — so users can pick a preset, tweak one toggle, and go.
 *
 * All colors are theme-driven (primary / warning / muted-foreground tokens)
 * so swapping the user theme doesn't break the view.
 */
/** Render a lucide icon by string name via static map property access — keeps
 * the react-hooks/static-components lint rule happy by avoiding a function
 * call that returns a component. */
function NamedIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_BY_NAME[name] ?? Layers;
  return <Icon className={className} />;
}

function PresetPickerGate({
  presets,
  granularityOpts,
  modifierOpts,
  granularity,
  modifiers,
  onChangeGranularity,
  onToggleModifier,
  onPickPreset,
  recommendedPreset,
  showCustomize,
  setShowCustomize,
  repoUrl,
  loading,
  onGenerate,
}: {
  presets: ReadonlyArray<PresetDTO>;
  granularityOpts: ReadonlyArray<GranularityDTO>;
  modifierOpts: ReadonlyArray<ModifierDTO>;
  granularity: Granularity;
  modifiers: Modifier[];
  onChangeGranularity: (g: Granularity) => void;
  onToggleModifier: (m: Modifier) => void;
  onPickPreset: (slug: string) => void;
  recommendedPreset: string | null;
  showCustomize: boolean;
  setShowCustomize: (open: boolean) => void;
  repoUrl: string | null;
  loading: boolean;
  onGenerate: () => void;
}) {
  const activePreset = detectActivePreset(presets, granularity, modifiers);
  const activePresetLabel = activePreset
    ? (presets.find((p) => p.slug === activePreset)?.label ?? null)
    : null;
  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-8 py-6 mx-auto w-full max-w-5xl space-y-6">
        {/* ── Preset cards (default view) ─────────────────────────────── */}
        <section>
          <header className="mb-3">
            <h3 className="text-sm font-medium text-foreground/90">Choose a preset</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Each preset bundles a granularity + a set of approach modifiers. Tweak any of it with
              Customize below.
            </p>
          </header>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {presets.map((preset) => {
              const isSelected = activePreset === preset.slug;
              const isRecommended = recommendedPreset === preset.slug;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onPickPreset(preset.slug)}
                  aria-pressed={isSelected}
                  className={`group text-left rounded-lg border p-3.5 transition-colors flex flex-col gap-2 ${
                    isSelected
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : 'border-border bg-card/40 hover:border-border/80 hover:bg-card/60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <NamedIcon
                      name={preset.icon}
                      className={`h-4 w-4 shrink-0 mt-0.5 ${
                        isSelected
                          ? 'text-primary'
                          : 'text-foreground/60 group-hover:text-foreground/80'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-sm font-medium ${
                            isSelected ? 'text-primary' : 'text-foreground/90'
                          }`}
                        >
                          {preset.label}
                        </span>
                        {isSelected && <Check className="h-3 w-3 text-primary" />}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">
                        {granularityOpts.find((g) => g.slug === preset.granularity)?.label ??
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
                  {isRecommended && (
                    <span className="self-start inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary border border-primary/30">
                      <Sparkles className="h-2.5 w-2.5" />
                      Recommended for this project
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!activePreset && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Current selection is <span className="text-foreground/80">custom</span> — it
              doesn&apos;t exactly match a preset. Customize below or pick a preset to reset.
            </p>
          )}
        </section>

        {/* ── Customize expander ─────────────────────────────────────── */}
        <section className="border-t border-border/40 pt-4">
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
            <div className="mt-4">
              <CustomizeBody
                granularityOpts={granularityOpts}
                modifierOpts={modifierOpts}
                granularity={granularity}
                modifiers={modifiers}
                onChangeGranularity={onChangeGranularity}
                onToggleModifier={onToggleModifier}
                repoUrl={repoUrl}
              />
            </div>
          )}
        </section>

        {/* ── CTA ────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 transition-colors disabled:opacity-40 shadow-sm"
          >
            <Sparkles className="h-4 w-4" />
            {activePresetLabel
              ? `Generate tasks with ${activePresetLabel}`
              : 'Generate tasks (custom)'}
          </button>
          <p className="text-[11px] text-muted-foreground/70 text-center max-w-md">
            You can change and regenerate any time before committing the board.
          </p>
        </div>
      </div>
    </div>
  );
}

/** The dual-axis picker body (granularity row + 4 categorised modifier sub-grids).
 * Extracted from the previous StylePickerGate so PresetPickerGate can show it
 * behind a Customize expander. Pre-populated by whatever preset is active. */
function CustomizeBody({
  granularityOpts,
  modifierOpts,
  granularity,
  modifiers,
  onChangeGranularity,
  onToggleModifier,
  repoUrl,
}: {
  granularityOpts: ReadonlyArray<GranularityDTO>;
  modifierOpts: ReadonlyArray<ModifierDTO>;
  granularity: Granularity;
  modifiers: Modifier[];
  onChangeGranularity: (g: Granularity) => void;
  onToggleModifier: (m: Modifier) => void;
  repoUrl: string | null;
}) {
  // Look up icon + signature metadata for SYSTEM slugs from the static maps
  // we still ship. Custom-admin slugs fall back to a default icon and no
  // signature chip (the blurb carries the explanation).
  const granularityMeta = (slug: string) => GRANULARITY_BY_SLUG[slug as Granularity];
  const modifierMeta = (slug: string) => MODIFIER_BY_SLUG[slug as Modifier];

  return (
    <div className="space-y-7">
      {/* ── Axis 1: granularity ─────────────────────────────────────── */}
      <section>
        <header className="mb-3">
          <h4 className="text-sm font-medium text-foreground/90">Number of tickets</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Pick one — drives how the AI splits the plan.
          </p>
        </header>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {granularityOpts.map((opt) => {
            const isSelected = granularity === opt.slug;
            const meta = granularityMeta(opt.slug);
            const Icon = meta?.icon ?? Layers;
            return (
              <OptionCard
                key={opt.id}
                isSelected={isSelected}
                Icon={Icon}
                label={opt.label}
                signature={meta?.signature ?? null}
                blurb={opt.blurb}
                promptFragment={opt.prompt_fragment}
                onClick={() => onChangeGranularity(opt.slug as Granularity)}
              />
            );
          })}
        </div>
      </section>

      {/* ── Axis 2: modifiers, grouped by category ─────────────────── */}
      <section className="space-y-5">
        <header className="flex items-baseline justify-between gap-3">
          <div>
            <h4 className="text-sm font-medium text-foreground/90">Approach</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Optional — toggle any combination. Stacks on top of granularity.
            </p>
          </div>
          {modifiers.length > 0 && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {modifiers.length} selected
            </span>
          )}
        </header>
        {MODIFIER_CATEGORIES.map((cat) => {
          const catOpts = modifierOpts.filter((o) => o.category === cat.key);
          if (catOpts.length === 0) return null;
          return (
            <div key={cat.key}>
              <div className="flex items-baseline gap-2 mb-2">
                <h5 className="text-[11px] font-medium uppercase tracking-wider text-foreground/70">
                  {cat.label}
                </h5>
                <span className="text-[11px] text-muted-foreground/70">{cat.hint}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {catOpts.map((opt) => {
                  const meta = modifierMeta(opt.slug);
                  const repoMissing =
                    (meta?.requiresRepo ?? opt.slug === 'follow_practices') && !repoUrl;
                  const isSelected = modifiers.includes(opt.slug as Modifier);
                  const Icon = meta?.icon ?? Sparkles;
                  return (
                    <OptionCard
                      key={opt.id}
                      isSelected={isSelected}
                      Icon={Icon}
                      label={opt.label}
                      signature={meta?.signature ?? null}
                      blurb={opt.blurb}
                      promptFragment={opt.prompt_fragment}
                      disabled={repoMissing}
                      disabledHint={
                        repoMissing ? 'Link a GitHub repo on the project to use this.' : null
                      }
                      onClick={() => !repoMissing && onToggleModifier(opt.slug as Modifier)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

/** One option card (granularity OR modifier). Renders the icon + label +
 * signature + blurb + a small "?" help icon. Clicking the help icon
 * (without selecting the option) opens a popover showing the prompt
 * fragment text — the actual guidance the LLM sees when this is picked. */
function OptionCard({
  isSelected,
  Icon,
  label,
  signature,
  blurb,
  promptFragment,
  disabled,
  disabledHint,
  onClick,
}: {
  isSelected: boolean;
  Icon: LucideIcon;
  label: string;
  signature: string | null;
  blurb: string | null;
  promptFragment: string;
  disabled?: boolean;
  disabledHint?: string | null;
  onClick: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <div
      className={`group relative rounded-lg border p-3 transition-colors flex gap-2.5 ${
        isSelected
          ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
          : 'border-border bg-card/40 hover:border-border/80 hover:bg-card/60'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={isSelected}
        className="flex-1 flex gap-2.5 text-left disabled:cursor-not-allowed"
      >
        <Icon
          className={`h-4 w-4 shrink-0 mt-0.5 ${
            isSelected ? 'text-primary' : 'text-foreground/60 group-hover:text-foreground/80'
          }`}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`text-sm font-medium ${
                isSelected ? 'text-primary' : 'text-foreground/90'
              }`}
            >
              {label}
            </span>
            {isSelected && <Check className="h-3 w-3 text-primary" />}
          </div>
          {signature && (
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mt-0.5">
              {signature}
            </div>
          )}
          {blurb && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{blurb}</p>
          )}
          {disabledHint && <p className="text-[10px] text-warning mt-1.5">{disabledHint}</p>}
        </div>
      </button>

      {/* Help icon — opens popover with the actual prompt fragment text */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setHelpOpen((v) => !v);
        }}
        aria-label={`Explain ${label}`}
        className="absolute top-1.5 right-1.5 p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-card/80 transition-colors"
      >
        <HelpCircle className="h-3 w-3" />
      </button>

      {helpOpen && (
        <div
          className="absolute z-20 top-8 right-1.5 w-72 max-h-72 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-foreground/90">{label}</span>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="text-muted-foreground/60 hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {blurb && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{blurb}</p>
          )}
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">
            What the AI sees
          </div>
          <pre className="text-[10px] text-foreground/80 whitespace-pre-wrap leading-relaxed font-mono bg-background/60 rounded p-2 border border-border/60">
            {promptFragment || '(no prompt guidance — has no effect on its own)'}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Compact summary bar shown ABOVE the cards after generation. Shows the
 * current selection as chips so the user can see at a glance what shape the
 * backlog was built with, plus a "Change" button to re-open the gate. */
function StyleSummaryBar({
  presets,
  granularityOpts,
  modifierOpts,
  granularity,
  modifiers,
  warning,
  onChange,
  disabled,
}: {
  presets: ReadonlyArray<PresetDTO>;
  // Live org-fetched options for label lookup — admin-renamed labels MUST
  // render here instead of the stale GRANULARITY_BY_SLUG / MODIFIER_BY_SLUG
  // static maps. Static maps are still consulted as a fallback for the icon
  // (DTOs from the API don't carry one).
  granularityOpts: ReadonlyArray<GranularityDTO>;
  modifierOpts: ReadonlyArray<ModifierDTO>;
  granularity: Granularity;
  modifiers: Modifier[];
  warning?: string | null;
  onChange: () => void;
  disabled?: boolean;
}) {
  const gStatic = GRANULARITY_BY_SLUG[granularity];
  const gLive = granularityOpts.find((g) => g.slug === granularity);
  const granularityLabel = gLive?.label ?? gStatic?.label ?? granularity;
  const GIcon = gStatic?.icon;
  // If the current combo matches a known preset, lead with the preset chip
  // so the user sees "Production-grade" instead of having to parse 4
  // modifier names. Granularity chip falls back when nothing matches.
  const activePreset = detectActivePreset(presets, granularity, modifiers);
  const presetEntry = activePreset ? (presets.find((p) => p.slug === activePreset) ?? null) : null;
  return (
    <div className="border-b border-border/60 bg-card/30">
      <div className="px-8 py-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 mr-1">
            Style
          </span>
          {presetEntry ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-primary/15 text-primary border border-primary/30">
              <NamedIcon name={presetEntry.icon} className="h-3 w-3" />
              {presetEntry.label}
            </span>
          ) : GIcon ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-primary/15 text-primary border border-primary/30">
              <GIcon className="h-3 w-3" />
              {granularityLabel}
            </span>
          ) : null}
          {modifiers.map((m) => {
            const staticOpt = MODIFIER_BY_SLUG[m];
            const liveOpt = modifierOpts.find((o) => o.slug === m);
            const label = liveOpt?.label ?? staticOpt?.label ?? m;
            const MIcon = staticOpt?.icon;
            if (!liveOpt && !staticOpt) return null;
            return (
              <span
                key={m}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary/90 border border-primary/20"
              >
                {MIcon && <MIcon className="h-3 w-3" />}
                {label}
              </span>
            );
          })}
          <button
            type="button"
            onClick={onChange}
            disabled={disabled}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            Change…
          </button>
        </div>
        {warning && (
          <div
            role="status"
            aria-live="polite"
            className="mt-2 rounded border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-[11px] text-warning"
          >
            {warning}
          </div>
        )}
      </div>
    </div>
  );
}
