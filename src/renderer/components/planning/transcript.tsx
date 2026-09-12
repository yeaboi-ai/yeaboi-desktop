'use client';

// The conversation, top to bottom: bubbles, cards, the reply as it streams,
// and the quick replies a parked gate or a question offers.

import { useEffect, useRef } from 'react';
import { DuckMark } from '@/components/brand/duck';
import { ArtifactCard } from '@/components/planning/artifact-card';
import { Bubble, Prose } from '@/components/planning/bubble';
import type { RoomState } from '@/lib/planning/chat-reducer';
import type { PlanView } from '@/lib/planning/plan-view';

export interface QuickReply {
  label: string;
  text: string;
}

export function Transcript({
  room,
  plan,
  replies,
  onReply,
  onOpenBlueprint,
}: {
  room: RoomState;
  plan: PlanView | null;
  replies: QuickReply[];
  onReply: (text: string) => void;
  onOpenBlueprint: () => void;
}) {
  const foot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end' });
  }, [room.bubbles, room.pending, room.busy]);

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
      {room.bubbles.map((bubble, index) =>
        bubble.role === 'card' ? (
          <ArtifactCard
            key={`${index}-card-${bubble.kind ?? ''}`}
            kind={bubble.kind ?? ''}
            plan={plan}
            onOpen={onOpenBlueprint}
          />
        ) : (
          <Bubble key={`${index}-${bubble.role}`} bubble={bubble} />
        ),
      )}
      {room.pending && (
        <div className="max-w-[88%]">
          <p className="mb-1 font-display text-[13px] italic text-muted-foreground">yeaboi</p>
          <Prose text={room.pending} />
        </div>
      )}
      {room.busy && !room.pending && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <DuckMark state="idle" size={22} />
          <span className="text-[12px]">
            {room.progress
              ? `Working on step ${room.progress.step} of ${room.progress.total}…`
              : 'Thinking…'}
          </span>
        </div>
      )}
      {room.error && <p className="text-[12px] text-destructive">{room.error}</p>}
      {room.notice && <p className="text-[12px] text-muted-foreground">{room.notice}</p>}
      {!room.busy && replies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {replies.map((reply, index) => (
            <button
              key={`${reply.text}-${index}`}
              type="button"
              onClick={() => onReply(reply.text)}
              className="rounded-full bg-secondary/60 px-3 py-1 text-[12px] text-foreground transition-colors hover:bg-primary/15 hover:text-primary"
            >
              {reply.label}
            </button>
          ))}
        </div>
      )}
      <div ref={foot} />
    </div>
  );
}
