'use client';

// The workspace worlds' landing — Solo and Team share it: two doors, and the
// difference between them is the whole point. A project workspace is durable,
// cross-mode scope; a one-off session is a single unscoped run saved in its
// mode's own history. The doors are teachers, not extra clicks — each one's
// content sits below it. The audience decides only the eyebrow, the mode grid
// (Solo has no retro/poker/performance) and a few words of copy.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Columns3, LayoutGrid, Zap } from 'lucide-react';
import { apiGet } from '@/lib/yeaboi/api';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { TipCompanion } from '@/components/yeaboi/tip-companion';
import { ModeCardGrid, type ModeCard } from '@/components/yeaboi/mode-card-grid';
import { MODE_ROUTES, type Tip } from '@/lib/yeaboi/tips';

interface CategoryCard {
  key: string;
  title: string;
  verb: string;
  capabilities: string[];
  color: string;
}

interface Capabilities {
  categories: CategoryCard[];
  /** The Solo menu. Absent on a sidecar that predates the Solo world. */
  solo?: ModeCard[];
  /** The Team menu (the key predates the Solo world). */
  modes: ModeCard[];
  agents: ModeCard[];
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

/** The cards a one-off run can be: the run-modes alone. Planning is the
 *  project door's whole world, and usage/settings are live views, not runs. */
const NOT_ONE_OFF = new Set(['project-planning', 'usage', 'settings']);

/** Old-sidecar fallback: the Team cards Solo deliberately does not carry. */
const SOLO_EXCLUDED = new Set(['retro', 'poker', 'performance']);

const VERB_FALLBACK: Record<'solo' | 'team', string> = {
  solo: 'Run your own show',
  team: "Run your team's scrum",
};

export function WorkspaceHome({ audience }: { audience: 'solo' | 'team' }) {
  const router = useRouter();
  const { authFetch, ready, teamVersion } = useAuthFetch();
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const oneOffRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<Capabilities>('/api/meta/capabilities').then(setCaps, (e: Error) => setError(e.message));
    apiGet<{ tips: Tip[] }>('/api/meta/tips').then(
      ({ tips: loaded }) => setTips(loaded),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    authFetch('/api/projects')
      .then((resp) => (resp.ok ? resp.json() : []))
      .then((rows: Project[]) => setProjects(rows.slice(0, 4)))
      .catch(() => setProjects([]));
  }, [ready, authFetch, teamVersion]);

  if (error)
    return (
      <p className="text-[13px] text-muted-foreground">
        Could not load the mode inventory: {error}
      </p>
    );
  if (!caps) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  // `humans` is the pre-rename key an older sidecar still serves for Team.
  const category =
    caps.categories.find((c) => c.key === audience) ??
    (audience === 'team' ? caps.categories.find((c) => c.key === 'humans') : undefined);
  const menu =
    audience === 'solo'
      ? (caps.solo ?? caps.modes.filter((card) => !SOLO_EXCLUDED.has(card.key)))
      : caps.modes;
  const runModes = menu.filter((card) => !NOT_ONE_OFF.has(card.key));
  const open = (key: string) => {
    const route = MODE_ROUTES[key];
    if (route) router.push(route);
  };

  return (
    <>
      <p
        data-audience-accented
        className="text-[11px] font-body uppercase tracking-wide mb-3"
        style={{ color: 'var(--audience-accent)' }}
      >
        {category?.title ?? (audience === 'solo' ? 'Solo' : 'Team')} —{' '}
        {category?.verb ?? VERB_FALLBACK[audience]}
      </p>

      {/* The two doors. Equal, and each explains when it is the right one. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="rounded-2xl bg-card ring-1 ring-border/60 px-6 py-6 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40 flex flex-col"
        >
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
            <LayoutGrid className="h-4 w-4 text-primary" />
            Project workspace
          </h3>
          <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed">
            {audience === 'solo'
              ? 'A durable home for one piece of work. Every ceremony you run inside it — planning, standups, reporting — shares the same memory: sessions link to the project, and context carries from one run into the next.'
              : 'A durable home for one piece of work. Every ceremony you run inside it — planning, standups, retros, poker — shares the same memory: sessions link to the project, and context carries from one ceremony into the next.'}
          </p>
          <p className="mt-3 text-[12px] font-body font-medium text-foreground/80">
            Pick this when the work has a name and you&rsquo;ll come back to it.
          </p>
        </button>
        <button
          type="button"
          onClick={() => oneOffRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="rounded-2xl bg-card ring-1 ring-border/60 px-6 py-6 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40 flex flex-col"
        >
          <h3 className="flex items-center gap-2 font-display text-lg text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            One-off session
          </h3>
          <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed">
            A single, independent run of one mode. Nothing is scoped to a project and nothing
            carries over; the run saves to that mode&rsquo;s own history and the next run starts
            clean.
          </p>
          <p className="mt-3 text-[12px] font-body font-medium text-foreground/80">
            {audience === 'solo'
              ? 'Pick this when you just need a standup or a report — right now.'
              : 'Pick this when you just need a standup, a retro, or a report — right now.'}
          </p>
        </button>
      </div>

      {/* What the project door leads to. */}
      {projects.length > 0 && (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[13px] font-body font-medium text-foreground">Recent projects</h2>
            <button
              type="button"
              onClick={() => router.push('/board')}
              className="flex items-center gap-1.5 text-[12px] font-body text-muted-foreground hover:text-foreground transition-colors"
            >
              <Columns3 className="h-3.5 w-3.5" />
              Board — every ticket in one place
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => router.push(`/projects/${project.id}`)}
                className="rounded-2xl bg-card ring-1 ring-border/60 px-4 py-3 text-left transition-colors hover:ring-primary/40 hover:bg-secondary/40"
              >
                <p className="text-[13px] font-body font-medium text-foreground truncate">
                  {project.name}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground truncate">
                  {project.description ?? new Date(project.created_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* What the one-off door leads to. */}
      <div ref={oneOffRef} className="scroll-mt-6">
        <h2 className="text-[13px] font-body font-medium text-foreground mb-3">
          One-off sessions — pick a mode
        </h2>
        <ModeCardGrid cards={runModes} onOpen={open} />
      </div>

      <TipCompanion tips={tips} cards={runModes} onNavigate={(route) => router.push(route)} />
    </>
  );
}
