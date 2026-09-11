'use client';

import { useCallback, useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

export interface SnapshotListItem {
  id: string;
  version_number: number;
  iteration_id: string | null;
  session_id: string | null;
  created_by: string;
  created_by_label: string;
  changed_sections: string[];
  created_at: string;
}

export interface SnapshotDetail {
  id: string;
  project_id: string;
  version_number: number;
  iteration_id: string | null;
  session_id: string | null;
  content: Record<string, string>;
  created_by: string;
  created_by_label: string;
  diff_from_previous: Record<string, { old: string; new: string }> | null;
  section_sources: Record<string, string> | null;
  created_at: string;
}

interface UseBlueprintHistoryArgs {
  projectId: string;
  iterationId: string | null;
  /** Bump this when the parent's session WS receives a `blueprint_update`
   *  event so the drawer reloads the list automatically. */
  invalidationToken?: number | string;
  /** Page size — defaults to 50. */
  pageSize?: number;
  /** When true, the hook performs initial + invalidation fetches. Default
   *  matches "drawer is open" semantics so closed drawers don't poll. */
  enabled?: boolean;
}

interface UseBlueprintHistoryReturn {
  snapshots: SnapshotListItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedDetail: SnapshotDetail | null;
  selectedLoading: boolean;
  /** Restore the given snapshot. On success, list is refreshed and the
   *  caller's `onRestored` is invoked with the new version number. */
  restore: (
    snapshotId: string,
    opts?: { onRestored?: (newVersion: number) => void },
  ) => Promise<void>;
  restoring: boolean;
}

const TAG = '[blueprint-history]';

export function useBlueprintHistory({
  projectId,
  iterationId,
  invalidationToken,
  pageSize = 50,
  enabled = true,
}: UseBlueprintHistoryArgs): UseBlueprintHistoryReturn {
  const { authFetch, ready } = useAuthFetch();
  const [snapshots, setSnapshots] = useState<SnapshotListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailCache, setDetailCache] = useState<Record<string, SnapshotDetail>>({});
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchPage = useCallback(
    async (beforeVersion: number | null) => {
      if (!ready || !projectId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: String(pageSize) });
        if (iterationId) params.set('iteration_id', iterationId);
        if (beforeVersion !== null) params.set('before_version', String(beforeVersion));
        const resp = await authFetch(
          `/api/sessions/${projectId}/blueprint/snapshots?${params.toString()}`,
        );
        if (!resp.ok) {
          setError(`Failed to load history (${resp.status})`);
          return;
        }
        const page: SnapshotListItem[] = await resp.json();
        setSnapshots((prev) => (beforeVersion === null ? page : [...prev, ...page]));
        setHasMore(page.length === pageSize);
      } catch (e) {
        logger.warn(TAG, 'list fetch failed', e);
        setError('Network error loading history');
      } finally {
        setLoading(false);
      }
    },
    [authFetch, ready, projectId, iterationId, pageSize],
  );

  // Initial load + invalidation refetch.
  useEffect(() => {
    if (!enabled) return;
    fetchPage(null);
  }, [enabled, fetchPage, invalidationToken]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore || snapshots.length === 0) return;
    const oldest = snapshots[snapshots.length - 1].version_number;
    fetchPage(oldest);
  }, [loading, hasMore, snapshots, fetchPage]);

  const refresh = useCallback(() => {
    fetchPage(null);
  }, [fetchPage]);

  const fetchDetail = useCallback(
    async (id: string) => {
      if (!ready || !projectId) return;
      if (detailCache[id]) return; // cached
      setSelectedLoading(true);
      try {
        const resp = await authFetch(`/api/sessions/${projectId}/blueprint/snapshots/${id}`);
        if (!resp.ok) {
          logger.warn(TAG, 'detail fetch failed', { id, status: resp.status });
          return;
        }
        const detail: SnapshotDetail = await resp.json();
        setDetailCache((prev) => ({ ...prev, [id]: detail }));
      } catch (e) {
        logger.warn(TAG, 'detail fetch error', e);
      } finally {
        setSelectedLoading(false);
      }
    },
    [authFetch, ready, projectId, detailCache],
  );

  // Auto-load detail when selection changes.
  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  const restore = useCallback(
    async (snapshotId: string, opts?: { onRestored?: (newVersion: number) => void }) => {
      if (!ready || !projectId) return;
      setRestoring(true);
      try {
        const resp = await authFetch(`/api/sessions/${projectId}/blueprint/restore/${snapshotId}`, {
          method: 'POST',
        });
        if (!resp.ok) {
          const detail = await resp.json().catch(() => ({}));
          setError(detail.detail || `Restore failed (${resp.status})`);
          return;
        }
        const newSnap = await resp.json();
        opts?.onRestored?.(newSnap.version_number);
        // Refresh list — the new snapshot should appear at the top, and the
        // backend's broadcast already updated the live blueprint state.
        await fetchPage(null);
      } catch (e) {
        logger.warn(TAG, 'restore error', e);
        setError('Network error during restore');
      } finally {
        setRestoring(false);
      }
    },
    [authFetch, ready, projectId, fetchPage],
  );

  const selectedDetail = selectedId ? detailCache[selectedId] || null : null;

  return {
    snapshots,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    selectedId,
    setSelectedId,
    selectedDetail,
    selectedLoading,
    restore,
    restoring,
  };
}
