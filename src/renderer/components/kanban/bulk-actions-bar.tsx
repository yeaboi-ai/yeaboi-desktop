"use client";

import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BoardColumn } from "@/hooks/use-board";

interface Props {
  count: number;
  columns: BoardColumn[];
  onMoveTo: (columnId: string) => Promise<void>;
  onSetPriority: (priority: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClear: () => void;
}

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export function BulkActionsBar({
  count,
  columns,
  onMoveTo,
  onSetPriority,
  onDelete,
  onClear,
}: Props) {
  const [busy, setBusy] = useState(false);
  if (count === 0) return null;

  const wrap = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-full border border-border bg-popover/95 backdrop-blur shadow-lg px-3 py-2 text-sm"
    >
      <span className="text-muted-foreground px-1">
        {count} card{count === 1 ? "" : "s"} selected
      </span>

      <select
        className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        defaultValue=""
        disabled={busy}
        onChange={async (e) => {
          if (!e.target.value) return;
          const value = e.target.value;
          e.currentTarget.value = "";
          await wrap(() => onMoveTo(value));
        }}
      >
        <option value="" disabled>
          Move to…
        </option>
        {columns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize"
        defaultValue=""
        disabled={busy}
        onChange={async (e) => {
          if (!e.target.value) return;
          const value = e.target.value;
          e.currentTarget.value = "";
          await wrap(() => onSetPriority(value));
        }}
      >
        <option value="" disabled>
          Priority…
        </option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => wrap(onDelete)}
        aria-label="Delete selected"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </Button>

      <Button variant="ghost" size="sm" onClick={onClear} aria-label="Clear selection">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
