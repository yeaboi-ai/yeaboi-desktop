'use client';

import type { Card as CardType } from '@/hooks/use-board';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

interface AgentLogEntry {
  timestamp: string;
  message: string;
  output?: string;
}

interface AgentProgressProps {
  card: CardType;
  onApprove?: () => void;
  onReject?: (feedback: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  investigating: 'Investigating',
  implementing: 'Implementing',
  reviewing: 'Self-reviewing',
  pr_open: 'PR Open',
  done: 'Done',
  failed: 'Failed',
};

const STATUS_COLORS: Record<string, string> = {
  investigating: 'bg-blue-500/15 text-blue-600 border-blue-200',
  implementing: 'bg-yellow-500/15 text-yellow-600 border-yellow-200',
  reviewing: 'bg-purple-500/15 text-purple-600 border-purple-200',
  pr_open: 'bg-green-500/15 text-green-600 border-green-200',
  done: 'bg-green-600/15 text-green-700 border-green-300',
  failed: 'bg-red-500/15 text-red-600 border-red-200',
};

export function AgentProgress({ card, onApprove, onReject }: AgentProgressProps) {
  const [rejectFeedback, setRejectFeedback] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!card.agent_status) return null;

  const logs: AgentLogEntry[] = Array.isArray(card.agent_log)
    ? (card.agent_log as unknown as AgentLogEntry[])
    : [];
  const statusLabel = STATUS_LABELS[card.agent_status] ?? card.agent_status;
  const statusColor =
    STATUS_COLORS[card.agent_status] ?? 'bg-muted text-muted-foreground border-border';

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Agent Status
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${statusColor}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {statusLabel}
        </span>
      </div>

      {/* Branch */}
      {card.agent_branch && (
        <p className="text-xs font-mono text-muted-foreground truncate">
          Branch: <span className="text-foreground">{card.agent_branch}</span>
        </p>
      )}

      {/* PR URL */}
      {card.agent_pr_url && (
        <a
          href={card.agent_pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-xs text-blue-600 hover:underline truncate"
        >
          {card.agent_pr_url}
        </a>
      )}

      {/* Activity Log */}
      {logs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Activity
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {logs.map((entry, i) => (
              <div key={i} className="text-xs">
                <span className="text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="mx-1.5 text-border">·</span>
                <span>{entry.message}</span>
                {entry.output && (
                  <pre className="mt-1 ml-4 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                    {entry.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PR Review Actions */}
      {card.agent_status === 'pr_open' && (onApprove || onReject) && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Review
          </p>
          {!showRejectForm ? (
            <div className="flex gap-2">
              {onApprove && (
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={onApprove}
                >
                  Approve
                </Button>
              )}
              {onReject && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => setShowRejectForm(true)}
                >
                  Reject
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={rejectFeedback}
                onChange={(e) => setRejectFeedback(e.target.value)}
                placeholder="Rejection feedback (optional)..."
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowRejectForm(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => {
                    onReject?.(rejectFeedback);
                    setShowRejectForm(false);
                    setRejectFeedback('');
                  }}
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
