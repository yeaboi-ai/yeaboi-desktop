'use client';

import { DeliverableCard } from './deliverable-card';
import { OUTPUT_TYPE_ORDER } from './output-types';
import { useProjectOutputs } from '@/hooks/use-project-outputs';

interface DeliverablesPanelProps {
  projectId: string;
}

export function DeliverablesPanel({ projectId }: DeliverablesPanelProps) {
  const { outputs, loading, error, generate } = useProjectOutputs(projectId);

  if (loading) {
    return (
      <section className="rounded-2xl border border-white/5 bg-white/[0.01] p-4">
        <div className="text-[11px] uppercase tracking-wide text-white/40">Deliverables</div>
        <div className="mt-3 text-sm text-white/50">Loading…</div>
      </section>
    );
  }
  if (error || !outputs) {
    return (
      <section className="rounded-2xl border border-white/5 bg-white/[0.01] p-4">
        <div className="text-[11px] uppercase tracking-wide text-white/40">Deliverables</div>
        <div className="mt-3 text-sm text-red-400/80">{error ?? 'No deliverables available.'}</div>
      </section>
    );
  }

  // Preserve the backend's catalogue order
  const ordered = OUTPUT_TYPE_ORDER.map((type) =>
    outputs.find((e) => e.output_type === type),
  ).filter((e) => e !== undefined);

  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.01] p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/40">Deliverables</div>
          <div className="text-xs text-white/50">
            Generate artifacts from this session&rsquo;s blueprint.
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {ordered.map((entry) => (
          <DeliverableCard key={entry.output_type} entry={entry} onGenerate={generate} />
        ))}
      </div>
    </section>
  );
}
