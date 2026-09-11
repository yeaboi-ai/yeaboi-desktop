'use client';

import { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertOctagon, Link2, MessageSquare, Paperclip } from 'lucide-react';
import type { Card as CardType } from '@/hooks/use-board';
import { useTicketTemplates } from '@/hooks/use-ticket-templates';
import { Badge } from '@/components/ui/badge';
import { TemplateBadge } from '@/components/tickets/template-badge';
import { stripHtml } from '@/lib/strip-html';
import { formatExecLabel, formatTicketKey } from '@/lib/ticket-id';
import { resolveTicketType } from '@/lib/ticket-type';

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

export const AGENT_STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  investigating: { dot: 'bg-blue-500', label: 'Investigating' },
  implementing: { dot: 'bg-yellow-500', label: 'Implementing' },
  reviewing: { dot: 'bg-purple-500', label: 'Reviewing' },
  pr_open: { dot: 'bg-green-500', label: 'PR open' },
  done: { dot: 'bg-green-600', label: 'Done' },
  failed: { dot: 'bg-red-500', label: 'Failed' },
};

/**
 * Dependency hover state for a card. Three roles:
 * - "blocks": the card is in the hovered card's `depends_on` (it must finish
 *   before the hovered card can start). Rendered with an emerald outline,
 *   matching the wrap-up wizard's legend.
 * - "blocked-by": the card depends on the hovered card. Amber outline.
 * - "hovered": the card is the one currently under the cursor. Slight ring.
 */
export type CardHighlight = 'blocks' | 'blocked-by' | 'hovered' | null;

interface KanbanCardProps {
  card: CardType;
  onClick: (card: CardType) => void;
  animationDelay?: number;
  density?: 'comfortable' | 'compact';
  selected?: boolean;
  onSelectToggle?: (cardId: string, ev: React.MouseEvent) => void;
  // When the parent column is virtual (e.g. the synthetic Blocked lane) we
  // disable sortable so the card stays anchored to its real column server-side.
  readOnly?: boolean;
  highlight?: CardHighlight;
  onHoverStart?: (cardId: string) => void;
  onHoverEnd?: (cardId: string) => void;
}

export function KanbanCard({
  card,
  onClick,
  animationDelay,
  density = 'comfortable',
  selected = false,
  onSelectToggle,
  readOnly = false,
  highlight = null,
  onHoverStart,
  onHoverEnd,
}: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card },
    disabled: readOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    ...(animationDelay !== undefined
      ? { animation: `card-appear 0.4s ease-out ${animationDelay}ms both` }
      : {}),
  };

  const friendly =
    card.friendly_id ??
    formatTicketKey({ key: card.session_key ?? null, number: card.number ?? null }) ??
    null;
  const execLabel = formatExecLabel(card);

  // Resolve display type. Prefers card.template_id (Phase 3+ generated cards);
  // falls back to a label-based inference + "feature" default so legacy cards
  // (generated before the template composer landed) still show something useful.
  const templates = useTicketTemplates();
  const templateInfo = useMemo(() => resolveTicketType(card, templates), [card, templates]);

  const agent = card.agent_status ? AGENT_STATUS_STYLES[card.agent_status] : null;
  const compact = density === 'compact';

  const attachmentCount = card.attachment_count ?? 0;
  const linkCount = card.link_count ?? 0;
  const commentCount = card.comment_count ?? 0;

  const visibleLabels = card.labels.slice(0, 3);
  const overflow = card.labels.length - visibleLabels.length;

  // Dependency hover ring. Same color semantics as the wrap-up wizard's
  // legend: emerald for "blocks the hovered task", amber for "depends on the
  // hovered task". When hovering, the card itself gets a subtle ring to read
  // as "I'm the focus".
  const highlightClass = (() => {
    switch (highlight) {
      case 'blocks':
        return 'ring-2 ring-emerald-400/60 ring-offset-2 ring-offset-background';
      case 'blocked-by':
        return 'ring-2 ring-amber-400/60 ring-offset-2 ring-offset-background';
      case 'hovered':
        return 'ring-1 ring-white/30';
      default:
        return '';
    }
  })();
  const hoverHandlers =
    onHoverStart || onHoverEnd
      ? {
          onMouseEnter: () => onHoverStart?.(card.id),
          onMouseLeave: () => onHoverEnd?.(card.id),
        }
      : {};

  // Compact mode: single-row "list-like" card with just the essentials.
  // The whole point of the density toggle is to scan more cards at once, so
  // we drop description, labels, counts, agent status, and friendly id row,
  // and lay everything on one line.
  if (compact) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        {...hoverHandlers}
        onClick={(e) => {
          if (e.shiftKey && onSelectToggle) {
            e.preventDefault();
            e.stopPropagation();
            onSelectToggle(card.id, e);
            return;
          }
          onClick(card);
        }}
        className={[
          'group flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 cursor-pointer transition-all select-none',
          selected ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-ring',
          highlightClass,
        ].join(' ')}
      >
        {card.priority && (
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[card.priority] ?? 'bg-muted-foreground'}`}
            aria-label={`Priority: ${card.priority}`}
            title={`Priority: ${card.priority}`}
          />
        )}
        {execLabel && (
          <span
            className="inline-flex h-4 shrink-0 items-center rounded border border-primary/30 bg-primary/10 px-1 font-mono text-[10px] font-semibold text-primary"
            title={`Execution order: ${execLabel}`}
          >
            {execLabel}
          </span>
        )}
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/70 shrink-0">
          {friendly ?? card.id.slice(0, 8)}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium leading-snug text-foreground">
          {card.title}
        </span>
        {card.is_blocked && (
          <AlertOctagon className="h-3 w-3 shrink-0 text-red-500" aria-label="Blocked" />
        )}
        {agent && (
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${agent.dot}`}
            title={agent.label}
            aria-label={agent.label}
          />
        )}
        {card.story_points != null && (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
            {card.story_points}
          </span>
        )}
        {card.assignee_name && (
          <span
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[8px] font-bold text-primary"
            title={card.assignee_name}
          >
            {card.assignee_name[0].toUpperCase()}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      {...hoverHandlers}
      onClick={(e) => {
        // Shift-click toggles selection without opening detail.
        if (e.shiftKey && onSelectToggle) {
          e.preventDefault();
          e.stopPropagation();
          onSelectToggle(card.id, e);
          return;
        }
        onClick(card);
      }}
      className={[
        'group relative rounded-lg border bg-card shadow-sm cursor-pointer transition-all select-none',
        'p-3',
        selected
          ? 'border-primary ring-2 ring-primary/40'
          : 'border-border hover:border-ring hover:shadow-md',
        highlightClass,
      ].join(' ')}
    >
      {/* Row 1 — exec-label pill (primary) + type badge + friendly id (secondary) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {execLabel && (
            <span
              className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums text-primary"
              title={`Execution order: ${execLabel}`}
            >
              {execLabel}
            </span>
          )}
          {templateInfo && <TemplateBadge slug={templateInfo.slug} name={templateInfo.name} />}
          <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/60">
            {friendly ?? card.id.slice(0, 8)}
          </span>
        </div>
        {card.session_name && !compact && (
          <span className="truncate max-w-[40%] text-[10px] text-muted-foreground/70">
            {card.session_name}
          </span>
        )}
      </div>

      {/* Row 2 — title */}
      <p className={`mt-1 text-sm font-medium leading-snug line-clamp-2 ${compact ? '' : ''}`}>
        {card.title}
      </p>

      {/* Row 3 — description preview (comfortable only) */}
      {!compact && card.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
          {stripHtml(card.description)}
        </p>
      )}

      {/* Row 4 — labels */}
      {visibleLabels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {visibleLabels.map((label) => (
            <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0 normal-case">
              {label}
            </Badge>
          ))}
          {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
        </div>
      )}

      {/* Row 5 — meta row: priority dot, agent status, blocked, counts, points, assignee */}
      <div
        className={`flex items-center justify-between gap-2 ${
          compact ? 'mt-1' : 'mt-2'
        } text-muted-foreground`}
      >
        <div className="flex items-center gap-2 text-[11px] min-w-0">
          {card.priority && (
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${PRIORITY_DOT[card.priority] ?? 'bg-muted-foreground'}`}
              aria-label={`Priority: ${card.priority}`}
              title={`Priority: ${card.priority}`}
            />
          )}
          {agent && (
            <span className="inline-flex items-center gap-1" title={agent.label}>
              <span className={`h-1.5 w-1.5 rounded-full ${agent.dot}`} />
              {!compact && <span className="text-[10px]">{agent.label}</span>}
            </span>
          )}
          {card.is_blocked && (
            <span
              className="inline-flex items-center gap-1 text-red-500"
              title="Blocked by an open ticket"
            >
              <AlertOctagon className="h-3 w-3" />
              {!compact && <span className="text-[10px] font-medium">Blocked</span>}
            </span>
          )}
          {card.sync_status && card.sync_status.external_key && (
            <span
              className="text-[10px] font-mono uppercase opacity-80"
              title={`Synced to ${card.sync_status.provider === 'azure_devops' ? 'Azure DevOps' : 'Jira'} — ${card.sync_status.state}`}
            >
              {card.sync_status.external_key}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          {attachmentCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${attachmentCount} attachments`}
            >
              <Paperclip className="h-3 w-3" /> {attachmentCount}
            </span>
          )}
          {linkCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${linkCount} linked tickets`}
            >
              <Link2 className="h-3 w-3" /> {linkCount}
            </span>
          )}
          {commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5" title={`${commentCount} comments`}>
              <MessageSquare className="h-3 w-3" /> {commentCount}
            </span>
          )}
          {card.story_points != null && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-semibold text-foreground">
              {card.story_points}
            </span>
          )}
          {card.assignee_name && (
            <span
              className="w-5 h-5 rounded-full bg-primary/20 text-primary text-[9px] font-bold flex items-center justify-center shrink-0"
              title={card.assignee_name}
            >
              {card.assignee_name[0].toUpperCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
