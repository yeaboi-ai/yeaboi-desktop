'use client';

// "Generate plan" — the blueprint handed to the yeaboi planning engine.
//
// One component straddling both wires on purpose: the blueprint, iteration
// and board live on the platform backend (useAuthFetch); the plan pipeline is
// the sidecar's `plan_generate` tool. The flow: map the filled sections onto
// the intake questionnaire (lib/yeaboi/blueprint-intake.ts), show what got
// answered vs defaulted, run the tool with an op id and render its progress
// from the ambient feed, then record the session on the iteration and put the
// stories on the board — the import is idempotent, so re-generating updates
// cards in place.
//
// There is no cancel: the pipeline has no cancel event, so a "Cancel" button
// here would lie. Dismissing the dialog lets the run finish in the sidecar;
// the session persists either way.

import { useEffect, useRef, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useAudience } from '@/components/providers/audience-provider';
import { callTool, newOpId, onAmbientEvent } from '@/lib/yeaboi/api';
import { mapBlueprintToIntake, type IntakeArgs } from '@/lib/yeaboi/blueprint-intake';
import { mapPlan, previewImport, runImport } from '@/lib/yeaboi/board-bridge';
import type { Plan } from '@/lib/yeaboi/plan';
import { duckQuip } from '@/lib/duck-events';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';

interface ProgressLine {
  op_id?: string;
  progress?: number;
  total?: number;
  message?: string;
}

// onAmbientEvent has no unsubscribe, so the module holds one subscription and
// a swappable handler rather than stacking a listener per dialog open.
let progressHandler: ((line: ProgressLine) => void) | null = null;
let subscribed = false;
function watchProgress(handler: ((line: ProgressLine) => void) | null): void {
  progressHandler = handler;
  if (!subscribed) {
    subscribed = true;
    onAmbientEvent((event) => {
      if (event.type === 'progress') progressHandler?.(event as ProgressLine);
    });
  }
}

interface IntakeQuestions {
  questions: Record<string, string>;
  defaults: Record<string, string>;
  essential_questions: number[];
}

interface Summary {
  answered: { number: string; question: string; answer: string }[];
  defaulted: number;
  open: number;
}

function summarize(args: IntakeArgs, intake: IntakeQuestions): Summary {
  const answered = Object.entries(args.answers)
    .map(([number, answer]) => ({
      number,
      question: intake.questions[number] ?? `Question ${number}`,
      answer,
    }))
    .sort((a, b) => Number(a.number) - Number(b.number));
  let defaulted = 0;
  let open = 0;
  for (const [number] of Object.entries(intake.questions)) {
    if (number === '1' || number in args.answers) continue;
    if (number in intake.defaults) defaulted += 1;
    else open += 1;
  }
  return { answered, defaulted, open };
}

export interface GeneratePlanDialogProps {
  projectId: string;
  onClose: () => void;
  /** Called with the new yeaboi session id once everything landed. */
  onGenerated?: (sessionId: string) => void;
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'blocked'; reason: string }
  | {
      kind: 'ready';
      args: IntakeArgs;
      summary: Summary | null;
      iterationId: string;
      snapshotId: string;
    }
  | { kind: 'running'; step: number; total: number; label: string }
  | { kind: 'error'; message: string };

export function GeneratePlanDialog({ projectId, onClose, onGenerated }: GeneratePlanDialogProps) {
  const { authFetch, ready } = useAuthFetch();
  const { audience } = useAudience();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  // Sibling state, not part of Phase: phases are replaced wholesale on
  // transitions and the toggles must survive an error → retry round-trip.
  const opIdRef = useRef('');

  useEffect(() => () => watchProgress(null), []);

  useEffect(() => {
    if (!ready) return;
    let stale = false;
    (async () => {
      const [projectResp, blueprintResp, iterationsResp] = await Promise.all([
        authFetch(`/api/sessions/${projectId}`),
        authFetch(`/api/sessions/${projectId}/blueprint`),
        authFetch(`/api/sessions/${projectId}/iterations`),
      ]);
      if (!projectResp.ok || !blueprintResp.ok || !iterationsResp.ok) {
        throw new Error('could not read the session blueprint');
      }
      const project = (await projectResp.json()) as {
        name: string;
        description?: string | null;
        repo_url?: string | null;
      };
      const snapshot = (await blueprintResp.json()) as {
        id: string;
        content: Record<string, string>;
      };
      const iterations = (await iterationsResp.json()) as { id: string }[];
      const iteration = iterations[iterations.length - 1];
      if (!iteration) throw new Error('the session has no blueprint iteration');

      let args: IntakeArgs;
      try {
        args = mapBlueprintToIntake(project, snapshot.content ?? {});
      } catch (e) {
        if (!stale) setPhase({ kind: 'blocked', reason: (e as Error).message });
        return;
      }

      // The intake contract is decoration (what got answered vs defaulted) —
      // generation works without it, so a failure here degrades quietly.
      let summary: Summary | null = null;
      try {
        const intake = await callTool<IntakeQuestions>('intake_questions');
        if (intake.ok) summary = summarize(args, intake.data);
      } catch {
        summary = null;
      }

      if (!stale)
        setPhase({
          kind: 'ready',
          args,
          summary,
          iterationId: iteration.id,
          snapshotId: snapshot.id,
        });
    })().catch((e: Error) => {
      if (!stale) setPhase({ kind: 'error', message: e.message });
    });
    return () => {
      stale = true;
    };
  }, [ready, authFetch, projectId]);

  async function generate(args: IntakeArgs, iterationId: string, snapshotId: string) {
    const opId = newOpId();
    opIdRef.current = opId;
    setPhase({ kind: 'running', step: 0, total: 8, label: 'Starting the pipeline' });
    watchProgress((line) => {
      if (line.op_id !== opIdRef.current) return;
      setPhase({
        kind: 'running',
        step: Number(line.progress ?? 0),
        total: Number(line.total ?? 8),
        label: String(line.message ?? ''),
      });
    });
    try {
      const envelope = await callTool<Plan>(
        'plan_generate',
        {
          description: args.description,
          answers: args.answers,
          project_context: args.project_context,
          // A Solo-world plan is for one developer: the intake defaults the team questions.
          ...(audience === 'solo' ? { solo: true } : {}),
        },
        { opId },
      );
      watchProgress(null);
      if (!envelope.ok) throw new Error(envelope.error?.message ?? 'plan_generate failed');
      const plan = envelope.data;
      const sessionId = plan.session_id ?? '';
      if (!sessionId) throw new Error('the engine returned a plan with no session id');

      // Record which run made this plan, then land the stories on the board.
      const patch = await authFetch(`/api/sessions/${projectId}/iterations/${iterationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yeaboi_session_id: sessionId, plan_source_snapshot_id: snapshotId }),
      });
      if (!patch.ok)
        throw new Error(`could not record the plan on the iteration (${patch.status})`);

      const preview = await previewImport(authFetch, projectId, mapPlan(plan));
      const summary = await runImport(authFetch, projectId, preview);
      toast.success({
        title: 'Plan generated',
        description: `${summary.created} card${summary.created === 1 ? '' : 's'} created, ${summary.updated} updated on the board.`,
      });
      duckQuip('wizard.committed');
      onGenerated?.(sessionId);
      onClose();
    } catch (e) {
      watchProgress(null);
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }

  const running = phase.kind === 'running';

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-background/60 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generate plan"
        className="w-[520px] max-w-[calc(100vw-3rem)] rounded-2xl bg-card shadow-2xl ring-1 ring-border/70 p-5"
      >
        <h2 className="text-sm font-medium text-foreground mb-1">Generate plan</h2>
        <p className="text-[12px] text-muted-foreground mb-4">
          The blueprint becomes the intake for yeaboi&apos;s planning engine — epics, stories, tasks
          and sprints. Takes a few minutes; other engine-backed pages queue behind it.
        </p>

        {phase.kind === 'loading' && (
          <p className="text-[12px] text-muted-foreground">Reading the blueprint…</p>
        )}

        {phase.kind === 'blocked' && (
          <p className="text-[13px] text-muted-foreground">{phase.reason}</p>
        )}

        {phase.kind === 'ready' && phase.summary && (
          <div className="rounded-xl bg-secondary/40 px-3 py-2 text-[12px] text-muted-foreground mb-3 space-y-1">
            <p>
              {phase.summary.answered.length} intake question
              {phase.summary.answered.length === 1 ? '' : 's'} answered from the blueprint ·{' '}
              {phase.summary.defaulted} using defaults
              {phase.summary.open ? ` · ${phase.summary.open} left open` : ''}
            </p>
            <ul className="max-h-40 overflow-y-auto space-y-0.5">
              {phase.summary.answered.map((row) => (
                <li
                  key={row.number}
                  className="truncate"
                  title={`${row.question}\n→ ${row.answer}`}
                >
                  Q{row.number} · {row.question}
                </li>
              ))}
            </ul>
          </div>
        )}

        {running && (
          <div className="mb-3">
            <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${Math.min(100, (phase.step / Math.max(1, phase.total)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">
              Step {phase.step} of {phase.total}
              {phase.label ? ` — ${phase.label}` : ''}
            </p>
          </div>
        )}

        {phase.kind === 'error' && (
          <p className="text-[12px] text-destructive mb-3">{phase.message}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {running ? 'Dismiss (keeps running)' : 'Close'}
          </Button>
          {phase.kind === 'ready' && (
            <Button
              size="sm"
              onClick={() => void generate(phase.args, phase.iterationId, phase.snapshotId)}
            >
              Generate plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
