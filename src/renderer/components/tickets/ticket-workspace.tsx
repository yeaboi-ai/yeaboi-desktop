"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import type { Card, CardUpdate } from "@/hooks/use-board";
import { useCardPresence } from "@/hooks/use-card-presence";
import { useTicket } from "@/hooks/use-ticket";
import { useTicketTemplates, type FieldLayoutEntry } from "@/hooks/use-ticket-templates";
import { PresenceBar } from "./presence-bar";
import { TicketField } from "./ticket-field-renderer";
import { TicketHeader } from "./ticket-header";
import {
  AddCustomFieldButton,
  LayoutZoneDroppable,
  SortableLayoutField,
  useLayoutEditor,
} from "./ticket-layout-edit";
import { TicketSidebar } from "./ticket-sidebar";

interface TeamMember {
  id: string;
  name: string | null;
  email: string;
}

interface Props {
  idOrKey: string;
  /** "page" — full-page 3-column standalone route. "panel" — slide-out side panel. */
  mode?: "page" | "panel";
}

// Shared workspace shell used by both /tickets/[id] (mode="page") and the future
// rewritten side panel (mode="panel" — wired in Phase 3). All persistence flows
// through PATCH /api/cards/{id}; reads come from /api/tickets-proxy/{id}.
export function TicketWorkspace({ idOrKey, mode = "page" }: Props) {
  const { authFetch } = useAuthFetch();
  const { ticket, loading, error, refetch } = useTicket(idOrKey, authFetch);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [optimisticCard, setOptimisticCard] = useState<Card | null>(null);

  // Reset optimistic state whenever the canonical ticket changes (initial load
  // or after a refetch following a save).
  useEffect(() => {
    if (ticket?.card) setOptimisticCard(ticket.card);
  }, [ticket?.card]);

  // Team members for the assignee dropdown — same endpoint card-detail.tsx uses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await authFetch("/api/team-proxy");
        if (!resp.ok) return;
        const data: TeamMember[] = await resp.json();
        if (!cancelled) setTeamMembers(data);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  const card = optimisticCard ?? ticket?.card ?? null;

  const persistPatch = useCallback(
    async (patch: CardUpdate) => {
      if (!card) return;
      setOptimisticCard((prev) => (prev ? ({ ...prev, ...patch } as Card) : prev));
      setSaving(true);
      try {
        const resp = await authFetch(`/api/cards-proxy/${card.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!resp.ok) throw new Error(`Failed to save: ${resp.status}`);
        await refetch();
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 1500);
      } catch (err) {
        // Roll back optimistic update by refetching authoritative state.
        await refetch();
        console.error("Failed to patch card", err);
      } finally {
        setSaving(false);
      }
    },
    [authFetch, card, refetch],
  );

  const addComment = useCallback(
    async (content: string) => {
      if (!card) return;
      const resp = await authFetch(`/api/cards/${card.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) return;
      await refetch();
    },
    [authFetch, card, refetch],
  );

  if (loading && !ticket) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">Failed to load ticket: {error}</div>
    );
  }
  if (!ticket || !card) {
    return <div className="p-6 text-sm text-muted-foreground">Ticket not found.</div>;
  }

  return (
    <TicketWorkspaceInner
      mode={mode}
      ticket={ticket}
      card={card}
      saving={saving}
      savedAt={savedAt}
      teamMembers={teamMembers}
      persistPatch={persistPatch}
      addComment={addComment}
      authFetch={authFetch}
    />
  );
}

interface InnerProps {
  mode: "page" | "panel";
  ticket: NonNullable<ReturnType<typeof useTicket>["ticket"]>;
  card: Card;
  saving: boolean;
  savedAt: number | null;
  teamMembers: TeamMember[];
  persistPatch: (patch: CardUpdate) => Promise<void>;
  addComment: (content: string) => Promise<void>;
  authFetch: ReturnType<typeof useAuthFetch>["authFetch"];
}

// Renders only when the ticket has loaded — lets us call card-scoped hooks
// (useCardPresence) safely without the conditional-hook footgun, since both
// boardId and cardId are stable for the lifetime of this component.
function TicketWorkspaceInner({
  mode,
  ticket,
  card,
  saving,
  savedAt,
  teamMembers,
  persistPatch,
  addComment,
  authFetch,
}: InnerProps) {
  const { viewers, editing, beginEditing, endEditing } = useCardPresence(
    ticket.board_id ?? null,
    card.id,
  );

  // Track our own width via ResizeObserver so panel mode can switch to a
  // two-column layout when the user resizes the sheet wider. We don't lean on
  // viewport-based breakpoints because the panel can be any width independent
  // of the page.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const isWidePanel = mode === "panel" && containerWidth >= 640;

  // Details panel (status / priority / assignee / labels / sync / links) is
  // collapsible. Closed by default — the description + AC + activity is the
  // primary content the user opens a ticket for. Persist the choice per-user
  // in localStorage so the workspace remembers across reloads.
  const [detailsOpen, setDetailsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("ticket-details-open") === "true";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("ticket-details-open", detailsOpen ? "true" : "false");
  }, [detailsOpen]);

  // Panel-mode layout is single-column when narrow (<640px) and a 2-col grid
  // when wide and details are open. Page mode keeps its wide-screen grid only
  // when details are open; otherwise the main column centers itself so the
  // description doesn't sprawl across an ultrawide monitor.
  const bodyClass =
    mode === "page"
      ? detailsOpen
        ? "mx-auto max-w-[1600px] px-8 py-8 xl:px-12 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"
        : "mx-auto max-w-3xl px-8 py-8 xl:px-12 space-y-8"
      : isWidePanel && detailsOpen
      ? "px-6 py-6 grid gap-6 grid-cols-[minmax(0,1fr)_260px]"
      : "px-5 py-5 space-y-6";

  const editingBanner = editing ? (
    <div
      role="status"
      aria-live="polite"
      className="text-xs rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-400"
    >
      {editing.user.name ?? editing.user.email ?? "Someone"} is editing this
      ticket. Yours will save normally; expect a merge if both finish at once.
    </div>
  ) : null;

  const availableLabels = card.labels ?? [];

  // Resolve the active template's field_layout. When no template is set or
  // the template has no layout (legacy), use the default built-in order.
  const templates = useTicketTemplates();
  const remoteLayout = useMemo<FieldLayoutEntry[]>(() => {
    if (card.template_id) {
      const t = templates.find((x) => x.id === card.template_id);
      if (t?.field_layout?.length) return t.field_layout;
    }
    return DEFAULT_FIELD_LAYOUT;
  }, [card.template_id, templates]);

  const [layoutEditing, setLayoutEditing] = useState(false);
  const layoutEditor = useLayoutEditor({
    authFetch,
    templateId: card.template_id ?? null,
    remoteLayout,
    active: layoutEditing,
  });
  const layout = layoutEditor.layout ?? remoteLayout;

  const fieldCtx = {
    card,
    teamMembers,
    boardColumns: ticket.board_columns ?? [],
    availableLabels,
    links: ticket.links,
    comments: ticket.comments,
    events: ticket.events,
    beginEditing,
    endEditing,
    persistPatch,
    addComment,
  };

  // In edit mode hidden fields stay visible (greyed) so the user can un-hide
  // them; outside edit mode hidden entries are filtered out.
  const mainEntries = layout.filter(
    (e) => e.placement === "main" && (layoutEditing || e.visible),
  );
  const sidebarEntries = layout.filter(
    (e) => e.placement === "sidebar" && (layoutEditing || e.visible),
  );

  const patchEntry = useCallback(
    (key: string, patch: Partial<FieldLayoutEntry>) => {
      layoutEditor.update(layout.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    },
    [layout, layoutEditor],
  );
  const removeEntry = useCallback(
    (key: string) => {
      layoutEditor.update(layout.filter((e) => e.key !== key));
    },
    [layout, layoutEditor],
  );
  const addEntry = useCallback(
    (entry: FieldLayoutEntry) => {
      // Prevent collisions with existing keys.
      if (layout.some((e) => e.key === entry.key)) {
        entry = { ...entry, key: `${entry.key}_${Date.now()}` };
      }
      layoutEditor.update([...layout, entry]);
    },
    [layout, layoutEditor],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeIdx = layout.findIndex((e) => e.key === activeId);
    if (activeIdx === -1) return;

    let next: FieldLayoutEntry[];
    if (overId.startsWith("zone:")) {
      // Dropped onto an empty zone container — move to end with new placement.
      const zone = overId.split(":")[1] as "main" | "sidebar";
      const moved: FieldLayoutEntry = { ...layout[activeIdx], placement: zone };
      next = layout.filter((_, i) => i !== activeIdx);
      next.push(moved);
    } else {
      const overIdx = layout.findIndex((e) => e.key === overId);
      if (overIdx === -1) return;
      const overEntry = layout[overIdx];
      const activeEntry = layout[activeIdx];
      if (activeEntry.placement !== overEntry.placement) {
        const moved: FieldLayoutEntry = { ...activeEntry, placement: overEntry.placement };
        const without = layout.filter((_, i) => i !== activeIdx);
        const insertAt = without.findIndex((e) => e.key === overId);
        without.splice(insertAt < 0 ? without.length : insertAt, 0, moved);
        next = without;
      } else {
        next = arrayMove(layout, activeIdx, overIdx);
      }
    }
    layoutEditor.update(next);
  };

  const mainIds = mainEntries.map((e) => e.key);
  const sidebarIds = sidebarEntries.map((e) => e.key);

  const renderedMainItems = mainEntries.map((entry) =>
    layoutEditing ? (
      <SortableLayoutField
        key={entry.key}
        entry={entry}
        ctx={fieldCtx}
        inSidebar={false}
        onPatch={(patch) => patchEntry(entry.key, patch)}
        onRemove={() => removeEntry(entry.key)}
      />
    ) : (
      <TicketField key={entry.key} entry={entry} ctx={fieldCtx} inSidebar={false} />
    ),
  );
  const renderedSidebarItems = sidebarEntries.map((entry) =>
    layoutEditing ? (
      <SortableLayoutField
        key={entry.key}
        entry={entry}
        ctx={fieldCtx}
        inSidebar={true}
        onPatch={(patch) => patchEntry(entry.key, patch)}
        onRemove={() => removeEntry(entry.key)}
      />
    ) : (
      <TicketField key={entry.key} entry={entry} ctx={fieldCtx} inSidebar={true} />
    ),
  );

  const mainColumn = layoutEditing ? (
    <LayoutZoneDroppable zone="main">
      <SortableContext items={mainIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-5">{renderedMainItems}</div>
      </SortableContext>
      <div className="mt-3">
        <AddCustomFieldButton zone="main" onAdd={addEntry} />
      </div>
    </LayoutZoneDroppable>
  ) : (
    <>{renderedMainItems}</>
  );

  const sidebarBody = layoutEditing ? (
    <LayoutZoneDroppable zone="sidebar">
      <SortableContext items={sidebarIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-5">{renderedSidebarItems}</div>
      </SortableContext>
      <div className="mt-3">
        <AddCustomFieldButton zone="sidebar" onAdd={addEntry} />
      </div>
    </LayoutZoneDroppable>
  ) : (
    <>{renderedSidebarItems}</>
  );

  const sidebarRendered = (
    <TicketSidebar
      card={card}
      teamMembers={teamMembers}
      onPatch={persistPatch}
      boardColumns={ticket.board_columns}
      availableLabels={availableLabels}
    >
      {sidebarBody}
    </TicketSidebar>
  );

  const layoutEditingBanner = layoutEditing ? (
    <div className="text-xs rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-foreground flex items-center justify-between">
      <span>
        <span className="font-medium">Editing layout</span> — drag fields to reorder, rename
        labels inline, toggle required, hide built-ins, drop a field across columns to move it.
        Changes apply to every ticket on this template.
      </span>
      {layoutEditor.saving && (
        <span className="ml-3 inline-flex items-center gap-1 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Saving
        </span>
      )}
    </div>
  ) : null;

  const body = (
    <div className={bodyClass}>
      {mode === "page" ? (
        <>
          <div className="space-y-8 min-w-0">
            {editingBanner}
            {layoutEditingBanner}
            {mainColumn}
          </div>
          {detailsOpen && (
            <div className="space-y-8 min-w-0">{sidebarRendered}</div>
          )}
        </>
      ) : isWidePanel ? (
        <>
          <div className="space-y-6 min-w-0">
            {editingBanner}
            {layoutEditingBanner}
            {mainColumn}
          </div>
          {detailsOpen && (
            <aside className="space-y-6 min-w-0">{sidebarRendered}</aside>
          )}
        </>
      ) : (
        <>
          {editingBanner}
          {layoutEditingBanner}
          {mainColumn}
          {detailsOpen && sidebarRendered}
        </>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={mode === "page" ? "min-h-screen bg-background" : "h-full flex flex-col"}
    >
      <TicketHeader
        card={card}
        projectKey={ticket.project_key ?? null}
        projectName={ticket.project_name ?? null}
        saving={saving}
        saved={savedAt !== null}
        onTitleChange={(title) => persistPatch({ title })}
        rightSlot={<PresenceBar viewers={viewers} />}
        showBackToBoard={mode === "page"}
        layoutEditing={card.template_id ? layoutEditing : undefined}
        onToggleLayoutEditing={
          card.template_id
            ? () => {
                // Layout editing requires the sidebar open so the user can
                // drag fields between the main column and the sidebar zone.
                setLayoutEditing((v) => {
                  if (!v) setDetailsOpen(true);
                  return !v;
                });
              }
            : undefined
        }
        detailsOpen={detailsOpen}
        onToggleDetails={() => setDetailsOpen((v) => !v)}
      />

      {layoutEditing ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {body}
        </DndContext>
      ) : (
        body
      )}
    </div>
  );
}

// Default unified layout when a card has no template_id or its template lacks
// a layout (e.g. legacy templates that haven't been touched since the upgrade).
const DEFAULT_FIELD_LAYOUT: FieldLayoutEntry[] = [
  { key: "title", label: "Title", type: "title", source: "builtin", placement: "header", visible: true, required: true },
  { key: "description", label: "Description", type: "rich_text", source: "builtin", placement: "main", visible: true, required: false },
  { key: "acceptance_criteria", label: "Acceptance criteria", type: "acceptance_criteria", source: "builtin", placement: "main", visible: true, required: false },
  { key: "activity", label: "Activity", type: "activity", source: "builtin", placement: "main", visible: true, required: false },
  { key: "status", label: "Status", type: "status", source: "builtin", placement: "sidebar", visible: true, required: false },
  { key: "priority", label: "Priority", type: "priority", source: "builtin", placement: "sidebar", visible: true, required: false },
  { key: "assignee", label: "Assignee", type: "assignee", source: "builtin", placement: "sidebar", visible: true, required: false },
  { key: "story_points", label: "Story points", type: "story_points", source: "builtin", placement: "sidebar", visible: true, required: false },
  { key: "labels", label: "Labels", type: "labels", source: "builtin", placement: "sidebar", visible: true, required: false },
  { key: "sync", label: "Sync", type: "sync", source: "builtin", placement: "sidebar", visible: true, required: false },
  { key: "links", label: "Links", type: "links", source: "builtin", placement: "sidebar", visible: true, required: false },
];
