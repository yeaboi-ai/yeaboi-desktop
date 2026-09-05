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
import { pocketMood, type PocketMood } from '@/lib/music/state';
import { vizMode } from '@/lib/music/viz/mode';
import type { VizFrameSource } from '@/lib/music/viz/source';
import { useVizFrames } from '@/hooks/use-viz-frames';
import { useMusicPrefs } from '@/hooks/use-music-prefs';
import { useNativePlayer, type NativePlayerApi } from '@/hooks/use-native-player';
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
  showEmbed(link: SavedLink): void;
  clearEmbed(): void;
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
  const [embedSlot, setEmbedSlot] = useState<HTMLElement | null>(null);
  const embedFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [lastApp, setLastApp] = useState<NativeApp | null>(null);
  const [installed, setInstalled] = useState<Partial<Record<NativeApp, boolean | null>>>({});
  const pathname = usePathname() ?? '';

  const source = prefs.source;
  const sourceApp = NATIVE[source] ?? null;
  const nativeApp = lastApp ?? sourceApp;
  // Poll while the page or the pocket has a reason to show the app: on the
  // Music page, or once a link has been handed to the app this session.
  const native = useNativePlayer(nativeApp, pathname === '/music' || lastApp !== null);

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
    (link: SavedLink) => {
      const parsed = parseMusicLink(link.url);
      if (!parsed) return;
      // Two sounds at once is never what anyone meant.
      if (radio.state.status === 'playing' || radio.state.status === 'connecting') stop();
      setEmbedTitle(link.label);
      // The same link again is a no-op: a new frame would start it over.
      setEmbed((current) => (current?.embedUrl === parsed.embedUrl ? current : parsed));
    },
    [radio.state.status, stop],
  );

  const embedFrame = useMemo(
    () => ({ ref: embedFrameRef, src: embed?.embedUrl ?? '', onLoad: () => undefined }),
    [embed?.embedUrl],
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

  // The visualiser follows the radio: its analyser, its status, and the feel
  // the person chose. One loop, however many canvases are mounted.
  const { gain, smoothing, peaks } = prefs.visualizer;
  useEffect(() => {
    viz.set({
      analyser: radio.analyser,
      mode: vizMode(radio.state.status),
      opts: { gain, smoothing, peaks },
    });
  }, [viz, radio.analyser, radio.state.status, gain, smoothing, peaks]);

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
  // embed (which a toggle stops — it has no pause from out here), else the app.
  const toggle = useCallback(() => {
    const radioLive = radio.state.status === 'playing' || radio.state.status === 'connecting';
    if (radioLive) radioApi.toggle();
    else if (embedLive) setEmbed(null);
    else if (nativeLive) void native.send('playpause');
    else radioApi.toggle();
  }, [radio.state.status, embedLive, nativeLive, native, radioApi]);

  const next = useCallback(() => {
    const radioLive = radio.state.status === 'playing' || radio.state.status === 'connecting';
    if (!radioLive && !embedLive && nativeLive) void native.send('next');
    else if (!embedLive) radioApi.next();
  }, [radio.state.status, embedLive, nativeLive, native, radioApi]);

  // The menu's chords. Bound once for the window: StrictMode mounts twice and
  // a second listener would toggle twice.
  const commands = useRef({ toggle, next });
  commands.current = { toggle, next };
  useEffect(() => {
    if (commandsBound) return;
    commandsBound = true;
    window.yeaboi.onMusicCommand((id) => {
      if (id === 'music:toggle') commands.current.toggle();
      else if (id === 'music:next') commands.current.next();
    });
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
