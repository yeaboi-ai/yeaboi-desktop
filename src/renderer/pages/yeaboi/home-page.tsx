'use client';

// Home: the front page. Section one is the paper, section two the two doors.

import { BackendGate } from '@/components/yeaboi/backend-gate';
import { FrontPage } from './home/front-page';

export default function HomePage() {
  return (
    <BackendGate>
      {/* Niko's pill floats over the bottom of the window; the padding keeps
          the last row reachable under it. */}
      <div className="mx-auto max-w-5xl px-6 py-10 pb-40">
        <FrontPage />
      </div>
    </BackendGate>
  );
}
