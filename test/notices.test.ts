// The two tables that decide when you are interrupted: which awareness kinds
// get a banner title, and which streamed run paths are worth announcing.

import { describe, expect, it } from 'vitest';
import { clampBanner, noticeTitle } from '../src/shared/notices';
import { runNotice } from '../src/renderer/lib/yeaboi/run-notices';

// The kinds src/yeaboi/app/awareness.py publishes. Adding one there without a
// title here would show a banner headed "yeaboi" and nothing else.
const AWARENESS_KINDS = ['ceremony_ran', 'ceremony_failed', 'ship_gate'];

describe('noticeTitle', () => {
  it('titles every kind the awareness feed publishes', () => {
    for (const kind of AWARENESS_KINDS) {
      expect(noticeTitle(kind)).not.toBe('yeaboi');
      expect(noticeTitle(kind).length).toBeGreaterThan(0);
    }
  });

  it('falls back to the app name rather than a blank banner', () => {
    expect(noticeTitle('a_kind_from_the_future')).toBe('yeaboi');
    expect(noticeTitle('')).toBe('yeaboi');
  });
});

describe('clampBanner', () => {
  it('refuses a banner with no title', () => {
    expect(clampBanner({ body: 'orphan' })).toBeNull();
    expect(clampBanner({ title: '' })).toBeNull();
    expect(clampBanner(undefined)).toBeNull();
    expect(clampBanner('done')).toBeNull();
  });

  it('truncates rather than trusting the renderer', () => {
    const clamped = clampBanner({
      title: 'x'.repeat(500),
      body: 'y'.repeat(500),
      route: '/z'.repeat(500),
    });
    expect(clamped?.title).toHaveLength(80);
    expect(clamped?.body).toHaveLength(200);
    expect(clamped?.route).toHaveLength(200);
  });

  it('treats non-string body and route as absent', () => {
    expect(clampBanner({ title: 'Done', body: 7, route: {} })).toEqual({
      title: 'Done',
      body: '',
      route: '',
    });
  });
});

describe('runNotice', () => {
  it('announces each mode run that finishes', () => {
    const done = { type: 'done' };
    expect(runNotice('/api/analysis/run', done)).toEqual({
      key: 'run.analysis',
      route: '/analysis',
    });
    expect(runNotice('/api/standup/run', done)?.key).toBe('run.standup');
    expect(runNotice('/api/reporting/run', done)?.key).toBe('run.reporting');
    expect(runNotice('/api/solo/review/run', done)).toEqual({
      key: 'run.review',
      route: '/solo/review',
    });
    expect(runNotice('/api/roadmap/analyze', done)?.key).toBe('run.roadmap');
    expect(runNotice('/api/agents/usage/run', done)?.key).toBe('run.agents');
    expect(runNotice('/api/ceremonies/standup/run', done)?.key).toBe('run.ceremony');
  });

  it('says a run failed, but keeps its route', () => {
    expect(runNotice('/api/analysis/run', { type: 'error', message: 'no key' })).toEqual({
      key: 'run.failed',
      route: '/analysis',
    });
  });

  it('stays quiet for a cancellation — you are the one who cancelled it', () => {
    expect(runNotice('/api/analysis/run', { type: 'cancelled' })).toBeNull();
  });

  it('stays quiet mid-run', () => {
    expect(runNotice('/api/analysis/run', { type: 'op', op_id: 'x' })).toBeNull();
    expect(runNotice('/api/analysis/run', { type: 'progress', phase: 'reading' })).toBeNull();
    expect(runNotice('/api/agents/usage/run', { type: 'component', component: {} })).toBeNull();
  });

  it('stays quiet for streams that are not runs', () => {
    const done = { type: 'done' };
    // A notification per chat turn is noise, and you are watching the other two.
    expect(runNotice('/api/chat/send', done)).toBeNull();
    expect(runNotice('/api/anonymize', done)).toBeNull();
    expect(runNotice('/api/voice/install', done)).toBeNull();
  });

  it('survives a line that is not a line', () => {
    expect(runNotice('/api/analysis/run', null)).toBeNull();
    expect(runNotice('/api/analysis/run', 'done')).toBeNull();
    expect(runNotice('/api/analysis/run', { type: 42 })).toBeNull();
  });
});
