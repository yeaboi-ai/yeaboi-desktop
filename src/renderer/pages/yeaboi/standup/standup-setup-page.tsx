'use client';

// Standup setup — who is on the team, which repos count, which docs count,
// and how your own activity is attributed. The terminal's four configure
// flows, as one page of sections over standup_config_get/_set.
//
// Discovery is explicit: a team or repository list is only fetched when asked
// for, because each is a paged API sweep.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { callTool } from '@/lib/yeaboi/api';
import { loadStandup } from '@/lib/yeaboi/dashboards';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { ProjectScopeLine } from '@/components/yeaboi/project-scope-line';
import { useProjectScope } from '@/hooks/yeaboi/use-project-scope';
import {
  ContextSourcesPanel,
  serializeContextSpec,
  type ContextDeps,
} from '@/components/yeaboi/context-sources';
import { Button } from '@/components/ui/button';

interface Config {
  tracker_sources: string[];
  team_members: string[];
  code_sources: string[];
  github_owners: string[];
  github_repositories: string[];
  github_excluded_repositories: string[];
  azdo_projects: string[];
  documentation_sources: string[];
  repo_path: string;
  my_aliases: string;
  transcript_dir: string;
  transcript_review_enabled: boolean;
}

const TRACKERS = ['jira', 'azure_devops'];
const CODE_SOURCES = ['github', 'azure_devops'];
const DOC_SOURCES = ['confluence', 'notion'];

const EMPTY: Config = {
  tracker_sources: [],
  team_members: [],
  code_sources: [],
  github_owners: [],
  github_repositories: [],
  github_excluded_repositories: [],
  azdo_projects: [],
  documentation_sources: [],
  repo_path: '',
  my_aliases: '',
  transcript_dir: '',
  transcript_review_enabled: true,
};

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-body font-medium text-foreground">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

const checkRow = 'flex items-start gap-2.5 cursor-pointer';
const checkInput = 'mt-0.5 accent-[var(--primary)]';
const inputClass =
  'mt-1 w-full rounded-lg bg-secondary/40 border border-border/40 px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40';

function StandupSetupBody() {
  const scope = useProjectScope();
  const [sessionId, setSessionId] = useState('');
  const [config, setConfig] = useState<Config | null>(null);
  const [contextDeps, setContextDeps] = useState<ContextDeps>(null);
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [owners, setOwners] = useState<{ github_owners: string[]; azdo_projects: string[] } | null>(
    null,
  );
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    loadStandup().then(
      async (dash) => {
        setSessionId(dash.session_id);
        const envelope = await callTool<{
          config: (Config & { context_deps?: string[] | null }) | null;
        }>('standup_config_get', {
          session_id: dash.session_id,
        });
        // context_deps rides sibling state: the get returns a list (or null =
        // inherit) while the set speaks the inherit/none/csv string grammar,
        // so it must not travel in the ...config spread.
        const { context_deps: loadedDeps, ...loaded } = envelope.data?.config ?? {};
        setConfig({ ...EMPTY, ...loaded });
        setContextDeps(loadedDeps ?? null);
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  async function discoverTeam() {
    setBusy('team');
    const envelope = await callTool<{ members: { name?: string }[] | string[] }>(
      'standup_members',
      {
        session_id: sessionId,
        tracker_sources: config?.tracker_sources.length ? config.tracker_sources : null,
      },
    );
    setBusy('');
    if (!envelope.ok) return setError(envelope.error?.message ?? 'standup_members failed');
    setCandidates(
      (envelope.data.members as (string | { name?: string })[]).map((m) =>
        typeof m === 'string' ? m : (m.name ?? ''),
      ),
    );
  }

  async function discoverRepos() {
    setBusy('repos');
    const envelope = await callTool<{ github_owners: string[]; azdo_projects: string[] }>(
      'standup_repositories',
      {
        code_sources: config?.code_sources.length ? config.code_sources : null,
      },
    );
    setBusy('');
    if (!envelope.ok) return setError(envelope.error?.message ?? 'standup_repositories failed');
    setOwners({
      github_owners: envelope.data.github_owners,
      azdo_projects: envelope.data.azdo_projects,
    });
  }

  async function save() {
    if (!config) return;
    setBusy('save');
    setError('');
    setNote('');
    const envelope = await callTool('standup_config_set', {
      session_id: sessionId,
      ...config,
      context_deps: serializeContextSpec(contextDeps),
    });
    setBusy('');
    if (envelope.ok) setNote('Saved.');
    else setError(envelope.error?.message ?? 'standup_config_set failed');
  }

  if (error && !config) return <Notice title="Could not load the setup" items={[error]} />;
  if (!config) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const set = (patch: Partial<Config>) => setConfig({ ...config, ...patch });
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl text-foreground">Standup setup</h1>
        {scope.scoped && (
          <div className="mt-1">
            <ProjectScopeLine name={scope.project?.name ?? 'this project'} onClear={scope.clear} />
          </div>
        )}
        <p className="text-[13px] text-muted-foreground mt-1">
          What the standup reads, and who it reads it for.
        </p>
      </div>

      {/* Three source pickers asking the same question of three places: a row,
          not a column of one-line cards down a narrow page. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          title="Team"
          actions={
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => void discoverTeam()}
            >
              {busy === 'team' ? 'Looking…' : 'Find people'}
            </Button>
          }
        >
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            {TRACKERS.map((source) => (
              <label key={source} className={checkRow}>
                <input
                  type="checkbox"
                  className={checkInput}
                  checked={config.tracker_sources.includes(source)}
                  onChange={() => set({ tracker_sources: toggle(config.tracker_sources, source) })}
                />
                <span className="text-[13px] text-foreground">{source}</span>
              </label>
            ))}
          </div>
          {candidates ? (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {candidates.map((name) => (
                <label key={name} className={checkRow}>
                  <input
                    type="checkbox"
                    className={checkInput}
                    checked={config.team_members.includes(name)}
                    onChange={() => set({ team_members: toggle(config.team_members, name) })}
                  />
                  <span className="text-[13px] text-foreground">{name}</span>
                </label>
              ))}
              {!candidates.length && (
                <p className="text-[13px] text-muted-foreground">
                  No candidates came back — check the tracker credentials in Settings.
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {config.team_members.length
                ? `${config.team_members.length} selected: ${config.team_members.join(', ')}`
                : 'Nobody selected yet — the standup runs self-only.'}
            </p>
          )}
        </Section>

        <Section
          title="Code"
          actions={
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => void discoverRepos()}
            >
              {busy === 'repos' ? 'Looking…' : 'Find repositories'}
            </Button>
          }
        >
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            {CODE_SOURCES.map((source) => (
              <label key={source} className={checkRow}>
                <input
                  type="checkbox"
                  className={checkInput}
                  checked={config.code_sources.includes(source)}
                  onChange={() => set({ code_sources: toggle(config.code_sources, source) })}
                />
                <span className="text-[13px] text-foreground">{source}</span>
              </label>
            ))}
          </div>
          {owners ? (
            <>
              <h3 className="text-[12px] font-medium text-foreground mb-1">GitHub owners</h3>
              <p className="text-[11px] text-muted-foreground mb-2">
                One owner covers every active repository inside it.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
                {owners.github_owners.map((owner) => (
                  <label key={owner} className={checkRow}>
                    <input
                      type="checkbox"
                      className={checkInput}
                      checked={config.github_owners.includes(owner)}
                      onChange={() => set({ github_owners: toggle(config.github_owners, owner) })}
                    />
                    <span className="text-[13px] text-foreground">{owner}</span>
                  </label>
                ))}
              </div>
              <h3 className="text-[12px] font-medium text-foreground mb-2">
                Azure DevOps projects
              </h3>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {owners.azdo_projects.map((project) => (
                  <label key={project} className={checkRow}>
                    <input
                      type="checkbox"
                      className={checkInput}
                      checked={config.azdo_projects.includes(project)}
                      onChange={() => set({ azdo_projects: toggle(config.azdo_projects, project) })}
                    />
                    <span className="text-[13px] text-foreground">{project}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {config.github_owners.length || config.azdo_projects.length
                ? [...config.github_owners, ...config.azdo_projects].join(', ')
                : 'No code scope yet.'}
            </p>
          )}
        </Section>

        <Section title="Documentation">
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-3">
            {DOC_SOURCES.map((source) => (
              <label key={source} className={checkRow}>
                <input
                  type="checkbox"
                  className={checkInput}
                  checked={config.documentation_sources.includes(source)}
                  onChange={() =>
                    set({ documentation_sources: toggle(config.documentation_sources, source) })
                  }
                />
                <span className="text-[13px] text-foreground">{source}</span>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Repository documentation follows the code repositories selected above.
          </p>
        </Section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title="You">
          <label className="block mb-3">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Local repository
            </span>
            <input
              type="text"
              value={config.repo_path}
              placeholder="/Users/you/code/project"
              onChange={(e) => set({ repo_path: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block mb-2">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Your other names
            </span>
            <input
              type="text"
              value={config.my_aliases}
              placeholder="ana, ana.dev, a.smith@work.com"
              onChange={(e) => set({ my_aliases: e.target.value })}
              className={inputClass}
            />
          </label>
          <p className="text-[11px] text-muted-foreground mb-3">
            Commit authors and tracker names that are also you, so your activity lands on your card.
          </p>
          <label className="block mb-3">
            <span className="text-[11px] font-body text-muted-foreground uppercase tracking-wide">
              Transcript folder
            </span>
            <input
              type="text"
              value={config.transcript_dir}
              placeholder="~/.yeaboi/transcripts"
              onChange={(e) => set({ transcript_dir: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className={checkRow}>
            <input
              type="checkbox"
              className={checkInput}
              checked={config.transcript_review_enabled}
              onChange={() => set({ transcript_review_enabled: !config.transcript_review_enabled })}
            />
            <span className="text-[13px] text-foreground">
              Review yesterday&apos;s meeting before today&apos;s standup
            </span>
          </label>
        </Section>

        <Section title="Context">
          <ContextSourcesPanel
            value={contextDeps}
            onChange={setContextDeps}
            note="Saved with the setup — every standup run for this session reads it."
          />
        </Section>
      </div>

      {error && <Notice title="Could not save" items={[error]} />}
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}

      <div className="flex items-center gap-3">
        <Button size="sm" disabled={!!busy} onClick={() => void save()}>
          {busy === 'save' ? 'Saving…' : 'Save setup'}
        </Button>
        <Link
          href={scope.href('/team/standup')}
          className="text-[12px] text-muted-foreground hover:text-foreground"
        >
          Back to the standup
        </Link>
      </div>
    </div>
  );
}

export default function StandupSetupPage() {
  return (
    <PageShell>
      <BackendGate>
        <StandupSetupBody />
      </BackendGate>
    </PageShell>
  );
}
