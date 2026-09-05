'use client';

// Projects — the durable way to work. Every run inside one reads what the
// runs before it left behind, and the flow strip says which reads which. In
// progress and Completed are two plain lists; the board and the roadmap
// intake are reached from the header.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocation } from 'react-router';
import { CreateProjectDialog } from '@/components/create-project-dialog';
import { ContextFlow } from '@/components/projects/context-flow';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAudience } from '@/components/providers/audience-provider';
import { DOOR_MASCOT } from '@/lib/audience/worlds';
import { PROJECTS_HEADER_LINKS } from '@/lib/nav/sections';
import { allCards, loadCapabilities, menuFor, type Capabilities } from '@/lib/yeaboi/capabilities';
import { splitProjects } from '@/lib/yeaboi/projects';
import { fallbackFlowKeys, flowFor } from '@/lib/yeaboi/reads';
import { relativeDay } from '@/lib/yeaboi/sessions';
import { logger } from '@/lib/logger';
import { PageShell } from '@/components/page-shell';

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at?: string;
  status?: string;
}

function ProjectRows({ projects, now }: { projects: Project[]; now: Date }) {
  return (
    <ul className="divide-y divide-border/50">
      {projects.map((project) => (
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
              {relativeDay(project.updated_at ?? project.created_at, now)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function ProjectsPage() {
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const { audience } = useAudience();
  const Mascot = DOOR_MASCOT[audience].projects;
  const router = useRouter();
  const { search } = useLocation();
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
      return (await resp.json()) as { id: string };
    },
    [authFetch],
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // null while the sidecar is being asked, or when it cannot be; the flow
  // strip never waits on it.
  const [caps, setCaps] = useState<Capabilities | null>(null);
  // Render nothing until we know the user has finished onboarding. Otherwise
  // the projects page paints for one frame before the redirect fires, which
  // shows up as a flash of the wrong UI right after first-time sign-in.
  const [gate, setGate] = useState<'checking' | 'redirecting' | 'ok'>('checking');

  useEffect(() => {
    loadCapabilities().then(setCaps, () => setCaps(null));
  }, []);

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
  }, [ready, authFetch, teamVersion]);

  const steps = useMemo(
    () =>
      flowFor(
        audience,
        caps ? menuFor(caps, audience).map((card) => card.key) : fallbackFlowKeys(audience),
      ),
    [audience, caps],
  );
  const colors = useMemo(
    () => Object.fromEntries((caps ? allCards(caps) : []).map((card) => [card.key, card.color])),
    [caps],
  );

  if (gate !== 'ok') {
    return <div className="min-h-[var(--page-min-h)] bg-background" aria-busy="true" />;
  }

  const now = new Date();
  const { active, done } = splitProjects(projects);
  // After Create the app opens the project; the old view is where the work is.
  const openCreated = (created: { id: string }) => router.push(`/projects/${created.id}`);

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
            Every run inside a project reads what the others left behind: the plan frames the
            standups, the standups feed the retro, the report is about this project alone.
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
            onCreated={openCreated}
            defaultOpen={new URLSearchParams(search).has('new')}
          />
        </div>
      </header>

      <div className="mt-10 animate-slide-up stagger-2">
        <ContextFlow steps={steps} colors={colors} />
      </div>

      <div className="mt-12 animate-slide-up stagger-3">
        {loading ? (
          <div className="divide-y divide-border/50">
            {[1, 2, 3].map((n) => (
              <div key={n} className="py-4">
                <div className="h-4 w-48 rounded bg-secondary/70 animate-pulse" />
              </div>
            ))}
          </div>
        ) : active.length === 0 && done.length === 0 ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Nothing here yet. Describe what you&rsquo;re building and yeaboi names it.
            </p>
            <CreateProjectDialog onCreate={createProject} onCreated={openCreated} />
          </div>
        ) : (
          <div className="space-y-12">
            <section aria-labelledby="projects-active">
              <h2
                id="projects-active"
                className="mb-1 text-[16px] font-body font-medium text-foreground"
              >
                In progress
              </h2>
              {active.length === 0 ? (
                <p className="py-4 text-[14px] leading-relaxed text-muted-foreground">
                  Everything here is done. Reopen one, or describe the next.
                </p>
              ) : (
                <ProjectRows projects={active} now={now} />
              )}
            </section>
            {done.length > 0 && (
              <section aria-labelledby="projects-done">
                <h2
                  id="projects-done"
                  className="mb-1 text-[16px] font-body font-medium text-foreground"
                >
                  Completed
                </h2>
                <ProjectRows projects={done} now={now} />
              </section>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
