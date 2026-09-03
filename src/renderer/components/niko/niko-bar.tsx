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
  summonsNiko,
} from '@/lib/yeaboi/niko';
import { NikoCyclingText } from './niko-cycling-text';
import { NikoMagicChips } from './niko-magic-chips';
import { NikoMessage } from './niko-message';
import { useNikoContext } from './niko-provider';
import { SLASH_COMMANDS, isPrefill, isSlashQuery, matchSlash, slashWindow } from './niko-slash';

/** The gap left between the panel and the window when it steps aside. */
const ASIDE_MARGIN = 16;

/** Everything in the expanded panel that is not the conversation: the resize
 *  grip, the gap under it, and the composer, plus two pixels of slack — a
 *  measurement that lands a fraction short puts a scrollbar on a conversation
 *  that fits. The list's own padding is inside the measurement. */
const CHROME = 24 + 8 + 44 + 2;
/** The shortest the panel gets: one exchange still needs somewhere to sit. */
const FIT_MIN = 140;

/** The controls beside the composer, in the order they detach in. */
const CONTROLS = [
  { key: 'new', title: 'New conversation', Icon: MessageSquarePlus },
  { key: 'close', title: 'Minimise', Icon: X },
] as const;

/** Their width, animated from nothing when they detach. */
const CONTROL_SIZE = 44;

/** A conversation control: its own object on the composer's line, the same
 *  height as it. Two of them side by side, not one panel holding two. */
const CONTROL =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-popover text-muted-foreground/50 shadow-xl ring-1 ring-border/60 transition-colors hover:bg-foreground/5 hover:text-foreground';

/** How long the panel takes to reach a new size. */
const HEIGHT_MS = 350;

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
  // The conversation's own height, so the panel fits it rather than standing at
  // full size around one message. Dragging the grip pins it: past that point
  // the height is a decision somebody made, not a measurement.
  const [pinned, setPinned] = useState(false);
  const [fit, setFit] = useState(FIT_MIN);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seen = useRef(0);
  const [fade, setFade] = useState<'none' | 'top' | 'bottom' | 'both'>('none');
  // The panel animates to its new height while the conversation is already at
  // full size, so for those few hundred milliseconds the box genuinely does
  // overflow. Nobody can act on a scrollbar that is about to go away.
  const [settling, setSettling] = useState(false);
  // A drag is a direct manipulation: the panel is the size the cursor says it
  // is, this frame. Animating towards it makes the grip feel like it is on a
  // rubber band and every frame restarts the transition.
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const navigate = useNavigate();
  const backend = useYeaboiBackend();
  const down = backend.kind !== 'ready';
  const width = useOpenWidth();
  // Niko stepping aside. When it takes you to a screen it moves out of the
  // middle so the screen it named is the thing in front of you; it comes back
  // to the centre when you turn to it again with another question.
  const [aside, setAside] = useState(false);

  const state = barState(isOpen, messages.length);
  const matches = useMemo(() => matchSlash(value), [value]);
  const slashOpen = isSlashQuery(value) && matches.length > 0;

  const grown = Math.min(expandedHeight, Math.max(FIT_MIN, fit + CHROME));

  const height =
    state === 'expanded'
      ? pinned
        ? expandedHeight
        : grown
      : state === 'collapsed'
        ? COLLAPSED_HEIGHT
        : INPUT_HEIGHT;

  const close = useCallback(() => {
    setIsOpen(false);
    setValue('');
    inputRef.current?.blur();
  }, [setIsOpen]);

  // Cmd+. opens and closes from anywhere; Escape only closes. Typing a
  // character with nothing focused opens the bar and keeps the character —
  // `summonsNiko` is the guard, and unlike planning's it reads
  // `isContentEditable`, which is what the kanban cards, the retro board and
  // the tiptap editors need it to read.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        togglePanel();
        return;
      }
      if (e.key === 'Escape' && isOpen) {
        close();
        return;
      }
      if (isOpen) return;
      const target = e.target as HTMLElement | null;
      const summon = summonsNiko({
        key: e.key,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        target: target
          ? { tagName: target.tagName, isContentEditable: target.isContentEditable }
          : null,
      });
      if (!summon) return;
      // The keypress opens the bar, so nothing is focused to receive it yet —
      // seed the value here and let the focus effect put the caret after it.
      e.preventDefault();
      setValue(e.key);
      setIsOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePanel, isOpen, close, setIsOpen]);

  // The caret lands after the transition has started, so the box is already
  // growing when it appears rather than jumping ahead of it.
  useEffect(() => {
    if (state === 'collapsed') return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (dragging) return;
    setSettling(true);
    const done = setTimeout(() => setSettling(false), HEIGHT_MS + 40);
    return () => clearTimeout(done);
  }, [height, dragging]);

  // While the bar is open it owns the window: the deck must not turn a page
  // under it when the conversation runs out of scroll. Claimed on the document
  // so the deck needs to know nothing about Niko.
  useEffect(() => {
    if (state === 'collapsed') return;
    document.documentElement.dataset['overlay'] = 'niko';
    return () => {
      delete document.documentElement.dataset['overlay'];
    };
  }, [state]);

  // Keeping the newest message in view. Nothing to do when it already fits, and
  // nothing smooth about it while the panel is still growing: a smooth scroll
  // chases a target that moves as the box expands, so the conversation slides up
  // and drifts back down under it. Growing is the movement; the scroll only has
  // to keep up.
  useEffect(() => {
    const box = scrollRef.current;
    if (!box || box.scrollHeight <= box.clientHeight + 1) return;
    endRef.current?.scrollIntoView({ behavior: settling ? 'auto' : 'smooth', block: 'end' });
  }, [messages, settling]);

  /** Which ends the conversation carries on past. */
  const readFade = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    const above = box.scrollTop > 2;
    const below = box.scrollTop + box.clientHeight < box.scrollHeight - 2;
    setFade(above && below ? 'both' : above ? 'top' : below ? 'bottom' : 'none');
  }, []);

  // Measured rather than counted: a message's height depends on what is in it,
  // and a streaming one changes while you watch. The scroll box is what is
  // measured — the list inside it under-reports by its own padding and the gap
  // above its last child, which is enough to leave a scrollbar on a
  // conversation that fits.
  useEffect(() => {
    const box = scrollRef.current;
    const list = listRef.current;
    if (!box || !list) return;
    const measure = () => {
      setFit(Math.ceil(box.scrollHeight));
      readFade();
    };
    // `scrollHeight` never reports less than the box it is in, so a panel that
    // has grown could not otherwise shrink — collapse it first and measure what
    // is actually there. Only when the conversation got shorter, though: doing
    // it on every message squashes the panel flat for a frame each time one
    // arrives.
    if (messages.length < seen.current) setFit(0);
    seen.current = messages.length;
    const first = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(first);
      observer.disconnect();
    };
  }, [state, messages.length, readFade]);

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
    setAside(true);
    clearSuggestedRoute();
  }, [suggestedRoute, navigate, clearSuggestedRoute]);

  const startFresh = useCallback(() => {
    setPinned(false);
    startNewConversation();
  }, [startNewConversation]);

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
      setAside(false);
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
    setPinned(true);
    setDragging(true);
    // From the height on screen, not the one stored: the panel fits its
    // conversation until you take hold of it, and the grip has to continue
    // from what your hand is on.
    setExpandedHeight(height);
    dragRef.current = { startY: e.clientY, startHeight: height };
    const move = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      setExpandedHeight(draggedHeight(dragRef.current.startHeight, delta, window.innerHeight));
    };
    const end = () => {
      setDragging(false);
      dragRef.current = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', end);
  };

  // The shortcut list belongs directly above whatever you are typing into: over
  // the pill when that is all there is, and over the composer once a
  // conversation has opened underneath it.
  const slashList = slashOpen ? (
    <div className="flex flex-col items-stretch gap-1.5">
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
  ) : null;

  // How far right of centre the panel sits when it has stepped aside: hard
  // against the window's edge, by the same margin as everything else there.
  const asideShift =
    aside && state !== 'collapsed'
      ? Math.max(0, window.innerWidth / 2 - width / 2 - ASIDE_MARGIN)
      : 0;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 flex flex-col"
      style={{
        // Centred by default; docked right while a screen it opened is being
        // read. A transform either way, so the move is one animation rather
        // than a swap between two anchors.
        transform: `translateX(calc(-50% + ${asideShift}px))`,
        width: `${state === 'collapsed' ? COLLAPSED_WIDTH : width}px`,
        height: `${height}px`,
        transition: dragging
          ? `width ${HEIGHT_MS}ms ${MORPH}, transform 420ms ${MORPH}`
          : `width ${HEIGHT_MS}ms ${MORPH}, height ${HEIGHT_MS}ms ${MORPH}, transform 420ms ${MORPH}`,
      }}
    >
      {showChips && state === 'input' && (
        <NikoMagicChips prompts={magicPrompts} onSelect={submit} hidden={slashOpen} />
      )}

      {state === 'input' && slashList && (
        <div
          className="absolute left-1/2"
          style={{
            bottom: 'calc(100% + 8px)',
            transform: 'translateX(-50%)',
            width: `${width - 80}px`,
          }}
        >
          {slashList}
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
        className="relative flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl transition-opacity duration-300"
        style={{
          // The shell paints nothing while the bar is open. Everything visible
          // is its own object — the bubbles, the composer, the two controls —
          // so returning to the pill has no larger box to shrink out of: the
          // composer is already the pill, at the size it will keep.
          background: 'transparent',
          border: 'none',
          opacity: state === 'collapsed' ? 0 : 1,
          pointerEvents: state === 'collapsed' ? 'none' : 'auto',
        }}
      >
        <div
          // Bottom-up: the composer is on the floor of the panel whatever the
          // panel's height is doing. Stacked from the top it had nothing holding
          // it down once the conversation went, and slid down the window as the
          // height animated back to the pill.
          className={`relative z-10 flex min-h-0 flex-1 flex-col justify-end ${
            state === 'expanded' ? 'gap-2 overflow-visible' : 'overflow-hidden'
          }`}
          style={{
            // Expanded there is nothing to hold: the bubbles, the composer and
            // the conversation's own buttons each sit on the page.
            background: state === 'expanded' ? 'transparent' : 'var(--popover)',
            borderRadius: state === 'input' ? '15px' : 'inherit',
          }}
        >
          {state === 'expanded' && (
            <div
              ref={scrollRef}
              onScroll={readFade}
              data-fade={fade}
              className={`min-h-0 flex-1 px-1 py-1 ${
                settling ? 'overflow-hidden' : 'overflow-y-auto'
              }`}
            >
              <div ref={listRef} className="space-y-3">
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
            </div>
          )}

          {down && state !== 'collapsed' && (
            <div className="border-t border-warning/20 bg-warning/10 px-4 py-1.5 text-[11px] text-warning">
              {backend.kind === 'starting'
                ? 'Starting the yeaboi backend…'
                : `Niko is paused: ${backend.reason || 'the yeaboi backend is down.'}`}
            </div>
          )}

          {state === 'expanded' && slashList && <div className="px-1">{slashList}</div>}

          {/* The composer and its controls hang from a common bottom edge. No
              gap between them: the controls carry their own margin so the space
              they take opens and closes with them. */}
          <div className="flex items-end">
            <div
              className={`flex h-11 flex-1 items-center gap-2 rounded-full bg-popover px-4 shadow-xl ring-1 ring-border/60 ${
                state === 'input' ? 'niko-ring' : ''
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
                className="flex-1 resize-none self-center bg-transparent py-0 text-[13px] font-body leading-5 text-foreground outline-none placeholder:text-muted-foreground/50 disabled:opacity-50"
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

            {/* The conversation's controls detach from the composer rather than
                appearing beside it: each opens from nothing to its own width,
                and the composer gives up the room as they do — flex reflows
                every frame of the animation, so one transition moves both.
                Kept mounted and inert when closed, or unmounting them mid-
                animation leaves the half-drawn object behind. */}
            {CONTROLS.map(({ key, title, Icon }) => (
              <div
                key={key}
                className="shrink-0 overflow-hidden transition-all duration-300 ease-out"
                style={{
                  width: state === 'expanded' ? CONTROL_SIZE : 0,
                  marginLeft: state === 'expanded' ? 8 : 0,
                  opacity: state === 'expanded' ? 1 : 0,
                  pointerEvents: state === 'expanded' ? 'auto' : 'none',
                }}
                aria-hidden={state !== 'expanded'}
              >
                <button
                  onClick={key === 'new' ? startFresh : close}
                  className={CONTROL}
                  title={title}
                  aria-label={title}
                  tabIndex={state === 'expanded' ? undefined : -1}
                >
                  <Icon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
