'use client';

// The living plan: the seven sections as the engine fills them, each with
// an editor that sends a change back as a turn; a section's accepted
// versions, one against the current; and what the plan can become.

import { useEffect, useState } from 'react';
import { BlueprintDiff } from '@/components/blueprint/blueprint-diff';
import { PlanActions } from '@/components/planning/plan-actions';
import { PlanSection } from '@/components/planning/plan-section';
import { Button } from '@/components/ui/button';
import {
  acceptedCount,
  editTurn,
  sectionItems,
  sectionText,
  sectionsOf,
  type PlanView,
  type PlanVersionRef,
  type SectionKey,
} from '@/lib/planning/plan-view';
import { loadPlan, type Plan } from '@/lib/yeaboi/plan';
import { loadPlanVersions } from '@/lib/yeaboi/chat';
import { apiGet } from '@/lib/yeaboi/api';

type Pane = 'plan' | 'history' | 'export';

interface Snapshot {
  section: string;
  version: number;
  created_at: string;
  payload: Record<string, unknown>;
}

/** A snapshot's payload as lines, for the diff against the current section. */
function snapshotText(payload: Record<string, unknown>): string {
  const rows = Object.values(payload).find(Array.isArray) as unknown[] | undefined;
  if (rows) {
    return rows
      .map((row) => {
        if (typeof row === 'string') return row;
        const record = row as Record<string, unknown>;
        return String(record['title'] ?? record['name'] ?? record['answer'] ?? JSON.stringify(row));
      })
      .join('\n');
  }
  return JSON.stringify(payload, null, 2);
}

export interface BlueprintDrawerProps {
  sessionId: string;
  plan: PlanView | null;
  busy: boolean;
  /** Sends `edit <section>: <instruction>` as a turn. */
  onSend: (text: string) => void;
  /** The pane the strip or a slash command asked for. */
  pane: Pane;
  onPane: (pane: Pane) => void;
  projectId?: string;
  ensureProject?: () => Promise<string | null>;
}

export function BlueprintDrawer({
  sessionId,
  plan,
  busy,
  onSend,
  pane,
  onPane,
  projectId,
  ensureProject,
}: BlueprintDrawerProps) {
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [versions, setVersions] = useState<PlanVersionRef[]>([]);
  const [picked, setPicked] = useState<Snapshot | null>(null);
  const [finished, setFinished] = useState<Plan | null>(null);
  const [note, setNote] = useState('');
  const sections = sectionsOf(plan);

  // Re-read while the pane is open too: an accept lands a new version.
  useEffect(() => {
    if (pane !== 'history') return;
    loadPlanVersions(sessionId).then(setVersions, (e: Error) => setNote(e.message));
  }, [pane, sessionId, plan]);

  useEffect(() => {
    if (pane !== 'export') return;
    loadPlan(sessionId).then(
      (envelope) =>
        envelope.ok ? setFinished(envelope.data) : setNote(envelope.error?.message ?? ''),
      (e: Error) => setNote(e.message),
    );
  }, [pane, sessionId, plan?.stage]);

  async function open(ref: PlanVersionRef) {
    try {
      const snapshot = await apiGet<Snapshot>(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}/plan/versions/${ref.section}/${ref.version}`,
      );
      setPicked(snapshot);
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  const tabs: { key: Pane; label: string }[] = [
    { key: 'plan', label: `Plan, ${acceptedCount(sections)} of ${sections.length} accepted` },
    { key: 'history', label: 'History' },
    { key: 'export', label: 'Export' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onPane(tab.key)}
            className={
              pane === tab.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }
            style={
              pane === tab.key ? { boxShadow: 'inset 0 -1px 0 var(--audience-accent)' } : undefined
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {note && <p className="text-[12px] text-destructive">{note}</p>}

      {pane === 'plan' && (
        <div className="space-y-1">
          {sections.map((section) => (
            <PlanSection
              key={section.kind}
              section={section}
              items={sectionItems(plan, section.kind)}
              text={sectionText(plan, section.kind)}
              editing={editing === section.kind}
              busy={busy}
              onEdit={() => setEditing(section.kind)}
              onCancel={() => setEditing(null)}
              onSend={(instruction) => {
                setEditing(null);
                onSend(editTurn(section.kind, instruction));
              }}
              onHistory={() => onPane('history')}
            />
          ))}
        </div>
      )}

      {pane === 'history' &&
        (picked ? (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="font-display text-[16px] text-foreground">
                {picked.section}, version {picked.version}
              </p>
              <Button variant="ghost" size="sm" onClick={() => setPicked(null)}>
                All versions
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{picked.created_at}</p>
            <BlueprintDiff
              oldContent={{ [picked.section]: snapshotText(picked.payload) }}
              newContent={{ [picked.section]: sectionText(plan, picked.section as SectionKey) }}
            />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nothing accepted yet. Each accepted section is kept here as a version.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {[...versions].reverse().map((ref) => (
              <li key={`${ref.section}-${ref.version}`}>
                <button
                  type="button"
                  onClick={() => void open(ref)}
                  className="flex w-full items-baseline justify-between gap-4 py-2 text-left text-[13px] hover:text-primary"
                >
                  <span className="text-foreground">
                    {ref.section}, version {ref.version}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{ref.created_at}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}

      {pane === 'export' &&
        (finished ? (
          <PlanActions
            sessionId={sessionId}
            plan={finished}
            projectId={projectId}
            ensureProject={ensureProject}
          />
        ) : (
          <p className="text-[13px] text-muted-foreground">Reading the plan…</p>
        ))}
    </div>
  );
}
