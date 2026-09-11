'use client';

// Export and Share — the two ways a result leaves this screen — and the one
// decision that belongs to both: what goes out under its real name.
//
// One component rather than copies per page: they take the same artifact
// reference, they open the same way, and a mode that grew its own copy of
// either would be the mode whose Share dialog forgets to say the link expired.
//
// Masking is not a third action. It is a setting on the two, shown at the
// moment something is about to leave rather than standing beside them as a
// button you have to know to press first. And it is deliberately NOT a state
// this component owns: the page has to mask what it is drawing, so the
// replacement map is handed up and the page applies it with `maskText`. A mask
// is a view over the same data, never a second copy of it.

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

type Dialog = '' | 'export' | 'share';

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
  /** Share the width of the row this sits on, rather than taking only what the
   *  labels need. */
  fill?: boolean;
}

export function ResultActions({
  refer,
  mode,
  extras = [],
  anonNote = '',
  onAnonymize,
  fill,
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

  // Masking is not an action of its own: it is a decision about what leaves,
  // and it only matters at the moment something is about to. So it travels
  // into whichever dialog is open rather than standing beside them.
  const mask =
    can?.anonymize && onAnonymize ? (
      <MaskSetting refer={refer} anonNote={anonNote} onAnonymize={onAnonymize} />
    ) : null;

  return (
    // `flex-[2]` for the two controls it holds, so a row that shares its width
    // between its children gives this pair two shares and every button on the
    // row comes out the same width.
    <div className={fill ? 'flex-[2] space-y-3' : 'space-y-3'}>
      <div className={`flex flex-wrap items-center gap-2 ${fill ? 'w-full [&>*]:flex-1' : ''}`}>
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
      </div>
      {message && <p className="text-[12px] text-muted-foreground">{message}</p>}
      {dialog === 'export' && (
        <ExportDialog
          refer={refer}
          mode={mode}
          extras={extras}
          mask={mask}
          onDone={(text) => {
            setMessage(text);
            setDialog('');
          }}
        />
      )}
      {dialog === 'share' && (
        <ShareDialog refer={refer} mask={mask} onClose={() => setDialog('')} />
      )}
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────

function ExportDialog({
  refer,
  mode,
  extras,
  mask,
  onDone,
}: {
  refer: ArtifactRef;
  mode: string;
  extras: string[];
  /** What goes out under its real name. Above the destinations, because it is
   *  a decision about the document rather than about where it lands. */
  mask?: React.ReactNode;
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
      {mask}
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

function ShareDialog({
  refer,
  mask,
  onClose,
}: {
  refer: ArtifactRef;
  /** What goes out under its real name. Offered before the share starts: once
   *  the link is live the document behind it is already readable. */
  mask?: React.ReactNode;
  onClose: () => void;
}) {
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
        {mask}
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

// ── Masking ────────────────────────────────────────────────────────────────

/**
 * What leaves under its real name, as a line in the dialog that is about to
 * send it. Closed it says which way it currently stands; open it is the pass
 * itself.
 */
function MaskSetting({
  refer,
  anonNote,
  onAnonymize,
}: {
  refer: ArtifactRef;
  anonNote: string;
  onAnonymize: (replacements: [string, string][], note: string) => void;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="mb-4">
        <AnonymizeForm
          refer={refer}
          onDone={(replacements, note) => {
            onAnonymize(replacements, note);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-secondary/30 px-3 py-2">
      <EyeOff className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 text-[12px] text-muted-foreground">
        {anonNote || 'Names, tickets and identifiers go out as written.'}
      </span>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {anonNote ? (
            <>
              <SlidersHorizontal data-icon="inline-start" />
              Adjust
            </>
          ) : (
            'Mask names'
          )}
        </Button>
        {anonNote && (
          <Button variant="ghost" size="sm" onClick={() => onAnonymize([], '')}>
            <Undo2 data-icon="inline-start" />
            Revert
          </Button>
        )}
      </div>
    </div>
  );
}

function AnonymizeForm({
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
    <div className="rounded-xl bg-secondary/30 p-4">
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
    </div>
  );
}
