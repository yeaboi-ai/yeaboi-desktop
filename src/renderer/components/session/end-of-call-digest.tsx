"use client";

import { useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Sparkles } from "lucide-react";
import type { Suggestion } from "@/hooks/use-suggestions";

const SECTION_LABELS: Record<string, string> = {
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

interface EndOfCallDigestProps {
  pending: Suggestion[];
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onReviewIndividually: () => void;
  onClose: () => void;
}

/**
 * Modal shown after a call ends if the AI listener queued any suggestions
 * the user hasn't reviewed yet. Gives them one final batched pass before
 * moving on, with bulk accept/reject as the path-of-least-resistance.
 */
export function EndOfCallDigest({
  pending,
  onAcceptAll,
  onRejectAll,
  onReviewIndividually,
  onClose,
}: EndOfCallDigestProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const s of pending) {
      const arr = map.get(s.section) ?? [];
      arr.push(s);
      map.set(s.section, arr);
    }
    return Array.from(map.entries());
  }, [pending]);

  if (typeof window === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-[560px] max-h-[85vh] flex flex-col bg-card border border-border/70 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-success" />
            <h2 className="text-[14px] font-semibold text-foreground">
              Review AI suggestions
            </h2>
            <span className="text-[11px] text-muted-foreground px-2 py-0.5 rounded-md bg-foreground/[0.06]">
              {pending.length}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.05]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 text-[12.5px] text-muted-foreground leading-relaxed border-b border-border/60">
          The AI captured these from the conversation but hasn&apos;t added them
          to the blueprint yet. Pick a path below — you can always re-review
          individual items later.
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3">
          {grouped.map(([section, items]) => (
            <div key={section} className="rounded-lg bg-foreground/[0.02] border border-border/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-foreground/95">
                  {SECTION_LABELS[section] || section}
                </span>
                <span className="text-[10px] text-muted-foreground/70">{items.length}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {items.map((s) => (
                  <li key={s.id} className="text-[12px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
                    {s.content}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button
            onClick={onRejectAll}
            className="px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground rounded-md hover:bg-foreground/[0.05] transition-colors"
          >
            Reject all
          </button>
          <button
            onClick={onReviewIndividually}
            className="px-3 py-1.5 text-[12px] text-foreground/95 hover:text-foreground rounded-md bg-foreground/[0.05] hover:bg-foreground/[0.08] transition-colors"
          >
            Review individually
          </button>
          <button
            onClick={onAcceptAll}
            className="px-4 py-1.5 text-[12px] font-medium text-black rounded-md bg-success hover:bg-success transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
