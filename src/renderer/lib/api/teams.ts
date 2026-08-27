/**
 * Stamps a team's currently-viewed project via PATCH /api/teams/{id}/last-viewed.
 *
 * Called from the project detail page on mount (see Task 10). Debounced per
 * (team_id, project_id) pair via sessionStorage — if we stamped the same pair
 * within the last 5 minutes, skip the call.
 *
 * The server enforces team membership and same-org project. On any 4xx (403/400/404)
 * or network failure, this helper fails silently — stamping is a UX nicety, not a
 * correctness boundary, and we don't want to spam the console or block page render.
 */

const DEBOUNCE_MS = 5 * 60 * 1000;
const STAMP_KEY = "planr:last_viewed_stamped";

type StampCache = Record<string, number>;

function readCache(): StampCache {
  try {
    return JSON.parse(sessionStorage.getItem(STAMP_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: StampCache): void {
  try {
    sessionStorage.setItem(STAMP_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable — non-critical */
  }
}

/**
 * Clear the in-session stamp cache. Intended for tests.
 */
export function _resetStampCacheForTests(): void {
  try {
    sessionStorage.removeItem(STAMP_KEY);
  } catch {
    /* ignore */
  }
}

type AuthFetch = (url: string, options?: RequestInit) => Promise<Response>;

export async function stampLastViewedProject(args: {
  teamId: string;
  projectId: string;
  authFetch: AuthFetch;
}): Promise<void> {
  if (typeof window === "undefined") return; // SSR no-op

  const key = `${args.teamId}:${args.projectId}`;
  const cache = readCache();
  const last = cache[key];
  const now = Date.now();
  if (last && now - last < DEBOUNCE_MS) return;

  try {
    const res = await args.authFetch(`/api/teams/${args.teamId}/last-viewed`, {
      method: "PATCH",
      body: JSON.stringify({ project_id: args.projectId }),
    });
    if (!res.ok) {
      // 4xx (403/400/404) → do NOT cache; the client state may recover on next load
      return;
    }
    cache[key] = now;
    writeCache(cache);
  } catch {
    // Network error — don't cache; next page visit will retry
  }
}
