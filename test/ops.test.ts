// The Agents wire's pure decisions: whether a sidecar honoured a project
// scope, and the fold over a run's lines.

import { describe, expect, it } from 'vitest';
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
    // An empty scoped_to is still the newer sidecar answering the question.
    expect(agentScopeState(latest({ scoped_to: '' }), 'proj-1')).toBe('scoped');
  });

  it('is unscoped when an older sidecar ignored the param', () => {
    expect(agentScopeState(latest(), 'proj-1')).toBe('unscoped');
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
