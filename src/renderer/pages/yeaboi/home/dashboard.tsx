'use client';

// Home, as the deck's first surface: where the work stands, not a menu of
// things to launch. The modes are one scroll away now, so this page's job is
// to answer "what happened, and what is next" before you go anywhere.
//
// Some of that the backend can answer today and some of it cannot. The tiles
// it cannot are drawn as themselves, labelled as waiting on their endpoint —
// a dashboard of invented numbers is worse than an honest gap, because you
// cannot tell by looking which half you are allowed to believe.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Columns3, LayoutGrid, Share2, Sparkles } from 'lucide-react';

import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { apiGet } from '@/lib/yeaboi/api';

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Board {
  id: string;
  title?: string;
  name?: string;
  mode?: string;
  created_at?: string;
}

interface ChangelogEntry {
  version?: string;
  title?: string;
  date?: string;
}

/** A tile with no endpoint behind it yet. Said plainly rather than filled with
 *  a plausible number, so nothing here has to be second-guessed. */
function AwaitingTile({ title, wants }: { title: string; wants: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 bg-card/30 p-4">
      <p className="font-body text-[12px] font-medium text-muted-foreground">{title}</p>
      <p className="mt-2 font-body text-[11px] leading-relaxed text-muted-foreground/60">
        Waiting on <span className="font-code">{wants}</span>
      </p>
    </div>
  );
}

function Tile({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof LayoutGrid;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <p className="flex items-center gap-2 font-body text-[12px] font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-[11px] text-muted-foreground/70">{children}</p>;
}

export function HomeDashboard({ audience }: { audience: 'solo' | 'team' }) {
  const router = useRouter();
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const [projects, setProjects] = useState<Project[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [shares, setShares] = useState<unknown[]>([]);
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);

  useEffect(() => {
    if (!ready) return;
    authFetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Project[]) => setProjects(rows.slice(0, 5)))
      .catch(() => setProjects([]));
  }, [ready, authFetch, teamVersion]);

  useEffect(() => {
    apiGet<{ boards?: Board[] }>('/api/boards').then(
      (data) => setBoards((data?.boards ?? []).slice(0, 5)),
      () => setBoards([]),
    );
    apiGet<{ shares?: unknown[] }>('/api/shares').then(
      (data) => setShares(data?.shares ?? []),
      () => setShares([]),
    );
    apiGet<{ entries?: ChangelogEntry[] }>('/api/meta/changelog').then(
      (data) => setChangelog((data?.entries ?? []).slice(0, 3)),
      () => setChangelog([]),
    );
  }, []);

  return (
    <div data-deck-scroll className="h-[calc(100vh-var(--titlebar-h))] overflow-y-auto px-8 py-8">
      <h1 className="font-display text-2xl text-foreground">
        {audience === 'solo' ? 'Your desk' : "Your team's desk"}
      </h1>
      <p className="mt-1 font-body text-[12px] text-muted-foreground">
        Scroll to move through the modes.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Tile title="Projects" icon={LayoutGrid}>
          {projects.length === 0 ? (
            <Empty>Nothing yet — a project is where ceremonies share memory.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/projects/${project.id}`)}
                    className="w-full truncate rounded-lg px-2 py-1 text-left font-body text-[12px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                  >
                    {project.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile title="Recent boards" icon={Columns3}>
          {boards.length === 0 ? (
            <Empty>No boards run yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {boards.map((board) => (
                <li
                  key={board.id}
                  className="truncate px-2 font-body text-[12px] text-muted-foreground"
                >
                  {board.title ?? board.name ?? board.mode ?? board.id}
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile title="Shared out" icon={Share2}>
          {shares.length === 0 ? (
            <Empty>Nothing shared yet.</Empty>
          ) : (
            <p className="font-body text-[26px] leading-none text-foreground">{shares.length}</p>
          )}
        </Tile>

        <Tile title="What's new" icon={Sparkles}>
          {changelog.length === 0 ? (
            <Empty>Up to date.</Empty>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {changelog.map((entry, index) => (
                <li
                  key={entry.version ?? index}
                  className="truncate px-2 font-body text-[12px] text-muted-foreground"
                >
                  {entry.title ?? entry.version}
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <AwaitingTile title="Velocity" wants="/api/analysis/velocity" />
        <AwaitingTile title="Last retro" wants="/api/retro/recent" />
        <AwaitingTile title="Next standup" wants="/api/standup/schedule" />
        <AwaitingTile title="Sprint progress" wants="/api/analysis/sprint" />
      </div>
    </div>
  );
}
