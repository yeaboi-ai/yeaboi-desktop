'use client';

// One turn in the bar. Planning's bubble shapes, painted with the app's tokens
// so they follow the theme rather than pinning a hex.
//
// The duck sits on Niko's side only. A user avatar would be a second identity
// in a 560px bar that already knows who is typing.

import { DuckMark } from '@/components/brand/duck';
import { NikoMarkdown } from './niko-markdown';
import { NikoToolCard } from './niko-tool-card';
import type { NikoMessage as NikoMessageType } from '@/hooks/use-niko';

interface NikoMessageProps {
  message: NikoMessageType;
  isStreaming?: boolean;
}

export function NikoMessage({ message, isStreaming }: NikoMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
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

  const hasTools = !!message.toolCalls?.length;
  const empty = !message.content && !hasTools;

  return (
    <div className="group flex justify-start gap-2">
      <DuckMark size={24} state={isStreaming ? 'urgent' : 'idle'} className="mt-0.5 shrink-0" />
      <div
        // A line's worth of room from the moment the turn starts, so the panel
        // grows once — for the question and the space the answer will need —
        // rather than a second time when the answer arrives in it.
        className="min-h-9 max-w-[85%] rounded-2xl rounded-bl-md border border-border/40 px-3.5 py-2 backdrop-blur-sm"
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

        {message.content && <NikoMarkdown content={message.content} />}

        {/* Nothing to show yet — the turn has started but not spoken. */}
        {empty && isStreaming && (
          <div className="flex items-center gap-1.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse [animation-delay:300ms]" />
          </div>
        )}
      </div>
    </div>
  );
}
