'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface ClipLine {
  ts: string | null;
  speaker: string | null;
  text: string;
}

interface ClipData {
  id: string;
  title: string | null;
  transcript: ClipLine[];
  start_ts: string | null;
  end_ts: string | null;
  created_at: string | null;
}

// The desktop's backend origin comes from main via the auth payload —
// there is no build-time env. These pages are share-token authed, so the
// origin is all they need.
import { getAuth } from '@/lib/api-base';
let API_BASE = '';
void getAuth().then((auth) => {
  if (auth) API_BASE = auth.apiUrl;
});

/**
 * W6.6.2 — Public clip viewer. The share token is the only auth.
 * Renders the transcript snapshot inline; no audio playback in this cut.
 */
export default function PublicClipPage() {
  const { token } = useParams<{ token: string }>();
  const [clip, setClip] = useState<ClipData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await getAuth();
        const resp = await fetch(`${auth?.apiUrl ?? API_BASE}/api/clips/${token}`);
        if (cancelled) return;
        if (!resp.ok) {
          setError(
            resp.status === 404
              ? "This clip doesn't exist or was removed."
              : `Error ${resp.status}`,
          );
          return;
        }
        const data = (await resp.json()) as ClipData;
        setClip(data);
      } catch {
        if (!cancelled) setError("Couldn't load this clip.");
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
      <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center">
        Loading clip…
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-background text-muted-foreground flex items-center justify-center">
        {error}
      </div>
    );
  }
  if (!clip) return null;

  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-2xl mx-auto">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
          Shared clip
        </p>
        <h1 className="text-xl font-semibold mb-1">{clip.title ?? 'Session clip'}</h1>
        {clip.start_ts && clip.end_ts && (
          <p className="text-[12px] text-muted-foreground mb-6 tabular-nums">
            {new Date(clip.start_ts).toLocaleString()} →{' '}
            {new Date(clip.end_ts).toLocaleTimeString()}
          </p>
        )}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-2">
          {clip.transcript.map((line, i) => (
            <p key={i} className="text-[14px] leading-relaxed">
              {line.speaker && <span className="text-muted-foreground mr-2">{line.speaker}:</span>}
              <span className="text-foreground">{line.text}</span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
