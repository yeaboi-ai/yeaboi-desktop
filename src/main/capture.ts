// Screenshare. In Electron, getDisplayMedia() yields nothing unless main
// installs a display-media request handler backed by desktopCapturer — so
// this module is the whole difference between the Share Screen button
// working and silently failing.
//
// The flow keeps the choice with the person: the renderer asks for the
// source list (capture:list-sources), draws its own picker, and passes the
// chosen id back (capture:pick). The pending getDisplayMedia request then
// resolves with that source. A picker dismissed without a choice denies the
// request — the browser behaviour a person expects.

import { desktopCapturer, ipcMain, session, systemPreferences } from 'electron';

interface PendingRequest {
  grant: (sourceId: string) => void;
  deny: () => void;
}

let pending: PendingRequest | null = null;

export interface CaptureSource {
  id: string;
  name: string;
  /** data: URL preview so the picker can show what each source looks like. */
  thumbnail: string;
  kind: 'screen' | 'window';
}

export function registerCapture(
  targetSession: Electron.Session,
  notifyPickerWanted: () => void,
): void {
  targetSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      // One request at a time; a second while one is open replaces it (the
      // first resolves denied) rather than queueing surprises.
      pending?.deny();
      pending = {
        grant: (sourceId) => {
          void desktopCapturer
            .getSources({ types: ['screen', 'window'] })
            .then((sources) => {
              const source = sources.find((row) => row.id === sourceId);
              if (source) callback({ video: source });
              else callback({});
            })
            .catch(() => callback({}));
        },
        deny: () => callback({}),
      };
      // Tell the renderer a picker is wanted — it opens the source list and
      // answers with capture:pick (empty id = the person dismissed it).
      notifyPickerWanted();
    },
    { useSystemPicker: false },
  );

  ipcMain.handle('capture:list-sources', async (): Promise<CaptureSource[]> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: false,
    });
    return sources.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
      kind: source.id.startsWith('screen') ? 'screen' : 'window',
    }));
  });

  ipcMain.handle('capture:pick', (_event, sourceId: unknown) => {
    if (!pending) return { ok: false, error: 'no capture request is waiting' };
    const request = pending;
    pending = null;
    if (typeof sourceId === 'string' && sourceId) request.grant(sourceId);
    else request.deny();
    return { ok: true };
  });
}

/** macOS gates the microphone and camera behind per-app TCC consent; asking
 *  up front (idempotent) beats a silent black tile mid-call. */
export async function ensureMediaAccess(): Promise<void> {
  if (process.platform !== 'darwin') return;
  for (const media of ['microphone', 'camera'] as const) {
    if (systemPreferences.getMediaAccessStatus(media) !== 'granted') {
      await systemPreferences.askForMediaAccess(media).catch(() => undefined);
    }
  }
}
