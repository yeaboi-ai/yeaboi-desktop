'use client';

// The front page: the paper, one story at a time. Reached from the home's
// foot, the Go menu and the palette; the home itself is the mode menu.

import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { FrontPage } from './front-page';

export default function NewsPage() {
  return (
    <PageShell>
      <BackendGate>
        <FrontPage />
      </BackendGate>
    </PageShell>
  );
}
