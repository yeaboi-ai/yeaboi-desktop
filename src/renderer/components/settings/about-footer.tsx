'use client';

// What is running, at the foot of every settings page: the numbers someone
// reads back into a bug report. It sat under the Privacy page's disclosure
// table, which is where it was written but not where it is looked for.

import { useEffect, useState } from 'react';

import { getShellMeta, getVersion, type ShellMeta, type VersionMeta } from '@/lib/yeaboi/api';

export function AboutFooter() {
  const [shell, setShell] = useState<ShellMeta | null>(null);
  const [backend, setBackend] = useState<VersionMeta | null>(null);

  useEffect(() => {
    getShellMeta().then(setShell, () => undefined);
    getVersion().then(setBackend, () => undefined);
  }, []);

  if (!shell && !backend) return null;
  // A grid, not a run-on line: this is the page someone lands on to read a
  // version number back into a bug report.
  const facts: [string, string][] = [
    ...(shell
      ? ([
          ['Desktop', shell.version],
          ['Electron', shell.electron],
          ['Platform', `${shell.platform}/${shell.arch}`],
        ] as [string, string][])
      : []),
    ...(backend
      ? ([
          ['Backend', backend.version],
          ['Python', backend.python],
        ] as [string, string][])
      : []),
  ];
  return (
    <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-1.5 border-t border-border/40 pt-5 text-[11px] sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="font-body tracking-wide text-muted-foreground/60 uppercase">{label}</dt>
          <dd className="truncate font-code text-foreground/80">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
