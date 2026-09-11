'use client';

// One turn in the bar. Planning's bubble shapes, painted with the app's tokens
// so they follow the theme rather than pinning a hex.
//
// The duck sits on Niko's side only. A user avatar would be a second identity
// in a 560px bar that already knows who is typing.

import { useEffect, useRef, useState } from 'react';

import { DuckMark } from '@/components/brand/duck';
import { revealStep, revealed } from '@shared/typewriter';
import { NikoBubble } from './niko-bubbles';
import { NikoMarkdown } from './niko-markdown';
import { NikoToolCard } from './niko-tool-card';
import type { NikoMessage as NikoMessageType } from '@/hooks/use-niko';

interface NikoMessageProps {
  message: NikoMessageType;
  isStreaming?: boolean;
  /** An answer to a scripted turn's bubble: a choice id, or a field's value. */
  onAnswer?: (answer: string) => void;
}

/** An answer spent at a steady rate rather than painted in the lumps the
 *  provider happens to send it in. Only while it is streaming: a message read
 *  back from a stored conversation is already written.
 *
 *  The loop outlives the stream — what has arrived but not been spent is still
 *  typed out rather than stamped down when the last token lands. */
function useTyped(text: string, streaming: boolean): string {
  const spent = useRef(streaming ? 0 : text.length);
  const [shown, setShown] = useState(spent.current);
  const target = useRef(text);
  target.current = text;
  const live = useRef(streaming);
  live.current = streaming;

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const step = revealStep(spent.current, target.current.length, !live.current);
      if (step > 0) {
        spent.current += step;
        setShown(spent.current);
      }
      frame = step > 0 || live.current ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, streaming]);

  return revealed(text, shown, !streaming);
}

export function NikoMessage({ message, isStreaming, onAnswer }: NikoMessageProps) {
  return message.role === 'user' ? (
    <UserBubble message={message} />
  ) : (
    <AssistantBubble message={message} isStreaming={isStreaming} onAnswer={onAnswer} />
  );
}

function UserBubble({ message }: { message: NikoMessageType }) {
  return (
    // Leaning out past the composer's right edge — the side you speak from.
    <div className="-mr-3 flex justify-end">
      <div
        className="max-w-[85%] rounded-2xl rounded-br-md border border-primary/25 px-3.5 py-2 backdrop-blur-sm"
        // Nearly solid, because there is no panel behind it any more: a tint
        // meant for a card reads as a hole when the page shows through it.
        style={{
          background:
            'color-mix(in srgb, color-mix(in srgb, var(--primary) 16%, var(--popover)) 92%, transparent)',
        }}
      >
        <p className="text-[13px] font-body text-foreground/90">{message.content}</p>
      </div>
    </div>
  );
}

function AssistantBubble({ message, isStreaming, onAnswer }: NikoMessageProps) {
  const hasTools = !!message.toolCalls?.length;
  const typed = useTyped(message.content, Boolean(isStreaming));
  // Nothing said yet — including an answer whose first characters have not been
  // spent, which is the same silence as far as the bubble is concerned.
  const empty = !typed && !hasTools && !message.bubble;

  return (
    // Far enough that the BUBBLE clears the composer's left edge, not just the
    // duck: he is 24px wide with a gap in front of it, so a small nudge only
    // moved him out and left what he says still inside the channel.
    <div className="group -ml-[42px] flex justify-start gap-2">
      <DuckMark size={24} state={isStreaming ? 'urgent' : 'idle'} className="mt-0.5 shrink-0" />
      <div className="flex max-w-[85%] flex-col items-start gap-1.5">
        <div
          // A line's worth of room from the moment the turn starts, so the panel
          // grows once — for the question and the space the answer will need —
          // rather than a second time when the answer arrives in it.
          className="min-h-9 w-full rounded-2xl rounded-bl-md border border-border/40 px-3.5 py-2 backdrop-blur-sm"
          style={{ background: 'color-mix(in srgb, var(--popover) 92%, transparent)' }}
        >
          {hasTools && (
            <div className="flex flex-col gap-1 mb-1.5">
              {message.toolCalls!.map((call, i) => {
                const result = message.toolResults?.[i];
                const status = result ? (result.success ? 'success' : 'error') : 'running';
                return (
                  <NikoToolCard
                    key={`${call.name}-${i}`}
                    name={call.name}
                    status={status}
                    error={result?.error}
                  />
                );
              })}
            </div>
          )}

          {typed && <NikoMarkdown content={typed} />}

          {/* Nothing to show yet — the turn has started but not spoken. */}
          {empty && isStreaming && (
            <div className="flex items-center gap-1.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:300ms]" />
            </div>
          )}
        </div>

        {/* Outside the bubble and off any ground of its own: what Niko said is a
          thing it said, and what you can press is not part of it. Held back
          until the words are out — a row of answers under a half-typed question
          is an answer to something nobody has finished asking. */}
        {message.bubble && typed === message.content && onAnswer && (
          <NikoBubble bubble={message.bubble} onAnswer={onAnswer} />
        )}
      </div>
    </div>
  );
}
