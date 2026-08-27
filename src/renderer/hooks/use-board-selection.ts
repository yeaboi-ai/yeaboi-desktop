'use client';

import { useCallback, useState } from 'react';

// Tracks the set of selected card ids on the board, plus the last-clicked id so
// shift-click can extend the selection across a contiguous range. The order
// argument is the flat array of currently visible card ids (top-down across
// columns) — derived once in the parent and passed in on each call.
export function useBoardSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);

  const toggle = useCallback(
    (cardId: string, ev: React.MouseEvent, visibleOrder: string[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (ev.shiftKey && anchorId && anchorId !== cardId) {
          // Range select between anchor and current.
          const aIdx = visibleOrder.indexOf(anchorId);
          const cIdx = visibleOrder.indexOf(cardId);
          if (aIdx !== -1 && cIdx !== -1) {
            const [lo, hi] = aIdx < cIdx ? [aIdx, cIdx] : [cIdx, aIdx];
            for (let i = lo; i <= hi; i++) next.add(visibleOrder[i]);
            return next;
          }
        }
        if (next.has(cardId)) next.delete(cardId);
        else next.add(cardId);
        return next;
      });
      setAnchorId(cardId);
    },
    [anchorId],
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  return { selectedIds, toggle, clear, anchorId, setAnchorId };
}
