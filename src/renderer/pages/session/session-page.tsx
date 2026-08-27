'use client';

// The live planning session screen. Placeholder while the planning-only
// rewrite of the platform's session page lands (chat left, blueprint right).

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Duck } from '@design/primitives/Duck';

export default function SessionPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <Duck state="idle" size={72} />
      <p className="text-sm text-muted-foreground">
        Session {params.sessionId} — the planning room is being rebuilt for desktop.
      </p>
      <Link className="text-sm text-primary underline" href={`/projects/${params.id}`}>
        Back to project
      </Link>
    </div>
  );
}
