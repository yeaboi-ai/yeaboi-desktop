'use client';

import type { Board, Card as CardType, CardUpdate } from '@/hooks/use-board';
import { Badge } from '@/components/ui/badge';
import { stripHtml } from '@/lib/strip-html';

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-600',
  high: 'bg-orange-500/15 text-orange-600',
  medium: 'bg-yellow-500/15 text-yellow-600',
  low: 'bg-blue-500/15 text-blue-500',
};

interface ListViewProps {
  board: Board;
  search: string;
  priorityFilter: string;
  onCardClick: (card: CardType) => void;
}

export function ListView({ board, search, priorityFilter, onCardClick }: ListViewProps) {
  const allCards: (CardType & { columnName: string })[] = board.columns.flatMap((col) =>
    col.cards.map((c) => ({ ...c, columnName: col.name })),
  );

  const filtered = allCards.filter((card) => {
    if (search && !card.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (priorityFilter && card.priority !== priorityFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-border p-12 text-center">
        <p className="text-muted-foreground text-sm">No cards found.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Title</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Points</span>
        <span>Labels</span>
      </div>

      {/* Rows */}
      {filtered.map((card) => (
        <div
          key={card.id}
          onClick={() => onCardClick(card)}
          className="grid grid-cols-[1fr_120px_100px_80px_80px] gap-4 border-b border-border px-4 py-3 text-sm hover:bg-muted/30 cursor-pointer transition-colors last:border-0"
        >
          {/* Title */}
          <div>
            <p className="font-medium line-clamp-1">{card.title}</p>
            {card.description && (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {stripHtml(card.description)}
              </p>
            )}
          </div>

          {/* Status (column name) */}
          <span className="text-muted-foreground self-center truncate">{card.columnName}</span>

          {/* Priority */}
          <div className="self-center">
            {card.priority ? (
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[card.priority] ?? ''}`}
              >
                {card.priority}
              </span>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </div>

          {/* Story points */}
          <span className="self-center text-muted-foreground">{card.story_points ?? '—'}</span>

          {/* Labels */}
          <div className="flex flex-wrap gap-1 self-center">
            {card.labels.slice(0, 2).map((label) => (
              <Badge key={label} variant="secondary" className="text-[10px] px-1 py-0">
                {label}
              </Badge>
            ))}
            {card.labels.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{card.labels.length - 2}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
