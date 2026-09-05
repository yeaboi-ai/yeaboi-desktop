'use client';

// The turns around one security signal, as a conversation: who spoke, when,
// what the tool ran. The flagged turn is the one thing on the page drawn in
// the warning tone; everything around it stays quiet so it reads at a glance.

import type { Replay, ReplayTurn } from '@/lib/yeaboi/ops';
import { cn } from '@/lib/utils';

function who(turn: ReplayTurn): string {
  if (turn.kind === 'tool_use') return turn.tool || 'tool';
  if (turn.role === 'result') return 'result';
  return turn.role === 'you' ? 'you' : 'agent';
}

export function ReplayTimeline({ replay }: { replay: Replay }) {
  if (replay.turns.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Nothing to replay on this line.</p>;
  }
  return (
    <ol className="space-y-1.5">
      {replay.turns.map((turn) => {
        const block = turn.kind !== 'text';
        return (
          <li key={turn.index} className="flex gap-3">
            <span className="w-16 shrink-0 pt-0.5 font-code text-[11px] tabular-nums text-muted-foreground">
              {turn.at}
            </span>
            <span
              className={cn(
                'w-14 shrink-0 pt-0.5 text-[12px]',
                turn.flagged ? 'font-medium text-warning' : 'text-muted-foreground',
              )}
            >
              {who(turn)}
            </span>
            <div className="min-w-0 flex-1">
              {block ? (
                <pre
                  className={cn(
                    'whitespace-pre-wrap break-words rounded-lg px-3 py-2 font-code text-[11.5px] leading-relaxed ring-1',
                    turn.flagged
                      ? 'bg-warning/10 text-foreground ring-warning/60'
                      : 'bg-secondary/40 text-muted-foreground ring-border/60',
                  )}
                >
                  {turn.text}
                </pre>
              ) : (
                <p
                  className={cn(
                    'text-[13px] leading-relaxed',
                    turn.flagged ? 'text-foreground' : 'text-foreground/90',
                  )}
                >
                  {turn.text}
                </p>
              )}
              {(turn.flagged || turn.truncated) && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {turn.flagged && (
                    <span className="text-warning">This is the line that matched.</span>
                  )}
                  {turn.flagged && turn.truncated && ' '}
                  {turn.truncated && 'Cut short.'}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
