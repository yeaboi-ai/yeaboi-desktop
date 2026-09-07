// A service the catalogue has not switched on. The page keeps its tab so the
// option is visible; the panel is one sentence and the way there.

import Link from 'next/link';
import { SERVICE_LABELS, type MusicService } from '@shared/music-links';

export function ServiceOff({ service, offline }: { service: MusicService; offline: boolean }) {
  const label = SERVICE_LABELS[service];
  return (
    <div className="py-10">
      <p className="font-display text-[28px] leading-tight text-foreground">{label} is off.</p>
      <p className="mt-2 max-w-[52ch] text-[13.5px] leading-relaxed text-muted-foreground">
        {offline
          ? 'The backend is not up, so the catalog cannot be read yet.'
          : 'Turn it on in the catalog and it becomes a source here.'}
      </p>
      {!offline && (
        <Link
          href="/settings/connections"
          className="mt-4 inline-block text-[13px] text-primary underline-offset-4 hover:underline"
        >
          Open the catalog
        </Link>
      )}
    </div>
  );
}
