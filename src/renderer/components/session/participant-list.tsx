'use client';

import { useMemo } from 'react';
import { Bot, ShieldOff, Crown } from 'lucide-react';

interface Participant {
  id: string;
  user_id: string;
  role: string;
  user_name?: string | null;
  user_email?: string | null;
  recording_consent?: boolean | null;
}

interface ActiveUser {
  user_id: string;
  name: string;
  email: string;
  color: string;
}

interface TranscriptEntry {
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
}

interface ParticipantListProps {
  participants: Participant[];
  connected: boolean;
  activeUsers?: ActiveUser[];
  /** Recent transcript entries — used to compute air-time per participant. */
  transcriptEntries?: TranscriptEntry[];
  /** Window in ms over which air-time is averaged. Default 5 minutes. */
  airTimeWindowMs?: number;
  /** Current user — only the host sees the role-change controls. */
  currentUserIsHost?: boolean;
  /** Promote/demote callback (W4.3.5). Called with the participant id and new role. */
  onChangeParticipantRole?: (participantId: string, role: 'co_host' | 'member') => Promise<void>;
}

const AI_NAMES = new Set([
  'AI Facilitator',
  'Senior Engineer',
  'Product Manager',
  'System Architect',
  'Patient Mentor',
  "Devil's Advocate",
]);

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

// Heuristic: addresses the agent. Matches "AI", "agent", "hey AI", or
// "@AI" at the start of an utterance, and bare "@<persona>".
const AI_INTENT_RE = /^\s*(@?ai\b|hey\s+ai\b|agent\b|@\w+)/i;

/**
 * Returns the latest "@AI" address attempt per speaker within the last `windowMs`.
 * Map value is the timestamp of the addressing utterance.
 */
function computeIntents(entries: TranscriptEntry[], windowMs: number): Map<string, number> {
  const cutoff = Date.now() - windowMs;
  const out = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.is_final) continue;
    if (!entry.speaker_name) continue;
    if (AI_NAMES.has(entry.speaker_name)) continue;
    const ts = new Date(entry.created_at).getTime();
    if (Number.isNaN(ts) || ts < cutoff) continue;
    if (!AI_INTENT_RE.test(entry.text)) continue;
    const prev = out.get(entry.speaker_name) ?? 0;
    if (ts > prev) out.set(entry.speaker_name, ts);
  }
  return out;
}

/**
 * Compute "air time" per speaker as a fraction of the spoken-word total
 * across the rolling window. Excludes AI speakers — air time is a humans-only
 * metric (the agent's involvement is governed by the involvement setting).
 */
function computeAirTime(entries: TranscriptEntry[], windowMs: number): Map<string, number> {
  if (entries.length === 0) return new Map();
  const cutoff = Date.now() - windowMs;
  const wordCounts = new Map<string, number>();
  let total = 0;
  for (const entry of entries) {
    if (!entry.is_final) continue;
    if (!entry.speaker_name) continue;
    if (AI_NAMES.has(entry.speaker_name)) continue;
    const ts = new Date(entry.created_at).getTime();
    if (Number.isNaN(ts) || ts < cutoff) continue;
    const words = entry.text.trim().split(/\s+/).filter(Boolean).length;
    if (words === 0) continue;
    wordCounts.set(entry.speaker_name, (wordCounts.get(entry.speaker_name) ?? 0) + words);
    total += words;
  }
  if (total === 0) return new Map();
  const result = new Map<string, number>();
  for (const [name, count] of wordCounts) {
    result.set(name, count / total);
  }
  return result;
}

export function ParticipantList({
  participants = [],
  connected,
  activeUsers = [],
  transcriptEntries = [],
  airTimeWindowMs = 5 * 60_000,
  currentUserIsHost = false,
  onChangeParticipantRole,
}: ParticipantListProps) {
  // Show active WebSocket users if available, fall back to session participants
  const displayUsers =
    activeUsers.length > 0
      ? activeUsers.map((u) => {
          const p = (participants || []).find((p) => p.user_email === u.email);
          return {
            id: u.user_id,
            participantId: p?.id ?? null,
            name: u.name,
            email: u.email,
            color: u.color,
            isHost: p?.role === 'host',
            isCoHost: p?.role === 'co_host',
            consentDeclined: p?.recording_consent === false,
          };
        })
      : (participants || []).map((p) => ({
          id: p.id,
          participantId: p.id,
          name: p.user_name || p.user_email || 'Unknown',
          email: p.user_email || '',
          color: p.role === 'host' ? '#7c3aed' : p.role === 'co_host' ? '#9333ea' : '#64748b',
          isHost: p.role === 'host',
          isCoHost: p.role === 'co_host',
          consentDeclined: p.recording_consent === false,
        }));

  const airTime = useMemo(
    () => computeAirTime(transcriptEntries, airTimeWindowMs),
    [transcriptEntries, airTimeWindowMs],
  );
  // @AI intent — show a badge for 30s after a participant addresses the agent.
  const intents = useMemo(() => computeIntents(transcriptEntries, 30_000), [transcriptEntries]);

  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-success' : 'bg-red-500'}`} />
      <span className="text-xs text-muted-foreground">
        {displayUsers.length} participant{displayUsers.length !== 1 ? 's' : ''}
      </span>
      <div className="flex items-center -space-x-1.5 ml-1">
        {displayUsers.slice(0, 6).map((u) => {
          const share = airTime.get(u.name) ?? 0;
          const sharePct = Math.round(share * 100);
          const addressedAi = intents.has(u.name);
          return (
            <div
              key={u.id}
              className="relative group"
              title={`${u.name}${u.isHost ? ' (Host)' : ''}${share > 0 ? ` · ${sharePct}% air-time` : ''}${addressedAi ? ' · addressing agent' : ''}`}
            >
              <div
                className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-semibold text-foreground"
                style={{ backgroundColor: u.color }}
              >
                {getInitials(u.name, u.email)}
              </div>
              {/* @AI intent badge — appears for 30s after the participant addressed the agent. */}
              {addressedAi && (
                <span
                  aria-label="Addressing the agent"
                  className="absolute -top-1 -right-1 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-cyan-500 text-foreground ring-1 ring-background"
                >
                  <Bot className="h-2 w-2" />
                </span>
              )}
              {/* W5.7.4 — consent declined badge. Shown only on the bottom-left
                  so it doesn't collide with the @AI badge. */}
              {u.consentDeclined && (
                <span
                  aria-label="Declined AI transcription"
                  className="absolute -bottom-0.5 -left-0.5 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-amber-500/90 text-black ring-1 ring-background"
                >
                  <ShieldOff className="h-2 w-2" />
                </span>
              )}
              {/* Air-time meter — bottom arc on the avatar.
                  Hidden when the participant hasn't spoken in the window. */}
              {share > 0 && (
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 h-[3px] rounded-full bg-success/80"
                  style={{ width: `${Math.max(20, sharePct)}%`, maxWidth: '16px' }}
                />
              )}
              {/* Co-host crown badge (W4.3.5) */}
              {u.isCoHost && (
                <span
                  aria-label="Co-host"
                  className="absolute -top-1 -left-1 flex items-center justify-center h-3.5 w-3.5 rounded-full bg-violet-500 text-foreground ring-1 ring-background"
                >
                  <Crown className="h-2 w-2" />
                </span>
              )}
              {/* Tooltip — also surfaces the host-only promote/demote action */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-background border border-border text-[10px] font-body text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">
                {u.name}
                {u.isHost && <span className="ml-1 text-primary font-medium">HOST</span>}
                {u.isCoHost && <span className="ml-1 text-violet-400 font-medium">CO-HOST</span>}
                {share > 0 && (
                  <span className="ml-1 text-success font-medium">{sharePct}% air</span>
                )}
                {currentUserIsHost && !u.isHost && u.participantId && onChangeParticipantRole && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeParticipantRole(u.participantId!, u.isCoHost ? 'member' : 'co_host');
                    }}
                    className="block mt-1 px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 hover:bg-violet-500/25 transition-colors"
                  >
                    {u.isCoHost ? 'Demote' : 'Make co-host'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {displayUsers.length > 6 && (
          <div className="w-7 h-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-body text-muted-foreground">
            +{displayUsers.length - 6}
          </div>
        )}
      </div>
    </div>
  );
}
