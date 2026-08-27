import type { WizardTask } from './completion-wizard';

export type GroupedWave = [number, Array<{ task: WizardTask; idx: number }>];

/**
 * Lane header label for a wave-grouped view. The wrap-up wizard and the board
 * (when grouped by wave) call this with the wave index and the count of tasks
 * in that wave so users see identical wording in both places.
 *
 * - Wave 0: "Can start in parallel · N task(s)"
 * - Wave N>0: "N task(s) that wait on wave N-1"
 */
export function formatWaveHeader(waveIndex: number, taskCount: number): string {
  const tasks = `${taskCount} ${taskCount === 1 ? 'task' : 'tasks'}`;
  if (waveIndex <= 0) return `Can start in parallel · ${tasks}`;
  return `${tasks} that wait on wave ${waveIndex - 1}`;
}

/** Group live (non-removed) tasks by wave, sort within wave by sequence. */
export function groupTasksByWave(tasks: WizardTask[], removed: Set<number>): GroupedWave[] {
  const live = tasks.map((t, idx) => ({ task: t, idx })).filter(({ idx }) => !removed.has(idx));
  const buckets = new Map<number, Array<{ task: WizardTask; idx: number }>>();
  for (const entry of live) {
    const w = entry.task.wave ?? 0;
    if (!buckets.has(w)) buckets.set(w, []);
    buckets.get(w)!.push(entry);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.task.sequence ?? 0) - (b.task.sequence ?? 0));
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a - b);
}

/** Indices of tasks that lost a hard dependency (something they depended on was removed). */
export function findOrphanedDependents(tasks: WizardTask[], removed: Set<number>): Set<number> {
  const orphans = new Set<number>();
  tasks.forEach((t, i) => {
    if (removed.has(i)) return;
    for (const j of t.depends_on_indices || []) if (removed.has(j)) orphans.add(i);
  });
  return orphans;
}

/** Inverted map: for each task index, the indices of tasks that depend on it.
 * Used to render the "Blocks: …" line in the expanded card view. */
export function computeDependentsByIdx(tasks: WizardTask[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  tasks.forEach((t, i) => {
    for (const j of t.depends_on_indices || []) {
      const list = map.get(j) ?? [];
      list.push(i);
      map.set(j, list);
    }
  });
  return map;
}

// ─── localStorage cache for the in-progress preview ─────────────────────────
// Keyed by sessionId so a refresh / tab-close during the stories step doesn't
// throw away the AI-generated preview + the user's edits. Cleared on commit.

const STORIES_CACHE_VERSION = 1;
const storiesCacheKey = (sessionId: string) => `wizard.stories.${sessionId}`;

export type CachedStoriesPayload = {
  tasks: WizardTask[];
  templatesBySlug: Record<string, string>;
  removed: number[];
};

type StoredEnvelope = {
  v: number;
} & CachedStoriesPayload;

/** Read the cached preview for a session. Returns null on miss, version
 * mismatch, or any parse error — caller should re-fetch in that case. */
export function readCachedStories(sessionId: string): CachedStoriesPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storiesCacheKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>;
    if (parsed.v !== STORIES_CACHE_VERSION) return null;
    if (!Array.isArray(parsed.tasks)) return null;
    return {
      tasks: parsed.tasks as WizardTask[],
      templatesBySlug: (parsed.templatesBySlug ?? {}) as Record<string, string>,
      removed: Array.isArray(parsed.removed) ? (parsed.removed as number[]) : [],
    };
  } catch {
    return null;
  }
}

/** Write the cached preview for a session. Best-effort — silently swallows
 * QuotaExceededError so a full localStorage doesn't break the wizard. */
export function writeCachedStories(sessionId: string, payload: CachedStoriesPayload): void {
  if (typeof window === 'undefined') return;
  try {
    const envelope: StoredEnvelope = { v: STORIES_CACHE_VERSION, ...payload };
    window.localStorage.setItem(storiesCacheKey(sessionId), JSON.stringify(envelope));
  } catch (err) {
    // Quota / disabled storage / serialization. Not worth interrupting flow.
    console.warn('writeCachedStories failed:', err);
  }
}

/** Clear the cached preview. Called after a successful commit (cards are
 * persisted server-side now) or when the user clicks Regenerate. */
export function clearCachedStories(sessionId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storiesCacheKey(sessionId));
  } catch {
    // ignore
  }
}
