'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-base';
import type { OutputStatus, OutputType } from '@/components/deliverables/output-types';

export interface OutputCatalogueEntry {
  output_type: OutputType;
  status: OutputStatus;
  implemented: boolean;
  maturity: number; // 0-100
  artifacts: Record<string, unknown> | null;
  updated_at: string | null;
}

export interface UseProjectOutputsResult {
  outputs: OutputCatalogueEntry[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  generate: (
    outputType: OutputType,
    payload?: Record<string, unknown>,
  ) => Promise<OutputCatalogueEntry | { error: string; status: number }>;
}

export function useProjectOutputs(projectId: string): UseProjectOutputsResult {
  const [outputs, setOutputs] = useState<OutputCatalogueEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await apiFetch(`/api/outputs-proxy/${projectId}`);
      if (!resp.ok) {
        setError(`Failed to load outputs (${resp.status})`);
        setOutputs(null);
        return;
      }
      const data: OutputCatalogueEntry[] = await resp.json();
      setOutputs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const generate = useCallback(
    async (outputType: OutputType, payload: Record<string, unknown> = {}) => {
      const resp = await apiFetch(`/api/outputs-proxy/${projectId}/${outputType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload }),
      });
      if (!resp.ok) {
        // Refresh the catalogue so the card reflects the DB's failed status
        // rather than being stuck in the optimistic "generating" state.
        void refetch();
        return { error: await resp.text(), status: resp.status };
      }
      const row = await resp.json();
      // Splice the returned ProjectOutputResponse into the catalogue entry shape
      setOutputs((prev) => {
        if (!prev) return prev;
        return prev.map((entry) =>
          entry.output_type === outputType
            ? {
                ...entry,
                status: row.status,
                artifacts: row.artifacts,
                updated_at: row.updated_at,
              }
            : entry,
        );
      });
      return {
        output_type: row.output_type,
        status: row.status,
        implemented: true,
        maturity: outputs?.find((e) => e.output_type === outputType)?.maturity ?? 0,
        artifacts: row.artifacts,
        updated_at: row.updated_at,
      } as OutputCatalogueEntry;
    },
    [projectId, outputs, refetch],
  );

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { outputs, loading, error, refetch, generate };
}
