// The radio streams' one requirement of the window: no referrer. SomaFM
// refuses a media request whose Referer it does not recognise, and every
// window sends one. Scoped to the station hosts so nothing else changes.

import { session } from 'electron';
import { radioRequestHeaders, radioUrlPatterns } from '../shared/music';

export function registerRadioHeaders(): void {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: radioUrlPatterns() },
    (details, callback) => {
      callback({ requestHeaders: radioRequestHeaders(details.requestHeaders) });
    },
  );
}
