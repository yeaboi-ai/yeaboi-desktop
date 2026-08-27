// Native notifications — the one way this app can reach you with the window
// shut. The duck's bubble only exists while you are looking at the desktop, and
// a toast only exists while you are looking at the app.
//
// Everything that arrives here has already been decided elsewhere: the renderer
// names the moment (duck-events.ts) and the awareness feed names the notice.
// The words and their clamps live in ../shared/notices, which is what the tests
// read — this file imports `electron`, and nothing tested may.

import { Notification } from 'electron';
import type { NoticeBanner } from '../shared/notices';

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
