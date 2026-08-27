'use client';

import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ResumeScreenProps {
  sessionId: string;
  projectId: string;
  onContinue: () => void;
}

interface PersonaRecommendation {
  persona: string;
  label: string;
  gaps_count: number;
  gap_sections: string[];
  recommended?: boolean;
}

interface GapItem {
  label: string;
  key: string;
  score: number;
}

interface ResumeInfo {
  coverage: {
    overall: number;
    grade: string;
    gaps: GapItem[];
    scores: Record<string, number>;
  };
  current_persona: string;
  persona_recommendations: PersonaRecommendation[];
  title: string;
  filled_count: number;
  total_count: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ResumeScreen({ sessionId, projectId, onContinue }: ResumeScreenProps) {
  const router = useRouter();
  const { authFetch, ready } = useAuthFetch();
  const [info, setInfo] = useState<ResumeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // Fetch resume info on mount
  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    authFetch(`/api/sessions/${sessionId}/resume-info`)
      .then(async (resp) => {
        if (resp.ok) {
          const data: ResumeInfo = await resp.json();
          setInfo(data);
          setSelectedPersona(data.current_persona);
        } else {
          setError('Failed to load session info');
        }
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ready]);

  // Switch persona
  async function handleSelectPersona(persona: string) {
    if (persona === selectedPersona || switching) return;
    setSwitching(true);
    setSelectedPersona(persona);
    try {
      await authFetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ai_config: { persona } }),
      });
    } catch {
      // Revert on failure
      setSelectedPersona(info?.current_persona ?? null);
    } finally {
      setSwitching(false);
    }
  }

  // ─── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="mx-auto max-w-2xl w-full px-6">
          <div className="space-y-6 animate-slide-up stagger-1">
            <div className="h-4 w-32 bg-card rounded animate-pulse" />
            <div className="h-8 w-64 bg-card rounded animate-pulse" />
            <div className="h-3 w-48 bg-card rounded animate-pulse" />
            <div className="flex items-center gap-4 mt-6">
              <div className="w-16 h-16 rounded-full bg-card animate-pulse" />
              <div className="space-y-2">
                <div className="h-3 w-36 bg-card rounded animate-pulse" />
                <div className="h-2 w-24 bg-card rounded animate-pulse" />
              </div>
            </div>
            <div className="space-y-2 mt-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />
              ))}
            </div>
            <div className="h-9 bg-card rounded-lg animate-pulse mt-6" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ─────────────────────────────────────────────────────────────

  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm font-body text-destructive">
            {error || 'Unable to load session details.'}
          </p>
          <button
            onClick={onContinue}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-body font-medium hover:bg-primary/85 transition-all"
          >
            Continue anyway
          </button>
        </div>
      </div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────────

  const { coverage, persona_recommendations, title, filled_count, total_count } = info;
  const pct = total_count > 0 ? (filled_count / total_count) * 94.2 : 0;
  const coveragePct = total_count > 0 ? Math.round((filled_count / total_count) * 100) : 0;

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-2xl px-6 py-14">
        {/* Back + Header */}
        <div className="mb-10 animate-slide-up stagger-1">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="text-[11px] font-body text-muted-foreground/50 hover:text-foreground/70 transition-colors mb-4 flex items-center gap-1"
          >
            ← Back to project
          </button>
          <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Resume Session
          </p>
          <h1 className="font-display text-4xl italic text-foreground">Resume Planning</h1>
          {title && <p className="text-sm font-body text-muted-foreground mt-2">{title}</p>}
        </div>

        {/* Coverage overview */}
        <div className="mb-8 animate-slide-up stagger-2">
          <div className="flex items-center gap-5">
            {/* Donut */}
            <div className="relative shrink-0">
              <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  className="text-muted-foreground/[0.30]"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${pct} 94.2`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-body font-medium text-foreground">
                {coveragePct}%
              </span>
            </div>

            <div>
              <p className="text-sm font-body text-foreground">
                <span className="text-primary font-medium">{filled_count}</span> of{' '}
                <span className="font-medium">{total_count}</span> sections filled
              </p>
              <p className="text-[11px] font-body text-muted-foreground/60 mt-0.5">
                Coverage grade: {coverage.grade}
              </p>
            </div>
          </div>
        </div>

        {/* Gap sections */}
        {coverage.gaps.length > 0 && (
          <div className="mb-8 animate-slide-up stagger-3">
            <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
              Remaining gaps
            </p>
            <div className="flex flex-wrap gap-2">
              {coverage.gaps.map((gap) => {
                const dotColor =
                  gap.score === 0
                    ? 'bg-destructive/70'
                    : gap.score < 60
                      ? 'bg-warning/70'
                      : 'bg-success/70';
                const borderColor =
                  gap.score === 0
                    ? 'border-destructive/20'
                    : gap.score < 60
                      ? 'border-warning/20'
                      : 'border-success/20';
                return (
                  <span
                    key={gap.key}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-body text-muted-foreground/70 px-2.5 py-1 rounded-md bg-card border ${borderColor}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />
                    {gap.label}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Persona recommendations */}
        {persona_recommendations.length > 0 && (
          <div className="mb-8 animate-slide-up stagger-4">
            <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground mb-3">
              Recommended focus
            </p>
            <div className="space-y-2">
              {persona_recommendations.map((rec) => {
                const isSelected = selectedPersona === rec.persona;
                return (
                  <button
                    key={rec.persona}
                    onClick={() => handleSelectPersona(rec.persona)}
                    disabled={switching}
                    className={`w-full text-left px-4 py-3.5 rounded-lg border transition-all group ${
                      isSelected
                        ? 'border-primary/60 bg-primary/10 ring-1 ring-primary/20'
                        : 'border-border/50 bg-card/40 hover:bg-card/80 hover:border-primary/30'
                    } disabled:opacity-60`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-body font-medium ${
                          isSelected
                            ? 'text-foreground'
                            : 'text-foreground/90 group-hover:text-foreground'
                        }`}
                      >
                        {rec.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {isSelected && (
                          <span className="text-[9px] font-body text-primary px-1.5 py-0.5 rounded bg-primary/15 font-medium">
                            Active
                          </span>
                        )}
                        {rec.recommended && !isSelected && (
                          <span className="text-[9px] font-body text-success px-1.5 py-0.5 rounded bg-success/10 font-medium">
                            Recommended
                          </span>
                        )}
                        <span className="text-[9px] font-body text-muted-foreground/40 px-1.5 py-0.5 rounded bg-muted/30">
                          {rec.gaps_count} {rec.gaps_count === 1 ? 'gap' : 'gaps'}
                        </span>
                      </div>
                    </div>
                    {rec.gap_sections.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {rec.gap_sections.map((section) => (
                          <span
                            key={section}
                            className={`text-[9px] font-body px-1.5 py-0.5 rounded ${
                              isSelected
                                ? 'bg-primary/15 text-primary/70'
                                : 'bg-muted/40 text-muted-foreground/50'
                            }`}
                          >
                            {section}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Continue button */}
        <div className="animate-slide-up stagger-5">
          <button
            onClick={onContinue}
            className="w-full px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-body font-medium hover:bg-primary/85 transition-all flex items-center justify-center gap-2"
          >
            {switching ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Switching persona...</span>
              </>
            ) : (
              'Continue where I left off'
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
