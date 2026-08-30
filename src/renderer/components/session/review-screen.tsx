'use client';

import { useRef } from 'react';
import { GeneratePlanDialog } from '@/components/projects/generate-plan-dialog';

interface ReviewScreenProps {
  projectId: string;
  sessionId: string;
  onComplete: () => void;
  onCancel?: () => void;
}

/**
 * Session wrap-up. The blueprint the session built is handed to the yeaboi
 * planning engine (the same Generate dialog the blueprint page uses): the
 * plan is generated, recorded on the iteration, and its stories land on the
 * board. The old completion wizard's own story generator retired with it.
 */
export function ReviewScreen({ projectId, onComplete, onCancel }: ReviewScreenProps) {
  // The dialog closes itself after a successful run — don't let that close
  // read as a cancel.
  const completed = useRef(false);

  return (
    <GeneratePlanDialog
      projectId={projectId}
      onGenerated={() => {
        completed.current = true;
        onComplete();
      }}
      onClose={() => {
        if (!completed.current) onCancel?.();
      }}
    />
  );
}
