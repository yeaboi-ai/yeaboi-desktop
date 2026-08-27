'use client';

// The "shall I set dictation up?" modal, and the install it runs.
//
// Speech recognition is an optional extra because its wheels do not exist for
// every machine — so the app ships without it and offers to fetch it the first
// time someone presses the microphone. The terminal makes the same offer from a
// one-line status bar; this has room for the whole sentence, but the answer is
// the same three: install it, not now, or never.
//
// "Never" is persisted and shared: declining here stops the terminal asking too,
// and Settings is the way back.

import { type ReactNode, useRef, useState } from 'react';
import {
  type VoiceStageLine,
  type VoiceStatus,
  cancelInstall,
  installVoice,
  setVoiceOffer,
  stageLine,
} from '@/lib/yeaboi/voice';
import { Button } from '@/components/ui/button';

export interface VoiceSetupProps {
  status: VoiceStatus;
  /** Called with the outcome: `true` once dictation can actually be used. */
  onClose: (ready: boolean, message: string) => void;
}

export function VoiceSetup({ status, onClose }: VoiceSetupProps) {
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState('');
  const [fraction, setFraction] = useState<number | null>(null);
  const opId = useRef('');

  if (status.state === 'unsupported' || status.install.blocked) {
    return (
      <Shell title="Dictation can't run here">
        <p className="text-[13px] text-muted-foreground">{status.install.blocked || status.detail}</p>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => onClose(false, '')}>
            Close
          </Button>
        </div>
      </Shell>
    );
  }

  function start(): void {
    setRunning(true);
    setLine('Setting dictation up…');
    let failure = '';
    let warning = '';
    installVoice((event: VoiceStageLine) => {
      if (event.type === 'op') opId.current = event.op_id ?? '';
      else if (event.type === 'stage') {
        setLine(stageLine(event));
        setFraction(event.fraction ?? null);
      } else if (event.type === 'error') failure = event.message ?? 'Dictation setup failed';
      else if (event.type === 'done') warning = event.warning ?? '';
    })
      .then(
        () => onClose(!failure, failure || warning),
        (error: Error) => onClose(false, error.message),
      )
      .finally(() => setRunning(false));
  }

  if (running) {
    return (
      <Shell title="Setting dictation up">
        <p className="text-[13px] text-foreground">{line}</p>
        <div
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuenow={fraction === null ? undefined : fraction * 100}
        >
          <span
            className={`block h-full rounded-full bg-primary transition-[width] ${
              fraction === null ? 'w-1/3 animate-pulse' : ''
            }`}
            style={fraction === null ? {} : { width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` }}
          />
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/70">
          This happens once. You can keep working — it runs in the background.
        </p>
        <div className="mt-4 flex justify-end">
          {/* Escape is deliberately not wired anywhere in this modal: the
              install spawns a package manager, and a stray keystroke must not
              walk away from a half-written environment. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (opId.current) void cancelInstall(opId.current);
            }}
          >
            Cancel
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title="Set dictation up?">
      <p className="text-[13px] text-muted-foreground leading-snug">
        Speaking instead of typing needs a speech engine — about {status.install.size_mb} MB,
        downloaded once. It runs entirely on this machine: nothing you say is sent anywhere.
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground/70">Takes about two minutes.</p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button size="sm" onClick={start}>
          Install
        </Button>
        <Button variant="outline" size="sm" onClick={() => onClose(false, '')}>
          Not now
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void setVoiceOffer(false);
            onClose(false, 'Dictation is off. Turn it back on in Settings → Voice Input.');
          }}
        >
          Never
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-[420px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
      >
        <h2 className="text-sm font-medium text-foreground mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
