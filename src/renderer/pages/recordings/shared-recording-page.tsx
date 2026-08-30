'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Film, Loader2 } from 'lucide-react';

interface PublicRecording {
  id: string;
  duration_seconds: number | null;
  ended_at: string | null;
  expires_at: string | null;
  playback_url: string | null;
}

// The desktop's backend origin comes from main via the auth payload —
// there is no build-time env. These pages are share-token authed, so the
// origin is all they need.
import { getAuth } from '@/lib/api-base';
let API_BASE = '';
void getAuth().then((auth) => {
  if (auth) API_BASE = auth.apiUrl;
});

function formatDuration(s: number | null): string {
  if (s == null || s < 0) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/**
 * Public, anonymous recording viewer. The share token is the only auth.
 * Mirrors the /clip/[token] pattern — no fetch credentials, no expiry/share
 * controls, only play/pause/seek through the native <video> element.
 */
export default function PublicRecordingPage() {
  const { token } = useParams<{ token: string }>();
  const [rec, setRec] = useState<PublicRecording | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await getAuth();
        const resp = await fetch(`${auth?.apiUrl ?? API_BASE}/api/recordings/public/${token}`);
        if (cancelled) return;
        if (resp.status === 404) {
          setError("This recording link doesn't exist or was revoked.");
          return;
        }
        if (resp.status === 410) {
          setError('This recording has expired.');
          return;
        }
        if (resp.status === 409) {
          setError('This recording is still being processed. Try again in a minute.');
          return;
        }
        if (!resp.ok) {
          setError(`Couldn't load recording (${resp.status}).`);
          return;
        }
        const data = (await resp.json()) as PublicRecording;
        setRec(data);
      } catch {
        if (!cancelled) setError("Couldn't load recording.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

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
          <p className="text-sm text-foreground">{error}</p>
        </div>
      </div>
    );
  }
  if (!rec || !rec.playback_url) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border px-6 py-4 flex items-center gap-3">
        <Film className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-sm font-semibold">Shared recording</h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDuration(rec.duration_seconds)}
        </span>
      </header>
      <main className="flex-1 flex items-center justify-center bg-black p-6">
        <video
          src={rec.playback_url}
          controls
          autoPlay={false}
          controlsList="nodownload"
          className="max-w-full max-h-full rounded-lg shadow-2xl"
        />
      </main>
    </div>
  );
}
