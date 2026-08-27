'use client';

import { useState, useCallback } from 'react';

export interface BlueprintState {
  content: Record<string, string>;
  version: number;
  editingSection: string | null;
}

export function useBlueprint(initial?: Record<string, string>) {
  const [blueprint, setBlueprint] = useState<BlueprintState>({
    content: initial || {},
    version: 1,
    editingSection: null,
  });

  const updateSection = useCallback((section: string, content: string, version?: number) => {
    setBlueprint((prev) => {
      // Ignore stale updates. The 10s blueprint poll can race accept-suggestion:
      // poll starts at v=N, accept commits at v=N+1, WS event arrives and lifts
      // local state to N+1, then the in-flight poll's response (still at v=N)
      // returns and would otherwise stomp the just-accepted bullet. Honour the
      // version so older snapshots can't overwrite newer state.
      if (version !== undefined && version < prev.version) {
        return prev;
      }
      return {
        ...prev,
        content: { ...prev.content, [section]: content },
        version: version ?? prev.version + 1,
      };
    });
  }, []);

  const setEditing = useCallback((section: string | null) => {
    setBlueprint((prev) => ({ ...prev, editingSection: section }));
  }, []);

  return { blueprint, updateSection, setEditing };
}
