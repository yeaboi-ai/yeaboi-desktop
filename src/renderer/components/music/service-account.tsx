'use client';

// Where a service's account stands: Sign in, or the name it is signed in as
// and Sign out. The sign-in opens the vendor in the browser and polls the
// backend until it lands; the catalogue is then re-read so every surface
// learns at once. Nothing to show for Apple (its library is the Mac's) or
// against a backend that predates the sign-in.

import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, LogOut } from 'lucide-react';
import { SERVICE_LABELS, type MusicService } from '@shared/music-links';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { accountFeatures } from '@/lib/music/account';
import { catalogueChanged } from '@/lib/music/catalogue-changed';
import { cancelSignIn, signInStatus, signOut, startSignIn } from '@/lib/yeaboi/music';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const POLL_MS = 1_500;

export function ServiceAccount({
  service,
  compact = false,
}: {
  service: MusicService;
  compact?: boolean;
}) {
  const { serviceFor } = useMusicPlayer();
  const features = accountFeatures(service, serviceFor(service));
  const [busy, setBusy] = useState<'signin' | 'signout' | null>(null);
  const [note, setNote] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const label = SERVICE_LABELS[service];

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stopPolling, []);

  const signIn = async () => {
    setBusy('signin');
    setNote('');
    try {
      const started = await startSignIn(service);
      if (!started.started) {
        setNote(started.message || 'Sign-in could not start');
        setBusy(null);
        return;
      }
      // The window-open handler in main sends http(s) to the system browser.
      window.open(started.url, '_blank', 'noopener');
      setNote(`Finish signing in to ${label} in your browser…`);
      timer.current = setInterval(() => {
        signInStatus(service).then(
          (status) => {
            if (!status.active) {
              stopPolling();
              setBusy(null);
              setNote('');
              return;
            }
            if (status.done) {
              stopPolling();
              setBusy(null);
              setNote(status.ok ? '' : status.message || 'Sign-in did not complete');
              if (status.ok) catalogueChanged();
            }
          },
          () => undefined,
        );
      }, POLL_MS);
    } catch (error) {
      logger.warn('music: sign-in could not start', error);
      setNote(error instanceof Error ? error.message : 'Sign-in could not start');
      setBusy(null);
    }
  };

  const cancel = () => {
    stopPolling();
    void cancelSignIn(service).catch(() => undefined);
    setBusy(null);
    setNote('');
  };

  const leave = async () => {
    setBusy('signout');
    try {
      await signOut(service);
      catalogueChanged();
    } catch (error) {
      logger.warn('music: sign-out failed', error);
      setNote(error instanceof Error ? error.message : 'Sign-out failed');
    }
    setBusy(null);
  };

  if (features.olderBackend || (!features.signIn && !features.signedIn)) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1',
        compact ? 'text-[12px]' : 'text-[13px]',
      )}
    >
      {features.signedIn ? (
        <>
          <span className="text-muted-foreground">
            Signed in as <span className="text-foreground">{features.account || label}</span>
          </span>
          <button
            type="button"
            onClick={() => void leave()}
            disabled={busy !== null}
            className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-40"
          >
            <LogOut className="size-3" aria-hidden />
            Sign out
          </button>
        </>
      ) : busy === 'signin' ? (
        <>
          <span className="text-muted-foreground">{note}</span>
          <button
            type="button"
            onClick={cancel}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void signIn()}
          className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
        >
          Sign in to browse your {label} library
          <ArrowUpRight className="size-3" aria-hidden />
        </button>
      )}
      {note && busy !== 'signin' && (
        <p role="status" className="basis-full text-[12px] text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}
