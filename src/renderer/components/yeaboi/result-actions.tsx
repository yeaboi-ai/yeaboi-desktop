'use client';

// Export, Share and Anonymize — the three actions every result screen carries.
//
// One component rather than three copies per page: they take the same artifact
// reference, they open the same way, and a mode that grew its own copy of any
// of them would be the mode whose Share dialog forgets to say the link expired.
//
// Anonymize is deliberately NOT a state this component owns: the page has to
// mask what it is drawing, so the replacement map is handed up and the page
// applies it with `maskText`. A mask is a view over the same data, never a
// second copy of it.

import { useEffect, useState } from 'react';
import { Download, EyeOff, Share2, SlidersHorizontal, Undo2 } from 'lucide-react';
import { quip } from '@/lib/yeaboi/ambience';
import {
  type AnonLine,
  type AnonState,
  type ArtifactRef,
  type Destination,
  type KindCapability,
  type ShareSnapshot,
  anonymizeArtifact,
  closeShare,
  discardShareEdits,
  emptyAnon,
  exportArtifact,
  loadDestinations,
  loadKindCapabilities,
  loadShare,
  loadShares,
  reduceAnon,
  shareInvite,
  startShare,
} from '@/lib/yeaboi/boards';
import { Button } from '@/components/ui/button';

type Dialog = '' | 'export' | 'share' | 'anonymize';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <h2 className="text-[13px] font-body font-medium text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

export interface ResultActionsProps {
  /** What these actions act on. */
  refer: ArtifactRef;
  /** The mode whose export folder and palette this belongs to. */
  mode: string;
  /** Mode-specific extra destinations (e.g. "jira" on a poker session). */
  extras?: string[];
  /** Non-empty while the page is showing masked data. */
  anonNote?: string;
  /** Handed the replacement map, or null to revert to the real names. */
  onAnonymize?: (replacements: [string, string][], note: string) => void;
}

export function ResultActions({
  refer,
  mode,
  extras = [],
  anonNote = '',
  onAnonymize,
}: ResultActionsProps) {
  const [dialog, setDialog] = useState<Dialog>('');
  const [message, setMessage] = useState('');
  const [can, setCan] = useState<KindCapability | null>(null);

  useEffect(() => {
    // Which actions this kind supports is the backend's answer, not a table
    // kept here: a poker session exports and nothing else, and a button that
    // always refuses is worse than no button.
    loadKindCapabilities().then(
      (body) => setCan(body.kinds.find((row) => row.kind === refer.kind) ?? null),
      () => undefined,
    );
  }, [refer.kind]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {can?.export && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog(dialog === 'export' ? '' : 'export')}
          >
            <Download data-icon="inline-start" />
            Export
          </Button>
        )}
        {can?.share && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog(dialog === 'share' ? '' : 'share')}
          >
            <Share2 data-icon="inline-start" />
            Share online
          </Button>
        )}
        {can?.anonymize &&
          onAnonymize &&
          (anonNote ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialog(dialog === 'anonymize' ? '' : 'anonymize')}
              >
                <SlidersHorizontal data-icon="inline-start" />
                Adjust
              </Button>
              <Button variant="outline" size="sm" onClick={() => onAnonymize([], '')}>
                <Undo2 data-icon="inline-start" />
                Revert
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialog(dialog === 'anonymize' ? '' : 'anonymize')}
            >
              <EyeOff data-icon="inline-start" />
              Anonymize
            </Button>
          ))}
      </div>
      {anonNote && <p className="text-[12px] text-muted-foreground italic">{anonNote}</p>}
      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}
      {dialog === 'export' && (
        <ExportDialog
          refer={refer}
          mode={mode}
          extras={extras}
          onDone={(text) => {
            setMessage(text);
            setDialog('');
          }}
        />
      )}
      {dialog === 'share' && <ShareDialog refer={refer} onClose={() => setDialog('')} />}
      {dialog === 'anonymize' && (
        <AnonymizeDialog
          refer={refer}
          onDone={(replacements, note) => {
            onAnonymize?.(replacements, note);
            setDialog('');
          }}
          onCancel={() => setDialog('')}
        />
      )}
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────

function ExportDialog({
  refer,
  mode,
  extras,
  onDone,
}: {
  refer: ArtifactRef;
  mode: string;
  extras: string[];
  onDone: (message: string) => void;
}) {
  const [destinations, setDestinations] = useState<Destination[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadDestinations(mode, extras).then(
      (body) => setDestinations(body.destinations),
      (e: Error) => setError(e.message),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- extras is a per-mode constant
  }, [mode]);

  async function send(destination: Destination) {
    setBusy(destination.key);
    setError('');
    try {
      const result = await exportArtifact(refer, destination.key);
      if (destination.local && result.markdown !== undefined) {
        // The clipboard belongs to whoever is in front of the screen, not to a
        // background process — the backend hands over the text and stops there.
        await navigator.clipboard.writeText(result.markdown);
        quip('export_done');
        onDone('Copied the Markdown to your clipboard.');
        return;
      }
      quip('export_done');
      onDone(result.message ?? 'Exported.');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  }

  return (
    <Panel title="Choose export destination">
      {error && <Notice title="Export failed" items={[error]} />}
      {!destinations && <p className="text-[13px] text-muted-foreground">Loading…</p>}
      <ul className="space-y-2">
        {(destinations ?? []).map((destination) => (
          <li key={destination.key} className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(busy) || Boolean(destination.blocked)}
              onClick={() => void send(destination)}
            >
              {busy === destination.key ? 'Sending…' : destination.label}
            </Button>
            <span className="text-[11px] text-muted-foreground">
              {destination.blocked || destination.description}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ── Share ──────────────────────────────────────────────────────────────────

function ShareDialog({ refer, onClose }: { refer: ArtifactRef; onClose: () => void }) {
  const [share, setShare] = useState<ShareSnapshot | null>(null);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Rejoin the share this artifact already has rather than opening a second
    // one: the session lives in the backend precisely so a reload does not
    // strand a tunnel.
    loadShares().then(
      (body) => {
        const open = body.shares.find(
          (row) => row.kind === refer.kind && row.session_id === (refer.session_id ?? ''),
        );
        if (open) setShare(open);
      },
      () => undefined,
    );
  }, [refer.kind, refer.session_id]);

  // Poll while the link is still coming up: setup is a binary download plus an
  // edge handshake, and the page has nothing to show until it lands.
  useEffect(() => {
    if (
      !share ||
      share.link.state === 'ready' ||
      share.link.state === 'failed' ||
      share.link.state === 'off'
    )
      return;
    const timer = setInterval(() => {
      loadShare(share.share_id).then(setShare, () => undefined);
    }, 1500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the polled pair
  }, [share?.share_id, share?.link.state]);

  useEffect(() => {
    if (!share || share.link.state !== 'ready') return;
    shareInvite(share.share_id).then(
      (body) => setInvite(body.invite),
      () => undefined,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the polled pair
  }, [share?.share_id, share?.link.state]);

  async function begin() {
    setBusy(true);
    setError('');
    try {
      setShare(await startShare(refer));
      quip('link_ready');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function stop(commit: boolean) {
    if (!share) return;
    setBusy(true);
    const result = await closeShare(share.share_id, commit);
    setBusy(false);
    setMessage(result.message);
    setShare(null);
    onClose();
  }

  async function discard() {
    if (!share) return;
    const result = await discardShareEdits(share.share_id);
    setMessage(result.message);
    setShare(result.share);
  }

  if (!share) {
    return (
      <Panel title="Share this output online">
        <p className="text-[12px] text-muted-foreground mb-3">
          Anyone with the temporary URL and the access code can read this while the share is open.
        </p>
        {error && <Notice title="Could not start the share" items={[error]} />}
        {message && <p className="text-[12px] text-muted-foreground mb-3">{message}</p>}
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => void begin()}>
            {busy ? 'Starting…' : 'Start sharing'}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={`Sharing — ${share.title}`}>
      {/* The link's own notice wins over everything else on this card: it is
          only non-empty for an expiry, and once a quick tunnel expires the
          invite already sent to everyone is permanently dead. */}
      {share.link.notice && <Notice title="Secure link" items={[share.link.notice]} />}
      <p className="text-[12px] text-muted-foreground mt-2">{share.link.status}</p>
      {share.link.state === 'ready' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-3">
            <div className="rounded-xl bg-secondary/40 px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Public URL
              </p>
              <p className="text-[12px] font-mono text-foreground break-all">{share.share_url}</p>
            </div>
            <div className="rounded-xl bg-secondary/40 px-3 py-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                Access code
              </p>
              <p className="text-[12px] font-mono text-foreground">{share.display_code}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!invite}
            onClick={() => void navigator.clipboard.writeText(invite)}
          >
            Copy invite
          </Button>
        </>
      ) : (
        <p className="text-[12px] text-muted-foreground mt-1">
          The access code is already live; the link takes a few seconds.
        </p>
      )}
      {share.editable && (
        <p className="text-[12px] text-muted-foreground mt-3">
          {share.edits
            ? `${share.edits} ${share.edits === 1 ? 'correction' : 'corrections'} by ${share.editors.length || 'someone'}.`
            : 'Teammates can correct what the run got wrong.'}
        </p>
      )}
      {share.edits > 0 && (
        <div className="mt-2">
          <Button variant="outline" size="sm" onClick={() => void discard()}>
            Discard edits
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {/* Keeping somebody else's corrections is the host's decision, so the
            two ways to stop are two buttons rather than one and a default. */}
        {share.edits > 0 && (
          <Button size="sm" disabled={busy} onClick={() => void stop(true)}>
            Keep {share.edits === 1 ? 'the correction' : 'the corrections'} &amp; stop
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void stop(false)}>
          Stop sharing
        </Button>
      </div>
    </Panel>
  );
}

// ── Anonymize ──────────────────────────────────────────────────────────────

function AnonymizeDialog({
  refer,
  onDone,
  onCancel,
}: {
  refer: ArtifactRef;
  onDone: (replacements: [string, string][], note: string) => void;
  onCancel: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [state, setState] = useState<AnonState>(emptyAnon());
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    let next = emptyAnon();
    setState(next);
    try {
      await anonymizeArtifact(refer, instruction, (line: AnonLine) => {
        next = reduceAnon(next, line);
        setState(next);
      });
    } catch (e) {
      next = { ...next, error: (e as Error).message, finished: true };
      setState(next);
    }
    setBusy(false);
    if (!next.error) {
      quip('anonymize_done');
      onDone(next.replacements, next.note);
    }
  }

  return (
    <Panel title="Anonymize this output">
      <p className="text-[12px] text-muted-foreground mb-3">
        Names, tickets and identifiers are replaced with stable placeholders. Review before sharing
        — a mask is a starting position, not a guarantee.
      </p>
      <label className="block mb-3">
        <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
          Also mask … · don&apos;t mask … (it&apos;s public/safe)
        </span>
        <input
          type="text"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </label>
      {state.phases.length > 0 && (
        <p className="text-[12px] text-muted-foreground mb-2">
          {state.phases[state.phases.length - 1]}
        </p>
      )}
      {state.error && <Notice title="Anonymize failed" items={[state.error]} />}
      {state.warnings.length > 0 && <Notice title="Notices" items={state.warnings} />}
      <div className="flex items-center gap-2 mt-2">
        <Button size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? 'Masking…' : 'Mask'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}
