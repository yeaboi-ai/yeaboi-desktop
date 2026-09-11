'use client';

// New plan: describe it, say what it may read from, pick a team profile to
// calibrate against, and the conversation opens. The description reaches the
// engine as the plan's opening; the screenshots follow it as the first turn's
// images, kept aside until the room sends that turn.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAudience } from '@/components/providers/audience-provider';
import { PageShell } from '@/components/page-shell';
import { ContextPicker } from '@/components/context/context-picker';
import { AnalysisProfilePick } from '@/components/planning/analysis-profile-pick';
import { PlanComposer, type PlanDraft } from '@/components/planning/plan-composer';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { useContextScope } from '@/hooks/yeaboi/use-context-scope';
import { PersonaMascot } from '@/lib/audience/worlds';
import { stashOpening } from '@/lib/planning/composer';
import { attachImage, createChat, sessionIdOf } from '@/lib/yeaboi/chat';
import { toBase64 } from '@/lib/yeaboi/voice';
import { logger } from '@/lib/logger';

function NewPlanBody() {
  const router = useRouter();
  const { audience } = useAudience();
  const reads = useContextScope('planning');
  const [text, setText] = useState('');
  const [profileId, setProfileId] = useState('');

  async function create(draft: PlanDraft): Promise<{ id: string }> {
    const body = reads.body();
    const view = await createChat({
      description: draft.description,
      references: draft.references.map((ref) => ({ ...ref, url: ref.url ?? '' })),
      analysisProfileId: profileId || undefined,
      projectLabel: body['project_label'] as string | undefined,
      tags: body['tags'] as string[] | undefined,
      context: body['context'] as object | undefined,
      solo: audience === 'solo',
    });
    const id = sessionIdOf(view);
    logger.info('plan created', { id, references: draft.references.length });
    // The screenshots follow one by one; a failed one is logged, not fatal.
    const paths: string[] = [];
    const chips: string[] = [];
    for (const [index, file] of draft.files.entries()) {
      try {
        const encoded = await toBase64(file);
        const kept = await attachImage(id, encoded, file.type, index + 1);
        paths.push(kept.path);
        chips.push(kept.chip);
      } catch (e) {
        logger.warn('screenshot not attached', { id, error: (e as Error).message });
      }
    }
    stashOpening(id, { paths, chips });
    return { id };
  }

  return (
    <>
      <header className="animate-slide-up stagger-1">
        <div className="flex items-center gap-4">
          <PersonaMascot size={40} />
          <h1 className="font-display italic text-[40px] leading-none text-foreground">New plan</h1>
        </div>
      </header>
      <section aria-label="New plan" className="mt-10 animate-slide-up stagger-2">
        <PlanComposer
          value={text}
          onChange={setText}
          onCreate={create}
          onCreated={({ id }) => router.push(`/planning/${encodeURIComponent(id)}`)}
          autoFocus
        >
          <ContextPicker
            mode="planning"
            options={reads.options}
            scope={reads.scope}
            onChange={reads.setScope}
          />
          <AnalysisProfilePick value={profileId} onChange={setProfileId} />
        </PlanComposer>
      </section>
    </>
  );
}

export default function NewPlanPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <NewPlanBody />
      </BackendGate>
    </PageShell>
  );
}
