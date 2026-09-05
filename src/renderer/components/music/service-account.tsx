'use client';

// Where a service's account stands, as a card on the Music page: Sign in, or
// the setup that has to come first when this build carries no OAuth app of
// yeaboi's own — the vendor's console, the client to paste, and then the
// sign-in. Signed in, it shrinks to a line with Sign out. In the catalogue
// sheet it is the line only: the sheet already renders the client fields.
//
// The sign-in opens the vendor in the browser and polls the backend until it
// lands; the catalogue is then re-read so every surface learns at once.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Copy, LogOut } from 'lucide-react';
import { SERVICE_LABELS, type MusicService } from '@shared/music-links';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { ServiceMark } from '@/components/music/service-mark';
import { accountFeatures } from '@/lib/music/account';
import { catalogueChanged } from '@/lib/music/catalogue-changed';
import { cancelSignIn, signInStatus, signOut, startSignIn } from '@/lib/yeaboi/music';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

const POLL_MS = 1_500;
/** Where the backend's callback listener answers; the vendor must know it. */
const REDIRECT_URI = 'http://127.0.0.1:8643/callback/spotify';

interface Vendor {
  /** The page-card title and the sentence under it. */
  title: string;
  promise: string;
  /** The button. */
  signIn: string;
  /** The page's one line when no app exists to sign in through. */
  needs: string;
  /** Why yeaboi's own app may not do, in the catalogue. */
  why: string;
  consoleUrl: string;
  consoleLabel: string;
  steps: string[];
  redirect?: string;
}

const VENDORS: Record<Exclude<MusicService, 'apple_music'>, Vendor> = {
  spotify: {
    title: 'Browse your Spotify library',
    promise:
      'Read-only: your playlists, liked songs, albums and recently played. yeaboi never creates, follows, likes or edits anything.',
    signIn: 'Sign in to Spotify',
    needs: 'This build carries no Spotify app of its own, so the sign-in needs one you create.',
    why: "Spotify allows an unapproved app five sign-ins, and this build carries no app of yeaboi's own — so the sign-in goes through a Spotify app you create. It takes a minute.",
    consoleUrl: 'https://developer.spotify.com/dashboard',
    consoleLabel: 'Spotify developer dashboard',
    steps: [
      'Create an app, tick Web API, and add the Redirect URI below.',
      'Under User Management, add the Spotify account you will sign in with.',
      'Paste the Client ID here.',
    ],
    redirect: REDIRECT_URI,
  },
  youtube_music: {
    title: 'Browse your YouTube Music library',
    promise:
      'Read-only, through a Google sign-in: your playlists and liked videos. yeaboi never reads your watch history and writes nothing.',
    signIn: 'Sign in with Google',
    needs: 'This build carries no Google client of its own, so the sign-in needs one you create.',
    why: "Google caps an unverified app at a hundred testers, and this build carries no client of yeaboi's own — so the sign-in goes through a Google client you create. It takes a few minutes.",
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    consoleLabel: 'Google Cloud console',
    steps: [
      'In a project of yours, enable the YouTube Data API v3.',
      'On the OAuth consent screen, add your Google account as a test user.',
      'Create credentials: an OAuth client ID of type Desktop app. Paste its Client ID and Client secret into the fields above.',
    ],
  },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy the Redirect URI"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1_500);
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

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
  const vendor = service === 'apple_music' ? null : VENDORS[service];

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

  if (features.olderBackend || !vendor || (!features.signIn && !features.signedIn)) return null;

  const status = note && busy !== 'signin' && (
    <p role="status" className="basis-full text-[12.5px] text-destructive">
      {note}
    </p>
  );

  // Signed in: one line, on the page and in the sheet.
  if (features.signedIn) {
    return (
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1',
          compact ? 'text-[12px]' : 'text-[13px]',
        )}
      >
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
        {status}
      </div>
    );
  }

  const signInButton = (
    <div className="flex flex-wrap items-center gap-3">
      {busy === 'signin' ? (
        <>
          <span className="text-[13px] text-muted-foreground">{note}</span>
          <button
            type="button"
            onClick={cancel}
            className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void signIn()}
            disabled={busy !== null}
            className="rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:opacity-40"
          >
            {vendor.signIn}
          </button>
          <span className="text-[12px] text-muted-foreground">
            {features.ownClient
              ? 'Through your own app; opens in your browser.'
              : 'Opens in your browser.'}
          </span>
        </>
      )}
      {status}
    </div>
  );

  // In the catalogue sheet: the setup, or the sign-in, under the fields.
  if (compact) {
    if (!features.needsClient) return signInButton;
    return (
      <div>
        <SetupSteps vendor={vendor} />
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          Paste them into the fields above and save; Sign in appears here once they are in.
        </p>
      </div>
    );
  }

  // On the Music page: the card. The setup itself lives in the catalogue.
  return (
    <section
      aria-label={vendor.title}
      className="rounded-xl border border-border/60 bg-secondary/30 p-5"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary/70 text-foreground">
          <ServiceMark service={service} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[20px] leading-tight text-foreground">{vendor.title}</h3>
          <p className="mt-1 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
            {vendor.promise}
          </p>
          <div className="mt-4">
            {features.needsClient ? (
              <p className="max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
                {vendor.needs}{' '}
                <Link
                  href={`/settings/connections?open=${service}`}
                  className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
                >
                  Set it up in the catalog
                  <ArrowUpRight className="size-3" aria-hidden />
                </Link>
                , and Sign in appears here.
              </p>
            ) : (
              signInButton
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** The vendor's console, the steps, and the Redirect URI to paste: what has
 *  to happen before a sign-in can start when no app of yeaboi's is built in. */
export function SetupSteps({ vendor }: { vendor: Vendor }) {
  return (
    <div>
      <p className="max-w-[60ch] text-[12.5px] leading-relaxed text-foreground">{vendor.why}</p>
      <ol className="mt-2.5 max-w-[60ch] list-decimal space-y-1.5 pl-5 text-[12.5px] leading-relaxed text-muted-foreground marker:font-mono marker:text-[11px] marker:text-muted-foreground/70">
        <li>
          Open the{' '}
          <a
            href={vendor.consoleUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
          >
            {vendor.consoleLabel}
            <ArrowUpRight className="size-3" aria-hidden />
          </a>
          .
        </li>
        {vendor.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {vendor.redirect && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2">
          <span className="font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground">
            Redirect URI
          </span>
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
            {vendor.redirect}
          </code>
          <CopyButton text={vendor.redirect} />
        </div>
      )}
    </div>
  );
}
