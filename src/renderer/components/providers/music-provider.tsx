'use client';

// One player for the whole window. The rail pocket, the Music page, the
// settings tab and the menu chords all read this and nothing else, so what is
// playing is one fact rather than four.
//
// Three things live here and are kept apart on purpose: the radio (an <audio>
// element and the reducer behind it), the native apps (Spotify or Music,
// polled through main), and the preferences (the shelf, the volume, the source
// tab, stored by main). The radio's station and on/off flag are the backend's
// (/api/ambience), so the terminal and the window agree on them.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { usePathname } from 'next/navigation';
import {
  type MusicPrefs,
  type MusicSourceId,
  type SavedLink,
  type VisualizerPrefs,
} from '@shared/music';
import { parseMusicLink, type MusicLink, type MusicService } from '@shared/music-links';
import type { NativeApp, NativeCommand } from '@shared/music-native';
import { logger } from '@/lib/logger';
import {
  getAmbience,
  setAmbience,
  type MusicChannel,
  type MusicServiceState,
} from '@/lib/yeaboi/ambience';
import { onCatalogueChanged } from '@/lib/music/catalogue-changed';
import {
  bridgedEmbedUrl,
  hasChannel,
  type EmbedCommand,
  type EmbedPlayback,
} from '@/lib/music/embed/bridge';
import { onMusicHoldChange } from '@/lib/music/hold';
import { nowPlayingFrom, type NowPlaying } from '@/lib/music/now-playing';
import { pocketMood, type PocketMood } from '@/lib/music/state';
import { vizModeFor } from '@/lib/music/viz/mode';
import type { VizFrameSource } from '@/lib/music/viz/source';
import { useEmbedBridge } from '@/hooks/use-embed-bridge';
import { useVizFrames } from '@/hooks/use-viz-frames';
import { useMusicPrefs } from '@/hooks/use-music-prefs';
import {
  useNativePlayer,
  type NativeCadence,
  type NativePlayerApi,
} from '@/hooks/use-native-player';
import { useRadio, type RadioApi } from '@/hooks/use-radio';
import { useYeaboiBackend } from '@/hooks/yeaboi/use-yeaboi-backend';

export type BackendReach = 'loading' | 'ready' | 'offline';

export interface MusicPlayer {
  radio: RadioApi;
  channels: MusicChannel[];
  backend: BackendReach;
  services: MusicServiceState[];
  /** The service, or null: what the catalogue says about one source. */
  serviceFor(service: MusicService): MusicServiceState | null;
  prefs: MusicPrefs;
  prefsLoading: boolean;
  updatePrefs(patch: Partial<MusicPrefs>): void;
  updateVisualizer(patch: Partial<VisualizerPrefs>): void;
  /** The one frame loop every visualiser canvas paints from. */
  viz: VizFrameSource;
  addLink(url: string, label?: string): SavedLink | null;
  removeLink(id: string): void;
  source: MusicSourceId;
  setSource(source: MusicSourceId): void;
  /** The embed that is up, if any. Playing one stops the radio. It lives in
   *  EmbedHost at the window's root, so it outlives the Music page. */
  embed: MusicLink | null;
  /** The shelf row's name for it, for the pocket. */
  embedTitle: string;
  /** `autoplay` starts it on load — for a link picked inside the player. */
  showEmbed(link: SavedLink, autoplay?: boolean): void;
  clearEmbed(): void;
  /** The player's last word over its channel; null with no embed up, and
   *  never more than 'unknown' for Apple's frame, which has no channel. */
  embedPlayback: EmbedPlayback | null;
  /** Tell the embed's player something. False when it takes no commands. */
  sendEmbed(command: EmbedCommand): boolean;
  /** Why the last embed went away on its own, for the popover to say. */
  embedNote: string;
  /** What is on, from whichever source sounds: the embed, else the app. */
  nowPlaying: NowPlaying | null;
  /** What EmbedHost mounts: the frame's ref and source. Nothing else reads it. */
  embedFrame: { ref: RefObject<HTMLIFrameElement | null>; src: string; onLoad(): void };
  /** The Music page's slot while the page shows this embed, else null. */
  embedSlot: HTMLElement | null;
  registerEmbedSlot(element: HTMLElement | null): void;
  /** Hand a saved link to Spotify or Music. Stops the radio. */
  openInApp(link: SavedLink): Promise<void>;
  /** The app the pocket is watching, and what it reports. */
  nativeApp: NativeApp | null;
  native: NativePlayerApi;
  sendNative(command: NativeCommand): Promise<void>;
  installed: Partial<Record<NativeApp, boolean | null>>;
  /** User-initiated transport, routed to whichever source is live. */
  toggle(): void;
  next(): void;
  mood: PocketMood;
  jamming: boolean;
}

const MusicContext = createContext<MusicPlayer | null>(null);

const NATIVE: Record<string, NativeApp> = { spotify: 'spotify', apple_music: 'apple_music' };

let commandsBound = false;

export function MusicProvider({ children }: { children: ReactNode }) {
  const backendState = useYeaboiBackend();
  const [channels, setChannels] = useState<MusicChannel[]>([]);
  const [services, setServices] = useState<MusicServiceState[]>([]);
  const [backend, setBackend] = useState<BackendReach>('loading');
  const {
    prefs,
    loading: prefsLoading,
    update: updatePrefs,
    addLink,
    removeLink,
  } = useMusicPrefs();
  const radio = useRadio(channels);
  const viz = useVizFrames();
  const [embed, setEmbed] = useState<MusicLink | null>(null);
  const [embedTitle, setEmbedTitle] = useState('');
  const [embedAutoplay, setEmbedAutoplay] = useState(false);
  const [embedNote, setEmbedNote] = useState('');
  const [embedSlot, setEmbedSlot] = useState<HTMLElement | null>(null);
  const embedFrameRef = useRef<HTMLIFrameElement | null>(null);
  const bridge = useEmbedBridge(embedFrameRef, embed);
  const [lastApp, setLastApp] = useState<NativeApp | null>(null);
  const [installed, setInstalled] = useState<Partial<Record<NativeApp, boolean | null>>>({});
  const pathname = usePathname() ?? '';

  const source = prefs.source;
  const sourceApp = NATIVE[source] ?? null;
  const nativeApp = lastApp ?? sourceApp;
  // Poll quickly while the Music page shows the app; slowly while only the
  // pocket watches it, and only an app that is installed and chosen.
  const watched =
    nativeApp !== null &&
    installed[nativeApp] === true &&
    (sourceApp === nativeApp || lastApp === nativeApp);
  const cadence: NativeCadence =
    nativeApp === null ? 'off' : pathname === '/music' ? 'fast' : watched ? 'slow' : 'off';
  const native = useNativePlayer(nativeApp, cadence);

  // The backend half: the stations, the shared station index, the services.
  const hydrated = useRef(false);
  const readAmbience = useCallback(async () => {
    try {
      const ambience = await getAmbience();
      setChannels(ambience.music.channels);
      setServices(ambience.music.services ?? []);
      setBackend('ready');
      if (!hydrated.current) {
        hydrated.current = true;
        radio.hydrate({ channel: ambience.music.channel });
      }
    } catch (error) {
      logger.warn('music: could not read the ambience', error);
      setBackend('offline');
    }
  }, [radio]);

  useEffect(() => {
    if (backendState.kind !== 'ready') {
      if (backendState.kind === 'down') setBackend('offline');
      return;
    }
    void readAmbience();
  }, [backendState.kind, readAmbience]);

  useEffect(() => onCatalogueChanged(() => void readAmbience()), [readAmbience]);

  // The stored volume is the window's own; it reaches the element once read.
  const volumeApplied = useRef(false);
  useEffect(() => {
    if (prefsLoading || volumeApplied.current) return;
    volumeApplied.current = true;
    radio.hydrate({ volume: prefs.volume });
  }, [prefsLoading, prefs.volume, radio]);

  useEffect(() => {
    for (const app of ['spotify', 'apple_music'] as const) {
      window.yeaboi
        .musicNativeInstalled(app)
        .then((found) =>
          setInstalled((current) => ({ ...current, [app]: found as boolean | null })),
        )
        .catch(() => undefined);
    }
  }, []);

  // Writes the terminal reads: the station, and whether music is on.
  const writeAmbience = useCallback(
    (changes: Record<string, unknown>, rollback?: () => void) => {
      if (backend !== 'ready') return;
      setAmbience(changes).catch((error: unknown) => {
        logger.warn('music: could not save the preference', error);
        rollback?.();
      });
    },
    [backend],
  );

  const setChannel = useCallback(
    (index: number) => {
      const previous = radio.state.channel;
      radio.setChannel(index);
      const count = channels.length;
      const wrapped = count ? ((index % count) + count) % count : 0;
      writeAmbience({ music_channel: wrapped }, () => radio.setChannel(previous));
    },
    [radio, channels.length, writeAmbience],
  );

  const play = useCallback(() => {
    setEmbed(null);
    void radio.play();
    writeAmbience({ music_enabled: true });
  }, [radio, writeAmbience]);

  const pause = useCallback(() => {
    radio.pause();
    writeAmbience({ music_enabled: false });
  }, [radio, writeAmbience]);

  const stop = useCallback(() => {
    radio.stop();
    writeAmbience({ music_enabled: false });
  }, [radio, writeAmbience]);

  const radioApi = useMemo<RadioApi>(
    () => ({
      ...radio,
      play: async () => play(),
      pause,
      stop,
      toggle: () => {
        const { status } = radio.state;
        if (status === 'playing' || status === 'connecting') pause();
        else play();
      },
      setChannel,
      next: () => setChannel(radio.state.channel + 1),
      previous: () => setChannel(radio.state.channel - 1),
      setVolume: (value: number) => {
        radio.setVolume(value);
        updatePrefs({ volume: value });
      },
    }),
    [radio, play, pause, stop, setChannel, updatePrefs],
  );

  const showEmbed = useCallback(
    (link: SavedLink, autoplay = false) => {
      const parsed = parseMusicLink(link.url);
      if (!parsed) return;
      // Two sounds at once is never what anyone meant.
      if (radio.state.status === 'playing' || radio.state.status === 'connecting') stop();
      setEmbedTitle(link.label);
      setEmbedNote('');
      setEmbedAutoplay(autoplay);
      // The same link again is a no-op: a new frame would start it over.
      setEmbed((current) => (current?.embedUrl === parsed.embedUrl ? current : parsed));
    },
    [radio.state.status, stop],
  );

  const { onLoad: onEmbedLoad } = bridge;
  const embedFrame = useMemo(
    () => ({
      ref: embedFrameRef,
      src: embed ? bridgedEmbedUrl(embed, window.location.origin, embedAutoplay) : '',
      onLoad: onEmbedLoad,
    }),
    [embed, embedAutoplay, onEmbedLoad],
  );

  // A hold can pause a player it can talk to (the bridge does that); Apple's
  // frame takes no commands, so a call stops it outright and says so.
  const embedRef = useRef(embed);
  embedRef.current = embed;
  useEffect(
    () =>
      onMusicHoldChange((held) => {
        const current = embedRef.current;
        if (!held || !current || hasChannel(current.service)) return;
        setEmbed(null);
        setEmbedNote('stopped for the call');
      }),
    [],
  );

  const openInApp = useCallback(
    async (link: SavedLink) => {
      const app = NATIVE[link.service];
      if (!app) return;
      if (radio.state.status === 'playing' || radio.state.status === 'connecting') stop();
      setEmbed(null);
      setLastApp(app);
      try {
        await window.yeaboi.musicNativeOpen(app, link.url);
      } catch (error) {
        logger.warn('music: could not open the link in the app', error);
      }
      setTimeout(() => void native.refresh(), 1_200);
    },
    [radio.state.status, stop, native],
  );

  // The visualiser follows the radio's analyser while the radio is on, and
  // moves synthetically for an embed or the app, whose sound never passes
  // through here. One loop, however many canvases are mounted.
  const { gain, smoothing, peaks } = prefs.visualizer;
  const embedStatus = embed ? (bridge.playback?.status ?? 'unknown') : null;
  const nativeStatus = native.nowPlaying?.status ?? null;
  useEffect(() => {
    viz.set({
      analyser: radio.state.status === 'stopped' ? null : radio.analyser,
      mode: vizModeFor({ radio: radio.state.status, embed: embedStatus, native: nativeStatus }),
      opts: { gain, smoothing, peaks },
    });
  }, [viz, radio.analyser, radio.state.status, embedStatus, nativeStatus, gain, smoothing, peaks]);

  const nowPlaying = useMemo(
    () =>
      nowPlayingFrom({
        embed,
        embedPlayback: bridge.playback,
        embedTitle,
        native: native.nowPlaying,
        nativeApp,
      }),
    [embed, bridge.playback, embedTitle, native.nowPlaying, nativeApp],
  );

  // A partial block: the prefs hook and main both merge it a level deep, so two
  // quick changes (a tile, then a colour) never overwrite each other.
  const updateVisualizer = useCallback(
    (patch: Partial<VisualizerPrefs>) => updatePrefs({ visualizer: patch as VisualizerPrefs }),
    [updatePrefs],
  );

  const nativeLive =
    native.nowPlaying?.status === 'playing' || native.nowPlaying?.status === 'paused';
  const nativePlaying = native.nowPlaying?.status === 'playing';

  const embedLive = embed !== null;

  // Transport goes to whichever source is sounding: the radio, else the
  // embed (paused over its channel, or stopped when it has none), else the app.
  const { send: sendEmbed } = bridge;
  const toggle = useCallback(() => {
    const radioLive = radio.state.status === 'playing' || radio.state.status === 'connecting';
    if (radioLive) radioApi.toggle();
    else if (embedLive) {
      if (!sendEmbed('toggle')) setEmbed(null);
    } else if (nativeLive) void native.send('playpause');
    else radioApi.toggle();
  }, [radio.state.status, embedLive, sendEmbed, nativeLive, native, radioApi]);

  const next = useCallback(() => {
    const radioLive = radio.state.status === 'playing' || radio.state.status === 'connecting';
    if (!radioLive && !embedLive && nativeLive) void native.send('next');
    else if (!embedLive) radioApi.next();
  }, [radio.state.status, embedLive, nativeLive, native, radioApi]);

  // The menu's chords. Bound once for the window: StrictMode mounts twice and
  // a second listener would toggle twice.
  const commands = useRef({ toggle, next });
  commands.current = { toggle, next };
  // A link a frame tried to open — a tile in YouTube's "More videos" tray —
  // plays here, on that service's tab, as if it had been picked from a shelf.
  const playLink = useCallback(
    (url: string) => {
      const parsed = parseMusicLink(url);
      if (!parsed) return;
      logger.info('music: playing a link the player opened');
      updatePrefs({ source: parsed.service });
      showEmbed(
        {
          id: `link-${parsed.service}-${parsed.id}`,
          service: parsed.service,
          kind: parsed.kind,
          label: parsed.label,
          url,
          addedAt: 0,
        },
        true,
      );
    },
    [updatePrefs, showEmbed],
  );
  const links = useRef(playLink);
  links.current = playLink;

  useEffect(() => {
    if (commandsBound) return;
    commandsBound = true;
    window.yeaboi.onMusicCommand((id) => {
      if (id === 'music:toggle') commands.current.toggle();
      else if (id === 'music:next') commands.current.next();
    });
    // Optional: a renderer hot-reloaded over an older preload has no bridge
    // method yet, and a missing tray click is better than a blank window.
    window.yeaboi.onMusicLink?.((url) => links.current(url));
  }, []);

  const value = useMemo<MusicPlayer>(
    () => ({
      radio: radioApi,
      channels,
      backend,
      services,
      serviceFor: (service) => services.find((s) => s.key === service) ?? null,
      prefs,
      prefsLoading,
      updatePrefs,
      updateVisualizer,
      viz,
      addLink,
      removeLink,
      source,
      setSource: (next) => updatePrefs({ source: next }),
      embed,
      embedTitle,
      showEmbed,
      clearEmbed: () => setEmbed(null),
      embedPlayback: bridge.playback,
      sendEmbed,
      embedNote,
      nowPlaying,
      embedFrame,
      embedSlot,
      registerEmbedSlot: setEmbedSlot,
      openInApp,
      nativeApp,
      native,
      sendNative: (command) => native.send(command),
      installed,
      toggle,
      next,
      mood: pocketMood(radio.state, { native: nativePlaying, embed: embedLive }),
      jamming: radio.state.status === 'playing' || nativePlaying || embedLive,
    }),
    [
      radioApi,
      channels,
      backend,
      services,
      prefs,
      prefsLoading,
      updatePrefs,
      updateVisualizer,
      viz,
      addLink,
      removeLink,
      source,
      embed,
      embedTitle,
      showEmbed,
      bridge.playback,
      sendEmbed,
      embedNote,
      nowPlaying,
      embedFrame,
      embedSlot,
      openInApp,
      nativeApp,
      native,
      installed,
      toggle,
      next,
      radio.state,
      nativePlaying,
      embedLive,
    ],
  );

  return <MusicContext.Provider value={value}>{children}</MusicContext.Provider>;
}

export function useMusicPlayer(): MusicPlayer {
  const value = useContext(MusicContext);
  if (!value) throw new Error('useMusicPlayer must be used inside MusicProvider');
  return value;
}
