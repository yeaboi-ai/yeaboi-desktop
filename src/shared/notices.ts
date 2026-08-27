// What a native banner says, and the clamps it says it within.
//
// Pure — no Electron — because CI runs with ELECTRON_SKIP_BINARY_DOWNLOAD=1 and
// importing `electron` there throws. A tested module must not reach it.

/** Titles for the awareness feed's kinds. Anything unknown gets the app's own
 *  name rather than a blank banner. */
const NOTICE_TITLES: Record<string, string> = {
  ceremony_ran: 'Ceremony finished',
  ceremony_failed: 'Ceremony failed',
  ship_gate: 'A diff needs you',
};

export function noticeTitle(kind: string): string {
  return NOTICE_TITLES[kind] ?? 'yeaboi';
}

export interface NoticeBanner {
  title: string;
  body: string;
  route: string;
}

/** Same clamps the pet bubble already applies to a renderer-supplied quip. */
export function clampBanner(raw: unknown): NoticeBanner | null {
  const n = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = typeof n['title'] === 'string' ? n['title'].slice(0, 80) : '';
  if (!title) return null;
  return {
    title,
    body: typeof n['body'] === 'string' ? n['body'].slice(0, 200) : '',
    route: typeof n['route'] === 'string' ? n['route'].slice(0, 200) : '',
  };
}
