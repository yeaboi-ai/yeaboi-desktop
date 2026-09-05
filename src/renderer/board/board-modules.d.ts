// The boards' own front end, as far as this project's typecheck is concerned.
//
// `@board/*` resolves into the yeaboi-frontend checkout, which has its own
// tsconfig, its own React alias (preact/compat) and its own `npm run typecheck`
// in CI. Type-checking it from here instead resolves its imports against this
// project's node_modules and fails on every file. So the seam is declared and
// the tree is left to its owner — the one thing this project must get right is
// what it passes in, which is the boot payload.

declare module '@board/poker/App' {
  export function App(props: { boot: unknown }): JSX.Element;
}

declare module '@board/retro/App' {
  export function App(props: { boot: unknown }): JSX.Element;
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
