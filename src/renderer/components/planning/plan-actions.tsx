'use client';

// What a finished plan can become: a file, a page, cards on the board, real
// tickets. Four of planning's tools (plan_export, plan_publish, plan_sync,
// and the board bridge) behind plain rows. Publish and push both write
// somewhere real, so neither runs on a click alone — each asks once, in the
// words of what it is about to do. Drawn in the Blueprint drawer's export
// menu and on the recap page alike.

import { useState } from 'react';
import type { Envelope } from '@/lib/yeaboi/api';
import {
  PLAN_DESTINATIONS,
  PLAN_FORMATS,
  PLAN_TRACKERS,
  type Plan,
  exportPlan,
  isEmptyPlan,
  outcomeMessage,
  planCounts,
  publishPlan,
  syncPlan,
} from '@/lib/yeaboi/plan';
import { PlanImportDialog } from '@/components/yeaboi/plan-import-dialog';
import { Button } from '@/components/ui/button';

type Pending = { verb: string; run: () => Promise<void>; warning: string } | null;

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-[15px] italic text-muted-foreground mb-2">{title}</h3>
      {children}
    </section>
  );
}

export interface PlanActionsProps {
  sessionId: string;
  plan: Plan;
  /** The board's own row for this plan, when one already exists. */
  projectId?: string;
  /** Makes (or finds) that row on first use; the board push waits for it. */
  ensureProject?: () => Promise<string | null>;
}

export function PlanActions({ sessionId, plan, projectId, ensureProject }: PlanActionsProps) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Pending>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const id = plan.session_id ?? sessionId;
  const counts = planCounts(plan);

  async function run(label: string, call: () => Promise<Envelope<Record<string, unknown>>>) {
    setBusy(label);
    setMessage('');
    setWarnings([]);
    try {
      const envelope = await call();
      setMessage(outcomeMessage(envelope));
      setWarnings(envelope.warnings ?? []);
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy('');
  }

  async function toBoard() {
    setBusy('board');
    setMessage('');
    try {
      const target = projectId ?? (ensureProject ? await ensureProject() : null);
      if (!target) {
        setMessage('The board could not be opened for this plan.');
        return;
      }
      setImporting(target);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      <Row title="Save it">
        <div className="flex flex-wrap gap-2">
          {PLAN_FORMATS.map((format) => (
            <Button
              key={format.key}
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              title={format.note}
              onClick={() => void run(format.key, () => exportPlan(id, format.key))}
            >
              {busy === format.key ? 'Saving…' : format.label}
            </Button>
          ))}
        </div>
      </Row>

      <Row title="Publish it as a page">
        <div className="flex flex-wrap gap-2">
          {PLAN_DESTINATIONS.map((destination) => (
            <Button
              key={destination.key}
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() =>
                setConfirm({
                  verb: `Publish to ${destination.label}`,
                  warning: `This creates a page in your ${destination.label} workspace.`,
                  run: () => run(destination.key, () => publishPlan(id, destination.key, 'plan')),
                })
              }
            >
              {busy === destination.key ? 'Publishing…' : destination.label}
            </Button>
          ))}
        </div>
      </Row>

      <Row title="Put it on the board">
        <p className="text-[12px] text-muted-foreground mb-2">
          Stories become cards on the board here in the app, sprints as waves, epics as labels.
          Running it again updates the cards it made before.
        </p>
        <Button
          size="sm"
          disabled={isEmptyPlan(plan) || Boolean(busy)}
          onClick={() => void toBoard()}
        >
          {busy === 'board' ? 'Opening the board…' : 'Send to board'}
        </Button>
      </Row>

      <Row title="Push it to a tracker">
        <div className="flex flex-wrap gap-2">
          {PLAN_TRACKERS.map((tracker) => (
            <Button
              key={tracker.key}
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              onClick={() =>
                setConfirm({
                  verb: `Push to ${tracker.label}`,
                  warning: `This creates ${counts.stories} stories and ${counts.tasks} tasks as real tickets in ${tracker.label}. Running it again skips anything it already made.`,
                  run: () => run(tracker.key, () => syncPlan(id, tracker.key, '')),
                })
              }
            >
              {busy === tracker.key ? 'Pushing…' : tracker.label}
            </Button>
          ))}
        </div>
      </Row>

      {message && <p className="text-[13px] text-foreground">{message}</p>}
      {warnings.length > 0 && (
        <ul className="space-y-1">
          {warnings.map((w) => (
            <li key={w} className="text-[12px] text-muted-foreground">
              {w}
            </li>
          ))}
        </ul>
      )}

      {importing && (
        <PlanImportDialog plan={plan} projectId={importing} onClose={() => setImporting(null)} />
      )}

      {confirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={confirm.verb}
            className="w-[420px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
          >
            <h2 className="text-sm font-medium text-foreground mb-2">{confirm.verb}?</h2>
            <p className="text-[13px] text-muted-foreground">{confirm.warning}</p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const pending = confirm;
                  setConfirm(null);
                  void pending.run();
                }}
              >
                {confirm.verb}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
