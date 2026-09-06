// The three vendor marks, monochrome, from simple-icons. They appear at 16px
// in the source row and in the pocket, and nowhere else.

import { siApplemusic, siSpotify, siYoutubemusic } from 'simple-icons';
import type { MusicService } from '@shared/music-links';

const PATHS: Record<MusicService, string> = {
  spotify: siSpotify.path,
  apple_music: siApplemusic.path,
  youtube_music: siYoutubemusic.path,
};

export function ServiceMark({
  service,
  size = 16,
  className,
}: {
  service: MusicService;
  size?: number;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path d={PATHS[service]} fill="currentColor" />
    </svg>
  );
}
