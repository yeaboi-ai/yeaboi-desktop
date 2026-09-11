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
import { usePathname } from 'next/navigation';
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

/** How the row leaves when a board takes the window. Matches the dock's own,
 *  so the two go together rather than one after the other. */
const RETREAT = 'translate 260ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease';

/** The gap left between the panel and the window when it steps aside. */
const ASIDE_MARGIN = 16;

/** How many controls sit beside the composer. */
const CONTROLS_COUNT = 2;

/** The controls beside the composer, in the order they detach in. */
const CONTROLS = [
  { key: 'new', title: 'New conversation', Icon: MessageSquarePlus },
  { key: 'close', title: 'Minimise', Icon: X },
] as const;

/** Their width, animated from nothing when they detach, and the gap each one
 *  carries with it. */
const CONTROL_SIZE = 44;
const CONTROL_GAP = 8;
/** How far apart in time the two of them arrive. */
const CONTROL_STAGGER = 70;
/** What the panel gains when they detach: the pair, with their gaps. */
const CONTROLS_WIDTH = CONTROLS_COUNT * (CONTROL_SIZE + CONTROL_GAP);
/** What the composer gives back as they arrive. Three objects on one line are
 *  wider than one, and at full width the row ran to the window's edges on a
 *  small screen — so the composer comes in a little rather than the row going
 *  out. */
const COMPOSER_GIVE = 64;

/** A bubble's own arrival, and how far apart in time they arrive. The
 *  conversation deals itself in from the composer upwards rather than being
 *  revealed by a box that grows around it. */
const BUBBLE_IN_MS = 320;
const BUBBLE_OUT_MS = 200;
const BUBBLE_STAGGER = 45;
/** How far from the bottom still counts as reading the newest line: past this
 *  you have scrolled up on purpose and the conversation stops following. */
const FOLLOW_SLACK = 60;

/** How long the composer takes to fold its controls back in and draw down to
 *  the pill: the controls' own animation, and their stagger. */
const SHRINK_MS = 340;
/** The most bubbles that stagger. Past this they leave together — waiting out a
 *  long conversation to close the panel is a wait. */
const BUBBLE_STAGGER_CAP = 6;

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
  // Published, so a page can lay itself out around the channel the bar sits in
  // rather than working the same sum out a second time.
  useEffect(() => {
    document.documentElement.style.setProperty('--niko-width', `${width}px`);
  }, [width]);
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
    onBubbleAnswer,
    onTypedAnswer,
    scripted,
  } = useNikoContext();

  const [value, setValue] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [showChips, setShowChips] = useState(false);
  // The panel opens at its full size and keeps it. Fitting it to the
  // conversation meant it grew with every reply, and a box that resizes under
  // what you are reading is a second movement on top of the one the bubbles
  // already carry. The conversation hangs from the bottom of it instead.
  const [expandedHeight, setExpandedHeight] = useState(DEFAULT_EXPANDED_HEIGHT);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState<'none' | 'top' | 'bottom' | 'both'>('none');
  // The panel animates to its new height while the conversation is already at
  // full size, so for those few hundred milliseconds the box genuinely does
  // overflow. Nobody can act on a scrollbar that is about to go away.
  const [settling, setSettling] = useState(false);
  // A drag is a direct manipulation: the panel is the size the cursor says it
  // is, this frame. Animating towards it makes the grip feel like it is on a
  // rubber band and every frame restarts the transition.
  const [dragging, setDragging] = useState(false);
  // Closing is a sequence, not an instant, and it is the opening run
  // backwards: the bubbles leave, then the controls fold back into the
  // composer and it draws itself down to the pill's width — so what the pill
  // takes over from is the size the pill already is.
  const [closingPhase, setClosingPhase] = useState<'idle' | 'bubbles' | 'shrink'>('idle');
  const leaving = closingPhase !== 'idle';
  /** Each bubble's place in the opening stagger, fixed when it first appears —
   *  recomputing it as the conversation grows would send finished animations
   *  back to their start. */
  const entrance = useRef(new Map<string, number>());

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  const navigate = useNavigate();
  const pathname = usePathname();
  const backend = useYeaboiBackend();
  const down = backend.kind !== 'ready';
  const width = useOpenWidth();
  // Niko stepping aside. When it takes you to a screen it moves out of the
  // middle so the screen it named is the thing in front of you; it comes back
  // to the centre when you turn to it again with another question.
  const [aside, setAside] = useState(false);

  const state = barState(isOpen, messages.length);
  // Each bubble carries its own entrance, so the panel does not have to grow
  // around them: the ones already there when it opens rise in turn from the
  // composer up, and one that arrives later simply rises on its own.
  const wasOpen = useRef(false);
  const opening = state === 'expanded' && !wasOpen.current;
  if (opening)
    entrance.current = new Map(
      messages.map((message, index) => [
        message.id,
        Math.min(BUBBLE_STAGGER_CAP - 1, messages.length - 1 - index) * BUBBLE_STAGGER,
      ]),
    );
  wasOpen.current = state === 'expanded';
  const matches = useMemo(() => matchSlash(value), [value]);
  const slashOpen = isSlashQuery(value) && matches.length > 0;

  const height =
    state === 'expanded' ? expandedHeight : state === 'collapsed' ? COLLAPSED_HEIGHT : INPUT_HEIGHT;

  // The conversation leaves the way it arrived: the bubbles go first, one after
  // another from the top, and the panel follows them down once they have gone.
  const closeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const finish = useCallback(() => {
    setClosingPhase('idle');
    setIsOpen(false);
    setValue('');
    inputRef.current?.blur();
  }, [setIsOpen]);
  const close = useCallback(() => {
    if (state !== 'expanded' || leaving) {
      finish();
      return;
    }
    const gone = BUBBLE_OUT_MS + BUBBLE_STAGGER * Math.min(messages.length, BUBBLE_STAGGER_CAP);
    setClosingPhase('bubbles');
    closeTimers.current = [
      setTimeout(() => setClosingPhase('shrink'), gone),
      setTimeout(finish, gone + SHRINK_MS),
    ];
  }, [state, leaving, messages.length, finish]);
  useEffect(
    () => () => {
      for (const timer of closeTimers.current) clearTimeout(timer);
    },
    [],
  );

  // A click anywhere else is a way out too: the bar covers the foot of the
  // window, and reaching for the page behind it should not mean finding the
  // key that closes it. Pointerdown rather than click, so the page's own
  // handler runs against a bar that is already leaving.
  useEffect(() => {
    if (!isOpen) return;
    const away = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-niko]')) return;
      close();
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [isOpen, close]);

  // Cmd+. opens and closes from anywhere; Escape only closes. Typing a
  // character with nothing focused opens the bar and keeps the character —
  // `summonsNiko` is the guard, and unlike planning's it reads
  // `isContentEditable`, which is what the kanban cards, the retro board and
  // the tiptap editors need it to read.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        // Closing goes through `close`, so the conversation leaves the same way
        // however it was dismissed.
        if (isOpen) close();
        else togglePanel();
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

  /** Whether the conversation is still following its newest line. */
  const following = useRef(true);

  /** Which ends the conversation carries on past. */
  const readFade = useCallback(() => {
    const box = scrollRef.current;
    if (!box) return;
    // Scrolling up is how you stop it following; coming back to the bottom is
    // how you start it again. Read here rather than compared against a stored
    // position, so the panel's own scrolling counts as staying at the bottom.
    following.current = box.scrollHeight - box.scrollTop - box.clientHeight < FOLLOW_SLACK;
    const above = box.scrollTop > 2;
    const below = box.scrollTop + box.clientHeight < box.scrollHeight - 2;
    setFade(above && below ? 'both' : above ? 'top' : below ? 'bottom' : 'none');
  }, []);

  // Which ends the conversation runs past changes as it grows and as a reply
  // streams, neither of which is a scroll — so it is watched rather than only
  // read on one.
  // An answer types itself out a few characters at a time, and every one of
  // them makes the conversation taller. Following it on the message rather
  // than the growth left the newest line drifting below the fold between
  // tokens, so the bottom is held here, frame by frame, unless you have
  // scrolled up to read something.
  const follow = useCallback(() => {
    const box = scrollRef.current;
    if (box && following.current) box.scrollTop = box.scrollHeight;
    readFade();
  }, [readFade]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const first = requestAnimationFrame(follow);
    const observer = new ResizeObserver(follow);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(first);
      observer.disconnect();
    };
  }, [state, messages.length, follow]);

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
    landed.current = suggestedRoute;
    clearSuggestedRoute();
  }, [suggestedRoute, navigate, clearSuggestedRoute]);

  // The corner he steps into is the duck's, so the window is told: see
  // globals.css, where the three of them drop out of his way. Only while he is
  // actually standing there — collapsed to his pill he takes none of it, and
  // the corner comes back the moment the panel closes.
  const standingAside = aside && state !== 'collapsed' && closingPhase !== 'shrink';
  useEffect(() => {
    const root = document.documentElement;
    if (standingAside) root.dataset['nikoAside'] = '';
    else delete root.dataset['nikoAside'];
    return () => {
      delete root.dataset['nikoAside'];
    };
  }, [standingAside]);

  // And leaving that screen closes it. The answer was about the page it took
  // you to; once you have gone somewhere else it is a panel held open over a
  // screen it has nothing to say about, and the way to shut it is not obvious
  // from looking at it.
  const landed = useRef<string | null>(null);
  useEffect(() => {
    if (!landed.current) return;
    if (pathname === landed.current || pathname?.startsWith(`${landed.current}/`)) return;
    landed.current = null;
    setAside(false);
    setIsOpen(false);
  }, [pathname, setIsOpen]);

  const startFresh = useCallback(() => {
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
      // A page asking a question of its own gets first refusal on the answer.
      if (!onTypedAnswer(question)) void sendMessage(question);
      setAside(false);
      resetComposer();
      setShowChips(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    },
    [isStreaming, down, sendMessage, resetComposer, onTypedAnswer],
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
    setDragging(true);
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
      {slashWindow(matches, slashIndex).map(({ command, index, isPeek }, at) => {
        const selected = index === slashIndex;
        return (
          <button
            key={command.cmd}
            onClick={() => !isPeek && runSlash(command)}
            // The chips above the bar and these are the same object in two
            // moods: one offers, the other completes what is being typed.
            className={`flex items-center gap-2.5 rounded-full border px-4 font-body text-[11px] whitespace-nowrap transition-all duration-300 ${
              selected
                ? 'border-primary/40 bg-primary/[0.08] text-primary/90 shadow-lg shadow-primary/10'
                : 'border-border/60 bg-foreground/[0.04] text-muted-foreground hover:border-primary/30 hover:text-foreground/90 hover:shadow-lg hover:shadow-primary/10'
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
              // The peek keeps its own transform; the rest float up as the
              // chips do, one after the other.
              transform: isPeek ? 'scale(0.95)' : 'none',
              animationDelay: isPeek ? undefined : `${at * 40}ms`,
              animation: isPeek ? undefined : 'chipFloat 0.35s ease-out both',
            }}
          >
            <span className="font-mono opacity-70">{command.cmd}</span>
            <span className="opacity-60">{command.label}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  const shell =
    state === 'collapsed' || closingPhase === 'shrink'
      ? COLLAPSED_WIDTH
      : state === 'expanded'
        ? Math.min(width + CONTROLS_WIDTH - COMPOSER_GIVE, window.innerWidth - 2 * ASIDE_MARGIN)
        : width;

  // How far right of centre the panel sits when it has stepped aside: hard
  // against the window's edge, by the same margin as everything else there.
  // Measured on the shell rather than the composer inside it — the controls
  // ride on the shell's right, so half a composer put them off the window.
  const asideShift = standingAside
    ? Math.max(0, window.innerWidth / 2 - shell / 2 - ASIDE_MARGIN)
    : 0;

  return (
    <div
      data-niko
      className="fixed bottom-[calc(1rem+var(--turn-inset))] left-1/2 z-50 flex flex-col transition-[bottom] duration-300 ease-out"
      style={{
        // Centred by default; docked right while a screen it opened is being
        // read. A transform either way, so the move is one animation rather
        // than a swap between two anchors.
        // The panel gains the controls' width and stays centred, so the three
        // objects are centred together once they are all there. The composer
        // keeps its own width throughout — it neither grows nor gives up room;
        // it moves half the controls' width to the left as they arrive.
        transform: `translateX(calc(-50% + ${asideShift}px))`,
        width: `${shell}px`,
        height: `${height}px`,
        // The height snaps whenever the conversation itself is arriving or
        // leaving: the bubbles carry that movement, and a box growing around
        // them at the same time is the second animation nobody asked for. It
        // still eases for the sizes that are the panel's own — settling to fit
        // a reply, or a drag on the grip.
        // `bottom` and `RETREAT` are on both branches: an inline transition
        // replaces the property list rather than adding to it, so anything the
        // stylesheet animates has to be named here too or it snaps. The deck
        // holds everything off the window's edge while it is being turned, and
        // a board staged in the window sends the whole row off the bottom —
        // named nowhere here, the bar vanished while the dock beside it slid.
        transition:
          dragging || opening || state === 'collapsed'
            ? `width ${HEIGHT_MS}ms ${MORPH}, transform 420ms ${MORPH}, bottom 300ms ease-out, ${RETREAT}`
            : `width ${HEIGHT_MS}ms ${MORPH}, height ${HEIGHT_MS}ms ${MORPH}, transform 420ms ${MORPH}, bottom 300ms ease-out, ${RETREAT}`,
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
        // Pill-high and on the floor, never `inset-0`: sized to the panel it was
        // drawn at the height of whatever was open a moment ago, so closing a
        // conversation painted an enormous rounded box that then shrank to this.
        className="group absolute inset-x-0 bottom-0 flex h-11 items-center justify-center gap-2 rounded-full border border-border bg-popover px-6 shadow-xl hover:border-primary/30 hover:shadow-primary/5"
        style={{
          opacity: state === 'collapsed' ? 1 : 0,
          pointerEvents: state === 'collapsed' ? 'auto' : 'none',
          // It takes over the instant the bar closes rather than fading up into
          // it: whatever is painting has to be the only thing painting, or the
          // retraction reads as two objects.
          transition:
            state === 'collapsed'
              ? 'border-color 150ms ease, box-shadow 150ms ease'
              : 'opacity 150ms ease',
        }}
        title="Ask Niko (Cmd+.)"
        aria-label="Ask Niko"
      >
        <MessageCircle className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary" />
        <NikoCyclingText />
      </button>

      {/* ── The card ─────────────────────────────────────────────────── */}
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-visible rounded-2xl"
        style={{
          // The shell paints nothing while the bar is open. Everything visible
          // is its own object — the bubbles, the composer, the two controls —
          // so returning to the pill has no larger box to shrink out of: the
          // composer is already the pill, at the size it will keep.
          background: 'transparent',
          border: 'none',
          opacity: state === 'collapsed' ? 0 : 1,
          pointerEvents: state === 'collapsed' ? 'none' : 'auto',
          // Instant on the way out, a fade on the way in. Fading it out left
          // the composer's own pill painted at full width while the panel was
          // still shrinking — two backgrounds retracting at once, one of them
          // belonging to something that had already closed.
          transition: state === 'collapsed' ? 'none' : 'opacity 300ms ease',
        }}
      >
        <div
          // Bottom-up: the composer is on the floor of the panel whatever the
          // panel's height is doing. Stacked from the top it had nothing holding
          // it down once the conversation went, and slid down the window as the
          // height animated back to the pill.
          // Paints nothing, in any state. Filling it while the bar was open drew
          // a popover-coloured box the height of whatever had just closed, with
          // the composer sitting inside it — the larger div with a background
          // that is not there any more. The composer is the only pill.
          className="relative z-10 flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-visible"
        >
          {state === 'expanded' && (
            <div
              ref={scrollRef}
              onScroll={readFade}
              data-fade={fade}
              // Wider than the composer by a little on each side, so the
              // conversation reads as a thing standing over the page rather
              // than a column the composer cut for it.
              className={`quiet-scroll -mx-3 flex min-h-0 flex-1 flex-col px-4 py-1 ${
                settling ? 'overflow-hidden' : 'overflow-y-auto'
              }`}
            >
              <div ref={listRef} className="mt-auto space-y-3">
                {messages.map((message, i) => (
                  <div
                    key={message.id}
                    style={{
                      animation: leaving
                        ? `niko-bubble-out ${BUBBLE_OUT_MS}ms ease-in ${Math.min(i, BUBBLE_STAGGER_CAP - 1) * BUBBLE_STAGGER}ms forwards`
                        : `niko-bubble-in ${BUBBLE_IN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${entrance.current.get(message.id) ?? 0}ms backwards`,
                    }}
                  >
                    <NikoMessage
                      message={message}
                      isStreaming={
                        isStreaming && message.role === 'assistant' && i === messages.length - 1
                      }
                      onAnswer={onBubbleAnswer}
                    />
                  </div>
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
            {CONTROLS.map(({ key, title, Icon }, index) => {
              // Put away while a page is asking: there is no new thread to
              // start and none to close in the middle of being asked something.
              const shown = state === 'expanded' && closingPhase !== 'shrink' && !scripted;
              // Later ones arrive later and leave first, so the pair reads as
              // two things rather than one wide thing.
              const delay = (shown ? index : CONTROLS_COUNT - 1 - index) * CONTROL_STAGGER;
              return (
                <div
                  key={key}
                  // Holds the space and nothing else. Clipping the reveal cut
                  // the ring and the shadow, which paint outside the button's
                  // box — the flattened tops and bottoms.
                  className="shrink-0"
                  style={{
                    width: shown ? CONTROL_SIZE : 0,
                    marginLeft: shown ? CONTROL_GAP : 0,
                    transition: `width 260ms ease-out ${delay}ms, margin-left 260ms ease-out ${delay}ms`,
                  }}
                  aria-hidden={!shown}
                >
                  <button
                    onClick={key === 'new' ? startFresh : close}
                    className={CONTROL}
                    title={title}
                    aria-label={title}
                    tabIndex={shown ? undefined : -1}
                    style={{
                      opacity: shown ? 1 : 0,
                      transform: shown ? 'none' : 'translateY(6px) scale(0.9)',
                      pointerEvents: shown ? 'auto' : 'none',
                      transition: `opacity 260ms ease-out ${delay}ms, transform 300ms cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`,
                    }}
                  >
                    <Icon className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
