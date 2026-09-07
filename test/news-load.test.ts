// Fetching the paper through the bridge, and the pure bits around it.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGetOptional, apiPost } from '../src/renderer/lib/yeaboi/api';
import {
  FOCUS_REFETCH_MS,
  STALE_RETRY_MS,
  addSource,
  loadFallbackNotes,
  loadPaper,
  loadSources,
  paperNow,
  probeSource,
  rememberPaper,
  removeSource,
  setSourceEnabled,
  shouldRefetch,
} from '../src/renderer/lib/news/load';
import { fixturePaper } from './news-paper.test';

vi.mock('../src/renderer/lib/yeaboi/api', () => ({
  apiGetOptional: vi.fn(async () => null),
  apiPost: vi.fn(async () => ({})),
}));

const mocked = vi.mocked(apiGetOptional);
const posted = vi.mocked(apiPost);

beforeEach(() => {
  mocked.mockReset();
  posted.mockReset();
});

describe('loadPaper', () => {
  it('asks /api/news and hands back what it gets', async () => {
    const paper = fixturePaper();
    mocked.mockResolvedValueOnce(paper);
    expect(await loadPaper()).toBe(paper);
    expect(mocked).toHaveBeenCalledWith('/api/news');
  });

  it('is null on a sidecar without the route', async () => {
    mocked.mockResolvedValueOnce(null);
    expect(await loadPaper()).toBeNull();
  });

  it('asks for a fresh one when told to', async () => {
    mocked.mockResolvedValueOnce(fixturePaper());
    await loadPaper({ refresh: true });
    expect(mocked).toHaveBeenCalledWith('/api/news?refresh=1');
  });
});

describe('the roster', () => {
  it('unwraps the outlet list and is null on an older sidecar', async () => {
    mocked.mockResolvedValueOnce({ sources: [{ id: 'a' }] });
    expect(await loadSources()).toEqual([{ id: 'a' }]);
    expect(mocked).toHaveBeenLastCalledWith('/api/news/sources');
    mocked.mockResolvedValueOnce(null);
    expect(await loadSources()).toBeNull();
  });

  it('writes through the four routes with their bodies', async () => {
    posted.mockResolvedValue({ source: { id: 'a' } });
    await setSourceEnabled('techmeme', false);
    expect(posted).toHaveBeenLastCalledWith('/api/news/sources/techmeme/enabled', {
      enabled: false,
    });
    await probeSource('https://x.example/feed');
    expect(posted).toHaveBeenLastCalledWith('/api/news/sources/probe', {
      url: 'https://x.example/feed',
    });
    await addSource({ url: 'https://x.example/feed', name: 'X', column: 'ai' });
    expect(posted).toHaveBeenLastCalledWith('/api/news/sources', {
      url: 'https://x.example/feed',
      name: 'X',
      column: 'ai',
    });
    await removeSource('custom-1a2b3c4d');
    expect(posted).toHaveBeenLastCalledWith('/api/news/sources/custom-1a2b3c4d/delete');
  });
});

describe('loadFallbackNotes', () => {
  it('unwraps the changelog entries and is null without them', async () => {
    mocked.mockResolvedValueOnce({ entries: [{ version: '1' }] });
    expect(await loadFallbackNotes()).toEqual([{ version: '1' }]);
    mocked.mockResolvedValueOnce(null);
    expect(await loadFallbackNotes()).toBeNull();
    expect(mocked).toHaveBeenLastCalledWith('/api/meta/changelog');
  });
});

describe('the remembered paper', () => {
  it('starts empty and keeps the last one', () => {
    expect(paperNow()).toBeNull();
    const paper = fixturePaper();
    rememberPaper(paper);
    expect(paperNow()).toBe(paper);
  });
});

describe('shouldRefetch', () => {
  it('asks again after the interval, and always the first time', () => {
    const now = 1_800_000_000_000;
    expect(shouldRefetch(0, now)).toBe(true);
    expect(shouldRefetch(now - 14 * 60_000, now)).toBe(false);
    expect(shouldRefetch(now - 16 * 60_000, now)).toBe(true);
    expect(shouldRefetch(now - 1, now, 1)).toBe(true);
  });

  it('keeps its two clocks', () => {
    expect(STALE_RETRY_MS).toBe(4_000);
    expect(FOCUS_REFETCH_MS).toBe(15 * 60 * 1000);
  });
});
