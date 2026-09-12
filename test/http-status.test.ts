// A sidecar answer is a success across the whole 2xx range: a create says
// 201, and the wrapper must not read that as a failure.

import { describe, expect, it } from 'vitest';
import { isOk } from '../src/renderer/lib/yeaboi/http-status';

describe('isOk', () => {
  it('accepts every 2xx, 201 included', () => {
    expect([200, 201, 204].map(isOk)).toEqual([true, true, true]);
  });

  it('rejects everything else', () => {
    expect([0, 199, 300, 304, 400, 404, 409, 500].map(isOk)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
