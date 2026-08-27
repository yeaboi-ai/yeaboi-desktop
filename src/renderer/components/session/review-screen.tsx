"use client";

import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { CompletionWizard, type WizardTask } from "./completion-wizard";
import { clearCachedStories } from "./completion-wizard-helpers";

interface ReviewScreenProps {
  projectId: string;
  sessionId: string;
  onComplete: () => void;
  onCancel?: () => void;
}

/**
 * Thin host for the wrap-up wizard. The wizard owns the entire UI surface
 * now (gaps → defaults → preview → commit); this component just supplies
 * the commit handler and the cancel/complete callbacks the wizard needs.
 *
 * The legacy 3-column "Review Your Plan" screen was removed because it
 * duplicated context the wizard already shows (blueprint) and rendered
 * empty placeholder boxes for diagram/scaffold previews that aren't part
 * of the wizard flow. The post-commit summary page at
 * `/projects/{id}/sessions/{sessionId}/completed` carries the
 * ExtractionPanel + feedback buttons that used to live here.
 */
export function ReviewScreen({ projectId, sessionId, onComplete, onCancel }: ReviewScreenProps) {
  const { authFetch } = useAuthFetch();

  // Throws on failure so the wizard's finish() catch surfaces the error
  // in its built-in error UI (with Try again).
  const handleCommit = async (tasks: WizardTask[]) => {
    const r = await authFetch(`/api/projects/${projectId}/stories/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasks }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(text || `commit ${r.status}`);
    }
    clearCachedStories(sessionId);
    onComplete();
  };

  return (
    <CompletionWizard
      projectId={projectId}
      sessionId={sessionId}
      onCancel={() => onCancel?.()}
      onCommit={handleCommit}
    />
  );
}
