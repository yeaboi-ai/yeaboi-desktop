// The `?project=` carrier: reading it, keeping it on a link, dropping it, and
// what it does to a run body.

import { describe, expect, it } from 'vitest';
import {
  PROJECT_PARAM,
  projectIdFromSearch,
  repoHost,
  runInsideHref,
  scopedRunBody,
  withProject,
  withoutProject,
} from '../src/renderer/lib/yeaboi/project-scope';

describe('repoHost', () => {
  it('names the host of a linked repo', () => {
    expect(repoHost('https://github.com/yeaboi-ai/yeaboi')).toBe('github.com');
  });

  it('passes a value that is not a URL through, and is empty for none', () => {
    expect(repoHost('git@github.com:yeaboi-ai/yeaboi.git')).toBe(
      'git@github.com:yeaboi-ai/yeaboi.git',
    );
    expect(repoHost('')).toBe('');
    expect(repoHost(null)).toBe('');
    expect(repoHost(undefined)).toBe('');
  });
});

describe('projectIdFromSearch', () => {
  it('reads the param whatever else is in the string', () => {
    expect(projectIdFromSearch('?project=p1')).toBe('p1');
    expect(projectIdFromSearch('?run=3&project=p1')).toBe('p1');
    expect(projectIdFromSearch('project=p1')).toBe('p1');
  });

  it('is empty without it', () => {
    expect(projectIdFromSearch('')).toBe('');
    expect(projectIdFromSearch('?run=3')).toBe('');
    expect(projectIdFromSearch('?project=')).toBe('');
  });
});

describe('withProject', () => {
  it('appends the param to a bare path', () => {
    expect(withProject('/team/reporting/new', 'p1')).toBe('/team/reporting/new?project=p1');
  });

  it('adds to an existing query and replaces a stale project', () => {
    expect(withProject('/team/ship/run?key=k', 'p1')).toBe('/team/ship/run?key=k&project=p1');
    expect(withProject('/team/standup?project=old', 'p1')).toBe('/team/standup?project=p1');
  });

  it('leaves a link alone when there is no project', () => {
    expect(withProject('/team/standup', '')).toBe('/team/standup');
  });

  it('encodes an id that needs it', () => {
    expect(withProject('/team/standup', 'a b')).toBe(`/team/standup?${PROJECT_PARAM}=a+b`);
  });
});

describe('withoutProject', () => {
  it('drops the param and keeps the rest', () => {
    expect(withoutProject('/team/standup', '?project=p1')).toBe('/team/standup');
    expect(withoutProject('/team/ship/run', '?key=k&project=p1')).toBe('/team/ship/run?key=k');
  });

  it('is the pathname when there was nothing to drop', () => {
    expect(withoutProject('/team/standup', '')).toBe('/team/standup');
  });
});

describe('runInsideHref', () => {
  it('scopes a mode that runs inside a project', () => {
    expect(runInsideHref('daily-standup', '/team/standup', 'p1')).toBe('/team/standup?project=p1');
  });

  it('opens Ship unscoped, since its run carries no project', () => {
    expect(runInsideHref('ship', '/team/ship', 'p1')).toBe('/team/ship');
  });
});

describe('scopedRunBody', () => {
  it('adds the engine id when scoped', () => {
    expect(scopedRunBody({ period: 'sprint' }, 'proj-aabbccdd')).toEqual({
      period: 'sprint',
      project_id: 'proj-aabbccdd',
    });
  });

  it('sends nothing extra for a one-off', () => {
    const body = { period: 'sprint' };
    expect(scopedRunBody(body, '')).toBe(body);
  });
});
