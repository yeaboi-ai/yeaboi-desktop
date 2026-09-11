// The boards' own front end, as far as this project's typecheck is concerned.
//
// `@board/*` resolves into the yeaboi-frontend checkout, which has its own
// tsconfig, its own React alias (preact/compat) and its own `npm run typecheck`
// in CI. Type-checking it from here instead resolves its imports against this
// project's node_modules and fails on every file. So the seam is declared and
// the tree is left to its owner — the one thing this project must get right is
// what it passes in, which is the boot payload.

/** The player a staged board is handed, so the window keeps one set of
 *  speakers. Mirrors `MusicApi` in the boards' own `hooks/useMusic`. */
interface BoardMusicApi {
  playing: boolean;
  connecting: boolean;
  channel: number;
  volume: number;
  toggle(): void;
  play(): Promise<void>;
  stop(): void;
  setChannel(index: number): void;
  setVolume(value: number): void;
  cast(index: number, on: boolean): Promise<void>;
  analyser: AnalyserNode | null;
}

/** What a staged board is given in place of its own music control. It hands
 *  back `cast` — putting a station on for everyone in the room is the board's
 *  business, not the window's — and undefined for a guest. */
type BoardMusicControlFn = (parts: { cast?: (() => void) | undefined }) => React.ReactNode;

declare module '@board/poker/App' {
  export type BoardMusic = BoardMusicApi;
  export function App(props: {
    boot: unknown;
    music?: BoardMusicApi;
    musicControl?: BoardMusicControlFn;
  }): JSX.Element;
}

declare module '@board/retro/App' {
  export type BoardMusic = BoardMusicApi;
  export function App(props: {
    boot: unknown;
    music?: BoardMusicApi;
    musicControl?: BoardMusicControlFn;
    /** A past retro to open on, by run id. The board steps back to it. */
    showRun?: number | undefined;
  }): JSX.Element;
}

declare module '@board/design/tokens.css';

declare module '@board/design/tokens.css?inline' {
  const css: string;
  export default css;
}

declare module '@board/runtime/storage' {
  /** The board's participant id, minted once and kept in local storage. */
  export function participantId(key?: string): string;
}

declare module '@board/motion/useCarry' {
  import type { MutableRefObject } from 'react';

  /** Where the carried thing hangs. The lean is a separate `rotate` property. */
  export function carriedTransform(carry: {
    x: number;
    y: number;
    grabX: number;
    grabY: number;
  }): string;

  /** Nudge a scroller the pointer is hovering near the top or bottom edge of. */
  export function edgeScroll(el: HTMLElement, y: number, top: number, bottom: number): void;

  export interface CarryState<Target> {
    itemId: string;
    x: number;
    y: number;
    grabX: number;
    grabY: number;
    width: number;
    tilt: number;
    target: Target | null;
  }

  export interface Landing {
    left: number;
    top: number;
  }

  export interface CarryOptions<Target, Survey> {
    itemSelector: string;
    survey(itemId: string): Survey;
    hitTest(survey: Survey, x: number, y: number): Target | null;
    sameTarget(a: Target, b: Target): boolean;
    landingAt?(target: Target): Landing | null;
    onPick?(itemId: string): void;
    onDrop(itemId: string, target: Target): void;
    onMiss?(itemId: string): void;
    onCancel?(itemId: string): void;
    enabled?: boolean;
  }

  export interface Carry<Target> {
    carry: CarryState<Target> | null;
    previewRef: MutableRefObject<HTMLElement | null>;
    onHandlePointerDown(itemId: string, event: PointerEvent): void;
    onBodyPointerDown(itemId: string, event: PointerEvent): void;
  }

  export function useCarry<Target, Survey>(options: CarryOptions<Target, Survey>): Carry<Target>;
}
