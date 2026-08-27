"use client";

import { useCallback, useEffect, useMemo } from "react";

export interface SessionShortcut {
  /** Stable identifier — used by Cmd-K to address the action programmatically. */
  id: string;
  /** Human-readable label rendered in the help overlay and command palette. */
  label: string;
  /**
   * Key descriptor — single key or `mod+letter` form (e.g. "k", "?", "mod+k").
   * `mod` resolves to ⌘ on macOS, Ctrl elsewhere.
   * Use "Space" for the space bar.
   *
   * Pass an empty string for actions that should appear in the Cmd-K palette
   * (and optionally the help overlay) but have no keyboard binding.
   */
  keys: string;
  /** Group label for the help overlay. */
  group?: "Call" | "Agent" | "Navigation" | "Misc";
  /** Action to invoke. Receives the originating event so handlers can preventDefault if needed. */
  run: (event: KeyboardEvent) => void;
  /** When true, this shortcut also fires when focus is in an input/textarea/contenteditable. Default false. */
  allowInInputs?: boolean;
  /** When true, the shortcut is hidden from the help overlay. Still appears in Cmd-K. */
  hideFromHelp?: boolean;
}

const isMac = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");
};

/** Format a shortcut spec ("mod+k") for display ("⌘K" on macOS, "Ctrl+K" elsewhere). */
export function formatShortcut(keys: string): string {
  const mac = isMac();
  return keys
    .split("+")
    .map((part) => {
      const k = part.toLowerCase();
      if (k === "mod") return mac ? "⌘" : "Ctrl";
      if (k === "shift") return mac ? "⇧" : "Shift";
      if (k === "alt") return mac ? "⌥" : "Alt";
      if (k === "space") return "Space";
      if (k === "esc" || k === "escape") return "Esc";
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join(mac ? "" : "+");
}

function isInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function matches(spec: string, e: KeyboardEvent): boolean {
  const parts = spec.toLowerCase().split("+");
  const needsMod = parts.includes("mod");
  const needsShift = parts.includes("shift");
  const needsAlt = parts.includes("alt");
  const key = parts[parts.length - 1];

  const modPressed = isMac() ? e.metaKey : e.ctrlKey;
  if (needsMod !== modPressed) return false;
  if (needsShift !== e.shiftKey) return false;
  if (needsAlt !== e.altKey) return false;

  // Space and Escape map to e.code; letter keys to e.key.
  if (key === "space") return e.code === "Space";
  if (key === "esc" || key === "escape") return e.key === "Escape";
  if (key === "?") return e.key === "?";
  return e.key.toLowerCase() === key;
}

/**
 * Registers a set of session-level keyboard shortcuts.
 *
 * The same `shortcuts` array is consumed by both the help overlay and the Cmd-K
 * command palette (W3) — single source of truth, no drift between what the
 * overlay shows and what actually works.
 */
export function useSessionShortcuts(shortcuts: SessionShortcut[], enabled: boolean = true): void {
  const list = useMemo(() => shortcuts, [shortcuts]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      const inInput = isInputTarget(e.target);
      for (const s of list) {
        if (!s.keys) continue; // Cmd-K-only entry
        if (!s.allowInInputs && inInput) continue;
        if (matches(s.keys, e)) {
          s.run(e);
          break;
        }
      }
    },
    [enabled, list],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onKey]);
}
