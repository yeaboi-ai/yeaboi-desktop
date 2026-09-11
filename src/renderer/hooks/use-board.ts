'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuth } from '@/lib/api-base';

export interface CardSyncStatus {
  provider: 'jira' | 'azure_devops';
  external_id?: string | null;
  external_key: string | null;
  external_url: string | null;
  state: 'synced' | 'local_dirty' | 'remote_dirty' | 'conflict' | 'error' | 'pending';
  link_id?: string | null;
  last_synced_at?: string | null;
}

export interface AcceptanceCriterion {
  text: string;
  done: boolean;
}

// Tolerate legacy plain-string items written before the {text, done} shape landed.
export function normalizeAC(raw: unknown): AcceptanceCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === 'string') return { text: item, done: false };
    if (item && typeof item === 'object') {
      const obj = item as { text?: unknown; done?: unknown };
      return { text: String(obj.text ?? ''), done: !!obj.done };
    }
    return { text: '', done: false };
  });
}

export interface Card {
  id: string;
  column_id: string;
  position: number;
  title: string;
  description: string | null;
  priority: string | null;
  story_points: number | null;
  assignee_id: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  labels: string[];
  acceptance_criteria: AcceptanceCriterion[];
  parent_card_id: string | null;
  depends_on: string[];
  auto_approve: boolean;
  agent_status: string | null;
  agent_pr_url: string | null;
  agent_branch: string | null;
  agent_log: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
  project_id?: string;
  project_name?: string;
  session_id?: string;
  session_title?: string;

  // Phase 0 foundations.
  number?: number | null;
  friendly_id?: string | null;
  project_key?: string | null;
  template_id?: string | null;
  template_icon?: string | null;
  template_version?: number | null;
  custom_fields?: Record<string, unknown>;

  // Aggregated counts from board endpoint to avoid N+1 fetches.
  attachment_count?: number;
  link_count?: number;
  comment_count?: number;
  is_blocked?: boolean;
  sync_status?: CardSyncStatus | null;

  // Execution-order numbering. wave + sequence are persisted on the model;
  // exec_label is derived per board response (e.g. "1", "2.1", "2.2", "3").
  wave?: number | null;
  sequence?: number | null;
  exec_label?: string | null;
}

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
  wip_limit: number | null;
  // Lifecycle role flags. Used by the orchestrator and the upcoming
  // board-customization UI to know which columns play which role.
  is_start_state?: boolean;
  is_done_state?: boolean;
  agent_trigger_state?: boolean;
  agent_review_state?: boolean;
  // Hex color (#RRGGBB) for the column header accent strip. Optional.
  accent_color?: string | null;
  // Synthetic columns derived on the client (e.g. the "Blocked" virtual lane).
  // Cards in a virtual column still live in their real column server-side; the
  // column is just a different way of slicing the board for visual triage.
  virtual?: boolean;
  cards: Card[];
}

export interface ColumnCreate {
  name: string;
  position?: number;
  wip_limit?: number | null;
  is_start_state?: boolean;
  is_done_state?: boolean;
  agent_trigger_state?: boolean;
  agent_review_state?: boolean;
  accent_color?: string | null;
}

export type ColumnUpdate = Partial<ColumnCreate>;

export interface Board {
  id: string;
  project_id: string;
  columns: BoardColumn[];
  created_at: string;
}

export interface CardUpdate {
  title?: string;
  description?: string;
  priority?: string | null;
  story_points?: number | null;
  column_id?: string;
  position?: number;
  assignee_id?: string | null;
  labels?: string[];
  acceptance_criteria?: AcceptanceCriterion[];
  template_id?: string | null;
}

export interface CardCreate {
  column_id: string;
  title: string;
  description?: string;
  priority?: string;
  story_points?: number;
  labels?: string[];
  acceptance_criteria?: AcceptanceCriterion[];
}

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

export function useBoard(projectId: string | null, fetchFn?: FetchFn) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fetchFnRef = useRef<FetchFn>(fetchFn ?? fetch);
  useEffect(() => {
    fetchFnRef.current = fetchFn ?? fetch;
  }, [fetchFn]);

  const fetchBoard = useCallback(async () => {
    try {
      const url = projectId ? `/api/board-proxy?sessionId=${projectId}` : `/api/global-board-proxy`;
      const resp = await fetchFnRef.current(url);
      if (!resp.ok) throw new Error(`Failed to load board: ${resp.status}`);
      const data = (await resp.json()) as Board;
      data.columns = data.columns.map((col) => ({
        ...col,
        cards: col.cards.map((c) => ({
          ...c,
          acceptance_criteria: normalizeAC(c.acceptance_criteria),
        })),
      }));
      setBoard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // WebSocket real-time sync
  useEffect(() => {
    if (!board?.id) return;

    const setupWs = async () => {
      try {
        const auth = await getAuth(true);
        if (!auth) return;
        const token = auth.token;
        const wsHost = auth.wsUrl;
        const ws = new WebSocket(
          `${wsHost}/ws/board/${board.id}?token=${encodeURIComponent(token)}`,
        );
        wsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            handleWsEvent(msg);
          } catch {
            // ignore
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
        };
      } catch {
        // WS is best-effort
      }
    };

    setupWs();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id]);

  const handleWsEvent = useCallback((msg: { type: string; payload?: Record<string, unknown> }) => {
    if (!msg.payload) return;
    const payload = msg.payload as Partial<Card> &
      Partial<BoardColumn> & {
        order?: string[];
        reassigned_to?: string;
      };

    setBoard((prev) => {
      if (!prev) return prev;
      const cols = prev.columns.map((col) => ({ ...col, cards: [...col.cards] }));

      if (msg.type === 'card.moved' || msg.type === 'card.updated') {
        // Remove card from all columns, then place in correct column
        for (const col of cols) {
          col.cards = col.cards.filter((c) => c.id !== payload.id);
        }
        const targetCol = cols.find((c) => c.id === payload.column_id);
        if (targetCol && payload.id) {
          const card = prev.columns.flatMap((c) => c.cards).find((c) => c.id === payload.id);
          if (card) {
            const merged = { ...card, ...payload } as Card;
            if ('acceptance_criteria' in payload) {
              merged.acceptance_criteria = normalizeAC(payload.acceptance_criteria);
            }
            targetCol.cards.splice(merged.position ?? targetCol.cards.length, 0, merged);
          }
        }
      } else if (msg.type === 'card.created') {
        const targetCol = cols.find((c) => c.id === payload.column_id);
        if (targetCol && payload.id) {
          const created = { ...payload } as Card;
          created.acceptance_criteria = normalizeAC(payload.acceptance_criteria);
          targetCol.cards.push(created);
        }
      } else if (msg.type === 'card.deleted') {
        for (const col of cols) {
          col.cards = col.cards.filter((c) => c.id !== payload.id);
        }
      } else if (msg.type === 'column.created') {
        if (payload.id && !cols.some((c) => c.id === payload.id)) {
          cols.push({ ...(payload as BoardColumn), cards: [] });
          cols.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
      } else if (msg.type === 'column.updated') {
        const target = cols.find((c) => c.id === payload.id);
        if (target) {
          Object.assign(target, payload);
          cols.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        }
      } else if (msg.type === 'column.deleted') {
        const removed = cols.find((c) => c.id === payload.id);
        const fallbackId = payload.reassigned_to;
        const fallback = fallbackId ? cols.find((c) => c.id === fallbackId) : undefined;
        if (removed && fallback) {
          fallback.cards = [
            ...fallback.cards,
            ...removed.cards.map((c) => ({ ...c, column_id: fallback.id })),
          ];
        }
        const idx = cols.findIndex((c) => c.id === payload.id);
        if (idx >= 0) cols.splice(idx, 1);
      } else if (msg.type === 'column.reordered' && payload.order) {
        const orderIndex = new Map(payload.order.map((id, i) => [id, i] as const));
        for (const col of cols) {
          const next = orderIndex.get(col.id);
          if (next !== undefined) col.position = next;
        }
        cols.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      }

      return { ...prev, columns: cols };
    });
  }, []);

  const moveCard = useCallback(
    async (cardId: string, newColumnId: string, newPosition?: number) => {
      // Optimistic update
      setBoard((prev) => {
        if (!prev) return prev;
        const cols = prev.columns.map((col) => ({ ...col, cards: [...col.cards] }));
        let movedCard: Card | undefined;
        for (const col of cols) {
          const idx = col.cards.findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            [movedCard] = col.cards.splice(idx, 1);
            break;
          }
        }
        if (movedCard) {
          const targetCol = cols.find((c) => c.id === newColumnId);
          if (targetCol) {
            movedCard = { ...movedCard, column_id: newColumnId };
            const pos = newPosition ?? targetCol.cards.length;
            targetCol.cards.splice(pos, 0, movedCard);
          }
        }
        return { ...prev, columns: cols };
      });

      // Persist
      try {
        await fetchFnRef.current(`/api/cards-proxy/${cardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column_id: newColumnId, position: newPosition }),
        });
      } catch {
        // Revert on failure
        fetchBoard();
      }
    },
    [fetchBoard],
  );

  const createCard = useCallback(
    async (data: CardCreate): Promise<Card | null> => {
      try {
        const resp = await fetchFnRef.current(`/api/cards-create-proxy?boardId=${board?.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!resp.ok) throw new Error('Failed to create card');
        const card: Card = await resp.json();
        card.acceptance_criteria = normalizeAC(card.acceptance_criteria);
        setBoard((prev) => {
          if (!prev) return prev;
          const cols = prev.columns.map((col) =>
            col.id === card.column_id ? { ...col, cards: [...col.cards, card] } : col,
          );
          return { ...prev, columns: cols };
        });
        return card;
      } catch {
        return null;
      }
    },
    [board?.id],
  );

  const updateCard = useCallback(async (cardId: string, data: CardUpdate): Promise<Card | null> => {
    try {
      const resp = await fetchFnRef.current(`/api/cards-proxy/${cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error('Failed to update card');
      const updated: Card = await resp.json();
      updated.acceptance_criteria = normalizeAC(updated.acceptance_criteria);
      setBoard((prev) => {
        if (!prev) return prev;
        const cols = prev.columns.map((col) => ({
          ...col,
          cards: col.cards.map((c) => (c.id === cardId ? updated : c)),
        }));
        return { ...prev, columns: cols };
      });
      return updated;
    } catch {
      return null;
    }
  }, []);

  const deleteCard = useCallback(
    async (cardId: string): Promise<boolean> => {
      // Optimistic
      setBoard((prev) => {
        if (!prev) return prev;
        const cols = prev.columns.map((col) => ({
          ...col,
          cards: col.cards.filter((c) => c.id !== cardId),
        }));
        return { ...prev, columns: cols };
      });
      try {
        const resp = await fetchFnRef.current(`/api/cards-proxy/${cardId}`, { method: 'DELETE' });
        return resp.ok || resp.status === 204;
      } catch {
        fetchBoard();
        return false;
      }
    },
    [fetchBoard],
  );

  // ── Column mutations ───────────────────────────────────────────────────
  const createColumn = useCallback(
    async (data: ColumnCreate): Promise<BoardColumn | null> => {
      if (!board?.id) return null;
      try {
        const resp = await fetchFnRef.current(`/api/columns-proxy/${board.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!resp.ok) throw new Error('Failed to create column');
        const created: BoardColumn = await resp.json();
        setBoard((prev) =>
          prev
            ? {
                ...prev,
                columns: [...prev.columns, { ...created, cards: created.cards ?? [] }].sort(
                  (a, b) => (a.position ?? 0) - (b.position ?? 0),
                ),
              }
            : prev,
        );
        return created;
      } catch {
        return null;
      }
    },
    [board?.id],
  );

  const updateColumn = useCallback(
    async (columnId: string, data: ColumnUpdate): Promise<BoardColumn | null> => {
      if (!board?.id) return null;
      try {
        const resp = await fetchFnRef.current(`/api/columns-proxy/${board.id}/${columnId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!resp.ok) throw new Error('Failed to update column');
        const updated: BoardColumn = await resp.json();
        setBoard((prev) => {
          if (!prev) return prev;
          const next = prev.columns.map((c) =>
            c.id === columnId ? { ...c, ...updated, cards: c.cards } : c,
          );
          next.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
          return { ...prev, columns: next };
        });
        return updated;
      } catch {
        return null;
      }
    },
    [board?.id],
  );

  const deleteColumn = useCallback(
    async (columnId: string, reassignTo?: string): Promise<boolean> => {
      if (!board?.id) return false;
      try {
        const resp = await fetchFnRef.current(`/api/columns-proxy/${board.id}/${columnId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reassign_to: reassignTo ?? null }),
        });
        if (!resp.ok && resp.status !== 204) return false;
        // Refetch to reconcile reassignment positions exactly.
        await fetchBoard();
        return true;
      } catch {
        return false;
      }
    },
    [board?.id, fetchBoard],
  );

  const reorderColumns = useCallback(
    async (orderedIds: string[]): Promise<boolean> => {
      if (!board?.id) return false;
      // Optimistic reorder.
      setBoard((prev) => {
        if (!prev) return prev;
        const idx = new Map(orderedIds.map((id, i) => [id, i] as const));
        const next = prev.columns
          .map((c) => ({ ...c, position: idx.get(c.id) ?? c.position }))
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        return { ...prev, columns: next };
      });
      try {
        const resp = await fetchFnRef.current(`/api/columns-proxy/${board.id}/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ column_ids: orderedIds }),
        });
        if (!resp.ok) throw new Error('Failed to reorder');
        return true;
      } catch {
        await fetchBoard();
        return false;
      }
    },
    [board?.id, fetchBoard],
  );

  return {
    board,
    loading,
    error,
    moveCard,
    createCard,
    updateCard,
    deleteCard,
    createColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    refetch: fetchBoard,
  };
}
