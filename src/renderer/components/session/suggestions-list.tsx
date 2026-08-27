"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Pencil, Sparkles, X } from "lucide-react";
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

interface SuggestionsListProps {
  pending: Suggestion[];
  /** Accept handler. `replace=true` strips the suggestion's `supersedes_bullet`
   *  before merging; default false keeps both. */
  onAccept: (id: string, editedContent?: string, replace?: boolean) => void;
  onReject: (id: string) => void;
  onBulkAcceptSection: (section: string) => void;
  /** When true, renders an empty-state placeholder. Useful when the host
   *  wants the list zone to always be present (e.g. for layout stability)
   *  rather than disappearing entirely. */
  showEmptyState?: boolean;
}

/**
 * The pending-suggestions UI extracted from the original drawer so it can be
 * embedded inline (e.g. inside the blueprint panel) without forcing a
 * separate drawer surface.
 */
export function SuggestionsList({
  pending,
  onAccept,
  onReject,
  onBulkAcceptSection,
  showEmptyState = false,
}: SuggestionsListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const s of pending) {
      const arr = map.get(s.section) ?? [];
      arr.push(s);
      map.set(s.section, arr);
    }
    // Phase 4 — conflict-first ordering. Within each group, items with a
    // `supersedes_bullet` float to the top because they require an explicit
    // accept/replace decision; additive suggestions can wait. Then the
    // groups themselves sort so any group containing a conflict appears
    // before purely-additive groups.
    for (const [, items] of map) {
      items.sort((a, b) => {
        const ac = a.supersedes_bullet ? 0 : 1;
        const bc = b.supersedes_bullet ? 0 : 1;
        return ac - bc;
      });
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const aHasConflict = a.some((s) => !!s.supersedes_bullet) ? 0 : 1;
      const bHasConflict = b.some((s) => !!s.supersedes_bullet) ? 0 : 1;
      return aHasConflict - bHasConflict;
    });
  }, [pending]);

  if (pending.length === 0) {
    if (!showEmptyState) return null;
    return (
      <div className="flex flex-col items-center justify-center text-center py-6 px-4 rounded-xl border border-dashed border-border/60">
        <Sparkles className="h-5 w-5 text-muted-foreground/30 mb-2" />
        <p className="text-[12px] text-muted-foreground max-w-[280px] leading-relaxed">
          No suggestions yet — anything the AI listener captures will appear here for review before it lands in the blueprint.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(([section, items]) => (
        <SectionGroup
          key={section}
          section={section}
          items={items}
          onAccept={onAccept}
          onReject={onReject}
          onBulkAcceptSection={onBulkAcceptSection}
        />
      ))}
    </div>
  );
}

function SectionGroup({
  section,
  items,
  onAccept,
  onReject,
  onBulkAcceptSection,
}: {
  section: string;
  items: Suggestion[];
  onAccept: (id: string, editedContent?: string, replace?: boolean) => void;
  onReject: (id: string) => void;
  onBulkAcceptSection: (section: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const label = SECTION_LABELS[section] || section;

  return (
    <div className="rounded-xl bg-foreground/[0.02] border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/90 hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {label}
          <span className="text-[10px] text-muted-foreground/70 ml-1">({items.length})</span>
        </button>
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => onBulkAcceptSection(section)}
            className="text-[11px] text-success/90 hover:text-success px-2 py-0.5 rounded-md hover:bg-success/10 transition-colors"
          >
            Accept all
          </button>
        )}
      </div>
      {expanded && (
        <div className="flex flex-col divide-y divide-white/[0.04]">
          {items.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} onAccept={onAccept} onReject={onReject} />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onAccept,
  onReject,
}: {
  suggestion: Suggestion;
  onAccept: (id: string, editedContent?: string, replace?: boolean) => void;
  onReject: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(suggestion.content);
  const hasConflict = !!suggestion.supersedes_bullet;

  return (
    <div className="px-3 py-2.5">
      {hasConflict && (
        // Conflict preview: show what will be replaced. Strikethrough the
        // existing bullet and label it as superseded so the user understands
        // why "Replace" is offered.
        <div className="mb-2 px-2 py-1.5 rounded-md bg-warning/[0.06] border border-warning/20">
          <div className="text-[10px] uppercase tracking-wide text-warning/80 mb-0.5">
            Conflicts with existing
          </div>
          <div className="text-[12px] text-muted-foreground line-through whitespace-pre-wrap leading-snug">
            {suggestion.supersedes_bullet}
          </div>
        </div>
      )}
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(6, Math.max(2, draft.split("\n").length))}
          className="w-full resize-y bg-foreground/[0.05] border border-border/70 rounded-md px-2 py-1.5 text-[12.5px] text-foreground leading-relaxed focus:outline-none focus:border-border"
          autoFocus
        />
      ) : (
        <pre className="text-[12.5px] text-foreground/95 leading-relaxed whitespace-pre-wrap font-sans m-0">
          {suggestion.content}
        </pre>
      )}
      <div className="flex items-center justify-end gap-1 mt-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(suggestion.content);
              }}
              className="px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground/90 rounded-md hover:bg-foreground/[0.05]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onAccept(suggestion.id, draft, hasConflict)}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-success hover:text-success rounded-md hover:bg-success/10"
              title={hasConflict ? "Save edited bullet and replace the conflicting one" : "Save edited bullet and accept"}
            >
              <Check className="h-3 w-3" />
              {hasConflict ? "Save & Replace" : "Save & Accept"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit suggestion"
              className="p-1 text-muted-foreground/70 hover:text-foreground/90 rounded-md hover:bg-foreground/[0.05]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onReject(suggestion.id)}
              aria-label="Reject suggestion"
              className="p-1 text-muted-foreground/70 hover:text-destructive rounded-md hover:bg-destructive/10"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {hasConflict ? (
              <>
                <button
                  type="button"
                  onClick={() => onAccept(suggestion.id, undefined, false)}
                  className="px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground/95 rounded-md hover:bg-foreground/[0.05]"
                  title="Add the new bullet alongside the existing one"
                >
                  Keep both
                </button>
                <button
                  type="button"
                  onClick={() => onAccept(suggestion.id, undefined, true)}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-amber-200 hover:text-amber-100 rounded-md bg-warning/15 hover:bg-warning/25"
                  title="Replace the conflicting bullet with this new one"
                >
                  <Check className="h-3 w-3" />
                  Replace
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onAccept(suggestion.id)}
                aria-label="Accept suggestion"
                className="p-1 text-success/80 hover:text-success rounded-md hover:bg-success/10"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
