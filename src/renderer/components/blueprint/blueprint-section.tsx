"use client";

import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Check, CheckCircle2, Pencil, X } from "lucide-react";

export const SECTION_LABELS: Record<string, string> = {
  project_overview: "Project Overview",
  goals_constraints: "Goals & Constraints",
  users_personas: "Users & Personas",
  team_capacity: "Team & Capacity",
  architecture: "Architecture",
  tech_stack: "Tech Stack",
  api_integrations: "API & Integrations",
  ui_ux: "UI/UX",
  security_compliance: "Security & Compliance",
  infrastructure: "Infrastructure",
  risks_unknowns: "Risks & Unknowns",
  out_of_scope: "Out of Scope",
  open_questions: "Open Questions",
};

interface BlueprintSectionProps {
  name: string;
  content: string;
  isEditing: boolean;
  highlighted?: boolean;
  suggested?: boolean;
  score?: number;
  /** Phase 4 — when set and the section just crossed 80% coverage, flash a
   *  quiet checkmark next to the score for a few seconds. Parent passes the
   *  full event payload so the section can dedupe (a re-render alone won't
   *  re-trigger the celebration). */
  completionSignal?: { at: number } | null;
  onEdit: () => void;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export function BlueprintSection({ name, content, isEditing, highlighted, suggested, score, completionSignal, onEdit, onSave, onCancel }: BlueprintSectionProps) {
  const [draft, setDraft] = useState(content);
  const [flash, setFlash] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const prevContent = useRef(content);
  const isFirstRender = useRef(true);
  const lastCelebrationRef = useRef<number | null>(null);
  const label = SECTION_LABELS[name] || name;
  const hasContent = content.trim().length > 0;

  // Sync draft when content changes or when entering edit mode
  useEffect(() => {
    setDraft(content);
  }, [content, isEditing]);

  // Flash highlight when content changes (live AI/chat/voice updates).
  // First mount is suppressed so the panel doesn't flash every section
  // while it hydrates from the API on page load. After that, ANY content
  // change flashes — including the common empty → content transition,
  // which is the most useful one to highlight.
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevContent.current = content;
      return;
    }
    if (prevContent.current !== content) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 2000);
      prevContent.current = content;
      return () => clearTimeout(timer);
    }
  }, [content]);

  // Phase 4 — quiet completion celebration when this section just crossed
  // the 80% threshold. Dedupe by signal timestamp so the same event arriving
  // through a re-render doesn't re-fire.
  useEffect(() => {
    if (!completionSignal) return;
    if (lastCelebrationRef.current === completionSignal.at) return;
    lastCelebrationRef.current = completionSignal.at;
    setCelebrate(true);
    const timer = setTimeout(() => setCelebrate(false), 2400);
    return () => clearTimeout(timer);
  }, [completionSignal]);

  if (isEditing) {
    return (
      <div className="border border-primary/30 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">{label}</h4>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onSave(draft); }}>
              <Check className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          className="text-sm"
          autoFocus
        />
      </div>
    );
  }

  const showWarning = highlighted && !hasContent;
  const showSuggested = !!suggested;

  return (
    <div
      className={`rounded-lg p-3 group cursor-pointer transition-all duration-500 ${
        flash
          ? "ring-2 ring-success/50 bg-success/[0.08]"
          : showWarning
          ? "bg-warning/5 border border-warning/30 hover:bg-warning/10"
          : showSuggested
            ? "bg-info/5 border border-info/20 hover:bg-info/10"
            : hasContent
              ? "bg-card hover:bg-secondary/30"
              : "bg-muted/30 hover:bg-muted/50"
      }`}
      onClick={onEdit}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className={`text-xs font-semibold uppercase tracking-wider ${
            showWarning ? "text-warning" : showSuggested ? "text-info" : "text-muted-foreground"
          }`}>{label}</h4>
          {showSuggested && <span className="text-[9px] font-normal normal-case tracking-normal text-info/60">AI suggested</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {score !== undefined && (
            <div className="flex items-center gap-1.5">
              {celebrate && (
                <CheckCircle2
                  className="h-3 w-3 text-success animate-in fade-in zoom-in duration-300"
                  aria-label="Just crossed the completion threshold"
                />
              )}
              <div className="w-12 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    score >= 80 ? "bg-success/70"
                    : score >= 50 ? "bg-primary/60"
                    : score > 0 ? "bg-warning/50"
                    : "bg-transparent"
                  }`}
                  style={{ width: `${score}%` }}
                />
              </div>
              <span className={`text-[9px] tabular-nums ${
                score >= 80 ? "text-success/60"
                : score >= 50 ? "text-primary/40"
                : score > 0 ? "text-warning/40"
                : "text-muted-foreground/20"
              }`}>{score}%</span>
            </div>
          )}
          <Pencil className={`h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity ${
            showWarning ? "text-warning" : showSuggested ? "text-info" : "text-muted-foreground"
          }`} />
        </div>
      </div>
      {hasContent ? (
        content.includes("\n- ") || content.startsWith("- ") ? (
          <ul className={`text-sm space-y-1 list-none ${showSuggested ? "text-muted-foreground" : ""}`}>
            {content.split("\n").filter(Boolean).map((line, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-primary/40 shrink-0 mt-0.5">•</span>
                <span>{line.replace(/^-\s*/, "")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`text-sm whitespace-pre-wrap ${showSuggested ? "text-muted-foreground" : ""}`}>{content}</p>
        )
      ) : (
        <p className={`text-sm italic ${showWarning ? "text-warning/70" : "text-muted-foreground"}`}>
          {showWarning ? "Empty — will be auto-filled with defaults" : "Not yet defined"}
        </p>
      )}
    </div>
  );
}
