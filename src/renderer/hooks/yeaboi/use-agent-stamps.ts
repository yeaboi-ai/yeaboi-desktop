// When each Agents kind last saved a report — the stamps the Sessions page
// shows beside the four kinds, machine-wide or scoped to an engine project. A kind with no report, or a sidecar without
// the route, simply has no stamp.

import { useEffect, useState } from 'react';
import { kindOf, loadAgentLatest } from '@/lib/yeaboi/ops';

export { kindOf };

export function useAgentStamps(keys: string[], projectId = ''): Record<string, string> {
  const [stamps, setStamps] = useState<Record<string, string>>({});
  const joined = keys.join(',');

  useEffect(() => {
    let stale = false;
    setStamps({});
    for (const key of joined ? joined.split(',') : []) {
      loadAgentLatest(kindOf(key), projectId ? { projectId } : {}).then(
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
  }, [joined, projectId]);

  return stamps;
}
