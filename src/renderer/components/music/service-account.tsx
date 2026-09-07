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

interface Step {
  text: string;
  link?: { label: string; url: string };
}

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
  /** The walkthrough, one click at a time; a step may open the exact page. */
  steps: Step[];
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
    steps: [
      {
        text: 'Open the dashboard and press Create app. Any name and description will do.',
        link: {
          label: 'Spotify developer dashboard',
          url: 'https://developer.spotify.com/dashboard',
        },
      },
      {
        text: 'In the form, paste the Redirect URI below into Redirect URIs and press Add, tick Web API under "Which API/SDKs are you planning to use?", accept the terms and Save.',
      },
      {
        text: "On the app's page press Settings: the Client ID is at the top. Paste it into the field above.",
      },
      {
        text: 'Still in Settings, open User Management and add the name and email of the Spotify account you will sign in with. Without this Spotify refuses the sign-in.',
      },
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
    steps: [
      {
        text: 'Open the OAuth consent screen and configure it: External, an app name such as yeaboi, your email as the support and developer contact. Skip the scopes page. On Test users, add your own Google account: an unverified app lets only listed testers in.',
        link: {
          label: 'OAuth consent screen',
          url: 'https://console.cloud.google.com/apis/credentials/consent',
        },
      },
      {
        text: 'Open the YouTube Data API v3 in the library and press Enable.',
        link: {
          label: 'YouTube Data API v3',
          url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
        },
      },
      {
        text: 'On Credentials press Create credentials, choose OAuth client ID, set the application type to Desktop app, name it and press Create.',
        link: { label: 'Credentials', url: 'https://console.cloud.google.com/apis/credentials' },
      },
      {
        text: 'Google shows a Client ID ending in apps.googleusercontent.com and a Client secret starting with GOCSPX-. Paste both into the fields above and save.',
      },
      {
        text: 'Signing in, Google warns the app is unverified. That is the test-user path: press Continue.',
      },
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
      <ol className="mt-2.5 max-w-[60ch] list-decimal space-y-2 pl-5 text-[12.5px] leading-relaxed text-muted-foreground marker:font-mono marker:text-[11px] marker:text-muted-foreground/70">
        {vendor.steps.map((step) => (
          <li key={step.text}>
            {step.text}
            {step.link && (
              <>
                {' '}
                <a
                  href={step.link.url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-0.5 whitespace-nowrap text-primary underline-offset-4 hover:underline"
                >
                  {step.link.label}
                  <ArrowUpRight className="size-3" aria-hidden />
                </a>
              </>
            )}
          </li>
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
