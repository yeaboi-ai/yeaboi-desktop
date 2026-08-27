'use client';

import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { BulletSourceChip, type BulletSource } from './bullet-source-chip';

const SECTION_ORDER = [
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
];

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

// Mirrors backend src/app/services/blueprint_merge.py:_normalize. Bullets are
// keyed by their normalized form so the chip lookup is stable across edits.
const BULLET_PREFIX_RE = /^\s*[-*•]\s*/;
const WHITESPACE_RE = /\s+/g;

function normalizeBullet(line: string): string {
  return line.replace(BULLET_PREFIX_RE, '').trim().replace(WHITESPACE_RE, ' ').toLowerCase();
}

function splitBullets(text: string): Array<{ raw: string; norm: string }> {
  if (!text) return [];
  const out: Array<{ raw: string; norm: string }> = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const norm = normalizeBullet(rawLine);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ raw: rawLine.replace(BULLET_PREFIX_RE, '').trimEnd(), norm });
  }
  return out;
}

export interface BlueprintDocumentProps {
  /** Map of section slug → markdown-ish bullet text (same shape as the panel). */
  content: Record<string, string>;
  /** Per-section, per-bullet provenance: { section: { normalized_bullet: source } }. */
  bulletSources?: Record<string, Record<string, BulletSource | string>> | null;
  /** Optional section-level fallback when no bullet-level source is recorded. */
  sectionSources?: Record<string, BulletSource | string> | null;
  /** 0–100 coverage per section, optional. Drives the coverage strip at the top. */
  coverageScores?: Record<string, number>;
  /** Header metadata. */
  iterationLabel: string;
  versionNumber: number;
  iterationStatus?: string;
  updatedAt?: string | Date | null;
  updatedByLabel?: string | null;
  /** Right-side controls for the sticky header (export menu, share toggle, etc.). */
  headerActions?: React.ReactNode;
  /** When true: no edit affordances, no anchor jump scrolls beyond the page. */
  readOnly?: boolean;
}

export function BlueprintDocument({
  content,
  bulletSources,
  sectionSources,
  coverageScores,
  iterationLabel,
  versionNumber,
  iterationStatus,
  updatedAt,
  updatedByLabel,
  headerActions,
  readOnly,
}: BlueprintDocumentProps) {
  const sections = useMemo(() => {
    return SECTION_ORDER.map((slug) => {
      const body = content[slug] || '';
      const bullets = splitBullets(body);
      const sectionBulletSources = bulletSources?.[slug] || {};
      const fallback = (sectionSources?.[slug] as BulletSource | undefined) ?? 'ai_inferred';
      return {
        slug,
        label: SECTION_LABELS[slug] || slug,
        body,
        bullets: bullets.map((b) => ({
          ...b,
          source: (sectionBulletSources[b.norm] as BulletSource | undefined) ?? fallback,
        })),
        score: coverageScores?.[slug],
      };
    });
  }, [content, bulletSources, sectionSources, coverageScores]);

  const overall = useMemo(() => {
    if (!coverageScores) return null;
    const scores = SECTION_ORDER.map((s) => coverageScores[s] ?? 0);
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [coverageScores]);

  const updatedText = useMemo(() => {
    if (!updatedAt) return null;
    const d = typeof updatedAt === 'string' ? new Date(updatedAt) : updatedAt;
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }, [updatedAt]);

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 backdrop-blur-md bg-background/85 border-b border-border/60">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">Blueprint · {iterationLabel}</h1>
              {iterationStatus === 'locked' && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-foreground/[0.08] text-muted-foreground">
                  <Lock className="h-3 w-3" /> locked
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              v{versionNumber}
              {updatedText ? ` · updated ${updatedText}` : ''}
              {updatedByLabel ? ` by ${updatedByLabel}` : ''}
              {readOnly ? ' · read-only' : ''}
            </p>
          </div>
          {headerActions && <div className="shrink-0">{headerActions}</div>}
        </div>

        {overall !== null && (
          <div className="max-w-4xl mx-auto px-6 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
                Coverage
              </span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {overall}%
              </span>
            </div>
            <div className="flex gap-1">
              {sections.map((s) => (
                <a
                  key={s.slug}
                  href={`#${s.slug}`}
                  title={`${s.label} — ${s.score ?? 0}%`}
                  className="flex-1 h-1.5 rounded-full bg-foreground/[0.06] hover:bg-foreground/[0.12] overflow-hidden transition-colors"
                >
                  <span
                    className={`block h-full rounded-full ${
                      (s.score ?? 0) >= 80
                        ? 'bg-success/70'
                        : (s.score ?? 0) >= 60
                          ? 'bg-primary/60'
                          : (s.score ?? 0) >= 40
                            ? 'bg-warning/60'
                            : 'bg-destructive/50'
                    }`}
                    style={{ width: `${s.score ?? 0}%` }}
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 w-full space-y-10">
        {sections.map((s) => (
          <section key={s.slug} id={s.slug} className="scroll-mt-32">
            <div className="flex items-baseline justify-between gap-3 mb-3 border-b border-border/40 pb-2">
              <h2 className="text-lg font-semibold tracking-tight">{s.label}</h2>
              {typeof s.score === 'number' && (
                <span
                  className={`text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded ${
                    s.score >= 80
                      ? 'bg-success/10 text-success/80'
                      : s.score >= 60
                        ? 'bg-primary/10 text-primary/80'
                        : s.score >= 40
                          ? 'bg-warning/10 text-warning/80'
                          : 'bg-destructive/10 text-destructive/80'
                  }`}
                >
                  {s.score}%
                </span>
              )}
            </div>
            {s.bullets.length === 0 ? (
              <p className="text-sm italic text-muted-foreground/60">Not yet covered.</p>
            ) : (
              <ul className="space-y-2">
                {s.bullets.map((b) => (
                  <li key={b.norm} className="flex items-start gap-2.5 text-sm leading-relaxed">
                    <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
                    <span className="flex-1 text-foreground/90">{b.raw}</span>
                    <span className="mt-0.5 shrink-0">
                      <BulletSourceChip source={b.source} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
