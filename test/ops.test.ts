// The Agents wire's pure decisions: whether a sidecar honoured a project
// scope, and the fold over a run's lines.

import { describe, expect, it, vi } from 'vitest';
import {
  MACHINE_WIDE_KINDS,
  agentScopeState,
  emptyAgentRun,
  reduceAgentRun,
  type AgentLatest,
} from '../src/renderer/lib/yeaboi/ops';

const latest = (over: Partial<AgentLatest> = {}): AgentLatest => ({
  kind: 'usage',
  label: 'Usage',
  report: { total_cost_usd: 1 },
  as_of: '2026-09-01',
  ...over,
});

describe('agentScopeState', () => {
  it('is scoped when the sidecar answered with the repo it scoped to', () => {
    expect(agentScopeState(latest({ report: null, as_of: '', scoped_to: '/r' }), 'proj-1')).toBe(
      'scoped',
    );
  });

  it('is unscoped when an older sidecar ignored the param', () => {
    expect(agentScopeState(latest(), 'proj-1')).toBe('unscoped');
  });

  it('is unscoped when the newer sidecar sends the key empty (a machine-wide kind)', () => {
    expect(agentScopeState(latest({ scoped_to: '' }), 'proj-1')).toBe('unscoped');
  });

  it('is unsupported when there is no such route', () => {
    expect(agentScopeState(null, 'proj-1')).toBe('unsupported');
    expect(agentScopeState(null, '')).toBe('unsupported');
  });

  it('never claims a scope nobody asked for', () => {
    expect(agentScopeState(latest({ scoped_to: '/r' }), '')).toBe('unscoped');
    expect(agentScopeState(latest(), '')).toBe('unscoped');
  });
});

describe('MACHINE_WIDE_KINDS', () => {
  it('keeps security machine-wide and nothing else', () => {
    expect([...MACHINE_WIDE_KINDS]).toEqual(['security']);
  });
});

describe('reduceAgentRun', () => {
  it('keeps the latest event per phase in first-seen order', () => {
    let state = emptyAgentRun();
    state = reduceAgentRun(state, {
      type: 'component',
      component: { component_id: 'scan', label: 'Scan', status: 'running', current: 1, total: 3 },
    });
    state = reduceAgentRun(state, {
      type: 'component',
      component: { component_id: 'price', label: 'Price', status: 'running' },
    });
    state = reduceAgentRun(state, {
      type: 'component',
      component: { component_id: 'scan', label: 'Scan', status: 'done', current: 3, total: 3 },
    });
    expect(state.components.map((c) => `${c.component_id}:${c.status}`)).toEqual([
      'scan:done',
      'price:running',
    ]);
  });

  it('finishes on done with the report, and on error with the message', () => {
    const done = reduceAgentRun(emptyAgentRun(), { type: 'done', report: { x: 1 } });
    expect(done).toMatchObject({ finished: true, report: { x: 1 } });
    const failed = reduceAgentRun(emptyAgentRun(), { type: 'error', message: 'no logs' });
    expect(failed).toMatchObject({ finished: true, error: 'no logs' });
  });

  it('ignores a line type it does not know', () => {
    const state = emptyAgentRun();
    expect(reduceAgentRun(state, { type: 'telemetry' })).toBe(state);
  });
});

describe('runAgentMode and dismissAgentFinding wire bodies', () => {
  it('sends only the knobs that were set, and keeps a zero window', async () => {
    const api = await import('../src/renderer/lib/yeaboi/api');
    const calls: [string, unknown][] = [];
    const stream = vi.spyOn(api, 'apiStream').mockImplementation(async (path, body) => {
      calls.push([path, body]);
    });
    const { runAgentMode } = await import('../src/renderer/lib/yeaboi/ops');
    await runAgentMode('usage', () => {});
    await runAgentMode('usage', () => {}, { projectId: 'proj-1', windowDays: 7 });
    await runAgentMode('security', () => {}, { includeInfo: false });
    await runAgentMode('usage', () => {}, { windowDays: 0 });
    expect(calls).toEqual([
      ['/api/agents/usage/run', {}],
      ['/api/agents/usage/run', { project_id: 'proj-1', window_days: 7 }],
      ['/api/agents/security/run', { include_info: false }],
      ['/api/agents/usage/run', { window_days: 0 }],
    ]);
    stream.mockRestore();
  });

  it('posts a reason to dismiss and an undo flag to restore', async () => {
    const api = await import('../src/renderer/lib/yeaboi/api');
    const calls: [string, unknown][] = [];
    const post = vi.spyOn(api, 'apiPost').mockImplementation(async (path, body) => {
      calls.push([path, body]);
      return { ok: true, dismissed: [] };
    });
    const { dismissAgentFinding } = await import('../src/renderer/lib/yeaboi/ops');
    await dismissAgentFinding('secret:p:/a', 'fixture');
    await dismissAgentFinding('secret:p:/a', '', true);
    expect(calls).toEqual([
      [
        '/api/agents/security/dismiss',
        { key: 'secret:p:/a', reason: 'fixture', include_info: false },
      ],
      ['/api/agents/security/dismiss', { key: 'secret:p:/a', undo: true, include_info: false }],
    ]);
    post.mockRestore();
  });
});

describe('security wire bodies', () => {
  it('sends a verdict with its keys and the info flag', async () => {
    const api = await import('../src/renderer/lib/yeaboi/api');
    const ops = await import('../src/renderer/lib/yeaboi/ops');
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    await ops.setSecurityVerdict(['a', 'b'], 'test-data', { includeInfo: true });
    expect(post).toHaveBeenLastCalledWith('/api/agents/security/verdict', {
      keys: ['a', 'b'],
      verdict: 'test-data',
      include_info: true,
    });
    await ops.setSecurityVerdict(['a'], 'dismiss', { reason: 'known' });
    expect(post).toHaveBeenLastCalledWith('/api/agents/security/verdict', {
      keys: ['a'],
      verdict: 'dismiss',
      reason: 'known',
      include_info: false,
    });
    post.mockRestore();
  });

  it('sends a fix with the whole issue behind it', async () => {
    const api = await import('../src/renderer/lib/yeaboi/api');
    const ops = await import('../src/renderer/lib/yeaboi/ops');
    const post = vi.spyOn(api, 'apiPost').mockResolvedValue({ ok: true });
    await ops.applySecurityFix('k1', 'guard-hook', { keys: ['k1', 'k2'], repo: '/r' });
    expect(post).toHaveBeenLastCalledWith('/api/agents/security/fix', {
      key: 'k1',
      fix_id: 'guard-hook',
      keys: ['k1', 'k2'],
      repo: '/r',
      include_info: false,
    });
    post.mockRestore();
  });

  it('asks for a replay by key and line, and lists info without a scan', async () => {
    const api = await import('../src/renderer/lib/yeaboi/api');
    const ops = await import('../src/renderer/lib/yeaboi/ops');
    const get = vi.spyOn(api, 'apiGet').mockResolvedValue({});
    const getOptional = vi.spyOn(api, 'apiGetOptional').mockResolvedValue(null);
    await ops.loadSecurityReplay('a:b:/p q', 12);
    expect(get).toHaveBeenLastCalledWith('/api/agents/security/replay?key=a%3Ab%3A%2Fp+q&line=12');
    await ops.loadSecurityReplay('k');
    expect(get).toHaveBeenLastCalledWith('/api/agents/security/replay?key=k');
    await ops.loadAgentLatest('security', { includeInfo: true });
    expect(getOptional).toHaveBeenLastCalledWith('/api/agents/security/latest?include_info=1');
    await ops.loadAgentLatest('usage', { projectId: 'proj-1' });
    expect(getOptional).toHaveBeenLastCalledWith('/api/agents/usage/latest?project_id=proj-1');
    get.mockRestore();
    getOptional.mockRestore();
  });
});
