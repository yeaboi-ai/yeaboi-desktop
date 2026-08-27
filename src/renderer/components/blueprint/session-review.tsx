"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCheck, Loader2 } from "lucide-react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import type { Suggestion } from "@/hooks/use-suggestions";
import { SuggestionReviewRow } from "./suggestion-review-row";

const SECTION_LABELS: Record<string, string> = {
  project_overview: "Project Overview",
  goals_constraints: "Goals & Constraints",
  users_personas: "Users & Personas",
  team_capacity: "Team & Capacity",
  architecture: "Architecture",
  tech_stack: "Tech Stack",
  api_integrations: "API & Integrations",
  ui_ux: "UI / UX",
  security_compliance: "Security & Compliance",
  infrastructure: "Infrastructure",
  risks_unknowns: "Risks & Unknowns",
  out_of_scope: "Out of Scope",
  open_questions: "Open Questions",
};

interface SessionDiff {
  baseline_snapshot_id: string | null;
  baseline_version: number | null;
  current_snapshot_id: string;
  current_version: number;
  sections: Record<string, { old: string; new: string }>;
  pending_suggestions: number;
}

interface SessionReviewProps {
  projectId: string;
  sessionId: string;
  /** Initial review state from the session payload — drives the empty / done copy. */
  initialStatus: "none" | "pending" | "completed";
  /** Notified when the review transitions to 'completed' so the parent page can
   *  refresh the recap/header. */
  onCompleted?: () => void;
}

export function SessionReview({
  projectId,
  sessionId,
  initialStatus,
  onCompleted,
}: SessionReviewProps) {
  const { authFetch, ready } = useAuthFetch();
  const router = useRouter();
  const [diff, setDiff] = useState<SessionDiff | null>(null);
  const [pending, setPending] = useState<Suggestion[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [iterationLabel, setIterationLabel] = useState<string | null>(null);
  const [iterationId, setIterationId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [diffResp, suggResp, sessResp] = await Promise.all([
        authFetch(`/api/projects/${projectId}/sessions/${sessionId}/blueprint-diff`),
        authFetch(`/api/projects/${projectId}/blueprint-suggestions?session_id=${sessionId}`),
        authFetch(`/api/sessions/${sessionId}`),
      ]);
      if (diffResp.ok) setDiff(await diffResp.json());
      if (suggResp.ok) setPending(await suggResp.json());
      if (sessResp.ok) {
        const s = await sessResp.json();
        if (s.iteration_id) {
          setIterationId(s.iteration_id);
          // Look up the iteration label for the "Promote to v(n+1)" CTA copy.
          const iterResp = await authFetch(`/api/projects/${projectId}/iterations`);
          if (iterResp.ok) {
            const iters: Array<{ id: string; label: string }> = await iterResp.json();
            const match = iters.find((i) => i.id === s.iteration_id);
            if (match) setIterationLabel(match.label);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, sessionId, ready, authFetch]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  async function accept(id: string, editedContent?: string, replace?: boolean) {
    const resp = await authFetch(
      `/api/projects/${projectId}/blueprint-suggestions/${id}/accept`,
      {
        method: "POST",
        body: JSON.stringify({
          edited_content: editedContent,
          replace: !!replace,
        }),
      },
    );
    if (resp.ok) {
      // Refetch is cheap and keeps diff in sync with the just-merged content.
      await fetchAll();
    }
  }

  async function reject(id: string) {
    const resp = await authFetch(
      `/api/projects/${projectId}/blueprint-suggestions/${id}/reject`,
      { method: "POST" },
    );
    if (resp.ok) {
      setPending((prev) => prev.filter((s) => s.id !== id));
    }
  }

  async function bulkAccept(section: string) {
    const resp = await authFetch(
      `/api/projects/${projectId}/blueprint-suggestions/bulk-accept`,
      {
        method: "POST",
        body: JSON.stringify({ section, session_id: sessionId }),
      },
    );
    if (resp.ok) {
      await fetchAll();
    }
  }

  async function complete(skipRemaining = false) {
    if (completing) return;
    setCompleting(true);
    try {
      const resp = await authFetch(
        `/api/sessions/${sessionId}/blueprint-review/complete`,
        {
          method: "POST",
          body: JSON.stringify({ skip_remaining: skipRemaining }),
        },
      );
      if (resp.ok) {
        setStatus("completed");
        onCompleted?.();
      }
    } finally {
      setCompleting(false);
    }
  }

  async function promoteIteration() {
    if (!iterationId) return;
    setCompleting(true);
    try {
      // Always close the review on promote — moving to a new iteration is an
      // explicit "we're done with v(n)" signal even if some suggestions linger.
      await authFetch(
        `/api/sessions/${sessionId}/blueprint-review/complete`,
        {
          method: "POST",
          body: JSON.stringify({ skip_remaining: true }),
        },
      );
      await authFetch(`/api/projects/${projectId}/iterations`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(`/projects/${projectId}/blueprint`);
    } finally {
      setCompleting(false);
    }
  }

  const groupedSuggestions = useMemo(() => {
    const map = new Map<string, Suggestion[]>();
    for (const s of pending) {
      const arr = map.get(s.section) ?? [];
      arr.push(s);
      map.set(s.section, arr);
    }
    return Array.from(map.entries());
  }, [pending]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading blueprint changes…
      </div>
    );
  }

  const changedSections = diff ? Object.entries(diff.sections) : [];
  const noChanges = changedSections.length === 0 && pending.length === 0;
  const isCompleted = status === "completed";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border/60 px-5 py-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-1">
            Blueprint review
          </p>
          <h2 className="text-base font-semibold text-foreground">
            {isCompleted
              ? "Review complete"
              : noChanges
                ? "Nothing changed in the blueprint"
                : `${changedSections.length} ${changedSections.length === 1 ? "section" : "sections"} changed${
                    pending.length > 0
                      ? ` · ${pending.length} ${pending.length === 1 ? "suggestion" : "suggestions"} waiting`
                      : ""
                  }`}
          </h2>
          {!isCompleted && !noChanges && (
            <p className="text-xs text-muted-foreground mt-1">
              Resolve the suggestions on the right, then close the loop so the
              blueprint is canonical for{iterationLabel ? ` ${iterationLabel}` : ""}.
            </p>
          )}
        </div>
        {!isCompleted && (
          <div className="flex items-center gap-2 shrink-0">
            {pending.length === 0 ? (
              <button
                type="button"
                onClick={() => complete(false)}
                disabled={completing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-success bg-success/10 hover:bg-success/15 border border-success/30 disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark reviewed
              </button>
            ) : (
              <button
                type="button"
                onClick={() => complete(true)}
                disabled={completing}
                className="px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground border border-border/60 hover:bg-foreground/[0.05] disabled:opacity-50"
                title="Close the review even though some suggestions are still pending"
              >
                Skip remaining
              </button>
            )}
            {iterationId && (
              <button
                type="button"
                onClick={promoteIteration}
                disabled={completing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 border border-primary/30 disabled:opacity-50"
                title={iterationLabel ? `Lock ${iterationLabel} and fork the next iteration` : "Lock this iteration and fork the next"}
              >
                Promote
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {isCompleted ? (
        <div className="p-6 text-sm text-muted-foreground">
          You closed the review for this session. Reopen the{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={`/projects/${projectId}/blueprint`}
          >
            blueprint
          </a>{" "}
          to see the canonical state.
        </div>
      ) : noChanges ? (
        <div className="p-6 text-sm text-muted-foreground">
          This session didn&apos;t change the blueprint and left no pending suggestions. Nothing to review.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border/60">
          <div className="p-5">
            <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
              What changed
            </p>
            {changedSections.length === 0 ? (
              <p className="text-sm italic text-muted-foreground/70">No section content changed yet.</p>
            ) : (
              <div className="space-y-4">
                {changedSections.map(([slug, change]) => (
                  <SectionDiff key={slug} slug={slug} oldText={change.old} newText={change.new} />
                ))}
              </div>
            )}
          </div>

          <div className="p-5">
            <p className="text-[10px] font-body font-medium tracking-[0.18em] uppercase text-muted-foreground mb-3">
              Pending suggestions
            </p>
            {pending.length === 0 ? (
              <p className="text-sm italic text-muted-foreground/70">
                Nothing waiting — every extracted fact has been resolved.
              </p>
            ) : (
              <div className="space-y-4">
                {groupedSuggestions.map(([section, items]) => (
                  <div key={section}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-medium text-foreground/80">
                        {SECTION_LABELS[section] || section}
                        <span className="ml-1.5 text-muted-foreground/60">({items.length})</span>
                      </p>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => bulkAccept(section)}
                          className="text-[11px] text-success/90 hover:text-success px-2 py-0.5 rounded-md hover:bg-success/10"
                        >
                          Accept all
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {items.map((s) => (
                        <SuggestionReviewRow
                          key={s.id}
                          suggestion={s}
                          onAccept={accept}
                          onReject={reject}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionDiff({ slug, oldText, newText }: { slug: string; oldText: string; newText: string }) {
  const label = SECTION_LABELS[slug] || slug;
  return (
    <div className="rounded-lg border border-border/60 bg-card/50">
      <div className="px-3 py-2 border-b border-border/60 text-[11px] font-medium text-foreground/80">
        {label}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/40 text-[12.5px] leading-relaxed">
        <div className="p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">Before</p>
          {oldText.trim() ? (
            <pre className="whitespace-pre-wrap font-sans text-muted-foreground/80 m-0">{oldText}</pre>
          ) : (
            <p className="italic text-muted-foreground/50">Empty</p>
          )}
        </div>
        <div className="p-3">
          <p className="text-[9px] uppercase tracking-wider text-success/70 mb-1">After</p>
          {newText.trim() ? (
            <pre className="whitespace-pre-wrap font-sans text-foreground/90 m-0">{newText}</pre>
          ) : (
            <p className="italic text-muted-foreground/50">Empty</p>
          )}
        </div>
      </div>
    </div>
  );
}
