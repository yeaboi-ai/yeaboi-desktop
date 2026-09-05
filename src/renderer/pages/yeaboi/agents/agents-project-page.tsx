'use client';

// One project, seen by the agents: the repo path its reports are scoped to,
// then the three kinds as tabs over that repo's sessions. Security stays
// machine-wide whatever project it is opened from.
//
// Opening the page only reads the engine pointer; a project with none is
// minted when the repo path is first saved, never on open.
//
// Three things a sidecar can say to a scoped read, and the page says each
// back honestly: it scoped the report (run fresh, since saved reports carry
// no project), it ignored the scope (show the machine-wide report and say
// so), or it has no such route (send the reader to the machine-wide page).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocation, useParams } from 'react-router';
import { DOOR_MASCOT } from '@/lib/audience/worlds';
import { Notice, ReportView, ScanProgress, type Report } from '@/components/agents/agent-report';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { ensureEngineProject } from '@/lib/yeaboi/engine-project';
import {
  loadEngineProject,
  repoPathCommand,
  repoPathOf,
  setEngineProjectDefaults,
} from '@/lib/yeaboi/project-defaults';
import {
  MACHINE_WIDE_KINDS,
  type AgentModeOption,
  type AgentRunState,
  type AgentScopeState,
  agentScopeState,
  emptyAgentRun,
  loadAgentLatest,
  loadAgentModes,
  reduceAgentRun,
  runAgentMode,
} from '@/lib/yeaboi/ops';

interface Project {
  id: string;
  name: string;
  description: string | null;
  yeaboi_project_id?: string | null;
  repo_url?: string | null;
}

const KINDS = ['usage', 'advisor', 'security'];

function RepoPathField({
  ensureEngineId,
  path,
  onSaved,
}: {
  /** The engine project to write to, minted on the first save. */
  ensureEngineId: () => Promise<string>;
  path: string;
  onSaved: (path: string) => void;
}) {
  const [draft, setDraft] = useState(path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(path), [path]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      const engineId = await ensureEngineId();
      const row = await setEngineProjectDefaults(engineId, { repo_path: draft.trim() });
      onSaved(repoPathOf(row));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <div>
      <label htmlFor="repo-path" className="text-[13px] font-body font-medium text-foreground">
        Repo path
      </label>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        The absolute path of the repository on this machine. A worktree under it counts.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Input
          id="repo-path"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="/Users/you/code/the-repo"
          className="max-w-md font-code text-[12px]"
        />
        <Button size="sm" disabled={busy || draft.trim() === path} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {error && <p className="mt-1 text-[12px] text-muted-foreground">{error}</p>}
    </div>
  );
}

function ScopedReport({
  kind,
  engineId,
  repoPath,
  option,
}: {
  kind: string;
  engineId: string;
  repoPath: string;
  option?: AgentModeOption;
}) {
  const machineWide = MACHINE_WIDE_KINDS.has(kind);
  const wanted = machineWide ? '' : engineId;
  const [state, setState] = useState<AgentScopeState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [asOf, setAsOf] = useState('');
  const [run, setRun] = useState<AgentRunState>(emptyAgentRun);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setRunning(true);
    setRun(emptyAgentRun());
    let next = emptyAgentRun();
    try {
      await runAgentMode(
        kind,
        (line) => {
          next = reduceAgentRun(next, line);
          setRun(next);
        },
        wanted ? { projectId: wanted } : {},
      );
      if (next.report) {
        setReport(next.report);
        setAsOf('');
      } else if (next.error) {
        setNotice(next.error);
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [kind, wanted]);

  useEffect(() => {
    setState(null);
    setReport(null);
    setAsOf('');
    setNotice('');
    loadAgentLatest(kind, wanted ? { projectId: wanted } : {}).then(
      (latest) => {
        const scope = agentScopeState(latest, wanted);
        setState(scope);
        setReport(latest?.report ?? null);
        setAsOf(latest?.as_of ?? '');
        // A scoped read has nothing saved to show; run the pass now.
        if (scope === 'scoped' || (scope === 'unscoped' && !latest?.report)) void refresh();
      },
      (e: Error) => setNotice(e.message),
    );
  }, [kind, wanted, refresh]);

  if (state === null && !notice) {
    return <p className="text-[13px] text-muted-foreground">Reading the latest report…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-[16px] font-body font-medium text-foreground">
            {option?.label ?? kind}
          </h3>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {state === null
              ? 'The report could not be read.'
              : machineWide
                ? 'Security reads the whole machine whichever project it is opened from.'
                : state === 'scoped'
                  ? `Scoped to ${repoPath}.`
                  : state === 'unscoped'
                    ? 'This sidecar cannot scope reports to a repo yet. This is the machine-wide report.'
                    : 'This sidecar has no such report.'}
          </p>
        </div>
        {state !== 'unsupported' && (
          <Button size="sm" disabled={running} onClick={() => void refresh()}>
            {running ? 'Running…' : 'Re-run'}
          </Button>
        )}
      </div>

      {notice && <Notice title="Note" items={[notice]} />}
      {state === 'unsupported' && (
        <p className="text-[13px] text-muted-foreground">
          <Link href={`/agents/${kind}`} className="text-primary hover:underline">
            Open the machine-wide report
          </Link>{' '}
          instead.
        </p>
      )}
      {asOf && running && (
        <p className="text-[12px] text-muted-foreground">
          Showing the report saved at {asOf} while a fresh pass runs.
        </p>
      )}
      {(running || !report) && <ScanProgress run={run} />}
      {report ? (
        <ReportView kind={kind} report={report} />
      ) : (
        state !== 'unsupported' &&
        !running && (
          <p className="text-[13px] text-muted-foreground">
            No report yet. Re-run to read this repo&rsquo;s sessions.
          </p>
        )
      )}
    </div>
  );
}

function AgentsProjectBody({ projectId }: { projectId: string }) {
  const Mascot = DOOR_MASCOT.agents.projects;
  const { authFetch, ready } = useAuthFetch();
  const [project, setProject] = useState<Project | null>(null);
  const [engineId, setEngineId] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [defaults, setDefaults] = useState<'reading' | 'ready' | 'unreadable'>('reading');
  const [modes, setModes] = useState<AgentModeOption[]>([]);
  const { search } = useLocation();
  const [kind, setKind] = useState(() => {
    const wanted = new URLSearchParams(search).get('kind') ?? '';
    return KINDS.includes(wanted) ? wanted : KINDS[0]!;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    loadAgentModes().then(
      (page) => setModes(page.modes),
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    authFetch(`/api/projects/${encodeURIComponent(projectId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`The project could not be read (${r.status}).`);
        return (await r.json()) as Project;
      })
      .then(async (row) => {
        if (stale) return;
        setProject(row);
        const id = row.yeaboi_project_id ?? '';
        setEngineId(id);
        // No engine project yet: nothing to read, and the field starts empty.
        if (!id) {
          setDefaults('ready');
          return;
        }
        const engine = await loadEngineProject(id);
        if (stale) return;
        setDefaults(engine === null ? 'unreadable' : 'ready');
        setRepoPath(repoPathOf(engine));
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [projectId, ready, authFetch]);

  const ensureEngineId = useCallback(async () => {
    if (engineId) return engineId;
    if (!project) throw new Error('The project has not loaded yet.');
    const id = await ensureEngineProject(authFetch, project);
    setEngineId(id);
    return id;
  }, [engineId, project, authFetch]);

  if (error) return <Notice title="Could not open this project" items={[error]} />;
  if (!project) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-10">
      <header className="animate-slide-up stagger-1">
        <Link
          href="/agents/projects"
          className="text-[13px] font-body text-muted-foreground hover:text-foreground"
        >
          Projects
        </Link>
        <div className="mt-3 flex items-center gap-4">
          <Mascot size={40} />
          <h1 className="font-display italic text-[40px] leading-none text-foreground">
            {project.name}
          </h1>
        </div>
        {project.description && (
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            {project.description}
          </p>
        )}
      </header>

      <section className="animate-slide-up stagger-2">
        {defaults === 'reading' ? (
          <p className="text-[13px] text-muted-foreground">Reading the project&rsquo;s defaults…</p>
        ) : defaults === 'ready' ? (
          <RepoPathField ensureEngineId={ensureEngineId} path={repoPath} onSaved={setRepoPath} />
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            This project&rsquo;s defaults could not be read: either this sidecar predates them, or
            the engine project it points at no longer exists. The terminal can still set the path:{' '}
            <code className="font-code text-[12px] text-foreground">
              {repoPathCommand(engineId)}
            </code>
          </p>
        )}
      </section>

      {defaults !== 'reading' && (
        <section className="animate-slide-up stagger-3">
          {repoPath ? (
            <>
              <div
                role="tablist"
                aria-label="Report"
                className="flex gap-1 border-b border-border/60"
              >
                {KINDS.map((k) => {
                  const active = k === kind;
                  const option = modes.find((m) => m.kind === k || m.key === k);
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setKind(k)}
                      className={`relative px-3 py-2.5 text-[13px] font-body font-medium transition-colors ${
                        active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {option?.label ?? k}
                      <span
                        aria-hidden
                        className={`absolute inset-x-0 -bottom-px h-[2px] rounded-t-sm bg-primary transition-opacity ${
                          active ? 'opacity-100' : 'opacity-0'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="mt-6">
                <ScopedReport
                  key={kind}
                  kind={kind}
                  engineId={engineId}
                  repoPath={repoPath}
                  option={modes.find((m) => m.kind === kind || m.key === kind)}
                />
              </div>
            </>
          ) : (
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Link a repo path and the three reports will read that repo&rsquo;s sessions alone.
              Until then,{' '}
              <Link href="/agents/usage" className="text-primary hover:underline">
                the machine-wide reports
              </Link>{' '}
              are a Session away.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

export default function AgentsProjectPage() {
  const { id = '' } = useParams();
  return (
    <PageShell>
      <BackendGate>
        <AgentsProjectBody projectId={id} />
      </BackendGate>
    </PageShell>
  );
}
