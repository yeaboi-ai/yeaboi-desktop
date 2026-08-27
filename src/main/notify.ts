// Native notifications — the one way this app can reach you with the window
// shut. The duck's bubble only exists while you are looking at the desktop, and
// a toast only exists while you are looking at the app.
//
// Everything that arrives here has already been decided elsewhere: the renderer
// names the moment (duck-events.ts) and the awareness feed names the notice.
// This clamps it and hands it to the OS.

import { Notification } from 'electron';

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

export class Notifier {
  constructor(private readonly onOpen: (route: string) => void) {}

  /** Post a banner. A platform without notification support is not an error —
   *  the duck and the toast are still saying it. */
  post(banner: NoticeBanner): void {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title: banner.title, body: banner.body });
    notification.on('click', () => this.onOpen(banner.route));
    notification.show();
  }
}
