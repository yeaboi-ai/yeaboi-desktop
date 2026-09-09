'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Sparkles,
  Check,
  X,
  Pencil,
  Rocket,
  Zap,
  Bug,
  Search,
  Layers,
  Wrench,
  Gauge,
  Timer,
  Microscope,
} from 'lucide-react';
import { BlueprintLauncher, type FocusTarget } from '@/components/blueprint/blueprint-launcher';
import { PageShell } from '@/components/page-shell';
import { DESCRIBE_COPY, carriesDescription, openingLine } from '@/lib/yeaboi/describe';

type Pace = 'fast' | 'balanced' | 'deep';
type TechnicalComfort = 'non_technical' | 'comfortable' | 'expert';

const TECHNICAL_COMFORT_OPTIONS: {
  id: TechnicalComfort;
  label: string;
  description: string;
}[] = [
  {
    id: 'non_technical',
    label: 'Non-technical',
    description: 'Explain technical terms in plain English as you go.',
  },
  {
    id: 'comfortable',
    label: 'Comfortable',
    description: 'I know the basics — explain only when I ask.',
  },
  {
    id: 'expert',
    label: 'Expert',
    description: 'Skip the definitions. Go straight to trade-offs.',
  },
];

const PACE_OPTIONS: { id: Pace; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'fast',
    label: 'Fast',
    description: '3 questions per persona, 1 follow-up. Rotates quickly.',
    icon: <Timer className="h-4 w-4" />,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: '5 questions per persona, 2 follow-ups. Default cadence.',
    icon: <Gauge className="h-4 w-4" />,
  },
  {
    id: 'deep',
    label: 'Deep',
    description: '8 questions per persona, 3 follow-ups. Stay longer per persona.',
    icon: <Microscope className="h-4 w-4" />,
  },
];

interface SessionSuggestion {
  label: string;
  description: string;
  persona?: string;
  sections?: string[];
  type?: 'general' | 'focused' | 'refinement';
}

interface IterationType {
  id: string;
  label: string;
  icon: string;
  description: string;
  default_persona: string;
  sections_count: number;
  sections?: string[];
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  rocket: <Rocket className="h-4 w-4" />,
  zap: <Zap className="h-4 w-4" />,
  bug: <Bug className="h-4 w-4" />,
  search: <Search className="h-4 w-4" />,
  layers: <Layers className="h-4 w-4" />,
  wrench: <Wrench className="h-4 w-4" />,
};

const TYPE_SECTION_LABELS: Record<string, string> = {
  project_overview: 'Overview',
  goals_constraints: 'Goals',
  users_personas: 'Users',
  team_capacity: 'Team',
  architecture: 'Architecture',
  tech_stack: 'Tech Stack',
  api_integrations: 'APIs',
  ui_ux: 'UI/UX',
  security_compliance: 'Security',
  infrastructure: 'Infra',
  risks_unknowns: 'Risks',
  out_of_scope: 'Scope',
  open_questions: 'Questions',
};

const TYPE_FOCUS_SECTIONS: Record<string, string[]> = {
  large_feature: [
    'project_overview',
    'goals_constraints',
    'users_personas',
    'team_capacity',
    'architecture',
    'tech_stack',
    'api_integrations',
    'ui_ux',
    'security_compliance',
    'infrastructure',
    'risks_unknowns',
    'out_of_scope',
    'open_questions',
  ],
  small_win: ['project_overview', 'goals_constraints', 'tech_stack', 'ui_ux', 'out_of_scope'],
  bug_fix: ['project_overview', 'architecture', 'risks_unknowns', 'open_questions'],
  spike: ['project_overview', 'goals_constraints', 'open_questions', 'risks_unknowns'],
  refactor: ['architecture', 'tech_stack', 'api_integrations', 'infrastructure'],
  maintenance: ['infrastructure', 'security_compliance', 'risks_unknowns', 'team_capacity'],
};

const TYPE_STARTERS: Record<string, string> = {
  large_feature: "I'm planning a new feature that ",
  small_win: 'I want to add a quick improvement to ',
  bug_fix: "There's a bug I need to fix where ",
  spike: "I'd like to explore and research ",
  refactor: 'I need to refactor ',
  maintenance: 'I need to update the infrastructure for ',
};

// Replaced by the coverage-aware BlueprintLauncher (Phase 3) — the launcher
// derives focus_target from current blueprint state instead of forcing the
// user to pick one of five static buckets.

export default function NewSessionPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const [idea, setIdea] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { authFetch, ready } = useAuthFetch();
  const confirm = useConfirm();

  // Suggestions from backend
  const [suggestions, setSuggestions] = useState<SessionSuggestion[]>([]);
  const [projectDesc, setProjectDesc] = useState('');
  const [coverage, setCoverage] = useState<{
    overall: number;
    grade: string;
    hasBlueprint: boolean;
  } | null>(null);

  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Rewrite state
  const [rewriting, setRewriting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState('');

  const [allLocked, setAllLocked] = useState(false);
  const [iterationTypes, setIterationTypes] = useState<IterationType[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [autoDetectedType, setAutoDetectedType] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>({
    mode: 'free_form',
    sections: [],
    bullet_ids: [],
  });
  // Per-session question budget. "balanced" matches today's behaviour;
  // "fast" rotates personas after ~3 questions; "deep" lets each persona
  // stay longer. Wired through to ai_config.pace on the backend.
  const [pace, setPace] = useState<Pace>('balanced');
  const [technicalComfort, setTechnicalComfort] = useState<TechnicalComfort>('comfortable');
  const [parentOos, setParentOos] = useState<string | null>(null);
  const ideaRef = useRef<HTMLTextAreaElement>(null);
  const [firstReleaseComplete, setFirstReleaseComplete] = useState(true);
  const [activeSessions, setActiveSessions] = useState<
    Array<{ id: string; title: string | null; release_name: string | null }>
  >([]);
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Fetch session suggestions and iteration status on mount
  useEffect(() => {
    if (!ready) return;
    authFetch(`/api/projects/${projectId}/session-suggestions`)
      .then(async (resp) => {
        if (resp.ok) {
          const data = await resp.json();
          setSuggestions(data.suggestions || []);
          setProjectDesc(data.project_description || '');
          setCoverage({
            overall: data.overall_coverage,
            grade: data.grade,
            hasBlueprint: data.has_blueprint,
          });
          if (data.iteration_types) setIterationTypes(data.iteration_types);
          if (data.parent_out_of_scope) setParentOos(data.parent_out_of_scope);
          if (data.first_release_complete !== undefined)
            setFirstReleaseComplete(data.first_release_complete);
          if (data.active_sessions) setActiveSessions(data.active_sessions);
          // First session: default to "Large Feature" and combine with project description
          if (!data.has_blueprint) {
            setSelectedType('large_feature');
            setIdea(openingLine(TYPE_STARTERS['large_feature'] || '', data.project_description));
          }
        }
      })
      .catch(() => {});
    // Check if all iterations are locked
    authFetch(`/api/projects/${projectId}/iterations`)
      .then(async (resp) => {
        if (resp.ok) {
          const iters = await resp.json();
          if (iters.length > 0 && iters.every((i: { status: string }) => i.status === 'locked')) {
            setAllLocked(true);
          }
        }
      })
      .catch(() => {});
  }, [projectId, ready, authFetch]);

  // Auto-detect iteration type from description (debounced)
  const detectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const detectType = useCallback(
    (text: string) => {
      if (!iterationTypes.length || !text.trim() || text.length < 10) return;
      clearTimeout(detectTimer.current);
      detectTimer.current = setTimeout(async () => {
        try {
          const resp = await authFetch(`/api/projects/${projectId}/detect-iteration-type`, {
            method: 'POST',
            body: JSON.stringify({ text }),
          });
          if (resp.ok) {
            const data = await resp.json();
            setAutoDetectedType(data.type);
          }
        } catch {}
      }, 800);
    },
    [projectId, iterationTypes.length, authFetch],
  );

  async function createSession() {
    // Pass persona from selected suggestion or iteration type
    const selectedPersona =
      selectedIdx !== null
        ? suggestions[selectedIdx]?.persona
        : selectedType
          ? iterationTypes.find((t) => t.id === selectedType)?.default_persona
          : undefined;

    // Update the active iteration's type if one was selected
    if (selectedType && coverage?.hasBlueprint) {
      await authFetch(
        `/api/projects/${projectId}/iterations/${(await authFetch(`/api/projects/${projectId}/iterations`).then((r) => r.json())).find((i: { status: string }) => i.status === 'planning')?.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iteration_type: selectedType }),
        },
      ).catch(() => {});
    }

    // Backend derives focus_sections from focus_target.sections when the
    // caller omits the explicit focus_sections field — see SessionCreate
    // in backend/src/app/schemas/session.py. Free-form mode sends an empty
    // sections list so the iteration-type default applies (no override).
    const isFreeForm = focusTarget.mode === 'free_form';
    const resp = await authFetch(`/api/projects/${projectId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({
        initial_idea: idea || undefined,
        persona: selectedPersona || undefined,
        iteration_type: selectedType || undefined,
        focus_target: isFreeForm ? undefined : focusTarget,
        pace,
        technical_comfort: technicalComfort,
      }),
    });
    if (resp.ok) {
      const session = await resp.json();
      router.push(`/projects/${projectId}/sessions/${session.id}?new=1`);
    } else {
      setError(`Failed to create session: ${resp.status}`);
    }
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      // Check relevance if user provided an idea (skip if it still carries the
      // project description — those words were auto-populated, not typed here)
      if (idea.trim() && !carriesDescription(idea, projectDesc)) {
        const checkResp = await authFetch(`/api/projects/${projectId}/sessions/check-relevance`, {
          method: 'POST',
          body: JSON.stringify({ initial_idea: idea }),
        });
        if (checkResp.ok) {
          const { relevant, reason } = await checkResp.json();
          if (!relevant) {
            const proceed = await confirm({
              title: 'Off-Topic Session',
              message: reason || "This doesn't seem related to this project.",
              confirmLabel: 'Continue Anyway',
              cancelLabel: 'Create New Project',
              variant: 'warning',
            });
            if (!proceed) {
              router.push('/projects');
              return;
            }
          }
        }
      }
      await createSession();
    } catch {
      setError('Failed to create session');
    } finally {
      setLoading(false);
    }
  }

  async function handleRewrite() {
    if (!idea.trim() || rewriting) return;
    setRewriting(true);
    setSuggestion(null);
    setEditing(false);
    try {
      const resp = await authFetch('/api/projects/rewrite-idea', {
        method: 'POST',
        body: JSON.stringify({ text: idea.trim(), project_id: projectId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.rewritten) {
          setSuggestion(data.rewritten);
        }
      } else {
        const data = await resp.json().catch(() => ({}));
        setError(data.detail || 'AI rewrite failed. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setRewriting(false);
    }
  }

  function handleAccept() {
    if (suggestion) setIdea(suggestion);
    setSuggestion(null);
    setEditing(false);
  }

  function handleDeny() {
    setSuggestion(null);
    setEditing(false);
  }

  function handleStartEdit() {
    setEditDraft(suggestion || '');
    setEditing(true);
  }

  function handleSaveEdit() {
    setIdea(editDraft);
    setSuggestion(null);
    setEditing(false);
  }

  function handlePickSuggestion(s: SessionSuggestion, idx: number) {
    if (selectedIdx === idx) {
      // Deselect
      setSelectedIdx(null);
      setIdea('');
      return;
    }
    setSelectedIdx(idx);
    if (s.type === 'general') {
      setIdea(projectDesc || s.description);
    } else {
      const sectionNames = (s.sections || [])
        .map((sec) => sec.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
        .join(', ');
      const focus = sectionNames || s.label;
      setIdea(
        coverage?.hasBlueprint
          ? `Continue planning — focus on ${focus}.`
          : `${s.label}. ${s.description}`,
      );
    }
  }

  return (
    <PageShell width="narrow">
      <div className="mb-8 animate-slide-up stagger-1">
        <button
          onClick={() => router.back()}
          className="text-[11px] font-body text-muted-foreground/50 hover:text-foreground/70 transition-colors mb-4 flex items-center gap-1"
        >
          ← Back to project
        </button>
        <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
          New Session
        </p>
        <h1 className="font-display text-4xl italic text-foreground">Start Planning</h1>
      </div>

      {/* First release gate: must complete first release before creating new ones */}
      {!firstReleaseComplete && coverage?.hasBlueprint && (
        <div className="mb-8 animate-slide-up stagger-2">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-6 text-center">
            <p className="text-sm font-body text-foreground/80 mb-2">
              Complete your first release first
            </p>
            <p className="text-[11px] font-body text-muted-foreground/60 mb-4">
              Finalize your initial release before starting new ones.
            </p>
            {activeSessions.length > 0 && (
              <button
                onClick={() =>
                  router.push(`/projects/${projectId}/sessions/${activeSessions[0].id}`)
                }
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-body font-medium hover:bg-primary/90 transition-colors"
              >
                Go to active session
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active session warning (for subsequent releases) */}
      {firstReleaseComplete && activeSessions.length > 0 && !warningDismissed && (
        <div className="mb-6 animate-slide-up stagger-2">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-body text-foreground/70">
                You have {activeSessions.length} active release
                {activeSessions.length > 1 ? 's' : ''}.{' '}
                <button
                  onClick={() =>
                    router.push(`/projects/${projectId}/sessions/${activeSessions[0].id}`)
                  }
                  className="text-primary hover:text-primary/80 underline"
                >
                  Resume {activeSessions[0].title || activeSessions[0].release_name || 'session'}
                </button>
              </p>
              <button
                onClick={() => setWarningDismissed(true)}
                className="text-[10px] font-body text-muted-foreground/40 hover:text-foreground/60 ml-3"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session focus suggestions */}
      {suggestions.length > 0 && !allLocked && !iterationTypes.length && (
        <div className="mb-6 animate-slide-up stagger-2">
          <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
            {coverage?.hasBlueprint ? 'Suggested focus areas' : 'Get started with'}
          </p>
          {coverage?.hasBlueprint && (
            <p className="text-[11px] font-body text-muted-foreground/60 mb-3">
              Blueprint is at {coverage.overall}% coverage (grade {coverage.grade}). These sessions
              will help fill the gaps:
            </p>
          )}
          <div className="space-y-2">
            {suggestions.map((s, i) => {
              const isGeneral = s.type === 'general';
              const isSelected = selectedIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => handlePickSuggestion(s, i)}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-all group ${
                    isSelected
                      ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/20'
                      : 'border-border/50 bg-card/40 hover:bg-card/80 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-body font-medium group-hover:text-foreground ${isSelected ? 'text-foreground' : 'text-foreground/90'}`}
                    >
                      {isGeneral ? 'Start from scratch' : s.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {isSelected && (
                        <span className="text-[9px] font-body text-primary px-1.5 py-0.5 rounded bg-primary/15 font-medium">
                          Selected
                        </span>
                      )}
                      {s.persona && (
                        <span className="text-[9px] font-body text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/30">
                          {s.persona === 'default'
                            ? 'Engineer'
                            : s.persona === 'pm'
                              ? 'PM'
                              : s.persona === 'architect'
                                ? 'Architect'
                                : s.persona === 'challenger'
                                  ? 'Challenger'
                                  : 'Mentor'}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] font-body text-muted-foreground/60 mt-0.5">
                    {s.description}
                  </p>
                  {s.sections && s.sections.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {s.sections.map((sec) => (
                        <span
                          key={sec}
                          className={`text-[9px] font-body px-1.5 py-0.5 rounded ${isSelected ? 'bg-primary/15 text-primary/70' : 'bg-muted/40 text-muted-foreground/50'}`}
                        >
                          {sec.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <div className="flex-1 h-px bg-border/30" />
            <span className="text-[10px] font-body text-muted-foreground/30">
              or describe your own
            </span>
            <div className="flex-1 h-px bg-border/30" />
          </div>
        </div>
      )}

      {/* Release type selector */}
      {iterationTypes.length > 0 && (firstReleaseComplete || !coverage?.hasBlueprint) && (
        <div className="mb-6 animate-slide-up stagger-2">
          <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
            What are you building?
          </p>
          {parentOos && (
            <p className="text-[11px] font-body text-muted-foreground/50 mb-3">
              From previous release: {parentOos.slice(0, 120)}
              {parentOos.length > 120 ? '...' : ''}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {iterationTypes.map((t) => {
              const isSelected = selectedType === t.id;
              const isDetected = autoDetectedType === t.id && !selectedType;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedType(null);
                      setIdea(projectDesc || '');
                    } else {
                      setSelectedType(t.id);
                      const combined = openingLine(TYPE_STARTERS[t.id] || '', projectDesc);
                      setIdea(combined);
                      // Focus textarea and place cursor at end
                      setTimeout(() => {
                        if (ideaRef.current) {
                          ideaRef.current.focus();
                          ideaRef.current.selectionStart = combined.length;
                          ideaRef.current.selectionEnd = combined.length;
                        }
                      }, 50);
                    }
                  }}
                  className={`text-left px-3 py-2.5 rounded-lg border transition-all group ${
                    isSelected
                      ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/20'
                      : isDetected
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/50 bg-card/40 hover:bg-card/80 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`${isSelected ? 'text-primary' : 'text-muted-foreground/60'}`}>
                      {TYPE_ICONS[t.icon] || <Zap className="h-4 w-4" />}
                    </span>
                    <span
                      className={`text-xs font-body font-medium ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}
                    >
                      {t.label}
                    </span>
                    {isDetected && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary font-medium ml-auto">
                        Suggested
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary font-medium ml-auto">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-body text-muted-foreground/50 mt-0.5 ml-6">
                    {t.description}
                  </p>
                  {isSelected && (t.sections || []).length > 0 && (
                    <div className="mt-1.5 ml-6 flex flex-wrap items-center gap-1">
                      {t.sections_count <= 6 ? (
                        <>
                          {(t.sections || []).map((sec) => (
                            <span
                              key={sec}
                              className="text-[8px] font-body px-1.5 py-0.5 rounded bg-primary/15 text-primary/70"
                            >
                              {TYPE_SECTION_LABELS[sec] ||
                                sec.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                            </span>
                          ))}
                          {t.sections_count < 13 && (
                            <span className="text-[8px] font-body text-muted-foreground/30">
                              +{13 - t.sections_count} defaulted
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[8px] font-body text-muted-foreground/40">
                          All {t.sections_count} sections
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Technical-comfort + pace selectors — segmented pill controls mirror
            the AI settings drawer so the visual language is consistent across
            session-start and in-session editing. Both write into
            Session.ai_config; see backend/src/app/services/facilitator.py
            (TECHNICAL_COMFORT_PROMPTS) and backend/src/app/services/pace.py. */}
      {(firstReleaseComplete || !coverage?.hasBlueprint) && (
        <div className="mb-6 animate-slide-up stagger-2 space-y-4">
          <div className="space-y-2">
            <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
              How comfortable are you with technical terms?
            </p>
            <div
              className="flex gap-1 bg-foreground/[0.04] rounded-md p-1"
              role="radiogroup"
              aria-label="Comfort with technical terms"
            >
              {TECHNICAL_COMFORT_OPTIONS.map((opt) => {
                const active = technicalComfort === opt.id;
                return (
                  <button
                    key={opt.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTechnicalComfort(opt.id)}
                    title={opt.description}
                    className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${
                      active
                        ? 'bg-foreground/[0.12] text-foreground'
                        : 'text-muted-foreground/80 hover:text-foreground/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-body text-muted-foreground/50 leading-snug">
              {TECHNICAL_COMFORT_OPTIONS.find((o) => o.id === technicalComfort)?.description}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground">
              How fast should personas rotate?
            </p>
            <div
              className="flex gap-1 bg-foreground/[0.04] rounded-md p-1"
              role="radiogroup"
              aria-label="Per-persona question budget"
            >
              {PACE_OPTIONS.map((opt) => {
                const active = pace === opt.id;
                return (
                  <button
                    key={opt.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPace(opt.id)}
                    title={opt.description}
                    className={`flex-1 text-[11px] py-1.5 rounded transition-all font-medium ${
                      active
                        ? 'bg-foreground/[0.12] text-foreground'
                        : 'text-muted-foreground/80 hover:text-foreground/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] font-body text-muted-foreground/50 leading-snug">
              {PACE_OPTIONS.find((o) => o.id === pace)?.description}
            </p>
          </div>
        </div>
      )}

      {/* Coverage-aware launcher — replaces the old 5-pill picker with a
            view of the current blueprint plus four continuation modes. */}
      {(firstReleaseComplete || !coverage?.hasBlueprint) && coverage?.hasBlueprint && (
        <div className="mb-6 animate-slide-up stagger-2">
          <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
            How do you want to spend this session?
          </p>
          <BlueprintLauncher projectId={projectId} onChange={setFocusTarget} />
        </div>
      )}

      {(firstReleaseComplete || !coverage?.hasBlueprint) && (
        <div className="space-y-5 animate-slide-up stagger-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-body font-medium text-muted-foreground">
                {coverage?.hasBlueprint
                  ? 'What should this session focus on?'
                  : 'What are you planning?'}
              </Label>
              <button
                type="button"
                onClick={handleRewrite}
                disabled={!idea.trim() || rewriting || !!suggestion}
                title="Improve clarity, fix spelling, and tighten up your description"
                className="group flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-primary hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
              >
                <Sparkles
                  className={`h-3 w-3 ${rewriting ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`}
                />
                <span>{rewriting ? 'Rewriting…' : 'AI Rewrite'}</span>
              </button>
            </div>
            {carriesDescription(idea, projectDesc) && (
              <p className="text-[11px] font-body text-muted-foreground/60">
                {DESCRIBE_COPY.CARRIED}
              </p>
            )}
            <Textarea
              ref={ideaRef}
              value={idea}
              onChange={(e) => {
                setIdea(e.target.value);
                if (selectedIdx !== null) setSelectedIdx(null);
                detectType(e.target.value);
              }}
              placeholder={
                coverage?.hasBlueprint
                  ? 'e.g. Define the user personas and prioritize features...'
                  : 'Describe your idea, project, or problem...'
              }
              rows={4}
              className="font-body text-sm bg-card border-border/70 focus:border-primary/50"
            />
          </div>

          {/* Suggestion card */}
          {suggestion && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden animate-slide-up">
              <div className="px-4 py-2.5 border-b border-primary/20 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-body font-medium text-primary">
                  Suggested rewrite
                </span>
              </div>

              {editing ? (
                <div className="p-4">
                  <Textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={4}
                    autoFocus
                    className="font-body text-sm bg-background border-border/70 focus:border-primary/50"
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditing(false)}
                      className="font-body text-xs h-7 px-3"
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveEdit}
                      className="font-body text-xs h-7 px-3"
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Use this
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="px-4 py-3">
                    <p className="font-body text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {suggestion}
                    </p>
                  </div>
                  <div className="px-4 py-2.5 border-t border-primary/20 flex items-center gap-2 justify-end">
                    <button
                      onClick={handleDeny}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <X className="h-3 w-3" />
                      Dismiss
                    </button>
                    <button
                      onClick={handleStartEdit}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      onClick={handleAccept}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-primary hover:bg-primary/15 transition-colors"
                    >
                      <Check className="h-3 w-3" />
                      Accept
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="text-xs font-body text-destructive">{error}</p>}
          <Button
            onClick={handleCreate}
            disabled={loading || !ready || !idea.trim()}
            className="w-full font-body font-medium"
          >
            {loading ? 'Creating...' : !ready ? 'Connecting...' : 'Start Release'}
          </Button>
        </div>
      )}
    </PageShell>
  );
}
