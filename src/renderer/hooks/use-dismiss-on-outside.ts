"use client";

import { useEffect, type RefObject } from "react";

/**
 * Fires `onDismiss` when the user mouses-down outside `ref` OR presses ESC.
 * No-op while `active` is false so the listeners aren't attached when the
 * popover/menu they're protecting is already closed.
 *
 * Use for popovers, dropdowns, and inline editors that should close on the
 * usual "user moved on" signals.
 */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [active, ref, onDismiss]);
}
