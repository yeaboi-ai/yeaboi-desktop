'use client';

// Niko's bar: a pill at the bottom of the window that morphs into a command bar
// and then into the conversation.
//
// The pill and the card are BOTH always mounted and cross-faded by opacity —
// conditionally rendering either one turns the morph into a swap, which is the
// whole effect. Only the outer box's width and height animate, on one shared
// curve, so the three states read as one object changing shape.
//
// The shape is derived, never stored: `barState(isOpen, messages.length)`. That
// is why "new conversation" drops back to the chip-bearing input state on its
// own, with no second source of truth to keep in step.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  GripHorizontal,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Send,
  Square,
  X,
} from 'lucide-react';
import { DuckMark } from '@/components/brand/duck';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';
import {
  COLLAPSED_HEIGHT,
  COLLAPSED_WIDTH,
  DEFAULT_EXPANDED_HEIGHT,
  INPUT_HEIGHT,
  barState,
  draggedHeight,
  openWidth as computeOpenWidth,
} from '@/lib/yeaboi/niko';
import { NikoCyclingText } from './niko-cycling-text';
import { NikoMagicChips } from './niko-magic-chips';
import { NikoMessage } from './niko-message';
import { useNikoContext } from './niko-provider';
import { SLASH_COMMANDS, isPrefill, isSlashQuery, matchSlash, slashWindow } from './niko-slash';

const MORPH = 'cubic-bezier(0.4, 0, 0.2, 1)';

/** How long the chips wait before floating in, so they follow the morph. */
const CHIPS_DELAY_MS = 1200;

/** Tallest the composer grows before it scrolls itself. */
const COMPOSER_MAX_PX = 120;

function useOpenWidth(): number {
  const [width, setWidth] = useState(() => computeOpenWidth(window.innerWidth));
  useEffect(() => {
    const onResize = () => setWidth(computeOpenWidth(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function NikoBar() {
  const {
    isOpen,
    setIsOpen,
    messages,
    isStreaming,
    magicPrompts,
    sendMessage,
    togglePanel,
    startNewConversation,
    stopStreaming,
    suggestedRoute,
    clearSuggestedRoute,
  } = useNikoContext();

  const [value, setValue] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [showChips, setShowChips] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState(DEFAULT_EXPANDED_HEIGHT);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const navigate = useNavigate();
  const backend = useYeaboiBackend();
  const down = backend.kind !== 'ready';
  const width = useOpenWidth();

  const state = barState(isOpen, messages.length);
  const matches = useMemo(() => matchSlash(value), [value]);
  const slashOpen = isSlashQuery(value) && matches.length > 0;

  const height =
    state === 'expanded' ? expandedHeight : state === 'collapsed' ? COLLAPSED_HEIGHT : INPUT_HEIGHT;

  const close = useCallback(() => {
    setIsOpen(false);
    setValue('');
    inputRef.current?.blur();
  }, [setIsOpen]);

  // Cmd+. opens and closes from anywhere; Escape only closes. Deliberately not
  // planning's type-to-open: yeaboi has kanban cards, a retro board and tiptap
  // editors, and its INPUT/TEXTAREA/SELECT guard misses every contenteditable.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        togglePanel();
        return;
      }
      if (e.key === 'Escape' && isOpen) close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel, isOpen, close]);

  // The caret lands after the transition has started, so the box is already
  // growing when it appears rather than jumping ahead of it.
  useEffect(() => {
    if (state === 'collapsed') return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (state !== 'input') {
      setShowChips(false);
      return;
    }
    const timer = setTimeout(() => setShowChips(true), CHIPS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Niko naming a route moves the window; the bar stays open so the answer is
  // still readable beside the screen it named.
  useEffect(() => {
    if (!suggestedRoute) return;
    navigate(suggestedRoute);
    clearSuggestedRoute();
  }, [suggestedRoute, navigate, clearSuggestedRoute]);

  const resetComposer = useCallback(() => {
    setValue('');
    setSlashIndex(0);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }, []);

  const submit = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || isStreaming || down) return;
      void sendMessage(question);
      resetComposer();
      setShowChips(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [isStreaming, down, sendMessage, resetComposer],
  );

  const runSlash = useCallback(
    (command: (typeof SLASH_COMMANDS)[number]) => {
      if (isPrefill(command)) {
        setValue(command.prompt);
        setSlashIndex(0);
        setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }
      submit(command.prompt);
    },
    [submit],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => Math.min(i + 1, matches.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        runSlash(matches[slashIndex]);
        return;
      }
      if (e.key === 'Escape') {
        // Escape out of the palette first; a second one closes the bar.
        e.preventDefault();
        e.stopPropagation();
        setValue('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(value);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: expandedHeight };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setExpandedHeight(draggedHeight(dragRef.current.startHeight, delta, window.innerHeight));
    };
    const end = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-50 flex flex-col"
      style={{
        transform: 'translateX(-50%)',
        width: `${state === 'collapsed' ? COLLAPSED_WIDTH : width}px`,
        height: `${height}px`,
        transition: `width 350ms ${MORPH}, height 350ms ${MORPH}`,
      }}
    >
      {showChips && state === 'input' && (
        <NikoMagicChips prompts={magicPrompts} onSelect={submit} hidden={slashOpen} />
      )}

      {slashOpen && (
        <div
          className="absolute left-1/2 flex flex-col items-stretch gap-1.5"
          style={{
            bottom: 'calc(100% + 8px)',
            transform: 'translateX(-50%)',
            width: `${width - 80}px`,
          }}
        >
          {slashWindow(matches, slashIndex).map(({ command, index, isPeek }) => {
            const selected = index === slashIndex;
            return (
              <button
                key={command.cmd}
                onClick={() => !isPeek && runSlash(command)}
                className={`flex items-center gap-2.5 px-4 rounded-full text-[11px] font-body whitespace-nowrap border ${
                  selected
                    ? 'bg-primary/[0.08] border-primary/25 text-primary/80'
                    : 'bg-foreground/[0.03] border-border/60 text-muted-foreground/70'
                }`}
                style={{
                  height: 32,
                  width: '100%',
                  overflow: 'hidden',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  // The peek row tucks UNDER the one below it, so the palette
                  // shows there is more above without spending a row saying so.
                  opacity: isPeek ? 0.3 : 1,
                  pointerEvents: isPeek ? 'none' : 'auto',
                  marginBottom: isPeek ? -20 : 0,
                  zIndex: isPeek ? 0 : 1,
                  transform: isPeek ? 'scale(0.95)' : 'none',
                }}
              >
                <span className="font-mono opacity-70">{command.cmd}</span>
                <span className="opacity-60">{command.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Resize grip — collapses to nothing outside the expanded state. */}
      <div
        className="flex items-center justify-center cursor-ns-resize group"
        onMouseDown={startDrag}
        style={{
          height: state === 'expanded' ? '24px' : '0px',
          opacity: state === 'expanded' ? 1 : 0,
          pointerEvents: state === 'expanded' ? 'auto' : 'none',
          overflow: 'hidden',
          transition: `height 350ms ${MORPH}, opacity 200ms ease`,
        }}
      >
        <GripHorizontal className="w-4 h-4 text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors" />
      </div>

      {/* ── The pill ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen(true)}
        className="group absolute inset-0 flex items-center justify-center gap-2 rounded-full border border-border bg-popover px-6 shadow-xl transition-all duration-150 hover:border-primary/30 hover:shadow-primary/5"
        style={{
          opacity: state === 'collapsed' ? 1 : 0,
          pointerEvents: state === 'collapsed' ? 'auto' : 'none',
        }}
        title="Ask Niko (Cmd+.)"
        aria-label="Ask Niko"
      >
        <MessageCircle className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" />
        <NikoCyclingText />
      </button>

      {/* ── The card ─────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-1 flex-col overflow-hidden rounded-2xl transition-opacity duration-300"
        style={{
          // In `input` the 1px pad + border-coloured backing IS the track the
          // spinning gradient below shows through; the inner card masks the rest.
          padding: state === 'input' ? '1px' : 0,
          background: state === 'input' ? 'var(--border)' : 'var(--popover)',
          border: state === 'input' ? 'none' : '1px solid var(--border)',
          boxShadow: '0 8px 32px rgb(0 0 0 / 35%)',
          opacity: state === 'collapsed' ? 0 : 1,
          pointerEvents: state === 'collapsed' ? 'none' : 'auto',
        }}
      >
        {state === 'input' && (
          <div
            className="absolute pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              width: '600px',
              height: '600px',
              marginTop: '-300px',
              marginLeft: '-300px',
              background:
                'conic-gradient(from 0deg, transparent 30%, var(--primary) 50%, transparent 70%)',
              animation: 'spin-slow 3s linear infinite',
            }}
          />
        )}

        <div
          className="relative z-10 flex flex-1 flex-col overflow-hidden"
          style={{
            background: 'var(--popover)',
            borderRadius: state === 'input' ? '15px' : 'inherit',
          }}
        >
          {state === 'expanded' && (
            <div className="flex items-center justify-between border-b border-border/30 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <DuckMark size={20} state={isStreaming ? 'urgent' : down ? 'offline' : 'idle'} />
                <span className="text-[11px] font-body font-medium uppercase tracking-wide text-muted-foreground/60">
                  Niko
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={startNewConversation}
                  className="rounded-md p-1.5 text-muted-foreground/30 transition-colors hover:bg-foreground/5 hover:text-muted-foreground"
                  title="New conversation"
                >
                  <MessageSquarePlus className="size-3.5" />
                </button>
                <button
                  onClick={close}
                  className="rounded-md p-1.5 text-muted-foreground/30 transition-colors hover:bg-foreground/5 hover:text-muted-foreground"
                  title="Minimise"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          )}

          {state === 'expanded' && (
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {messages.map((message, i) => (
                <NikoMessage
                  key={message.id}
                  message={message}
                  isStreaming={
                    isStreaming && message.role === 'assistant' && i === messages.length - 1
                  }
                />
              ))}
              <div ref={endRef} />
            </div>
          )}

          {down && state !== 'collapsed' && (
            <div className="border-t border-amber-500/20 bg-amber-950/30 px-4 py-1.5 text-[11px] text-amber-200/80">
              {backend.kind === 'starting'
                ? 'Starting the yeaboi backend…'
                : `Niko is paused: ${backend.reason || 'the yeaboi backend is down.'}`}
            </div>
          )}

          <div
            className={`flex items-center gap-2 px-3 ${
              state === 'expanded' ? 'border-t border-border/30 py-2' : 'flex-1'
            }`}
          >
            {/* The duck, embedded the moment the bar opens. The expanded header
                carries it once there is a conversation; this is the first open. */}
            {state === 'input' && <DuckMark size={18} className="shrink-0" />}
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setSlashIndex(0);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, COMPOSER_MAX_PX)}px`;
              }}
              onKeyDown={onKeyDown}
              placeholder={
                down ? 'Waiting for the yeaboi backend…' : 'Ask Niko anything, or / for shortcuts'
              }
              className="flex-1 resize-none bg-transparent text-[13px] font-body text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
              rows={1}
              disabled={down}
              style={{ maxHeight: COMPOSER_MAX_PX }}
            />
            <button
              onClick={() => (isStreaming ? stopStreaming() : submit(value))}
              disabled={!isStreaming && (!value.trim() || down)}
              title={isStreaming ? 'Stop' : 'Ask'}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground/50 transition-colors hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground/50"
            >
              {isStreaming ? (
                <span className="relative flex size-4 items-center justify-center">
                  <Loader2 className="absolute size-4 animate-spin text-primary/50" />
                  <Square className="size-2 fill-current" />
                </span>
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
