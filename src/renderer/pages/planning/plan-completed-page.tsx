'use client';

// The recap of a plan: what is in it, sprint by sprint, and what it can
// become — a file, a page, cards on the board, real tickets. Inside the
// frame; the room is one link away.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'react-router';
import { PageShell } from '@/components/page-shell';
import { PlanPanel } from '@/components/planning/plan-panel';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { useRoomLink } from '@/hooks/planning/use-room-link';
import { PersonaMascot } from '@/lib/audience/worlds';
import { linkNaming } from '@/lib/planning/room-link';
import { loadChat, type SessionView } from '@/lib/yeaboi/chat';

function CompletedBody({ sessionId }: { sessionId: string }) {
  // The row the board import hangs off is named after the plan, so the plan
  // is read once here as the room reads it.
  const [view, setView] = useState<SessionView | null>(null);
  useEffect(() => {
    let live = true;
    loadChat(sessionId).then(
      (loaded) => live && setView(loaded),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [sessionId]);
  const naming = linkNaming(view);
  const link = useRoomLink(sessionId, naming.title, naming.description);
  return (
    <>
      <header className="animate-slide-up stagger-1">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4">
            <PersonaMascot size={40} />
            <h1 className="font-display italic text-[40px] leading-none text-foreground">
              The plan
            </h1>
          </div>
          <Link
            href={`/planning/${encodeURIComponent(sessionId)}`}
            className="mt-2 shrink-0 font-display text-[18px] text-foreground decoration-1 underline-offset-[3px] hover:underline"
          >
            Back to the room
          </Link>
        </div>
      </header>
      <section className="mt-10 animate-slide-up stagger-2">
        <PlanPanel
          sessionId={sessionId}
          projectId={link.vendoredId ?? undefined}
          ensureProject={async () => (await link.ensure())?.id ?? null}
          hideHeading
        />
      </section>
    </>
  );
}

export default function PlanCompletedPage() {
  const { id = '' } = useParams<{ id: string }>();
  return (
    <PageShell width="narrow">
      <BackendGate>
        <CompletedBody key={id} sessionId={id} />
      </BackendGate>
    </PageShell>
  );
}
