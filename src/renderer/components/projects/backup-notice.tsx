'use client';

// Projects were removed by an update nobody chose, so the app says once where
// the old data went. Dismissed per machine — the file stays where it is, and
// the release notes say the same thing for anyone who dismisses it too fast.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const SEEN_KEY = 'projects-backup-notice-seen';

interface Backup {
  database: string;
  uploads: string | null;
  taken_at: string;
}

export function BackupNotice({ fetcher }: { fetcher: (path: string) => Promise<Response> }) {
  const [backup, setBackup] = useState<Backup | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      // A browser that refuses storage shows the notice every time, which is
      // the safe direction for something the user may still need to act on.
      seen = false;
    }
    if (seen) return;
    setDismissed(false);
    fetcher('/api/local/backup')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setBackup(body?.backup ?? null))
      .catch(() => setBackup(null));
  }, [fetcher]);

  if (dismissed || !backup) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Nothing to do — the notice reappears next launch.
    }
  };

  return (
    <div
      role="status"
      className="relative mt-6 rounded-lg border border-border bg-secondary/30 px-5 py-4 pr-12"
    >
      <p className="text-[13px] font-body leading-relaxed text-foreground">
        Projects were removed in this update, and everything that lived only inside one went with
        them. Your previous data was copied first.
      </p>
      <p className="mt-2 break-all font-mono text-[12px] leading-relaxed text-muted-foreground">
        {backup.database}
        {backup.uploads && (
          <>
            <br />
            {backup.uploads}
          </>
        )}
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
