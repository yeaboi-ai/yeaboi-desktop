'use client';

// The team profile a plan may calibrate against — one plain select over the
// analyses this machine has run. Nothing to choose from draws nothing.

import { useEffect, useState } from 'react';
import { loadProfiles, type ProfileSummary } from '@/lib/yeaboi/dashboards';

export function profileLine(profile: ProfileSummary): string {
  const parts = [profile.team_name || profile.project_key || profile.team_id];
  if (profile.project_key && profile.project_key !== parts[0]) parts.push(profile.project_key);
  if (profile.velocity_avg) parts.push(`${Math.round(profile.velocity_avg)} points a sprint`);
  return parts.join(', ');
}

export function AnalysisProfilePick({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (teamId: string) => void;
  disabled?: boolean;
}) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);

  useEffect(() => {
    let live = true;
    loadProfiles().then(
      (body) => live && setProfiles(body.profiles),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  if (profiles.length === 0) return null;

  return (
    <label className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px] font-body">
      <span className="font-display text-[15px] italic text-muted-foreground">Calibrate from</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Team profile"
        className="rounded-md bg-secondary/40 px-2 py-1 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        <option value="">no team profile</option>
        {profiles.map((profile) => (
          <option key={profile.team_id} value={profile.team_id}>
            {profileLine(profile)}
          </option>
        ))}
      </select>
    </label>
  );
}
