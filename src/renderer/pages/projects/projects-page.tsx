'use client';

// Projects — the durable way to work. Every run inside one shares context.
// A plain list, newest first; the board and the roadmap intake are reached
// from the header.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocation } from 'react-router';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAudience } from '@/components/providers/audience-provider';
import { DOOR_MASCOT } from '@/lib/audience/worlds';
import { PROJECTS_HEADER_LINKS } from '@/lib/nav/sections';
import { relativeDay } from '@/lib/yeaboi/sessions';
import { logger } from '@/lib/logger';
import { PageShell } from '@/components/page-shell';

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function ProjectsPage() {
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const { audience } = useAudience();
  const Mascot = DOOR_MASCOT[audience].projects;
  const router = useRouter();
  // Was a Next server action; the desktop talks to FastAPI directly.
  const createProject = useCallback(
    async (data: { description: string; name?: string }) => {
      const resp = await authFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        // The dialog renders this verbatim, so prefer the backend's wording.
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `Couldn't create the project (${resp.status}).`);
      }
      return resp.json();
    },
    [authFetch],
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // Render nothing until we know the user has finished onboarding. Otherwise
  // the projects page paints for one frame before the redirect fires, which
  // shows up as a flash of the wrong UI right after first-time sign-in.
  const [gate, setGate] = useState<'checking' | 'redirecting' | 'ok'>('checking');

  useEffect(() => {
    if (!ready) return;

    authFetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        void me; // onboarding gate is a web-app concern; desktop goes straight in
        setGate('ok');
      })
      .catch(() => {
        logger.warn('Failed to check onboarding status');
        setGate('ok');
      });

    // Fetch projects (includes X-Team-Id header) — runs in parallel so when
    // the gate clears the page is already populated.
    setLoading(true);
    authFetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [ready, authFetch, router, teamVersion]);

  const refetchProjects = useCallback(() => {
    authFetch('/api/projects')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProjects(data))
      .catch(() => logger.warn('Failed to refresh projects'));
  }, [authFetch]);

  if (gate !== 'ok') {
    return <div className="min-h-[var(--page-min-h)] bg-background" aria-busy="true" />;
  }

  const now = new Date();
  const { search } = useLocation();
  const sorted = [...projects].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <PageShell>
      <header className="flex flex-wrap items-end justify-between gap-6 animate-slide-up stagger-1">
        <div>
          <div className="flex items-center gap-4">
            <Mascot size={40} />
            <h1 className="font-display italic text-[40px] leading-none text-foreground">
              Projects
            </h1>
          </div>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            A durable home for one piece of work. Every run inside it reads what the earlier runs
            left behind: the standup reads the plan, the retro reads the standups.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {PROJECTS_HEADER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] font-body text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <CreateProjectDialog
            onCreate={createProject}
            onCreated={refetchProjects}
            defaultOpen={new URLSearchParams(search).has('new')}
          />
        </div>
      </header>

      <div className="mt-10 animate-slide-up stagger-2">
        {loading ? (
          <div className="divide-y divide-border/50">
            {[1, 2, 3].map((n) => (
              <div key={n} className="py-4">
                <div className="h-4 w-48 rounded bg-secondary/70 animate-pulse" />
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Nothing here yet. Create the first project and every run inside it will share what it
            learns.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {sorted.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="group flex items-baseline justify-between gap-8 py-4"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-body font-medium text-foreground transition-colors group-hover:text-primary">
                      {project.name}
                    </span>
                    {project.description && (
                      <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                        {project.description}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                    {relativeDay(project.created_at, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
