"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Board, BoardColumn, Card as CardType, CardUpdate, CardCreate } from "@/hooks/use-board";
import { summarisePriorities, type Lane } from "@/lib/board-lanes";
import { stripHtml } from "@/lib/strip-html";
import type { BoardGroupBy } from "@/lib/preferences";
import { KanbanColumn } from "./column";
import { KanbanCard, type CardHighlight } from "./card";
import { CardDetail } from "./card-detail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BoardViewProps {
  board: Board;
  lanes?: Lane[];
  groupBy?: BoardGroupBy;
  search: string;
  priorityFilter: string;
  onMoveCard: (cardId: string, newColumnId: string, newPosition?: number) => Promise<void>;
  onUpdateCard: (cardId: string, data: CardUpdate) => Promise<CardType | null>;
  onCreateCard: (data: CardCreate) => Promise<CardType | null>;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  onAgentApprove?: (cardId: string) => Promise<void>;
  onAgentReject?: (cardId: string, feedback: string) => Promise<void>;
  initialCardId?: string | null;
  density?: "comfortable" | "compact";
  selectedIds?: Set<string>;
  onSelectToggle?: (cardId: string, ev: React.MouseEvent, visibleOrder: string[]) => void;
  hasFilters?: boolean;
}

export function BoardView({
  board,
  lanes,
  groupBy = "off",
  search,
  priorityFilter,
  onMoveCard,
  onUpdateCard,
  onCreateCard,
  onDeleteCard,
  onAgentApprove,
  onAgentReject,
  initialCardId,
  density = "comfortable",
  selectedIds,
  onSelectToggle,
  hasFilters = false,
}: BoardViewProps) {
  // Lane collapse state — lane key → collapsed?
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const toggleLane = (key: string) =>
    setCollapsedLanes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Dependency hover state. While hovering a card we light up:
  //   - cards in hovered.depends_on → emerald ring (they "block" hovered)
  //   - cards X where X.depends_on includes hovered.id → amber ring
  // Same color semantics as the wrap-up wizard's hover legend.
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const cardHighlights = useMemo(() => {
    const map = new Map<string, CardHighlight>();
    if (!hoveredCardId) return map;

    const allCards = board.columns.flatMap((c) => c.cards);
    const hovered = allCards.find((c) => c.id === hoveredCardId);
    if (!hovered) return map;

    map.set(hovered.id, "hovered");

    // Cards the hovered card depends on → "blocks" (emerald).
    for (const id of hovered.depends_on ?? []) {
      if (id !== hovered.id) map.set(id, "blocks");
    }

    // Cards that depend on hovered → "blocked-by" (amber).
    for (const c of allCards) {
      if (c.id === hovered.id) continue;
      if ((c.depends_on ?? []).includes(hovered.id)) {
        map.set(c.id, "blocked-by");
      }
    }

    return map;
  }, [hoveredCardId, board]);

  const handleCardHoverStart = (cardId: string) => setHoveredCardId(cardId);
  const handleCardHoverEnd = (cardId: string) =>
    setHoveredCardId((current) => (current === cardId ? null : current));
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [addingToColumn, setAddingToColumn] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState("");

  // Auto-open card from URL param
  const initialCardHandled = useRef(false);
  useEffect(() => {
    if (initialCardHandled.current || !initialCardId || !board) return;
    const card = board.columns.flatMap((col) => col.cards).find((c) => c.id === initialCardId);
    if (card) {
      setSelectedCard(card);
      initialCardHandled.current = true;
    }
  }, [initialCardId, board]);

  // Animate cards on first render only, disable after 3s so drag/drop doesn't re-trigger
  const animateCards = useRef(true);
  const animateTimerSet = useRef(false);
  if (!animateTimerSet.current) {
    animateTimerSet.current = true;
    if (typeof window !== "undefined") {
      window.setTimeout(() => { animateCards.current = false; }, 3000);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Filter cards based on search/priority. Search now matches title, description,
  // friendly id, and labels (was title-only) so users can find cards by any visible
  // attribute without an extra round-trip — the backend full-text endpoint kicks
  // in only when virtualisation lands in Phase 6.
  const needle = search.trim().toLowerCase();
  const filteredBoard = {
    ...board,
    columns: board.columns.map((col) => ({
      ...col,
      cards: col.cards.filter((card) => {
        if (priorityFilter && card.priority !== priorityFilter) return false;
        if (!needle) return true;
        const haystack = [
          card.title,
          stripHtml(card.description),
          card.friendly_id ?? "",
          ...(card.labels ?? []),
        ]
          .join("\n")
          .toLowerCase();
        return haystack.includes(needle);
      }),
    })),
  };

  // Flat top-down ordering used for shift-click range selection.
  const visibleOrder = filteredBoard.columns.flatMap((c) => c.cards.map((card) => card.id));

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const card = active.data.current?.card as CardType | undefined;
    if (card) setActiveCard(card);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type !== "card") return;

    const card = activeData.card as CardType;
    const targetColumnId = overData?.type === "column"
      ? (over.id as string)
      : overData?.type === "card"
        ? overData.card.column_id
        : null;

    if (!targetColumnId) return;

    // Calculate position
    let newPosition: number | undefined;
    if (overData?.type === "card") {
      const targetCol = board.columns.find((c) => c.id === targetColumnId);
      const overIdx = targetCol?.cards.findIndex((c) => c.id === over.id) ?? 0;
      newPosition = overIdx;
    }

    onMoveCard(card.id, targetColumnId, newPosition);
  }

  const handleAddCard = async () => {
    if (!newCardTitle.trim() || !addingToColumn) return;
    await onCreateCard({
      column_id: addingToColumn,
      title: newCardTitle.trim(),
    });
    setNewCardTitle("");
    setAddingToColumn(null);
  };

  // Lane axis is rendered as a stack of horizontal rows; "off" collapses to a
  // single all-cards lane (handled by deriveLanes already returning [{key:"all"}]).
  const effectiveLanes: Lane[] = lanes && lanes.length > 0
    ? lanes
    : [
        {
          key: "all",
          label: "",
          cardIds: new Set(filteredBoard.columns.flatMap((c) => c.cards.map((card) => card.id))),
        },
      ];

  const filterColumnByLane = (column: BoardColumn, lane: Lane): BoardColumn => ({
    ...column,
    cards: column.cards.filter((c) => lane.cardIds.has(c.id)),
  });

  const showLaneHeaders = groupBy !== "off" && effectiveLanes.length > 1;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={`flex flex-col ${showLaneHeaders ? "gap-3" : "gap-0"} pb-4`}>
          {effectiveLanes.map((lane, laneIdx) => {
            const collapsed = collapsedLanes.has(lane.key);
            const laneCards = filteredBoard.columns.flatMap((col) =>
              col.cards.filter((c) => lane.cardIds.has(c.id)),
            );
            const cardsInLane = laneCards.length;
            // Skip empty lanes when grouping is active so the layout stays
            // tight. The "all" pseudo-lane (groupBy === "off") never gets
            // skipped — it's the entire board.
            if (showLaneHeaders && cardsInLane === 0) return null;

            const prioritySummary = showLaneHeaders ? summarisePriorities(laneCards) : [];

            return (
              <div key={lane.key} className="flex flex-col gap-1.5">
                {showLaneHeaders && (
                  <div className="flex items-center gap-3 self-start">
                    <button
                      type="button"
                      onClick={() => toggleLane(lane.key)}
                      aria-expanded={!collapsed}
                      className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white/90"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-white/40 transition-transform ${
                          collapsed ? "-rotate-90" : ""
                        }`}
                      />
                      {lane.badgeClass ? (
                        <span
                          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${lane.badgeClass}`}
                          aria-hidden
                        >
                          {lane.icon ? <lane.icon className="h-3 w-3 shrink-0" /> : null}
                          {lane.badgeNumeral && <span>{lane.badgeNumeral}</span>}
                        </span>
                      ) : (
                        lane.swatchClass && (
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${lane.swatchClass}`}
                            aria-hidden
                          />
                        )
                      )}
                      <span
                        className={
                          lane.badgeClass
                            ? "text-[12px] font-semibold tracking-tight text-white/90"
                            : "font-mono text-[11px] uppercase tracking-wide text-white/85"
                        }
                      >
                        {lane.label}
                      </span>
                      {lane.subLabel && (
                        <span className="text-[11px] text-white/45">· {lane.subLabel}</span>
                      )}
                    </button>

                    {/* Per-priority breakdown chips. Hidden when the lane is
                        collapsed since the cards aren't visible anyway. */}
                    {!collapsed && prioritySummary.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px]">
                        {prioritySummary.map((item) => (
                          <span
                            key={item.priority}
                            title={`${item.label}: ${item.count}`}
                            className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-1.5 py-0.5 text-white/70"
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${item.swatchClass}`} aria-hidden />
                            <span className="font-medium tabular-nums">{item.count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!collapsed && (
                  <div className="flex gap-4 overflow-x-auto">
                    {filteredBoard.columns.map((column, colIdx) => {
                      const offset = filteredBoard.columns
                        .slice(0, colIdx)
                        .reduce((sum, c) => sum + c.cards.length, 0);
                      // Each column rendered for this lane only contains cards
                      // that belong to the lane. Drag-and-drop still updates
                      // column_id only — wave/assignee/etc. don't move on drop.
                      const laneColumn = filterColumnByLane(column, lane);
                      return (
                        <KanbanColumn
                          key={`${lane.key}:${column.id}`}
                          column={laneColumn}
                          animate={animateCards.current && laneIdx === 0}
                          cardIndexOffset={offset}
                          density={density}
                          filtered={hasFilters}
                          selectedIds={selectedIds}
                          onSelectToggle={(cardId, ev) => onSelectToggle?.(cardId, ev, visibleOrder)}
                          onCardClick={(card) => setSelectedCard(card)}
                          onAddCard={(colId) => {
                            setAddingToColumn(colId);
                            setNewCardTitle("");
                          }}
                          readOnly={column.virtual ?? false}
                          emptyHint={
                            column.virtual
                              ? "Nothing blocked. Cards waiting on a blocker land here automatically."
                              : showLaneHeaders
                                ? " "
                                : undefined
                          }
                          cardHighlights={cardHighlights}
                          onCardHoverStart={handleCardHoverStart}
                          onCardHoverEnd={handleCardHoverEnd}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DragOverlay>
          {activeCard && (
            <div className="rotate-1 opacity-90 w-72">
              <KanbanCard card={activeCard} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Add card inline form */}
      {addingToColumn && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/20" onClick={() => setAddingToColumn(null)}>
          <div
            className="w-80 rounded-xl border border-border bg-background p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-semibold mb-3">Add card</p>
            <Input
              autoFocus
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Card title…"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCard();
                if (e.key === "Escape") setAddingToColumn(null);
              }}
            />
            <div className="mt-3 flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setAddingToColumn(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddCard} disabled={!newCardTitle.trim()}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Card detail panel */}
      <CardDetail
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
        onUpdate={async (cardId, data) => {
          const updated = await onUpdateCard(cardId, data);
          if (updated) setSelectedCard(updated);
          return updated;
        }}
        onDelete={async (cardId) => {
          await onDeleteCard(cardId);
          setSelectedCard(null);
          return true;
        }}
        onAgentApprove={onAgentApprove}
        onAgentReject={onAgentReject}
      />
    </>
  );
}
