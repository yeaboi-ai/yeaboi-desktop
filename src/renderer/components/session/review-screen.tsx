'use client';

// Session wrap-up: the wizard that turns the blueprint the session built into
// tickets — fill the gaps, choose how much detail, preview what will be made,
// then commit it to the board.
//
// The wizard owns the whole surface. This is only the commit handler and the
// two callbacks it needs; the post-commit summary lives on
// /projects/:id/sessions/:sessionId/completed.
//
// The blueprint page keeps its own Generate dialog, which runs the yeaboi
// planning engine over a snapshot. That is the path without a session; this is
// the path with one.

import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { commitTasks } from '@/lib/yeaboi/board-bridge';
import { CompletionWizard, type WizardTask } from './completion-wizard';
import { clearCachedStories } from './completion-wizard-helpers';

interface ReviewScreenProps {
  projectId: string;
  sessionId: string;
  onComplete: () => void;
  onCancel?: () => void;
}

export function ReviewScreen({ projectId, sessionId, onComplete, onCancel }: ReviewScreenProps) {
  const { authFetch } = useAuthFetch();

  // Throws on failure so the wizard's own error state shows it, with Try again.
  const handleCommit = async (tasks: WizardTask[]) => {
    await commitTasks(authFetch, projectId, tasks);
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
