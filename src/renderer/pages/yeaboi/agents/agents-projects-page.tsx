'use client';

// The Agents world's Projects: the same platform projects, each a place to
// scope the four reports to one repo. A row says whether a repo is linked.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RoboMark } from '@/components/brand/robo';
import { KITS } from '@/lib/yeaboi/kits';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { repoHost } from '@/lib/yeaboi/project-scope';
import { relativeDay } from '@/lib/yeaboi/sessions';

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  repo_url?: string | null;
}

export default function AgentsProjectsPage() {
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) return;
    authFetch('/api/projects')
      .then(async (r) => {
        if (!r.ok) throw new Error(`The projects could not be read (${r.status}).`);
        return (await r.json()) as Project[];
      })
      .then(setProjects, (e: Error) => {
        setError(e.message);
        setProjects([]);
      });
  }, [ready, authFetch, teamVersion]);

  const now = new Date();
  const sorted = [...(projects ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto max-w-5xl px-6 py-14 pb-40">
      <header className="animate-slide-up stagger-1">
        <div className="flex items-center gap-4">
          <RoboMark kit={KITS.agents.projects} size={40} />
          <h1 className="font-display italic text-[40px] leading-none text-foreground">Projects</h1>
        </div>
        <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
          The same projects, seen by the agents. Link a repo path and the reports read that
          repo&rsquo;s sessions alone.
        </p>
      </header>

      <div className="mt-10 animate-slide-up stagger-2">
        {error && <p className="mb-4 text-[13px] text-muted-foreground">{error}</p>}
        {projects === null ? (
          <p className="text-[13px] text-muted-foreground">Loading…</p>
        ) : sorted.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Nothing here yet.{' '}
            <Link href="/projects" className="text-primary hover:underline">
              Create the first project
            </Link>{' '}
            and it will appear here too.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {sorted.map((project) => {
              const host = repoHost(project.repo_url);
              return (
                <li key={project.id}>
                  <Link
                    href={`/agents/projects/${project.id}`}
                    className="group flex items-baseline justify-between gap-8 py-4"
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-body font-medium text-foreground transition-colors group-hover:text-primary">
                        {project.name}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                        {host || 'no linked repo'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                      {relativeDay(project.created_at, now)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
