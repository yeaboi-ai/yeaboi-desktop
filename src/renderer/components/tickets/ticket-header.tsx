'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Settings2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Card } from '@/hooks/use-board';
import { useTicketTemplates } from '@/hooks/use-ticket-templates';
import { formatExecLabel, formatTicketKey } from '@/lib/ticket-id';
import { resolveTicketType } from '@/lib/ticket-type';
import { TemplateBadge } from './template-badge';

interface Props {
  card: Card;
  projectKey: string | null;
  projectName: string | null;
  saving: boolean;
  saved: boolean;
  onTitleChange: (title: string) => void;
  showBackToBoard?: boolean;
  /** Optional content rendered to the left of the action buttons — used for
   *  the presence avatar stack so live viewers always sit in the header. */
  rightSlot?: React.ReactNode;
  /** When defined, renders an "Edit layout" toggle in the header that flips
   *  the workspace into inline schema-edit mode. */
  layoutEditing?: boolean;
  onToggleLayoutEditing?: () => void;
  /** When defined, renders a details-panel toggle. The workspace passes the
   *  open/closed state and a setter; the header just owns the button. */
  detailsOpen?: boolean;
  onToggleDetails?: () => void;
}

export function TicketHeader({
  card,
  projectKey,
  projectName,
  saving,
  saved,
  onTitleChange,
  showBackToBoard = true,
  rightSlot,
  layoutEditing,
  onToggleLayoutEditing,
  detailsOpen,
  onToggleDetails,
}: Props) {
  const friendly =
    card.friendly_id ??
    formatTicketKey({ key: projectKey, number: card.number ?? null }) ??
    card.id.slice(0, 8);

  const templates = useTicketTemplates();
  const templateInfo = useMemo(() => resolveTicketType(card, templates), [card, templates]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.title);
  const [copied, setCopied] = useState(false);

  // Reset the draft when the underlying title changes (e.g. WS update from another
  // viewer). Using "compare previous prop, set during render" instead of useEffect —
  // see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [titleSnapshot, setTitleSnapshot] = useState(card.title);
  if (titleSnapshot !== card.title) {
    setTitleSnapshot(card.title);
    setDraft(card.title);
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== card.title) onTitleChange(trimmed);
    setEditing(false);
  };

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/tickets/${friendly}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — Clipboard API unavailable
    }
  };

  const boardHref = card.project_id
    ? `/board?project=${card.project_id}&card=${card.id}`
    : `/board?card=${card.id}`;

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        {/* Breadcrumb */}
        <nav className="text-xs text-muted-foreground flex items-center gap-1 min-w-0">
          {showBackToBoard && (
            <Link href={boardHref} className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Board
            </Link>
          )}
          {projectName && (
            <>
              <span className="opacity-50">/</span>
              <span className="truncate max-w-[180px]">{projectName}</span>
            </>
          )}
          <span className="opacity-50">/</span>
          {formatExecLabel(card) && (
            <span
              className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-primary"
              title={`Execution order: ${formatExecLabel(card)}`}
            >
              {formatExecLabel(card)}
            </span>
          )}
          <span className="font-mono text-foreground text-muted-foreground/70">{friendly}</span>
          {templateInfo && (
            <TemplateBadge
              slug={templateInfo.slug}
              name={templateInfo.name}
              variant="pill"
              size="sm"
              className="ml-1"
            />
          )}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {rightSlot}
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1 w-16 justify-end">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving
              </>
            ) : saved ? (
              <>
                <Check className="h-3 w-3 text-green-500" /> Saved
              </>
            ) : null}
          </span>
          {onToggleLayoutEditing && (
            <Button
              variant={layoutEditing ? 'default' : 'ghost'}
              size="sm"
              onClick={onToggleLayoutEditing}
              aria-pressed={layoutEditing ?? false}
              aria-label="Edit ticket layout"
              title={
                layoutEditing
                  ? 'Done editing layout'
                  : 'Edit layout — drag, rename, add or hide fields on this ticket type'
              }
            >
              <Settings2 className="h-4 w-4" />
              {layoutEditing && <span className="ml-1.5 text-xs">Done</span>}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={copyLink} aria-label="Copy ticket link">
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          {onToggleDetails && (
            <Button
              variant={detailsOpen ? 'default' : 'ghost'}
              size="sm"
              onClick={onToggleDetails}
              aria-pressed={detailsOpen ?? false}
              aria-label={detailsOpen ? 'Hide details' : 'Show details'}
              title={detailsOpen ? 'Hide details panel' : 'Show details panel'}
            >
              {detailsOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-6 pb-6">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Escape') {
                setDraft(card.title);
                setEditing(false);
              }
            }}
            className="w-full text-2xl font-semibold bg-transparent border-b border-primary outline-none py-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-2xl font-semibold tracking-tight leading-snug text-left w-full hover:opacity-80 transition py-1"
          >
            {card.title}
          </button>
        )}
      </div>
    </header>
  );
}
