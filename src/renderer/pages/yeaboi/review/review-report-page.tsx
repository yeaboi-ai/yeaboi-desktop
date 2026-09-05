'use client';

// One saved Weekly Review, by `?id=` — the same body the hub draws for the
// latest, plus export to Markdown.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'react-router';
import { Download } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { ReviewBody } from '@/components/yeaboi/review-body';
import { Button, buttonVariants } from '@/components/ui/button';
import { type ReviewRun, exportReview, loadReview, reviewHeadline } from '@/lib/yeaboi/modes';

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl bg-card ring-1 ring-destructive/30 p-4">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {items.map((item) => (
        <p key={item} className="text-[12px] text-muted-foreground mt-1">
          {item}
        </p>
      ))}
    </div>
  );
}

function ReportBody() {
  const [searchParams] = useSearchParams();
  const runId = Number.parseInt(searchParams.get('id') ?? '', 10);
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!Number.isFinite(runId) || runId <= 0) {
      setError('No review was named.');
      return;
    }
    loadReview(runId).then(setRun, (e: Error) => setError(e.message));
  }, [runId]);

  async function doExport() {
    try {
      const envelope = await exportReview(runId);
      const paths =
        envelope.data?.paths ?? (envelope.data?.path ? { markdown: envelope.data.path } : {});
      const where = Object.values(paths).join(', ');
      setNote(envelope.ok ? `Exported to ${where || 'your exports folder'}` : 'Export failed');
    } catch (e) {
      setNote((e as Error).message);
    }
  }

  if (error) return <Notice title="Could not open that review" items={[error]} />;
  if (!run) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/solo/review" className="text-[12px] text-muted-foreground hover:underline">
            ← Weekly Review
          </Link>
          <h1 className="font-display text-2xl text-foreground mt-1">
            {reviewHeadline(run.review)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void doExport()}>
            <Download data-icon="inline-start" />
            Export
          </Button>
          <Link
            href="/solo/review"
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
          >
            Back
          </Link>
        </div>
      </header>
      {note && (
        <div className="rounded-2xl bg-card ring-1 ring-border/60 p-4">
          <p className="text-[12px] text-muted-foreground">{note}</p>
        </div>
      )}
      <ReviewBody review={run.review} />
    </div>
  );
}

export default function ReviewReportPage() {
  return (
    <PageShell width="narrow">
      <BackendGate>
        <ReportBody />
      </BackendGate>
    </PageShell>
  );
}
