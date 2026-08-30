// ensureEngineProject — the lazy mint that links a platform project to its
// engine-side row: short-circuits on an existing link, mints + PATCHes once,
// keeps the run scoped when only the pointer write fails, and surfaces a
// sidecar failure to the caller (who degrades to an unscoped run).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/renderer/lib/yeaboi/api', () => ({
  callTool: vi.fn(),
}));

import { callTool } from '../src/renderer/lib/yeaboi/api';
import { ensureEngineProject } from '../src/renderer/lib/yeaboi/engine-project';

const mockedCallTool = vi.mocked(callTool);

function authFetchReturning(status: number) {
  const calls: { path: string; init?: RequestInit }[] = [];
  const fn = async (path: string, init?: RequestInit) => {
    calls.push({ path, init });
    return { ok: status < 400, status } as Response;
  };
  return { fn, calls };
}

const PROJECT = { id: 'plat-1', name: 'Apollo', description: 'the big one' };

beforeEach(() => {
  mockedCallTool.mockReset();
});

describe('ensureEngineProject', () => {
  it('short-circuits on an existing link without touching either wire', async () => {
    const { fn, calls } = authFetchReturning(200);
    const id = await ensureEngineProject(fn, { ...PROJECT, yeaboi_project_id: 'proj-11112222' });
    expect(id).toBe('proj-11112222');
    expect(mockedCallTool).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('mints once and records the pointer', async () => {
    mockedCallTool.mockResolvedValue({ ok: true, data: { project_id: 'proj-aabbccdd' } } as never);
    const { fn, calls } = authFetchReturning(200);
    const id = await ensureEngineProject(fn, PROJECT);
    expect(id).toBe('proj-aabbccdd');
    expect(mockedCallTool).toHaveBeenCalledWith('project_create', {
      name: 'Apollo',
      description: 'the big one',
    });
    expect(calls[0]?.path).toBe('/api/projects/plat-1');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      yeaboi_project_id: 'proj-aabbccdd',
    });
  });

  it('still returns the minted id when only the pointer PATCH fails', async () => {
    mockedCallTool.mockResolvedValue({ ok: true, data: { project_id: 'proj-aabbccdd' } } as never);
    const { fn } = authFetchReturning(500);
    await expect(ensureEngineProject(fn, PROJECT)).resolves.toBe('proj-aabbccdd');
  });

  it('throws when the sidecar refuses to mint', async () => {
    mockedCallTool.mockResolvedValue({
      ok: false,
      error: { message: 'engine busy' },
    } as never);
    const { fn, calls } = authFetchReturning(200);
    await expect(ensureEngineProject(fn, PROJECT)).rejects.toThrow('engine busy');
    expect(calls).toHaveLength(0);
  });
});
