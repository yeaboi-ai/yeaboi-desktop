'use client';

// Browse: the signed-in library's shelves, one playlist's tracks, and a
// catalogue search. Every row plays through exactly the path a pasted link
// does — its URL goes through the same grammar — or, on a Mac with the Music
// app, through the app itself. "Add to shelf" is the same shelf as pasting.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, ChevronLeft, Plus, Search } from 'lucide-react';
import type { SavedLink } from '@shared/music';
import { NATIVE_APPS, type NativeItemKind, type NativeLibraryItem } from '@shared/music-native';
import {
  SERVICE_APPS,
  SERVICE_LABELS,
  parseMusicLink,
  type MusicService,
} from '@shared/music-links';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { accountFeatures } from '@/lib/music/account';
import { formatElapsed } from '@/lib/music/state';
import {
  MusicApiError,
  fallsBackToApp,
  libraryShelf,
  playlistItems,
  searchCatalogue,
  spotifyPlay,
  type LibraryItem,
  type LibraryPage,
  type MusicShelf,
} from '@/lib/yeaboi/music';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type Tab = MusicShelf | 'search';

const TABS: Record<MusicService, { id: Tab; label: string }[]> = {
  spotify: [
    { id: 'playlists', label: 'Playlists' },
    { id: 'liked', label: 'Liked' },
    { id: 'albums', label: 'Albums' },
    { id: 'recent', label: 'Recent' },
    { id: 'search', label: 'Search' },
  ],
  youtube_music: [
    { id: 'playlists', label: 'Playlists' },
    { id: 'liked', label: 'Liked' },
    { id: 'search', label: 'Search' },
  ],
  apple_music: [
    { id: 'playlists', label: 'Playlists' },
    { id: 'search', label: 'Search' },
  ],
};

/** A row from the Music app, in the same shape as a backend row. */
function fromNative(item: NativeLibraryItem): LibraryItem {
  return {
    id: item.id,
    kind: item.kind === 'playlist' ? 'playlist' : 'song',
    title: item.title,
    subtitle: item.subtitle,
    artwork_url: '',
    duration_ms: item.duration * 1000,
    url: '',
    uri: '',
    preview_url: '',
    count: 0,
  };
}

/** A transient shelf row for a browsed item, so it plays like a pasted link. */
function asLink(service: MusicService, item: LibraryItem): SavedLink | null {
  const parsed = parseMusicLink(item.url);
  if (!parsed || parsed.service !== service) return null;
  return {
    id: `browse-${item.id}`,
    service,
    kind: parsed.kind,
    label: item.title,
    url: item.url,
    addedAt: 0,
  };
}

interface View {
  tab: Tab;
  playlist: LibraryItem | null;
}

export function Browser({ service }: { service: MusicService }) {
  const { serviceFor, addLink, showEmbed, openInApp, installed } = useMusicPlayer();
  const features = accountFeatures(service, serviceFor(service));
  const playback = serviceFor(service)?.playback ?? '';
  const local = service === 'apple_music';
  const app = SERVICE_APPS[service];
  const [view, setView] = useState<View>({ tab: 'playlists', playlist: null });
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [appRunning, setAppRunning] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);

  const load = useCallback(
    async (next: View, q: string, after = '', append = false) => {
      const mine = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        let page: LibraryPage;
        if (local && next.tab !== 'search') {
          const answer = (await window.yeaboi.musicNativeLibrary(
            'apple_music',
            next.playlist?.id ?? '',
          )) as { running: boolean; items: NativeLibraryItem[]; denied?: boolean };
          setAppRunning(answer.running);
          setDenied(answer.denied === true);
          page = { items: answer.items.map(fromNative), next_cursor: '' };
        } else if (next.tab === 'search') {
          page = q ? await searchCatalogue(service, q) : { items: [], next_cursor: '' };
        } else if (next.playlist) {
          page = await playlistItems(service, next.playlist.id, after);
        } else {
          page = await libraryShelf(service, next.tab, after);
        }
        if (mine !== generation.current) return;
        setItems((current) => (append ? [...current, ...page.items] : page.items));
        setCursor(page.next_cursor);
      } catch (caught) {
        if (mine !== generation.current) return;
        logger.warn('music: browse failed', caught);
        setError(
          caught instanceof MusicApiError
            ? { message: caught.message, code: caught.code }
            : {
                message: caught instanceof Error ? caught.message : 'Could not read the library',
                code: 'unknown',
              },
        );
      } finally {
        if (mine === generation.current) setLoading(false);
      }
    },
    [local, service],
  );

  useEffect(() => {
    if (!features.browse) return;
    void load(view, submitted);
  }, [features.browse, view, submitted, load]);

  if (!features.browse) return null;

  const go = (tab: Tab) => {
    setItems([]);
    setCursor('');
    setView({ tab, playlist: null });
  };
  const open = (playlist: LibraryItem) => {
    setItems([]);
    setCursor('');
    setView({ tab: view.tab, playlist });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setItems([]);
    setSubmitted(query.trim());
  };

  const play = async (item: LibraryItem) => {
    setNotice('');
    if (local && !item.url) {
      const kind: NativeItemKind = item.kind === 'playlist' ? 'playlist' : 'track';
      const result = (await window.yeaboi.musicNativePlayItem('apple_music', kind, item.id)) as {
        ok: boolean;
      };
      if (!result.ok) setNotice('Music could not play that.');
      return;
    }
    const link = asLink(service, item);
    if (!link) {
      setNotice('That row has no link yeaboi can play.');
      return;
    }
    if (service === 'spotify' && playback === 'desktop' && item.uri) {
      try {
        await spotifyPlay(item.uri);
        return;
      } catch (caught) {
        if (!fallsBackToApp(caught)) {
          setNotice(caught instanceof Error ? caught.message : 'Spotify could not play that.');
          return;
        }
        // Not Premium, or nothing running Spotify: the app path from a link.
      }
      void openInApp(link);
      return;
    }
    if (app && playback === 'desktop') {
      void openInApp(link);
      return;
    }
    if (playback === 'browser') {
      window.open(item.url, '_blank', 'noopener');
      return;
    }
    showEmbed(link);
  };

  const keep = (item: LibraryItem) => {
    if (!item.url) return;
    const added = addLink(item.url, item.title);
    setNotice(added ? `${item.title} is on the shelf.` : `${item.title} is already on the shelf.`);
  };

  const tabs = TABS[service];
  const heading = view.playlist
    ? view.playlist.title
    : local
      ? `In the Music app`
      : `Your ${SERVICE_LABELS[service]} library`;

  return (
    <section aria-label="Browse" className="pt-6">
      <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-5">
        <h2 className="min-w-0 truncate font-display text-[20px] text-foreground">{heading}</h2>
        {local && installed.apple_music === false && (
          <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
            Music app not found
          </span>
        )}
      </div>
      <div role="tablist" aria-label="Library" className="mt-3 flex items-center gap-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={view.tab === tab.id}
            onClick={() => go(tab.id)}
            className={cn(
              'text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm',
              view.tab === tab.id
                ? 'text-foreground underline underline-offset-[6px]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
        {view.playlist && (
          <button
            type="button"
            onClick={() => go(view.tab)}
            className="ml-auto inline-flex items-center gap-0.5 text-[12.5px] text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Back
          </button>
        )}
      </div>
      {view.tab === 'search' && (
        <form onSubmit={submit} className="mt-3 flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${SERVICE_LABELS[service]}…`}
              aria-label={`Search ${SERVICE_LABELS[service]}`}
              className="w-full rounded-lg border border-border bg-transparent py-2 pl-9 pr-3 text-[13px] font-body placeholder:text-muted-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim()}
            className="rounded-lg border border-border px-3 py-2 text-[13px] text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            Search
          </button>
        </form>
      )}
      {local && denied && view.tab !== 'search' && (
        <p
          role="alert"
          className="mt-4 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground"
        >
          macOS is not letting yeaboi talk to the Music app. Allow it under System Settings ›
          Privacy &amp; Security › Automation, then come back here.
        </p>
      )}
      {local && appRunning === false && !denied && view.tab !== 'search' && (
        <p className="mt-4 text-[13px] text-muted-foreground">
          Open the Music app to browse its library.{' '}
          <button
            type="button"
            onClick={() =>
              void window.yeaboi.musicNativeLaunch('apple_music').then(() => load(view, submitted))
            }
            className="text-primary underline-offset-4 hover:underline"
          >
            Open Music
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[13px] text-destructive">
          {error.message}
        </p>
      )}
      <ul className="mt-2">
        {items.map((item) => {
          const isFolder = item.kind === 'playlist' || item.kind === 'album';
          const appName = local ? NATIVE_APPS.apple_music.name : app;
          // A local row plays outright; a catalogue link opens in the app,
          // where Play is the person's to press.
          const playLabel =
            local && !item.url
              ? `Play in ${appName}`
              : local && playback === 'desktop'
                ? 'Open in Music'
                : service === 'spotify' && playback === 'desktop'
                  ? 'Play in Spotify'
                  : playback === 'browser'
                    ? 'Open in the browser'
                    : 'Play';
          return (
            <li
              key={`${item.kind}-${item.id}`}
              className="group flex items-center gap-3 border-b border-border/40 py-2 last:border-b-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary/60">
                {item.artwork_url ? (
                  <img
                    src={item.artwork_url}
                    alt=""
                    width={36}
                    height={36}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.kind === 'playlist' ? '≡' : item.kind === 'album' ? '◎' : '♪'}
                  </span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                {isFolder && (!local || item.kind === 'playlist') ? (
                  <button
                    type="button"
                    onClick={() => open(item)}
                    className="block max-w-full truncate text-left text-[14px] text-foreground underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </button>
                ) : (
                  <span className="block truncate text-[14px] text-foreground">{item.title}</span>
                )}
                {(item.subtitle || item.count > 0) && (
                  <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                    {[item.subtitle, item.count > 0 ? `${item.count} tracks` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                )}
              </span>
              {item.duration_ms > 0 && (
                <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground">
                  {formatElapsed(item.duration_ms / 1000)}
                </span>
              )}
              <button
                type="button"
                onClick={() => void play(item)}
                className="shrink-0 text-[12.5px] text-foreground underline-offset-4 hover:underline"
              >
                {playLabel}
              </button>
              {item.url && (
                <button
                  type="button"
                  aria-label={`Add ${item.title} to the shelf`}
                  title="Add to shelf"
                  onClick={() => keep(item)}
                  className="shrink-0 rounded-full p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Plus className="size-3.5" aria-hidden />
                </button>
              )}
              {item.url && !local && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open ${item.title} in ${SERVICE_LABELS[service]}`}
                  className="shrink-0 rounded-full p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              )}
            </li>
          );
        })}
        {!loading && !error && items.length === 0 && (
          <li className="py-3 text-[13px] leading-relaxed text-muted-foreground">
            {view.tab === 'search' ? (
              submitted ? (
                'Nothing found.'
              ) : (
                'Search the catalogue.'
              )
            ) : local && appRunning === false ? (
              ''
            ) : local && !view.playlist ? (
              <>
                No playlists in your Music library yet. Anything you add to your library in the
                Music app shows up here; until then,{' '}
                <button
                  type="button"
                  onClick={() => go('search')}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  search the catalogue
                </button>{' '}
                and open what you find in Music.
              </>
            ) : (
              'Nothing here yet.'
            )}
          </li>
        )}
        {loading && <li className="py-3 font-mono text-[12px] text-muted-foreground">reading…</li>}
      </ul>
      {cursor && !loading && (
        <button
          type="button"
          onClick={() => void load(view, submitted, cursor, true)}
          className="mt-2 text-[12.5px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          More
        </button>
      )}
      {notice && (
        <p role="status" className="mt-2 text-[12.5px] text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}
