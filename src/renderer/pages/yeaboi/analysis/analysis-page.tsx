'use client';

// Team Analysis — the saved-runs hub. Every analysis this machine has done,
// newest first, plus the way into a new one.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DuckMark } from '@/components/brand/duck';
import { type ProfileSummary, loadProfiles } from '@/lib/yeaboi/dashboards';
import { BackendGate } from '@/components/yeaboi/backend-gate';
import { Button } from '@/components/ui/button';

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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/40 px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function AnalysisBody() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileSummary[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProfiles().then(
      (body) => setProfiles(body.profiles),
      (e: Error) => setError(e.message),
    );
  }, []);

  if (error) return <Notice title="Could not load saved analyses" items={[error]} />;
  if (!profiles) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">Team Analysis</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            How this team actually delivers — read off the tracker, the code and the docs.
          </p>
        </div>
        <Button size="sm" onClick={() => router.push('/humans/analysis/new')}>
          New analysis
        </Button>
      </header>

      {profiles.length ? (
        <div className="space-y-3">
          {profiles.map((profile) => (
            <Link
              key={profile.team_id}
              href={`/humans/analysis/results?id=${encodeURIComponent(profile.team_id)}`}
              className="block rounded-2xl bg-card ring-1 ring-border/60 p-5 transition-colors hover:ring-primary/40"
            >
              <h2 className="text-[13px] font-body font-medium text-foreground mb-3">
                {profile.team_name || profile.project_key}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatTile label="Source" value={profile.source} />
                <StatTile label="Sprints" value={String(profile.sample_sprints)} />
                <StatTile label="Stories" value={String(profile.sample_stories)} />
                <StatTile label="Velocity" value={profile.velocity_avg.toFixed(0)} />
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">{profile.analyzed_at}</p>
            </Link>
          ))}
        </div>
      ) : (
        <section className="rounded-2xl bg-card ring-1 ring-border/60 p-5">
          <h2 className="text-[13px] font-body font-medium text-foreground mb-3">
            Nothing analysed yet
          </h2>
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <DuckMark state="idle" size={28} /> Point yeaboi at your tracker and it will read the
            last few sprints — how fast the team goes, what a point means here, and where work
            spills.
          </p>
          <div className="mt-3">
            <Button size="sm" onClick={() => router.push('/humans/analysis/new')}>
              Run the first analysis
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <BackendGate>
      <div className="mx-auto max-w-3xl px-6 py-10">
        <AnalysisBody />
      </div>
    </BackendGate>
  );
}
