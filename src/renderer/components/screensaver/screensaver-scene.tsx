// The screensaver styles that are React rather than canvas.
//
// One switch, so the host stays a two-branch conditional however many of
// these there come to be.

import type { DomStyle } from '@/lib/screensaver/styles';
import { FrontPageSaver } from './front-page-saver';

export function ScreensaverScene({ style, still }: { style: DomStyle; still: boolean }) {
  switch (style) {
    case 'front-page':
      return <FrontPageSaver still={still} />;
  }
}
