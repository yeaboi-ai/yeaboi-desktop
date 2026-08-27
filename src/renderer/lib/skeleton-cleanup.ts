type Node = {
  id?: string;
  type?: string;
  data?: { _filled?: boolean; _runId?: string } & Record<string, unknown>;
};

export const SKELETON_STALE_MS = 30_000;

export function pruneStaleSkeletons<T extends Node>(
  nodes: T[],
  activeRuns: Map<string, number>,
  now: number,
  staleMs: number = SKELETON_STALE_MS,
): T[] {
  return nodes.filter((n) => {
    const isUnfilledSkeleton =
      typeof n.id === 'string' &&
      n.id.startsWith('__skeleton') &&
      n.type === 'wirescreen' &&
      !n.data?._filled;
    if (!isUnfilledSkeleton) return true;
    const skelRunId = n.data?._runId;
    if (!skelRunId) return false;
    const lastActivity = activeRuns.get(skelRunId);
    if (!lastActivity) return false;
    if (now - lastActivity > staleMs) {
      activeRuns.delete(skelRunId);
      return false;
    }
    return true;
  });
}
