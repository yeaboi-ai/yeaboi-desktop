'use client';

// The music pocket at the foot of the rail — the window's answer to the
// two-row alcove on the terminal's bottom border. Four glyphs while the radio
// plays, the vendor's mark while Spotify or Music does, a dim note otherwise.

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useMusicPlayer } from '@/components/providers/music-provider';
import { MiniPlayer } from '@/components/music/mini-player';
import { ServiceMark } from '@/components/music/service-mark';
import { Visualizer } from '@/components/music/visualizer';
import { RailButton } from '@/components/rail/rail-button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NATIVE_APPS } from '@shared/music-native';
import { STATUS_WORDS } from '@/lib/music/state';
import { useRouter } from 'next/navigation';

export function RailPocket({ ring }: { ring: boolean }) {
  const { radio, channels, mood, native, nativeApp, toggle, next } = useMusicPlayer();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { state } = radio;
  const station = channels[state.channel]?.name ?? 'Radio';

  const label =
    mood === 'native' && native.nowPlaying
      ? `${native.nowPlaying.title || NATIVE_APPS[native.nowPlaying.app].name} · in ${NATIVE_APPS[native.nowPlaying.app].name}`
      : mood === 'off'
        ? 'Music'
        : `${station} · ${state.status === 'failed' ? 'stream unavailable' : STATUS_WORDS[state.status]}`;

  const face =
    mood === 'native' && nativeApp ? (
      <ServiceMark service={nativeApp} size={18} className="text-primary" />
    ) : mood === 'off' ? (
      <span className="font-mono text-[18px] leading-none text-muted-foreground">♪</span>
    ) : (
      <Visualizer size="pocket" className="size-12" />
    );

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <RailButton
                label={label}
                aria-label={`Music: ${label}`}
                lit={pathname === '/music' && !open}
                ring={ring}
              >
                {face}
              </RailButton>
            }
          />
          <PopoverContent side="right" align="end" sideOffset={12} className="p-0">
            <MiniPlayer />
          </PopoverContent>
        </Popover>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={toggle}>
          {state.status === 'playing' ||
          state.status === 'connecting' ||
          native.nowPlaying?.status === 'playing'
            ? 'Pause'
            : 'Play'}
        </ContextMenuItem>
        <ContextMenuItem onClick={next}>Next station or track</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => router.push('/music')}>Open Music</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
