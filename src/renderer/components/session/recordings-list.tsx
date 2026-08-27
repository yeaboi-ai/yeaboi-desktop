"use client";

import { Clock, Film, Loader2 } from "lucide-react";

import { useSessionRecordings, type SessionRecording as RecordingRow } from "@/hooks/use-session-recordings";

interface RecordingsListProps {
  sessionId: string;
  /** Layout style: `strip` for inline session use, `grid` for the recap rail. */
  layout?: "strip" | "grid";
}

function formatDuration(s: number | null): string {
  if (s == null || s < 0) return "—";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const expires = new Date(iso).getTime();
  const days = Math.round((expires - Date.now()) / 86_400_000);
  if (days < 0) return "Expired";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  if (days <= 14) return `Expires in ${days}d`;
  return `Expires ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

const STATUS_LABEL: Record<RecordingRow["status"], string> = {
  starting: "Starting",
  active: "Recording",
  completed: "Ready",
  failed: "Failed",
  expired: "Expired",
};

export function RecordingsList({ sessionId, layout = "strip" }: RecordingsListProps) {
  const { rows, error } = useSessionRecordings(sessionId);

  if (rows === null && !error) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground/70">
        <Loader2 className="h-3 w-3 animate-spin" />
        Loading recordings…
      </div>
    );
  }
  if (error) {
    return <p className="text-[12px] text-warning/80">Couldn&apos;t load recordings ({error})</p>;
  }
  if (!rows || rows.length === 0) {
    return null;
  }

  const containerClass =
    layout === "grid"
      ? "grid grid-cols-1 gap-2"
      : "flex gap-2 overflow-x-auto -mx-1 px-1 py-1";

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium">
        Recordings
      </p>
      <div className={containerClass}>
        {rows.map((r) => (
          <RecordingCard key={r.id} recording={r} />
        ))}
      </div>
    </div>
  );
}

function RecordingCard({ recording }: { recording: RecordingRow }) {
  const isReady = recording.status === "completed";
  const expiry = formatExpiry(recording.expires_at);
  const expired = recording.status === "expired" || expiry === "Expired";
  const inFlight = recording.status === "starting" || recording.status === "active";

  const playerHref = `/recordings/${recording.id}`;
  const card = (
    <div
      className={`shrink-0 w-64 rounded-xl ring-1 transition-colors ${
        expired
          ? "bg-foreground/[0.02] ring-border/40 opacity-60"
          : isReady
            ? "bg-foreground/[0.05] ring-border/70 hover:bg-foreground/[0.08]"
            : "bg-foreground/[0.04] ring-border/60"
      }`}
    >
      <div className="aspect-video rounded-t-xl bg-background/60 flex items-center justify-center">
        {inFlight ? (
          <div className="flex items-center gap-2 text-[11px] text-destructive">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
            </span>
            Recording…
          </div>
        ) : (
          <Film className="h-6 w-6 text-muted-foreground/50" />
        )}
      </div>
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-foreground/95">
            {formatDate(recording.started_at ?? recording.ended_at)}
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded ${
              isReady
                ? "bg-success/15 text-success"
                : recording.status === "failed"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-foreground/[0.06] text-muted-foreground"
            }`}
          >
            {STATUS_LABEL[recording.status]}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/80">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(recording.duration_seconds)}
          </span>
          {expiry && <span>{expiry}</span>}
        </div>
      </div>
    </div>
  );

  if (!isReady) return card;
  return (
    <a
      href={playerHref}
      target="_blank"
      rel="noopener noreferrer"
      className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/60 rounded-xl"
      title="Open recording in a new tab"
    >
      {card}
    </a>
  );
}
