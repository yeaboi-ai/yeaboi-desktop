"use client";

import { ExternalLink as ExternalLinkIcon, Trash2 } from "lucide-react";
import type { Card as CardType, CardUpdate } from "@/hooks/use-board";
import { AgentProgress } from "@/components/kanban/agent-progress";
import { ResizableSheet } from "@/components/ui/resizable-sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TicketWorkspace } from "@/components/tickets/ticket-workspace";

interface CardDetailProps {
  card: CardType | null;
  onClose: () => void;
  // The TicketWorkspace owns its own persistence via /api/cards-proxy/{id};
  // updates flow back to the board via the existing /ws/board subscription
  // and the 5s poll. onUpdate is kept on the prop surface for source
  // compatibility with existing call sites but is not invoked here.
  onUpdate?: (cardId: string, data: CardUpdate) => Promise<CardType | null>;
  onDelete?: (cardId: string) => Promise<boolean>;
  onAgentApprove?: (cardId: string) => Promise<void>;
  onAgentReject?: (cardId: string, feedback: string) => Promise<void>;
}

/**
 * Thin shell that hosts the same TicketWorkspace component the standalone
 * /tickets/[id] route uses. Wrapping it in ResizableSheet means the side
 * panel:
 *
 *  - opens at 720px instead of the previous 420px squash
 *  - is user-resizable via a drag handle on its left edge
 *  - re-flows into a 2-column main+sidebar layout once it's wide enough
 *  - keeps full feature parity with the standalone route (presence, sync
 *    push, attachments, links, custom fields, exec-label header)
 *
 * Agent-progress and PR-review surfaces are panel-specific and render below
 * the workspace content. They consume the cached ``card`` prop because that's
 * what the board's useBoard already has loaded — TicketWorkspace's own fetch
 * provides the editable surface for everything else.
 */
export function CardDetail({
  card,
  onClose,
  onDelete,
  onAgentApprove,
  onAgentReject,
}: CardDetailProps) {
  const confirm = useConfirm();
  const open = card !== null;
  const target = card?.friendly_id ?? card?.id ?? "";

  const handleDelete = async () => {
    if (!card || !onDelete) return;
    const ok = await confirm({
      title: "Delete this ticket?",
      message: "This is permanent and removes the card, comments, and attachments.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await onDelete(card.id);
    onClose();
  };

  return (
    <ResizableSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      headerSlot={
        card ? (
          <>
            {onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Delete ticket"
                title="Delete ticket"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                window.open(
                  `/tickets/${encodeURIComponent(target)}`,
                  "_blank",
                  "noopener",
                );
              }}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <ExternalLinkIcon className="h-4 w-4" />
            </button>
          </>
        ) : null
      }
    >
      {card && (
        <>
          <TicketWorkspace idOrKey={card.id} mode="panel" />
          {(card.agent_status || card.agent_pr_url) && (
            <div className="px-5 pb-6 space-y-4 border-t border-border pt-5 mt-2">
              {card.agent_status && card.agent_status !== "pr_open" && (
                <AgentProgress card={card} />
              )}
            </div>
          )}
        </>
      )}
    </ResizableSheet>
  );
}
