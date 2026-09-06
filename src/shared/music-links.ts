// A pasted share link, turned into the two URLs the Music page needs: the
// vendor's embed for the frame, and the native URL the desktop app opens.
//
// Pure, and strict on purpose: every URL is rebuilt from validated parts, so
// user text never reaches an iframe `src` or an AppleScript string as typed.
// Anything the grammar does not recognise is null, never a best guess.

/** The catalogue keys of the three streaming services (yeaboi.ai's connectors). */
export type MusicService = 'spotify' | 'apple_music' | 'youtube_music';

export const MUSIC_SERVICES: readonly MusicService[] = ['spotify', 'apple_music', 'youtube_music'];

export const SERVICE_LABELS: Record<MusicService, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
};

/** The name of the desktop app a link hands off to, where one exists. */
export const SERVICE_APPS: Record<MusicService, string | null> = {
  spotify: 'Spotify',
  apple_music: 'Music',
  youtube_music: null,
};

export function isMusicService(value: unknown): value is MusicService {
  return typeof value === 'string' && (MUSIC_SERVICES as readonly string[]).includes(value);
}

export type EmbedKind =
  'track' | 'album' | 'playlist' | 'artist' | 'episode' | 'show' | 'song' | 'video';

export interface MusicLink {
  service: MusicService;
  kind: EmbedKind;
  id: string;
  /** The vendor's embed player. Always one of EMBED_FRAME_ORIGINS. */
  embedUrl: string;
  /** What the desktop app opens; null for a service with no app. */
  nativeUrl: string | null;
  /** "Spotify playlist", "YouTube video" — the row's default name. */
  label: string;
}

const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'artist', 'episode', 'show']);
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const APPLE_KINDS = new Set(['album', 'playlist', 'song', 'artist']);
const APPLE_ID = /^(?:pl\.[A-Za-z0-9-]{8,}|\d{4,})$/;
const APPLE_SLUG = /^[A-Za-z0-9._~%-]{1,200}$/;
const APPLE_TRACK = /^\d{4,}$/;
const YOUTUBE_VIDEO = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_LIST = /^[A-Za-z0-9_-]{13,64}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

function spotify(kind: string, id: string): MusicLink | null {
  if (!SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID.test(id)) return null;
  return {
    service: 'spotify',
    kind: kind as EmbedKind,
    id,
    embedUrl: `https://open.spotify.com/embed/${kind}/${id}?theme=0`,
    nativeUrl: `spotify:${kind}:${id}`,
    label: `Spotify ${kind}`,
  };
}

function apple(url: URL): MusicLink | null {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 4) return null;
  const [cc, kind, rawSlug, id] = parts as [string, string, string, string];
  if (!/^[a-z]{2}$/.test(cc) || !APPLE_KINDS.has(kind) || !APPLE_ID.test(id)) return null;
  let slug: string;
  try {
    slug = encodeURIComponent(decodeURIComponent(rawSlug));
  } catch {
    return null;
  }
  if (!APPLE_SLUG.test(slug)) return null;
  const track = url.searchParams.get('i') ?? '';
  if (track && !APPLE_TRACK.test(track)) return null;
  const path = `${cc}/${kind}/${slug}/${id}${track ? `?i=${track}` : ''}`;
  return {
    service: 'apple_music',
    kind: track ? 'song' : (kind as EmbedKind),
    id: track || id,
    embedUrl: `https://embed.music.apple.com/${path}`,
    nativeUrl: `music://music.apple.com/${path}`,
    label: `Apple Music ${track ? 'song' : kind}`,
  };
}

function youtube(url: URL): MusicLink | null {
  const list = url.searchParams.get('list') ?? '';
  if (list && !YOUTUBE_LIST.test(list)) return null;
  let video = '';
  if (url.hostname === 'youtu.be') {
    video = url.pathname.slice(1);
  } else if (url.pathname === '/watch') {
    video = url.searchParams.get('v') ?? '';
  } else if (url.pathname.startsWith('/shorts/')) {
    video = url.pathname.slice('/shorts/'.length);
  } else if (url.pathname === '/playlist' && list) {
    return {
      service: 'youtube_music',
      kind: 'playlist',
      id: list,
      embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}`,
      nativeUrl: null,
      label: 'YouTube playlist',
    };
  }
  if (!YOUTUBE_VIDEO.test(video)) return null;
  return {
    service: 'youtube_music',
    kind: 'video',
    id: video,
    embedUrl: `https://www.youtube-nocookie.com/embed/${video}${list ? `?list=${list}` : ''}`,
    nativeUrl: null,
    label: 'YouTube video',
  };
}

/** The link's two URLs and identity, or null for anything unrecognised. */
export function parseMusicLink(input: string): MusicLink | null {
  const text = input.trim();
  if (!text) return null;
  const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/.exec(text);
  if (uri) return spotify(uri[1]!, uri[2]!);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'open.spotify.com') {
    const m = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?([a-z]+)\/([A-Za-z0-9]+)\/?$/i.exec(
      url.pathname,
    );
    return m ? spotify(m[1]!.toLowerCase(), m[2]!) : null;
  }
  if (host === 'music.apple.com' || host === 'embed.music.apple.com') return apple(url);
  if (YOUTUBE_HOSTS.has(host)) return youtube(url);
  return null;
}
