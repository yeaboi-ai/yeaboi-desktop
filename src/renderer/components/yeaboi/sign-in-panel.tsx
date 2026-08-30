'use client';

// The subscription sign-in bubble: drives `claude setup-token` on the backend
// a poll at a time. The token never reaches this renderer — the backend
// persists it and only says that it did.

import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  type SignInStatus,
  signInCancel,
  signInCode,
  signInStart,
  signInStatus,
} from '@/lib/yeaboi/settings';
import { Button } from '@/components/ui/button';

const POLL_MS = 1000;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in with your Claude subscription"
        className="w-[480px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
      >
        {children}
      </div>
    </div>
  );
}

export function SignInPanel({ onClose }: { onClose: (saved: boolean, message: string) => void }) {
  const [status, setStatus] = useState<SignInStatus | null>(null);
  const [startError, setStartError] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  // Outlives StrictMode's simulated unmount, so the effect's second run polls
  // the session the first run started instead of spawning a second
  // `claude setup-token` (which cancels the first and opens the browser twice).
  const started = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const beginPolling = () => {
      timer = setInterval(() => {
        signInStatus().then(
          (s) => {
            if (!alive) return;
            setStatus(s);
            if (s.done && timer) clearInterval(timer);
          },
          () => undefined,
        );
      }, POLL_MS);
    };
    if (started.current) {
      beginPolling();
    } else {
      started.current = true;
      signInStart().then(
        (result) => {
          if (!alive) return;
          if (!result.started) {
            setStartError(result.message || 'Sign-in could not start');
            return;
          }
          beginPolling();
        },
        (e: Error) => {
          if (alive) setStartError(e.message);
        },
      );
    }
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, []);

  const cancel = () => {
    void signInCancel();
    onClose(false, 'Sign-in cancelled');
  };

  if (startError) {
    return (
      <Shell>
        <p className="text-[13px] text-destructive">{startError}</p>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => onClose(false, startError)}>
            Close
          </Button>
        </div>
      </Shell>
    );
  }

  if (status?.done) {
    const ok = Boolean(status.ok);
    return (
      <Shell>
        <div className="flex flex-col items-center py-3 text-center">
          <span
            aria-hidden
            className={`flex h-12 w-12 items-center justify-center rounded-full ring-1 ${
              ok
                ? 'bg-success/10 text-success ring-success/30'
                : 'bg-destructive/10 text-destructive ring-destructive/30'
            }`}
          >
            {ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </span>
          <h3 className="mt-4 text-[15px] font-body font-medium text-foreground">
            {ok ? 'Signed in' : "Sign-in didn't complete"}
          </h3>
          <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
            {ok
              ? 'Your Claude subscription now powers the duck. The token is saved on this machine and never shown.'
              : (status.message ??
                'Something went wrong — try again, or paste an API key instead.')}
          </p>
          <Button
            autoFocus
            className="mt-6 px-7"
            onClick={() => onClose(Boolean(status.saved), status.message ?? '')}
          >
            Done
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-[13px] text-muted-foreground leading-snug">
        Sign in with your Claude subscription. A browser window opens; approve the request and paste
        the code back here if asked.
      </p>
      {status?.url ? (
        <p className="mt-3 flex items-center gap-2">
          <a
            href={status.url}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-primary hover:underline break-all"
          >
            {status.url}
          </a>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void navigator.clipboard.writeText(status.url ?? '').then(() => setCopied(true));
            }}
          >
            {copied ? 'copied' : 'copy'}
          </Button>
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground animate-pulse">starting…</p>
      )}
      {status?.awaiting_code && (
        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) {
              void signInCode(code.trim());
              setCode('');
            }
          }}
        >
          <input
            value={code}
            placeholder="paste the authorization code"
            onChange={(event) => setCode(event.target.value)}
            className="flex-1 rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <Button size="sm" type="submit">
            Submit
          </Button>
        </form>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </Shell>
  );
}
