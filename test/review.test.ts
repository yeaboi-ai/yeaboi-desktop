// The Weekly Review's pure decisions: how a carried action is marked, what the
// next run is told, and the one-line headline a review earns. Plus the route's
// place in the palette and the beta gate.

import { describe, expect, it } from 'vitest';
import {
  type ReviewAction,
  carriedStatusesPayload,
  confidenceDrift,
  nextActionStatus,
  reviewHeadline,
} from '../src/renderer/lib/yeaboi/modes';
import { railDestinations } from '../src/renderer/lib/nav/rail-catalogue';
import { pageHits } from '../src/renderer/lib/yeaboi/palette';
import { betaKeyFor } from '../src/renderer/lib/yeaboi/ambience';

const action = (over: Partial<ReviewAction> = {}): ReviewAction => ({
  id: 'a1',
  text: 'Write the tests first',
  status: 'pending',
  origin: 'carryover',
  week_label: '2026-W35',
  ...over,
});

describe('nextActionStatus', () => {
  it('cycles the three marks a person can make', () => {
    expect(nextActionStatus('pending')).toBe('done');
    expect(nextActionStatus('done')).toBe('dropped');
    expect(nextActionStatus('dropped')).toBe('pending');
  });

  it("starts the engine's own carried status from pending", () => {
    expect(nextActionStatus('carried')).toBe('done');
    expect(nextActionStatus('')).toBe('done');
  });
});

describe('carriedStatusesPayload', () => {
  it('sends only the marks that differ from what the engine holds', () => {
    const carried = [action({ id: 'a1' }), action({ id: 'a2' }), action({ id: 'a3' })];
    expect(carriedStatusesPayload(carried, { a1: 'done', a2: 'pending', a3: 'dropped' })).toEqual({
      a1: 'done',
      a3: 'dropped',
    });
  });

  it('sends nothing for an untouched list', () => {
    expect(carriedStatusesPayload([action()], {})).toEqual({});
  });

  it('ignores a mark for an action that is not carried', () => {
    expect(carriedStatusesPayload([action({ id: 'a1' })], { ghost: 'done' })).toEqual({});
  });
});

describe('reviewHeadline', () => {
  it('names the week and the plan verdict', () => {
    expect(reviewHeadline({ week_label: '2026-W35', plan_line: 'Day 7/10 · On track' })).toBe(
      'Week 2026-W35 · Day 7/10 · On track',
    );
  });

  it('degrades to the week alone, and to "this week" with no label', () => {
    expect(reviewHeadline({ week_label: '2026-W35', plan_line: '' })).toBe('Week 2026-W35');
    expect(reviewHeadline({ week_label: '', plan_line: '' })).toBe('This week');
  });
});

describe('confidenceDrift', () => {
  it('says nothing for a week with no standups', () => {
    expect(confidenceDrift({ confidence_start: 0, confidence_end: 0, standup_dates: [] })).toBe('');
  });

  it('shows the movement since Monday', () => {
    const dates = ['2026-08-31', '2026-09-04'];
    expect(
      confidenceDrift({ confidence_start: 70, confidence_end: 62, standup_dates: dates }),
    ).toBe('62% ↓ 8 since Monday');
    expect(
      confidenceDrift({ confidence_start: 50, confidence_end: 72, standup_dates: dates }),
    ).toBe('72% ↑ 22 since Monday');
    expect(
      confidenceDrift({ confidence_start: 72, confidence_end: 72, standup_dates: dates }),
    ).toBe('72%, steady');
  });
});

describe('the review route', () => {
  it('is a Solo mode in the palette, wherever it is opened from', () => {
    const hits = pageHits(railDestinations(), null, 'team');
    const review = hits.find((hit) => hit.href === '/solo/review');
    expect(review?.group).toBe('modes');
    expect(review?.world).toBe('solo');
    expect(hits.find((hit) => hit.href === '/team/ship')?.world).toBeNull();
    expect(hits.find((hit) => hit.href === '/solo/review/report')?.world).toBe('solo');
  });

  it('is gated by the weekly-review beta notice, sub-routes included', () => {
    expect(betaKeyFor('/solo/review')).toBe('weekly-review');
    expect(betaKeyFor('/solo/review/report')).toBe('weekly-review');
    expect(betaKeyFor('/solo')).toBe('');
  });
});
