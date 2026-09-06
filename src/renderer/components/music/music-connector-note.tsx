'use client';

// The closing line of a music connector's sheet: where the playlist gets
// picked, and on a Mac whether the app it hands off to is here.

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SERVICE_APPS, isMusicService } from '@shared/music-links';
import { useMusicPlayer } from '@/components/providers/music-provider';

export function MusicConnectorNote({ connectorKey }: { connectorKey: string }) {
  const { installed } = useMusicPlayer();
  if (!isMusicService(connectorKey)) return null;
  const app = SERVICE_APPS[connectorKey];
  const found =
    connectorKey === 'spotify' || connectorKey === 'apple_music'
      ? installed[connectorKey]
      : undefined;
  return (
    <div className="mt-5 space-y-1.5 border-t border-border/60 pt-4 text-[12px] text-muted-foreground">
      <p>
        Then pick a playlist on the{' '}
        <Link
          href="/music"
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          Music page
          <ArrowUpRight className="size-3" aria-hidden />
        </Link>
        .
      </p>
      {app && found === true && <p>{app} app found on this Mac.</p>}
      {app && found === false && <p>{app} app not found, so links will open in the browser.</p>}
    </div>
  );
}
