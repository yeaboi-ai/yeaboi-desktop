'use client';

// The shelf: the links a person pasted for one service, as plain rows, and the
// field that adds one. Validation is live and the error says what to paste.

import { useState, type FormEvent } from 'react';
import { ArrowUpRight, X } from 'lucide-react';
import type { SavedLink } from '@shared/music';
import {
  SERVICE_APPS,
  SERVICE_LABELS,
  parseMusicLink,
  type MusicService,
} from '@shared/music-links';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { cn } from '@/lib/utils';

const KINDS_HINT: Record<MusicService, string> = {
  spotify: 'a track, album, playlist or artist link',
  apple_music: 'an album, playlist or song link',
  youtube_music: 'a video or playlist link',
};

export function Library({ service }: { service: MusicService }) {
  const { prefs, addLink, removeLink, showEmbed, openInApp, serviceFor, embed } = useMusicPlayer();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const rows = prefs.library.filter((row) => row.service === service);
  const playback = serviceFor(service)?.playback ?? '';
  const app = SERVICE_APPS[service];
  const label = SERVICE_LABELS[service];

  const parsed = draft.trim() ? parseMusicLink(draft) : null;
  const wrongService = parsed && parsed.service !== service;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!parsed || wrongService) {
      setError(`That is not a ${label} link. Paste ${KINDS_HINT[service]}.`);
      return;
    }
    const added = addLink(draft);
    if (!added) {
      setError('That link is already on the shelf.');
      return;
    }
    setDraft('');
    setError('');
  };

  const primary = (row: SavedLink) => {
    if (app && playback === 'desktop')
      return { label: `Play in ${app}`, run: () => void openInApp(row) };
    if (playback === 'browser') {
      return {
        label: 'Open in the browser',
        run: () => window.open(row.url, '_blank', 'noopener'),
      };
    }
    return { label: 'Play', run: () => showEmbed(row) };
  };

  return (
    <section aria-label="Your shelf" className="pt-6">
      <div className="flex items-baseline justify-between border-t border-border/60 pt-5">
        <h2 className="font-display text-[20px] text-foreground">Your shelf</h2>
        {rows.length > 0 && (
          <span className="font-mono text-[11.5px] text-muted-foreground">{rows.length}</span>
        )}
      </div>
      <ul className="mt-2">
        {rows.map((row) => {
          const action = primary(row);
          const current = embed !== null && parseMusicLink(row.url)?.embedUrl === embed.embedUrl;
          return (
            <li
              key={row.id}
              className="group flex items-center gap-4 border-b border-border/40 py-2.5 last:border-b-0"
            >
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-[14px]',
                  current ? 'text-primary' : 'text-foreground',
                )}
              >
                {row.label}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                {row.kind}
              </span>
              <button
                type="button"
                onClick={action.run}
                className="shrink-0 text-[12.5px] text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
              >
                {action.label}
              </button>
              {app && playback !== 'desktop' && (
                <button
                  type="button"
                  onClick={() => void openInApp(row)}
                  className="shrink-0 inline-flex items-center gap-0.5 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  {app}
                  <ArrowUpRight className="size-3" aria-hidden />
                </button>
              )}
              {app && playback === 'desktop' && (
                <button
                  type="button"
                  onClick={() => showEmbed(row)}
                  className="shrink-0 text-[12px] text-muted-foreground hover:text-foreground"
                >
                  Preview here
                </button>
              )}
              <button
                type="button"
                aria-label={`Remove ${row.label}`}
                onClick={() => removeLink(row.id)}
                className="shrink-0 rounded-full p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="py-3 text-[13px] text-muted-foreground">
            Paste a {label} link to start a shelf, or add one from Browse above.
          </li>
        )}
      </ul>
      <form onSubmit={submit} className="mt-3 flex items-center gap-3">
        <input
          type="url"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError('');
          }}
          placeholder={`Paste a ${label} link…`}
          aria-label={`Paste a ${label} link`}
          aria-invalid={error ? true : undefined}
          className={cn(
            'min-w-0 flex-1 rounded-lg border bg-transparent px-3 py-2 text-[13px] font-body placeholder:text-muted-foreground/70',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            error ? 'border-destructive/60' : 'border-border',
          )}
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          Add
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
