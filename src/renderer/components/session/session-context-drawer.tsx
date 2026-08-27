"use client";

// The session's right-hand inspector. The web app carried four tabs here
// (blueprint / design / plan / debug); the desktop keeps the blueprint —
// the living document planning writes into — plus the debug feed. Design
// and plan were canvas features.

import { useEffect, useState } from "react";
import { DrawerShell } from "./drawer-shell";
import { BlueprintPanel } from "../blueprint/blueprint-panel";
import {
  DebugPanel,
  type DebugIntent,
  type DebugPipelineStart,
  type DebugPipelineMetrics,
  type DebugRenderItem,
} from "./debug-drawer";
import type { Suggestion } from "@/hooks/use-suggestions";

type TabKey = "blueprint" | "debug";

interface SessionContextDrawerProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  // Blueprint tab props
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
  readOnly?: boolean;
  // History feature
  projectId?: string;
  currentUserId?: string | null;
  /** Bumped by the parent on every `blueprint_update` WS event so the
   *  history drawer auto-refreshes when changes land. */
  blueprintHistoryToken?: number;
  onHistoryRestored?: (newVersion: number) => void;
  // AI suggestion queue (rendered inside the blueprint panel)
  pendingSuggestions?: Suggestion[];
  onAcceptSuggestion?: (id: string, editedContent?: string) => void;
  onRejectSuggestion?: (id: string) => void;
  onBulkAcceptSuggestionSection?: (section: string) => void;
  /** True while the silent AI-listening pipeline is active. Gates the
   *  AI Suggestions affordance inside the Blueprint panel. */
  aiListeningActive?: boolean;
  /** Last section to cross the completion threshold (from a section_completed
   *  WS event). Forwarded to BlueprintPanel for a quiet inline checkmark. */
  recentlyCompletedSection?: { section: string; at: number } | null;
  // Debug tab props
  debugIntents: DebugIntent[];
  debugPipelineStarts: DebugPipelineStart[];
  debugPipelineMetrics: DebugPipelineMetrics[];
  debugDesignTokens: Record<string, unknown> | null;
  debugRenderItems: DebugRenderItem[];
  debugPendingMessages: string[];
  // Shared
  triggerRef?: React.RefObject<HTMLElement | null>;
  collapsedContent?: React.ReactNode;
  collapsedPosition?: { x: number; y: number };
  onOpen?: () => void;
  initialTab?: TabKey;
  /** Hide the drawer entirely (display:none) without unmounting so internal
   *  state (active tab, scroll position) survives. */
  hidden?: boolean;
}

export function SessionContextDrawer({
  open,
  onClose,
  sessionId,
  content,
  version,
  editingSection,
  highlightEmpty,
  suggestedSections,
  coverageScores,
  focusSections,
  onEdit,
  onSave,
  onCancel,
  readOnly,
  projectId,
  currentUserId,
  blueprintHistoryToken,
  onHistoryRestored,
  pendingSuggestions,
  onAcceptSuggestion,
  onRejectSuggestion,
  onBulkAcceptSuggestionSection,
  aiListeningActive,
  recentlyCompletedSection,
  debugIntents,
  debugPipelineStarts,
  debugPipelineMetrics,
  debugDesignTokens,
  debugRenderItems,
  debugPendingMessages,
  triggerRef,
  collapsedContent,
  collapsedPosition,
  onOpen,
  initialTab = "blueprint",
  hidden,
}: SessionContextDrawerProps) {
  const storageKey = `session-context-tab-${sessionId}`;
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return initialTab;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "blueprint" || saved === "debug") return saved;
    } catch {}
    return initialTab;
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, activeTab); } catch {}
  }, [storageKey, activeTab]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "blueprint", label: "Blueprint" },
    { key: "debug", label: "Debug" },
  ];

  const titleByTab: Record<TabKey, string> = {
    blueprint: "Blueprint",
    debug: "Debug",
  };
  const title = titleByTab[activeTab];

  const headerExtra = (
    <div role="tablist" aria-label="Inspector view" className="flex items-center gap-1 rounded-lg bg-foreground/[0.05] p-0.5">
      {tabs.map((t) => {
        const isActive = t.key === activeTab;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => setActiveTab(t.key)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 ${
              isActive
                ? "bg-foreground/[0.10] text-foreground"
                : "text-muted-foreground/70 hover:text-foreground/80"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <DrawerShell
      open={open}
      onClose={onClose}
      side="right"
      title={title}
      width="w-[420px]"
      storageKey={`session-context-${sessionId}`}
      triggerRef={triggerRef}
      collapsedContent={collapsedContent}
      collapsedPosition={collapsedPosition}
      onOpen={onOpen}
      headerExtra={headerExtra}
      hidden={hidden}
    >
      {activeTab === "blueprint" && (
        <BlueprintPanel
          content={content}
          version={version}
          editingSection={editingSection}
          highlightEmpty={highlightEmpty}
          suggestedSections={suggestedSections}
          coverageScores={coverageScores}
          focusSections={focusSections}
          onEdit={onEdit}
          onSave={onSave}
          onCancel={onCancel}
          readOnly={readOnly}
          projectId={projectId}
          currentUserId={currentUserId}
          historyInvalidationToken={blueprintHistoryToken}
          onHistoryRestored={onHistoryRestored}
          pendingSuggestions={pendingSuggestions}
          onAcceptSuggestion={onAcceptSuggestion}
          onRejectSuggestion={onRejectSuggestion}
          onBulkAcceptSuggestionSection={onBulkAcceptSuggestionSection}
          aiListeningActive={aiListeningActive}
          recentlyCompletedSection={recentlyCompletedSection ?? null}
        />
      )}
      {activeTab === "debug" && (
        <DebugPanel
          sessionId={sessionId}
          intents={debugIntents}
          pipelineStarts={debugPipelineStarts}
          pipelineMetrics={debugPipelineMetrics}
          designTokens={debugDesignTokens}
          renderItems={debugRenderItems}
          pendingMessages={debugPendingMessages}
        />
      )}
    </DrawerShell>
  );
}
