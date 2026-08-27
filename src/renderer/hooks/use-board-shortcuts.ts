"use client";

import { useEffect } from "react";

export interface BoardShortcutHandlers {
  onCreate?: () => void;
  onFocusSearch?: () => void;
  onOpenSelected?: () => void;
  onShowHelp?: () => void;
  onEscape?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  onToggleSelect?: () => void;
}

// Listens for board-scoped keyboard shortcuts. Skips when focus is in any
// editable element (input, textarea, contenteditable) so users can type freely.
export function useBoardShortcuts(handlers: BoardShortcutHandlers) {
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const handler = (e: KeyboardEvent) => {
      // Always allow Escape, even from inputs (closes panels / clears selection).
      if (e.key === "Escape") {
        handlers.onEscape?.();
        return;
      }
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "c":
          e.preventDefault();
          handlers.onCreate?.();
          break;
        case "/":
          e.preventDefault();
          handlers.onFocusSearch?.();
          break;
        case "?":
          e.preventDefault();
          handlers.onShowHelp?.();
          break;
        case "e":
          e.preventDefault();
          handlers.onOpenSelected?.();
          break;
        case "j":
          e.preventDefault();
          handlers.onNext?.();
          break;
        case "k":
          e.preventDefault();
          handlers.onPrev?.();
          break;
        case "x":
          e.preventDefault();
          handlers.onToggleSelect?.();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}
