"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectCard } from "@/components/project-card";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export default function ProjectsPage() {
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const router = useRouter();
  // Was a Next server action; the desktop talks to FastAPI directly.
  const createProject = useCallback(
    async (data: { description: string; name?: string }) => {
      const resp = await authFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!resp.ok) throw new Error(`create project failed: ${resp.status}`);
      return resp.json();
    },
    [authFetch],
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  // Render nothing until we know the user has finished onboarding. Otherwise
  // the projects page paints for one frame before the redirect fires, which
  // shows up as a flash of the wrong UI right after first-time sign-in.
  const [gate, setGate] = useState<"checking" | "redirecting" | "ok">("checking");

  useEffect(() => {
    if (!ready) return;

    authFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        void me; // onboarding gate is a web-app concern; desktop goes straight in
        setGate("ok");
      })
      .catch(() => {
        logger.warn("Failed to check onboarding status");
        setGate("ok");
      });

    // Fetch projects (includes X-Team-Id header) — runs in parallel so when
    // the gate clears the page is already populated.
    setLoading(true);
    authFetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProjects(data))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [ready, authFetch, router, teamVersion]);

  const refetchProjects = useCallback(() => {
    authFetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setProjects(data))
      .catch(() => logger.warn("Failed to refresh projects"));
  }, [authFetch]);

  if (gate !== "ok") {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-6 py-14">

        {/* Page masthead — asymmetric split */}
        <div className="flex items-end justify-between mb-14 gap-8">
          <div className="max-w-lg animate-slide-up stagger-1">
            <p className="text-xs font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
              Workspace
            </p>
            <h1 className="font-display text-6xl italic leading-[1.05] text-foreground">
              Projects
            </h1>
          </div>

          <div className="flex flex-col items-end gap-2 animate-fade-in stagger-2 shrink-0">
            {!loading && projects.length > 0 && (
              <span className="text-xs text-muted-foreground font-body tabular-nums">
                {projects.length} project{projects.length !== 1 ? "s" : ""}
              </span>
            )}
            <CreateProjectDialog onCreate={createProject} onCreated={refetchProjects} />
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mb-12 animate-fade-in stagger-2" />

        {/* Content */}
        {loading ? (
          <div className="space-y-4 animate-slide-up stagger-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="rounded-lg border border-border h-32 bg-card animate-pulse"
                style={{ animationDelay: `${n * 80}ms` }}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={createProject} onCreated={refetchProjects} />
        ) : (
          <ProjectGrid projects={projects} />
        )}
      </main>
    </div>
  );
}

function EmptyState({ onCreate, onCreated }: { onCreate: (data: { description: string; name?: string }) => Promise<unknown>; onCreated: () => void }) {
  return (
    <div className="animate-slide-up stagger-3">
      <div className="border border-border border-dashed rounded-lg p-16 flex flex-col justify-between min-h-[280px]">
        <div>
          <p className="text-xs font-body font-medium tracking-[0.15em] uppercase text-muted-foreground/60 mb-6">
            No projects yet
          </p>
          <p className="font-display text-4xl italic text-muted-foreground/40 leading-tight max-w-sm">
            Start your first<br />planning session
          </p>
        </div>
        <div className="mt-8">
          <CreateProjectDialog onCreate={onCreate} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}

function ProjectGrid({ projects }: { projects: Project[] }) {
  if (projects.length === 0) return null;

  const [featured, ...rest] = projects;

  return (
    <div className="space-y-4">
      {/* Featured project — full width, taller */}
      <div className="animate-slide-up stagger-3">
        <ProjectCard
          id={featured.id}
          name={featured.name}
          description={featured.description}
          createdAt={featured.created_at}
          featured
        />
      </div>

      {/* Remaining — 60/40 or 3-col depending on count */}
      {rest.length > 0 && (
        <div
          className={`grid gap-4 ${
            rest.length === 1
              ? "grid-cols-1 max-w-lg"
              : rest.length === 2
              ? "grid-cols-[3fr_2fr]"
              : "grid-cols-[2fr_1fr_1fr]"
          }`}
        >
          {rest.map((p, i) => (
            <div
              key={p.id}
              className={`animate-slide-up`}
              style={{ animationDelay: `${(i + 4) * 60}ms` }}
            >
              <ProjectCard
                id={p.id}
                name={p.name}
                description={p.description}
                createdAt={p.created_at}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
