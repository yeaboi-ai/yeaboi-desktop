'use client';

// Home: the front page. Section one is the paper, section two the two doors.

import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { FrontPage } from './home/front-page';

export default function HomePage() {
  return (
    <PageShell>
      <BackendGate>
        <FrontPage />
      </BackendGate>
    </PageShell>
  );
}
