"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, History as HistoryIcon, Lock, Sparkles } from "lucide-react";
import { BlueprintSection } from "./blueprint-section";
import { BlueprintHistoryDrawer } from "./blueprint-history-drawer";
import { SuggestionsList } from "@/components/session/suggestions-list";
import type { Suggestion } from "@/hooks/use-suggestions";

const SECTIONS = [
  "project_overview",
  "goals_constraints",
  "users_personas",
  "team_capacity",
  "architecture",
  "tech_stack",
  "api_integrations",
  "ui_ux",
  "security_compliance",
  "infrastructure",
  "risks_unknowns",
  "out_of_scope",
  "open_questions",
];

export interface BlueprintIterationInfo {
  id: string;
  iteration_number: number;
  label: string;
  status: "planning" | "locked";
}

interface BlueprintPanelProps {
  content: Record<string, string>;
  version: number;
  editingSection: string | null;
  highlightEmpty?: boolean;
  suggestedSections?: Set<string>;
  coverageScores?: Record<string, number>;
  focusSections?: string[] | null;
  onEdit: (section: string) => void;
  onSave: (section: string, content: string) => void;
  onCancel: () => void;
  iterations?: BlueprintIterationInfo[];
  activeIterationId?: string;
  onIterationChange?: (iterationId: string) => void;
  readOnly?: boolean;
  /** Project id — required to enable the history drawer. */
  projectId?: string;
  /** Logged-in user id; powers "You" personalization in author labels. */
  currentUserId?: string | null;
  /** Bumped by the parent when a `blueprint_update` WS event arrives so
   *  the history list auto-refreshes if the drawer is open. */
  historyInvalidationToken?: number;
  /** Called after a successful restore (new version returned from the API). */
  onHistoryRestored?: (newVersion: number) => void;
  /** Pending AI suggestions queued by the voice agent. Rendered above
   *  the sections so the user can accept/edit/reject before they land. */
  pendingSuggestions?: Suggestion[];
  onAcceptSuggestion?: (id: string, editedContent?: string) => void;
  onRejectSuggestion?: (id: string) => void;
  onBulkAcceptSuggestionSection?: (section: string) => void;
  /** True iff the silent AI-listening pipeline is currently active — i.e.,
   *  user is on a call with mic on AND the live voice agent is NOT in the
   *  call. The AI Suggestions affordance hides when this is false. */
  aiListeningActive?: boolean;
  /** Phase 4 — last section to cross the 80% completion threshold (set from
   *  a section_completed WS event). Passed straight through to the matching
   *  BlueprintSection so it can flash a quiet inline checkmark. */
  recentlyCompletedSection?: { section: string; at: number } | null;
}

export { SECTIONS };

export function BlueprintPanel({
  content, version, editingSection, highlightEmpty, suggestedSections,
  coverageScores, focusSections, onEdit, onSave, onCancel,
  iterations, activeIterationId, onIterationChange, readOnly,
  projectId, currentUserId, historyInvalidationToken, onHistoryRestored,
  pendingSuggestions = [],
  onAcceptSuggestion,
  onRejectSuggestion,
  onBulkAcceptSuggestionSection,
  aiListeningActive = false,
  recentlyCompletedSection,
}: BlueprintPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const hasPendingSuggestions = pendingSuggestions.length > 0;
  const hasSuggestionHandlers =
    !!onAcceptSuggestion && !!onRejectSuggestion && !!onBulkAcceptSuggestionSection;
  // Suggestions are only meaningful while the silent AI-listening pipeline is
  // running. Outside that window (no call, mic muted, or the live voice agent
  // is on the call) we hide the affordance entirely.
  const showSuggestionsAffordance = hasSuggestionHandlers && aiListeningActive;
  // The suggestions block renders at the top of the scroll area. If the user
  // is scrolled deep into the section list when they click the toggle, the
  // expanded panel is off-screen above. Snap the scroll container back to
  // top so the suggestions are visible without manual scrolling.
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleToggleSuggestions = () => {
    setSuggestionsExpanded((v) => {
      const next = !v;
      if (next) {
        // Defer until React commits the expanded panel so scrollTop accounts
        // for its height (otherwise the container scrolls before the panel
        // is in the DOM and we land mid-section).
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
      return next;
    });
  };
  const isScoped = Array.isArray(focusSections) && focusSections.length > 0;
  const inScopeSections = isScoped
    ? SECTIONS.filter((s) => focusSections!.includes(s))
    : SECTIONS;
  const outOfScopeSections = isScoped
    ? SECTIONS.filter((s) => !focusSections!.includes(s))
    : [];

  const filledCount = inScopeSections.filter((s) => (content[s] || "").trim().length > 0).length;
  const activeIteration = iterations?.find((i) => i.id === activeIterationId);
  const isLocked = readOnly || activeIteration?.status === "locked";

  // Compute overall coverage from individual scores
  const overall = coverageScores
    ? Math.round(
        inScopeSections
          .map((s) => coverageScores[s] ?? 0)
          .reduce((a, b) => a + b, 0) / Math.max(inScopeSections.length, 1)
      )
    : 0;
  const grade = overall >= 80 ? "A" : overall >= 60 ? "B" : overall >= 40 ? "C" : "D";
  const hasCoverage = coverageScores && Object.keys(coverageScores).length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Iteration tabs + History / AI Suggestions buttons */}
      {(iterations && iterations.length > 1) || projectId || showSuggestionsAffordance ? (
        <div className="flex items-center gap-1 px-4 pt-3 pb-1">
          {iterations && iterations.length > 1 && (
            <div className="flex items-center gap-1">
              {iterations.map((iter) => {
                const active = iter.id === activeIterationId;
                return (
                  <button
                    key={iter.id}
                    onClick={() => onIterationChange?.(iter.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      active
                        ? "bg-foreground/[0.10] text-foreground border border-border"
                        : "text-muted-foreground/70 hover:text-muted-foreground hover:bg-foreground/[0.05]"
                    }`}
                  >
                    {iter.label}
                    {iter.status === "locked" && <Lock className="h-2.5 w-2.5 text-muted-foreground/50" />}
                  </button>
                );
              })}
            </div>
          )}
          <div className="ml-auto flex items-center gap-1">
            {showSuggestionsAffordance && (
              <button
                type="button"
                onClick={handleToggleSuggestions}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  hasPendingSuggestions
                    ? "text-success/90 hover:text-success hover:bg-success/10"
                    : "text-muted-foreground/70 hover:text-foreground/80 hover:bg-foreground/[0.05]"
                }`}
                title={hasPendingSuggestions ? "Review AI suggestions" : "AI suggestions (empty)"}
                aria-expanded={suggestionsExpanded}
              >
                <Sparkles className="h-3 w-3" />
                AI Suggestions
                {hasPendingSuggestions && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-semibold text-black bg-success">
                    {pendingSuggestions.length > 99 ? "99+" : pendingSuggestions.length}
                  </span>
                )}
              </button>
            )}
            {projectId && (
              <Link
                href={`/projects/${projectId}/blueprint`}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
                title="Open the full blueprint page"
              >
                <ExternalLink className="h-3 w-3" />
                Open blueprint
              </Link>
            )}
            {projectId && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
                title="Blueprint history"
              >
                <HistoryIcon className="h-3 w-3" />
                History
              </button>
            )}
          </div>
        </div>
      ) : null}
      {isLocked && (
        <div className="mx-4 mt-2 px-2.5 py-1.5 rounded-md bg-warning/10 border border-warning/20">
          <p className="text-[10px] text-amber-200/70">
            This version is locked. Content is read-only.
          </p>
        </div>
      )}
      {/* Overall coverage header */}
      {hasCoverage && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              Overall Coverage
            </span>
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                grade === "A" ? "bg-success/15 text-success"
                : grade === "B" ? "bg-primary/15 text-primary"
                : grade === "C" ? "bg-warning/15 text-warning"
                : "bg-destructive/15 text-destructive"
              }`}>{grade}</span>
              <span className={`text-xs font-semibold tabular-nums ${
                overall >= 80 ? "text-success/80"
                : overall >= 60 ? "text-primary/70"
                : overall >= 40 ? "text-warning/70"
                : "text-destructive/70"
              }`}>{overall}%</span>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                overall >= 80 ? "bg-success/60"
                : overall >= 60 ? "bg-primary/50"
                : overall >= 40 ? "bg-warning/50"
                : "bg-destructive/40"
              }`}
              style={{ width: `${overall}%` }}
            />
          </div>
          <p className="text-[9px] text-muted-foreground/30 mt-1">
            {filledCount}/{inScopeSections.length} sections filled
          </p>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 pt-2 space-y-2"
        onClick={(e) => {
          // Click on the scroll area background (not on a section) closes the editor
          if (editingSection && e.target === e.currentTarget) onCancel();
        }}
      >
        {showSuggestionsAffordance && suggestionsExpanded && (
          <div
            className={`mb-3 rounded-xl border overflow-hidden ${
              hasPendingSuggestions
                ? "bg-success/[0.04] border-success/15"
                : "bg-foreground/[0.02] border-border/60"
            }`}
          >
            {hasPendingSuggestions ? (
              <div className="px-3 py-3">
                <SuggestionsList
                  pending={pendingSuggestions}
                  onAccept={onAcceptSuggestion!}
                  onReject={onRejectSuggestion!}
                  onBulkAcceptSection={onBulkAcceptSuggestionSection!}
                />
              </div>
            ) : (
              <div className="px-3 py-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
                <Sparkles className="h-3 w-3 text-muted-foreground/60" />
                <span>No suggestions yet — the agent will queue items here for your review.</span>
              </div>
            )}
          </div>
        )}
        {inScopeSections.map((section) => (
          <BlueprintSection
            key={section}
            name={section}
            content={content[section] || ""}
            isEditing={editingSection === section}
            highlighted={highlightEmpty}
            suggested={suggestedSections?.has(section)}
            score={coverageScores?.[section]}
            completionSignal={
              recentlyCompletedSection?.section === section
                ? { at: recentlyCompletedSection.at }
                : null
            }
            onEdit={() => !isLocked && onEdit(section)}
            onSave={(c) => onSave(section, c)}
            onCancel={onCancel}
          />
        ))}
        {outOfScopeSections.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-muted-foreground/50 hover:text-muted-foreground transition-colors px-2 py-2">
              Show full blueprint ({outOfScopeSections.length} more {outOfScopeSections.length === 1 ? "section" : "sections"})
            </summary>
            <div className="mt-2 space-y-2 opacity-70">
              {outOfScopeSections.map((section) => (
                <BlueprintSection
                  key={section}
                  name={section}
                  content={content[section] || ""}
                  isEditing={editingSection === section}
                  highlighted={highlightEmpty}
                  suggested={suggestedSections?.has(section)}
                  score={coverageScores?.[section]}
                  onEdit={() => !isLocked && onEdit(section)}
                  onSave={(c) => onSave(section, c)}
                  onCancel={onCancel}
                />
              ))}
            </div>
          </details>
        )}
      </div>
      {projectId && (
        <BlueprintHistoryDrawer
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          projectId={projectId}
          iterationId={activeIterationId ?? null}
          currentContent={content}
          currentVersion={version}
          iterationLocked={!!isLocked}
          invalidationToken={historyInvalidationToken}
          currentUserId={currentUserId}
          onRestored={onHistoryRestored}
        />
      )}
    </div>
  );
}
