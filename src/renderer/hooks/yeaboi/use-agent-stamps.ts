// When each Agents kind last saved a report — the stamps the home's right
// half and the Sessions page show beside the four kinds. A kind with no
// report, or a sidecar without the route, simply has no stamp.

import { useEffect, useState } from 'react';
import { loadAgentLatest } from '@/lib/yeaboi/ops';

/** `agent-usage` the card, `usage` the API kind. */
export const kindOf = (key: string) => key.replace(/^agent-/, '');

export function useAgentStamps(keys: string[]): Record<string, string> {
  const [stamps, setStamps] = useState<Record<string, string>>({});
  const joined = keys.join(',');

  useEffect(() => {
    let stale = false;
    setStamps({});
    for (const key of joined ? joined.split(',') : []) {
      loadAgentLatest(kindOf(key)).then(
        (latest) => {
          if (!stale && latest?.report) {
            setStamps((prev) => ({ ...prev, [key]: latest.as_of }));
          }
        },
        () => undefined,
      );
    }
    return () => {
      stale = true;
    };
  }, [joined]);

  return stamps;
}
