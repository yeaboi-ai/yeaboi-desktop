"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Compass, MessagesSquare, Sparkles, Target } from "lucide-react";
import { useBlueprintGaps } from "@/hooks/use-blueprint-gaps";

export type LauncherMode = "gaps" | "deep_dive" | "resume" | "free_form";

export interface FocusTarget {
  mode: LauncherMode;
  sections: string[];
  bullet_ids: string[];
}

interface BlueprintLauncherProps {
  projectId: string;
  /** Default selection — defaults to "free_form" to preserve the
   *  zero-friction path users expect from the prior General/Specific pills. */
  defaultMode?: LauncherMode;
  /** Fired whenever the user changes mode or selection so the parent can
   *  send the right payload at session-create time. */
  onChange: (target: FocusTarget) => void;
}

const SECTION_LABELS: Record<string, string> = {
  project_overview: "Project Overview",
  goals_constraints: "Goals & Constraints",
  users_personas: "Users & Personas",
  team_capacity: "Team & Capacity",
  architecture: "Architecture",
  tech_stack: "Tech Stack",
  api_integrations: "API & Integrations",
  ui_ux: "UI / UX",
  security_compliance: "Security & Compliance",
  infrastructure: "Infrastructure",
  risks_unknowns: "Risks & Unknowns",
  out_of_scope: "Out of Scope",
  open_questions: "Open Questions",
};

const SECTION_ORDER = Object.keys(SECTION_LABELS);

export function BlueprintLauncher({
  projectId,
  defaultMode = "free_form",
  onChange,
}: BlueprintLauncherProps) {
  const gaps = useBlueprintGaps(projectId);
  const [mode, setMode] = useState<LauncherMode>(defaultMode);
  const [deepDiveSection, setDeepDiveSection] = useState<string | null>(null);
  const [selectedBullets, setSelectedBullets] = useState<Set<string>>(new Set());

  const deepDiveBullets = useMemo(
    () => (deepDiveSection ? gaps.bullets.filter((b) => b.section === deepDiveSection) : []),
    [gaps.bullets, deepDiveSection],
  );

  // Build the focus_target the caller will send. The derivation per mode is
  // explicit so behaviour stays predictable as we add modes later.
  const derived: FocusTarget = useMemo(() => {
    if (mode === "free_form") {
      return { mode, sections: [], bullet_ids: [] };
    }
    if (mode === "gaps") {
      return {
        mode,
        sections: gaps.gaps.map((g) => g.section),
        bullet_ids: [],
      };
    }
    if (mode === "deep_dive") {
      return {
        mode,
        sections: deepDiveSection ? [deepDiveSection] : [],
        bullet_ids: Array.from(selectedBullets),
      };
    }
    // resume — scope to open_questions + any sections with outstanding
    // suggestions on the prior session. Keeping it section-level here lets
    // the facilitator zoom into the right area without us needing to predict
    // which specific bullets are still open.
    return {
      mode,
      sections: ["open_questions"],
      bullet_ids: [],
    };
  }, [mode, gaps.gaps, deepDiveSection, selectedBullets]);

  // Emit on every change so the parent always has the up-to-date target.
  // Dedupe by serialised key so the parent isn't re-notified on every render.
  const key = `${derived.mode}|${derived.sections.join(",")}|${derived.bullet_ids.join(",")}`;
  const lastKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    onChange(derived);
  }, [key, derived, onChange]);

  function toggleBullet(id: string) {
    setSelectedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-4">
      {/* Left pane — compact blueprint snapshot */}
      <div className="rounded-xl border border-border/60 bg-card/50 p-4">
        <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
          Blueprint state
        </p>
        {gaps.loading ? (
          <p className="text-xs text-muted-foreground italic">Loading coverage…</p>
        ) : Object.keys(gaps.scores).length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            Blueprint is empty — start with Free-form to outline it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {SECTION_ORDER.filter((s) => s in gaps.scores).map((slug) => {
              const score = gaps.scores[slug] ?? 0;
              const isGap = score < 60;
              return (
                <li key={slug} className="flex items-center gap-2">
                  <span
                    className={`flex-1 truncate text-[11px] ${isGap ? "text-foreground/90" : "text-muted-foreground/70"}`}
                  >
                    {SECTION_LABELS[slug]}
                  </span>
                  <span className="w-20 h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${
                        score >= 80
                          ? "bg-success/70"
                          : score >= 60
                            ? "bg-primary/60"
                            : score >= 40
                              ? "bg-warning/60"
                              : "bg-destructive/50"
                      }`}
                      style={{ width: `${score}%` }}
                    />
                  </span>
                  <span className="w-7 text-right text-[10px] font-medium tabular-nums text-muted-foreground/70">
                    {score}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Right pane — launcher modes */}
      <div className="space-y-2">
        <ModeCard
          icon={Target}
          label="Fill gaps"
          subtitle={
            gaps.gaps.length === 0
              ? "Nothing under 60% — blueprint is in good shape"
              : `${gaps.gaps.length} ${gaps.gaps.length === 1 ? "section" : "sections"} below 60% — auto-targets them`
          }
          active={mode === "gaps"}
          disabled={gaps.loading || gaps.gaps.length === 0}
          onClick={() => setMode("gaps")}
        >
          {mode === "gaps" && gaps.gaps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gaps.gaps.slice(0, 6).map((g) => (
                <span
                  key={g.section}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning/90 border border-warning/20"
                >
                  {g.label} · {g.score}%
                </span>
              ))}
              {gaps.gaps.length > 6 && (
                <span className="text-[10px] text-muted-foreground/60">+{gaps.gaps.length - 6} more</span>
              )}
            </div>
          )}
        </ModeCard>

        <ModeCard
          icon={Compass}
          label="Deep dive on a section"
          subtitle="Pick a section, optionally select specific bullets to expand"
          active={mode === "deep_dive"}
          disabled={gaps.loading || Object.keys(gaps.scores).length === 0}
          onClick={() => setMode("deep_dive")}
        >
          {mode === "deep_dive" && (
            <div className="mt-2 space-y-2">
              <select
                value={deepDiveSection ?? ""}
                onChange={(e) => {
                  setDeepDiveSection(e.target.value || null);
                  setSelectedBullets(new Set());
                }}
                className="w-full bg-foreground/[0.04] border border-border/70 rounded-md px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-border"
              >
                <option value="">Choose a section…</option>
                {SECTION_ORDER.filter((s) => s in gaps.scores).map((s) => (
                  <option key={s} value={s}>
                    {SECTION_LABELS[s]} · {gaps.scores[s] ?? 0}%
                  </option>
                ))}
              </select>
              {deepDiveSection && deepDiveBullets.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
                    Pick bullets to expand (optional)
                  </p>
                  <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {deepDiveBullets.map((b) => {
                      const checked = selectedBullets.has(b.id);
                      return (
                        <li key={b.id} className="flex items-start gap-2 text-[11.5px]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBullet(b.id)}
                            className="mt-0.5 accent-primary"
                          />
                          <span className={checked ? "text-foreground" : "text-muted-foreground/85"}>
                            {b.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {deepDiveSection && deepDiveBullets.length === 0 && (
                <p className="text-[11px] italic text-muted-foreground/70">
                  No bullets yet — the session will open the section from scratch.
                </p>
              )}
            </div>
          )}
        </ModeCard>

        <ModeCard
          icon={MessagesSquare}
          label="Resume last session"
          subtitle={
            gaps.previousSessionId
              ? `${gaps.openQuestions.length} open question${gaps.openQuestions.length === 1 ? "" : "s"}${
                  gaps.previousSessionPendingCount > 0
                    ? ` · ${gaps.previousSessionPendingCount} unresolved suggestion${gaps.previousSessionPendingCount === 1 ? "" : "s"}`
                    : ""
                }`
              : "No prior session yet"
          }
          active={mode === "resume"}
          disabled={!gaps.previousSessionId}
          onClick={() => setMode("resume")}
        >
          {mode === "resume" && gaps.openQuestions.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground/90 list-disc list-inside max-h-32 overflow-y-auto">
              {gaps.openQuestions.slice(0, 5).map((q, i) => (
                <li key={`${i}-${q}`}>{q}</li>
              ))}
            </ul>
          )}
        </ModeCard>

        <ModeCard
          icon={Sparkles}
          label="Free-form"
          subtitle="No scope override — talk about anything, the agent steers"
          active={mode === "free_form"}
          onClick={() => setMode("free_form")}
        />
      </div>
    </div>
  );
}

function ModeCard({
  icon: Icon,
  label,
  subtitle,
  active,
  disabled,
  onClick,
  children,
}: {
  icon: typeof Target;
  label: string;
  subtitle: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
        active
          ? "border-primary/40 bg-primary/[0.06]"
          : "border-border/60 bg-card/40 hover:border-border hover:bg-card/60"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">{subtitle}</p>
          {children}
        </div>
        {!disabled && !active && (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 mt-1" />
        )}
      </div>
    </button>
  );
}

