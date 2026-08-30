'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Calendar, Clock, Copy, Film, Loader2, Share2, Trash2, X } from 'lucide-react';

import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';

interface RecordingDetail {
  id: string;
  session_id: string;
  status: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  started_at: string | null;
  ended_at: string | null;
  expires_at: string | null;
  share_token: string | null;
  share_url: string | null;
  playback_url: string | null;
  error: string | null;
}

function formatDuration(s: number | null): string {
  if (s == null || s < 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

/**
 * Authenticated player. Opens in a new tab from the session's recordings list.
 * The component fetches a fresh playback URL on mount; signed URLs from
 * LiveKit Cloud may be short-lived, so on 410/expired we render the
 * appropriate error state rather than silently failing on the <video>.
 */
export default function RecordingPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { authFetch, ready } = useAuthFetch();
  const confirm = useConfirm();
  const [rec, setRec] = useState<RecordingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    kind: 'expired' | 'missing' | 'generic';
    message: string;
  } | null>(null);

  // Track when the user is editing the expiry to keep the date input
  // controlled cleanly even when the API echoes back the persisted value.
  const [expiryDraft, setExpiryDraft] = useState<string>('');
  const [savingExpiry, setSavingExpiry] = useState(false);

  // Used to skip the abort guard when re-fetching after a mutation.
  const lastFetchedId = useRef<string | null>(null);

  const load = async (recId: string) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await authFetch(`/api/recordings/${recId}`);
      if (resp.status === 404) {
        setError({ kind: 'missing', message: "This recording doesn't exist or was deleted." });
        return;
      }
      if (resp.status === 410) {
        setError({
          kind: 'expired',
          message: 'This recording has expired and is no longer available.',
        });
        return;
      }
      if (!resp.ok) {
        setError({ kind: 'generic', message: `Couldn't load recording (${resp.status}).` });
        return;
      }
      const data = (await resp.json()) as RecordingDetail;
      setRec(data);
      setExpiryDraft(isoToDateInput(data.expires_at));
      lastFetchedId.current = recId;
    } catch {
      setError({ kind: 'generic', message: "Couldn't load recording." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !id) return;
    load(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading recording…
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center px-6">
        <div className="text-center space-y-2 max-w-md">
          <Film className="h-8 w-8 text-muted-foreground/60 mx-auto" />
          <p className="text-sm text-foreground">{error.message}</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="mt-4 px-3 py-1.5 text-xs font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
          >
            Close tab
          </button>
        </div>
      </div>
    );
  }
  if (!rec) return null;

  const isReady = rec.status === 'completed' && !!rec.playback_url;
  const shareLink = rec.share_token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/recording/${rec.share_token}`
    : null;

  const saveExpiry = async () => {
    if (!expiryDraft) return;
    setSavingExpiry(true);
    try {
      // Convert YYYY-MM-DD into an ISO datetime at end-of-day UTC.
      const iso = new Date(`${expiryDraft}T23:59:59Z`).toISOString();
      const resp = await authFetch(`/api/recordings/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expires_at: iso }),
      });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}));
        toast.warning({
          title: "Couldn't update expiry",
          description: detail.detail ?? `${resp.status}`,
        });
        return;
      }
      const data = (await resp.json()) as RecordingDetail;
      setRec((prev) => (prev ? { ...prev, expires_at: data.expires_at } : prev));
      toast.success({ title: 'Expiry updated' });
    } finally {
      setSavingExpiry(false);
    }
  };

  const toggleShare = async () => {
    if (rec.share_token) {
      const resp = await authFetch(`/api/recordings/${rec.id}/share`, { method: 'DELETE' });
      if (resp.status === 204) {
        setRec((prev) => (prev ? { ...prev, share_token: null, share_url: null } : prev));
        toast.success({ title: 'Share link revoked' });
      } else {
        toast.warning({ title: "Couldn't revoke link", description: `${resp.status}` });
      }
      return;
    }
    const resp = await authFetch(`/api/recordings/${rec.id}/share`, { method: 'POST' });
    if (resp.status !== 201) {
      toast.warning({ title: "Couldn't create link", description: `${resp.status}` });
      return;
    }
    const data = (await resp.json()) as { share_token: string; share_url: string };
    setRec((prev) =>
      prev ? { ...prev, share_token: data.share_token, share_url: data.share_url } : prev,
    );
    const fullUrl = `${window.location.origin}${data.share_url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success({ title: 'Share link copied', description: fullUrl });
    } catch {
      toast.success({ title: 'Share link created', description: fullUrl });
    }
  };

  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success({ title: 'Link copied' });
    } catch {
      toast.warning({ title: "Couldn't copy", description: shareLink });
    }
  };

  const deleteRecording = async () => {
    const ok = await confirm({
      title: 'Delete this recording?',
      message: 'This permanently removes the file and any share link.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    const resp = await authFetch(`/api/recordings/${rec.id}`, { method: 'DELETE' });
    if (resp.status === 204) {
      toast.success({ title: 'Recording deleted' });
      window.close();
    } else {
      toast.warning({ title: "Couldn't delete", description: `${resp.status}` });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Film className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">Session recording</h1>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatDuration(rec.duration_seconds)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => window.close()}
          aria-label="Close"
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 flex items-center justify-center bg-black p-6">
          {isReady ? (
            <video
              key={rec.playback_url ?? rec.id}
              src={rec.playback_url ?? undefined}
              controls
              autoPlay={false}
              className="max-w-full max-h-full rounded-lg shadow-2xl"
            />
          ) : (
            <div className="text-center text-muted-foreground space-y-2">
              <Film className="h-10 w-10 mx-auto text-muted-foreground/60" />
              <p className="text-sm">
                {rec.status === 'starting' || rec.status === 'active'
                  ? 'Recording is still in progress — check back when the call ends.'
                  : rec.status === 'failed'
                    ? `Recording failed${rec.error ? `: ${rec.error}` : '.'}`
                    : "Recording isn't available."}
              </p>
            </div>
          )}
        </section>

        <aside className="w-80 max-w-[36vw] border-l border-border bg-card p-5 space-y-5 overflow-y-auto">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium">
              Recorded
            </p>
            <p className="text-[13px] text-foreground">
              {rec.started_at ? new Date(rec.started_at).toLocaleString() : '—'}
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Expires
            </p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={expiryDraft}
                onChange={(e) => setExpiryDraft(e.target.value)}
                className="flex-1 bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[12px] text-foreground focus:outline-none focus:border-ring"
              />
              <button
                type="button"
                onClick={saveExpiry}
                disabled={
                  savingExpiry || !expiryDraft || expiryDraft === isoToDateInput(rec.expires_at)
                }
                className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              The recording is auto-deleted after this date.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium flex items-center gap-1.5">
              <Share2 className="h-3 w-3" />
              Share link
            </p>
            {shareLink ? (
              <>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareLink}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="flex-1 bg-muted border border-border rounded-lg px-2.5 py-1.5 text-[11px] text-foreground/70 font-mono"
                  />
                  <button
                    type="button"
                    onClick={copyShareLink}
                    aria-label="Copy share link"
                    className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={toggleShare}
                  className="text-[11px] text-rose-300/80 hover:text-rose-300 transition-colors"
                >
                  Revoke link
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={toggleShare}
                disabled={!isReady}
                className="w-full px-3 py-1.5 text-[12px] font-medium rounded-lg bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Create public link
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-border space-y-2 text-[11px] text-muted-foreground">
            {rec.duration_seconds != null && (
              <p className="flex items-center gap-1.5">
                <Clock className="h-3 w-3" />
                {formatDuration(rec.duration_seconds)} duration
              </p>
            )}
            {rec.file_size_bytes != null && (
              <p>{(rec.file_size_bytes / 1_048_576).toFixed(1)} MB</p>
            )}
          </div>

          <button
            type="button"
            onClick={deleteRecording}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20 hover:bg-rose-500/20 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete recording
          </button>
        </aside>
      </main>
    </div>
  );
}
