// Single source of truth for board view state in the URL. Filters + selected card +
// density + groupBy + search query all round-trip through the URL so that copying
// a link preserves the exact view, and saved views can be just a serialised query.

import type { BoardGroupBy, BoardSortKey } from "./preferences";

export interface BoardUrlState {
  card: string | null; // friendly_id or uuid
  q: string | null;
  priority: string | null; // comma-joined
  assignee: string | null;
  labels: string | null; // comma-joined
  density: "comfortable" | "compact" | null;
  groupBy: BoardGroupBy | null;
  sortBy: BoardSortKey | null;
}

const KEYS: (keyof BoardUrlState)[] = [
  "card",
  "q",
  "priority",
  "assignee",
  "labels",
  "density",
  "groupBy",
  "sortBy",
];

export function decodeBoardUrlState(params: URLSearchParams): BoardUrlState {
  const get = (k: string) => params.get(k) || null;
  // Accept the legacy `swimlane=` key for one release so older bookmarks /
  // saved views keep working. Coerced into the new groupBy taxonomy.
  const legacySwimlane = get("swimlane");
  const groupByRaw = get("groupBy") ?? legacySwimlane;
  return {
    card: get("card"),
    q: get("q"),
    priority: get("priority"),
    assignee: get("assignee"),
    labels: get("labels"),
    density: (get("density") as BoardUrlState["density"]) ?? null,
    groupBy: (groupByRaw as BoardGroupBy | null) ?? null,
    sortBy: (get("sortBy") as BoardSortKey | null) ?? null,
  };
}

export function encodeBoardUrlState(state: Partial<BoardUrlState>, base: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const k of KEYS) {
    const v = state[k];
    if (v == null || v === "") {
      next.delete(k);
    } else {
      next.set(k, String(v));
    }
  }
  return next;
}

export function serialiseBoardUrlState(state: Partial<BoardUrlState>): string {
  return encodeBoardUrlState(state, new URLSearchParams()).toString();
}
