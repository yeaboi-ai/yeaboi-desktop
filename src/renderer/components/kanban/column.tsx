"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { BoardColumn as BoardColumnType, Card as CardType } from "@/hooks/use-board";
import { KanbanCard, type CardHighlight } from "./card";
import { EmptyColumn } from "./empty-column";

interface KanbanColumnProps {
  column: BoardColumnType;
  onCardClick: (card: CardType) => void;
  onAddCard?: (columnId: string) => void;
  animate?: boolean;
  cardIndexOffset?: number;
  density?: "comfortable" | "compact";
  filtered?: boolean;
  selectedIds?: Set<string>;
  onSelectToggle?: (cardId: string, ev: React.MouseEvent) => void;
  // Virtual/computed columns (e.g. the "Blocked" lane) are non-droppable
  // and their cards are non-draggable. The column is still clickable.
  readOnly?: boolean;
  emptyHint?: string;
  cardHighlights?: Map<string, CardHighlight>;
  onCardHoverStart?: (cardId: string) => void;
  onCardHoverEnd?: (cardId: string) => void;
}

export function KanbanColumn({
  column,
  onCardClick,
  onAddCard,
  animate,
  cardIndexOffset = 0,
  density = "comfortable",
  filtered = false,
  selectedIds,
  onSelectToggle,
  readOnly = false,
  emptyHint,
  cardHighlights,
  onCardHoverStart,
  onCardHoverEnd,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
    disabled: readOnly,
  });

  const cardIds = column.cards.map((c) => c.id);
  const wip = column.wip_limit ?? null;
  const overWip = wip !== null && column.cards.length > wip;
  const atWip = wip !== null && column.cards.length === wip;

  const accent = column.accent_color ?? null;

  return (
    <div
      className={[
        "flex flex-1 flex-col overflow-hidden rounded-xl border bg-muted/30 transition-colors",
        // Narrower columns when cards are single-row so the full board fits
        // on a typical 1280–1440px viewport without horizontal scrolling.
        density === "compact" ? "min-w-[160px]" : "min-w-[200px]",
        overWip
          ? "border-red-500/40 ring-1 ring-red-500/30"
          : atWip
          ? "border-orange-500/40"
          : "border-border",
      ].join(" ")}
    >
      {accent && (
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} aria-hidden />
      )}
      {/* Column header — tints the top with the accent color so the choice is
          visible even when the user isn't looking for it. */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={
          accent
            ? { backgroundImage: `linear-gradient(to bottom, ${accent}26, transparent 75%)` }
            : undefined
        }
      >
        <div className="flex items-center gap-2">
          {accent && (
            <span
              className="h-2.5 w-2.5 rounded-full ring-1 ring-white/10"
              style={{ backgroundColor: accent }}
              aria-hidden
            />
          )}
          <span className="text-sm font-semibold tracking-tight">{column.name}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
              overWip
                ? "bg-red-500/20 text-red-600"
                : atWip
                ? "bg-orange-500/15 text-orange-600"
                : "bg-muted text-muted-foreground"
            }`}
            title={
              overWip
                ? `Over WIP limit by ${column.cards.length - (wip ?? 0)}`
                : atWip
                ? "At WIP limit"
                : undefined
            }
          >
            {column.cards.length}
            {wip !== null ? `/${wip}` : ""}
          </span>
        </div>
        {overWip && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-500">
            Over WIP
          </span>
        )}
      </div>

      {/* Cards drop zone */}
      <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex flex-1 flex-col overflow-y-auto px-2 pb-2 min-h-[4rem] rounded-b-xl transition-colors ${
            density === "compact" ? "gap-1" : "gap-2"
          } ${isOver ? "bg-accent/40" : ""}`}
        >
          {column.cards.length === 0 ? (
            emptyHint ? (
              <div className="flex flex-1 items-center justify-center px-2 py-6 text-center text-xs text-muted-foreground">
                {emptyHint}
              </div>
            ) : (
              <EmptyColumn columnName={column.name} filtered={filtered} />
            )
          ) : (
            column.cards.map((card, i) => (
              <KanbanCard
                key={card.id}
                card={card}
                onClick={onCardClick}
                animationDelay={animate ? (cardIndexOffset + i) * 80 : undefined}
                density={density}
                selected={selectedIds?.has(card.id) ?? false}
                onSelectToggle={onSelectToggle}
                readOnly={readOnly}
                highlight={cardHighlights?.get(card.id) ?? null}
                onHoverStart={onCardHoverStart}
                onHoverEnd={onCardHoverEnd}
              />
            ))
          )}
        </div>
      </SortableContext>

      {/* Add card button */}
      {onAddCard && !readOnly && (
        <button
          onClick={() => onAddCard(column.id)}
          className="mx-2 mb-2 rounded-md border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:border-ring hover:text-foreground transition-colors"
        >
          + Add card
        </button>
      )}
    </div>
  );
}
