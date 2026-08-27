'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  X,
  ThumbsUp,
  ThumbsDown,
  Mic,
  MicOff,
  AlertTriangle,
  EyeOff,
  Type,
} from 'lucide-react';
import { FeedbackButtons } from '@/components/ui/feedback-buttons';
import { useFeedback } from '@/hooks/use-feedback';
import { useReducedColor } from '@/hooks/use-reduced-color';
import { AIReasoningPeek, extractAIMeta } from './ai-reasoning-peek';
import { mediumOf, type TranscriptMedium } from './transcript-medium';

interface TranscriptEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
  original_content?: string | null;
  /** Attachments JSON — the agent stashes AI-response metadata under
   *  `[{_ai_meta: {model, latency_ms, reason}}]` for the W3.2.4 reasoning peek. */
  attachments?: Array<Record<string, unknown>> | null;
  /** Backend message_type used to derive Spoken vs Typed medium. */
  message_type?: string;
}

interface TranscriptFeedProps {
  entries: TranscriptEntry[];
  onEditEntry?: (entryId: string, text: string) => Promise<void>;
  /** When provided, the redact button appears for editable entries. Confirms
   *  with the user, then calls back with the entry id. Backend replaces
   *  content with [redacted]. */
  onRedactEntry?: (entryId: string) => Promise<void>;
  readOnly?: boolean;
  sessionId?: string;
  /** Optional case-insensitive substring filter (W6.6.4). */
  searchQuery?: string;
  /** Optional speaker filter. When non-empty, only entries from these speakers
   *  pass through. Empty/undefined = no filter. */
  filterSpeakers?: Set<string>;
  /** Optional medium filter (Spoken / Typed). When non-empty, only entries
   *  whose `mediumOf(message_type)` is in the set pass through. Marker rows
   *  (no speaker) always pass — they're context, not content. */
  filterMediums?: Set<TranscriptMedium>;
  /** When set, scroll the entry whose `created_at` matches this ISO timestamp
   *  into view and briefly flash-highlight it. Used by the recap doc to
   *  cross-link decisions/highlights/chapters into the transcript pane.
   *
   *  Pair with `onScrollHandled` so the parent can reset the value back to
   *  null after consumption (otherwise repeated clicks on the same item
   *  wouldn't retrigger). */
  scrollToTs?: string | null;
  onScrollHandled?: () => void;
}

/** Strip markdown syntax from transcript text (bold, italic, headers, etc.) */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **bold**
    .replace(/\*(.+?)\*/g, '$1') // *italic*
    .replace(/__(.+?)__/g, '$1') // __bold__
    .replace(/_(.+?)_/g, '$1') // _italic_
    .replace(/^#{1,6}\s+/gm, '') // # headers
    .replace(/`(.+?)`/g, '$1'); // `code`
}

/** Censor profanity — keeps first letter, replaces rest with asterisks.
 *  Uses word boundaries and excludes common words that contain profanity substrings
 *  (e.g. "assume", "assess", "assist", "cocktail", "dictionary"). */
const PROFANITY =
  /\b(fuck|shit|bitch|ass(?!ess|ume|ist|et|ign|oci|ert)|damn|crap|dick(?!ens|tionar)|piss|cock(?!tail|pit|roach)|cunt|bastard|twat|wanker|bollocks)\w*/gi;
function censorProfanity(text: string): string {
  return text.replace(PROFANITY, (match) => match[0].toUpperCase() + '*'.repeat(match.length - 1));
}

const SPEAKER_COLORS = [
  'text-amber-400',
  'text-success',
  'text-purple-400',
  'text-pink-400',
  'text-orange-400',
];

// Colorblind-safe (Wong 2011 / Bang Wong palette adapted to dark UI).
// Distinguishable for Deuteranopia, Protanopia, and Tritanopia.
const SPEAKER_COLORS_CB = [
  'text-[#56B4E9]', // sky blue
  'text-[#E69F00]', // orange
  'text-[#009E73]', // bluish green
  'text-[#F0E442]', // yellow
  'text-[#CC79A7]', // reddish purple
];

// Leading symbol per speaker — provides identification independent of color.
const SPEAKER_SYMBOLS = ['●', '▲', '■', '◆', '★'];

const AI_COLOR = 'text-cyan-400';
const AI_COLOR_CB = 'text-[#0072B2]'; // CB-safe blue
const AI_SYMBOL = '✦';
const AI_NAMES = new Set([
  'AI Facilitator',
  'Senior Engineer',
  'Product Manager',
  'System Architect',
  'Patient Mentor',
  "Devil's Advocate",
]);

export function TranscriptFeed({
  entries: rawEntries,
  onEditEntry,
  onRedactEntry,
  readOnly,
  sessionId,
  searchQuery,
  filterSpeakers,
  filterMediums,
  scrollToTs,
  onScrollHandled,
}: TranscriptFeedProps) {
  // Apply optional search/speaker/medium filters before rendering. We never
  // filter out config-change rows or the "Call ended" markers — those provide
  // context regardless of which speakers or mediums are selected.
  const entries = useMemo(() => {
    const q = searchQuery?.trim().toLowerCase() ?? '';
    const speakers = filterSpeakers && filterSpeakers.size > 0 ? filterSpeakers : null;
    const mediums = filterMediums && filterMediums.size > 0 ? filterMediums : null;
    if (!q && !speakers && !mediums) return rawEntries;
    return rawEntries.filter((e) => {
      // Always keep marker rows (no speaker, system messages).
      if (!e.speaker_name) return true;
      if (speakers && !speakers.has(e.speaker_name)) return false;
      if (mediums) {
        const m = mediumOf(e.message_type);
        if (!m || !mediums.has(m)) return false;
      }
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rawEntries, searchQuery, filterSpeakers, filterMediums]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const { submitFeedback, retractFeedback, getRating } = useFeedback(sessionId);
  const [reducedColor] = useReducedColor();
  const colorPalette = reducedColor ? SPEAKER_COLORS_CB : SPEAKER_COLORS;
  const aiColor = reducedColor ? AI_COLOR_CB : AI_COLOR;
  // Keyboard navigation: roving tabindex through editable entries.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !onEditEntry || !editText.trim()) return;
    setEditSaving(true);
    try {
      await onEditEntry(editingId, editText.trim());
      setEditingId(null);
      setEditText('');
    } catch (e) {
      console.error('Failed to save transcript edit:', e);
    } finally {
      setEditSaving(false);
    }
  }, [editingId, editText, onEditEntry]);

  // Thumbs-up: confirm transcript is correct (positive vocabulary signal).
  // Thumbs-down: open the inline rewrite editor — when the user saves, the
  // existing PATCH endpoint detects the diff and feeds it to apply_corrections_to_vocabulary
  // so STT improves on future sessions, not just the visible text.
  const handleThumb = useCallback(
    (entry: TranscriptEntry, rating: 'thumbs_up' | 'thumbs_down') => {
      const current = getRating(entry.id);
      if (current === rating) {
        retractFeedback(entry.id);
        if (rating === 'thumbs_down' && editingId === entry.id) cancelEdit();
        return;
      }
      submitFeedback({
        targetType: 'transcript',
        targetId: entry.id,
        sessionId,
        agentType: 'voice',
        rating,
        context: { text: entry.text },
      });
      if (rating === 'thumbs_down') {
        setEditingId(entry.id);
        setEditText(entry.text);
        setTimeout(() => editInputRef.current?.focus(), 50);
      }
    },
    [getRating, retractFeedback, submitFeedback, sessionId, editingId, cancelEdit],
  );

  // Assign stable colors + symbols to speakers by order of first appearance.
  // Symbols ensure speakers remain distinguishable for users with color vision deficiency.
  const speakerStyles = useMemo(() => {
    const map = new Map<string, { color: string; symbol: string }>();
    let humanIdx = 0;
    for (const entry of entries) {
      const name = entry.speaker_name;
      if (name && !map.has(name)) {
        if (AI_NAMES.has(name)) {
          map.set(name, { color: aiColor, symbol: AI_SYMBOL });
        } else {
          map.set(name, {
            color: colorPalette[humanIdx % colorPalette.length],
            symbol: SPEAKER_SYMBOLS[humanIdx % SPEAKER_SYMBOLS.length],
          });
          humanIdx += 1;
        }
      }
    }
    return map;
  }, [entries, colorPalette, aiColor]);

  // Auto-scroll on new entries and interim updates. Skipped in read-only
  // (recap) mode so it doesn't fight the seek-to-timestamp effect below.
  const lastText = entries.length > 0 ? entries[entries.length - 1].text : '';
  useEffect(() => {
    if (readOnly) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [entries.length, lastText, readOnly]);

  // Seek-to-timestamp: recap doc click → flash the matching transcript row.
  const [flashTs, setFlashTs] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToTs) return;
    const root = scrollRef.current;
    if (!root) return;
    // CSS.escape isn't safe on a raw ISO string with colons; querySelector
    // attribute selectors handle the value as a string when quoted properly.
    const target = root.querySelector<HTMLElement>(`[data-ts="${scrollToTs}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashTs(scrollToTs);
      const t = window.setTimeout(() => setFlashTs(null), 1500);
      onScrollHandled?.();
      return () => window.clearTimeout(t);
    }
    onScrollHandled?.();
  }, [scrollToTs, onScrollHandled]);

  if (entries.length === 0) {
    // Filtered to empty — distinct copy from the cold-start case.
    if (rawEntries.length > 0) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm px-4 text-center">
          No transcript entries match your filter.
        </div>
      );
    }
    return <EmptyTranscript />;
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1.5">
      {entries.map((entry) => {
        const time = (() => {
          try {
            const d = new Date(entry.created_at);
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch {
            return '';
          }
        })();
        const isCallEnded = entry.text.startsWith('Call ended');
        const isConfigChange =
          !entry.speaker_name &&
          (entry.text.startsWith('Switched to') ||
            entry.text.startsWith('Assertiveness set') ||
            entry.text.startsWith('Language changed') ||
            entry.text.startsWith('Emotion set') ||
            entry.text.startsWith('Speed set') ||
            entry.text.startsWith('Voice changed'));
        if (isCallEnded || isConfigChange) {
          const durationMatch = isCallEnded ? entry.text.match(/\(([^)]+)\)/) : null;
          const duration = durationMatch?.[1] ?? '';
          const label = isCallEnded
            ? `Call ended${duration ? ` · ${duration}` : ''}`
            : entry.text.replace(/\*\*/g, '');
          const isFlashing = flashTs === entry.created_at;
          return (
            <div
              key={entry.id}
              data-ts={entry.created_at}
              className={`my-2 animate-in fade-in duration-300 rounded-md transition-shadow ${
                isFlashing ? 'ring-2 ring-info/40' : ''
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                <div className="flex-1 border-t border-border/50" />
                {time && <span className="tabular-nums">{time}</span>}
                <span>{label}</span>
                <div className="flex-1 border-t border-border/50" />
              </div>
            </div>
          );
        }

        const isEditing = editingId === entry.id;
        // Only allow editing DB-backed entries (UUID format), not Deepgram interim or config change entries
        const isDbEntry = /^[0-9a-f]{8}-/.test(entry.id);
        const isEditable =
          isDbEntry &&
          entry.is_final &&
          !readOnly &&
          onEditEntry &&
          !AI_NAMES.has(entry.speaker_name || '');

        const isFocused = focusedId === entry.id;
        const navIdx = entries.findIndex((e) => e.id === entry.id);
        const moveFocus = (delta: number) => {
          // Skip non-editable entries when navigating with j/k.
          for (let i = navIdx + delta; i >= 0 && i < entries.length; i += delta) {
            const cand = entries[i];
            const candDb = /^[0-9a-f]{8}-/.test(cand.id);
            if (candDb && cand.is_final) {
              setFocusedId(cand.id);
              return;
            }
          }
        };
        const handleEntryKey = (e: React.KeyboardEvent) => {
          if (isEditing) return;
          // j/k navigation (also Down/Up arrows)
          if (e.key === 'j' || e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus(1);
          } else if (e.key === 'k' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(-1);
          } else if (e.key === 'e' && isEditable) {
            e.preventDefault();
            setEditingId(entry.id);
            setEditText(entry.text);
            setTimeout(() => editInputRef.current?.focus(), 50);
          } else if (e.key === 't' && isEditable) {
            e.preventDefault();
            handleThumb(entry, e.shiftKey ? 'thumbs_down' : 'thumbs_up');
          }
        };

        const isFlashing = flashTs === entry.created_at;
        return (
          <div
            key={entry.id}
            tabIndex={
              isEditable
                ? isFocused || (focusedId === null && navIdx === entries.length - 1)
                  ? 0
                  : -1
                : -1
            }
            onFocus={() => isEditable && setFocusedId(entry.id)}
            onKeyDown={handleEntryKey}
            data-transcript-entry-id={entry.id}
            data-ts={entry.created_at}
            className={`group/transcript text-sm flex gap-2 animate-in fade-in duration-300 rounded-md outline-none transition-shadow px-1 ${
              entry.is_final ? '' : 'text-muted-foreground italic'
            } ${isFocused ? 'ring-1 ring-white/20 bg-foreground/[0.02]' : ''} ${
              isFlashing ? 'ring-2 ring-info/40' : ''
            }`}
          >
            {time && (
              <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0 pt-0.5 select-none">
                {time}
              </span>
            )}
            <div className="min-w-0 flex-1">
              {entry.speaker_name &&
                (() => {
                  const style = speakerStyles.get(entry.speaker_name);
                  const color = style?.color ?? 'text-foreground/80';
                  const symbol = style?.symbol;
                  const medium = mediumOf(entry.message_type);
                  const MediumIcon = medium === 'spoken' ? Mic : medium === 'typed' ? Type : null;
                  const mediumLabel =
                    medium === 'spoken' ? 'Voice' : medium === 'typed' ? 'Chat' : null;
                  const mediumTone =
                    medium === 'spoken'
                      ? 'bg-info/10 text-info/90 ring-info/25'
                      : 'bg-foreground/[0.06] text-muted-foreground/90 ring-border/60';
                  return (
                    <span className={`font-medium ${color}`}>
                      {symbol && (
                        <span aria-hidden className="mr-1.5 text-[10px]">
                          {symbol}
                        </span>
                      )}
                      {MediumIcon && mediumLabel && (
                        <span
                          title={mediumLabel === 'Voice' ? 'Spoken in a call' : 'Typed in chat'}
                          className={`inline-flex items-center gap-0.5 mr-1.5 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-[0.04em] ring-1 align-[1px] ${mediumTone}`}
                        >
                          <MediumIcon aria-hidden className="h-2.5 w-2.5" />
                          {mediumLabel}
                        </span>
                      )}
                      {entry.speaker_name}:{' '}
                    </span>
                  );
                })()}
              {isEditing ? (
                <span className="inline-flex items-center gap-1.5 w-full">
                  <input
                    ref={editInputRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') cancelEdit();
                      if (e.key === 'Enter') saveEdit();
                    }}
                    className="flex-1 bg-foreground/[0.05] border border-border rounded px-2 py-0.5 text-foreground/90 text-sm focus:outline-none focus:border-border"
                    disabled={editSaving}
                  />
                  <button
                    onClick={saveEdit}
                    disabled={editSaving}
                    className="p-0.5 text-success hover:text-success"
                    title="Save"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={cancelEdit}
                    disabled={editSaving}
                    className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground"
                    title="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <>
                  <span className="text-foreground/90">
                    {censorProfanity(stripMarkdown(entry.text))}
                  </span>
                  {entry.original_content && (
                    <span className="text-[9px] text-muted-foreground/30 ml-1">(edited)</span>
                  )}
                </>
              )}
            </div>
            {/* Thumbs UI for editable user-transcript entries.
                Thumbs-down opens an inline rewrite — corrections feed the
                vocabulary service so STT improves on future sessions.
                Visible on hover OR keyboard focus (W5.4.4). */}
            {isEditable &&
              !isEditing &&
              (() => {
                const rating = getRating(entry.id);
                return (
                  <div
                    className={`transition-opacity flex items-center gap-0.5 shrink-0 self-center ${
                      isFocused ? 'opacity-100' : 'opacity-0 group-hover/transcript:opacity-100'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleThumb(entry, 'thumbs_up')}
                      className={`p-1 rounded transition-colors ${
                        rating === 'thumbs_up'
                          ? 'text-success bg-success/10'
                          : 'text-muted-foreground/30 hover:text-muted-foreground hover:bg-foreground/[0.05]'
                      }`}
                      title="Transcript looks right"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleThumb(entry, 'thumbs_down')}
                      className={`p-1 rounded transition-colors ${
                        rating === 'thumbs_down'
                          ? 'text-red-400 bg-red-400/10'
                          : 'text-muted-foreground/30 hover:text-muted-foreground hover:bg-foreground/[0.05]'
                      }`}
                      title="Rewrite — improves transcription quality"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                    {onRedactEntry && (
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = window.confirm(
                            'Redact this transcript entry? The text will be permanently replaced with [redacted] for all participants and any future export.',
                          );
                          if (!ok) return;
                          try {
                            await onRedactEntry(entry.id);
                          } catch (e) {
                            console.error('Failed to redact:', e);
                          }
                        }}
                        className="p-1 rounded text-muted-foreground/30 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                        title="Redact — replaces this entry with [redacted]"
                        aria-label="Redact this transcript entry"
                      >
                        <EyeOff className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })()}
            {/* Feedback buttons + reasoning peek for AI transcript entries */}
            {AI_NAMES.has(entry.speaker_name || '') && entry.is_final && (
              <div className="opacity-0 group-hover/transcript:opacity-100 transition-opacity shrink-0 self-center flex items-center gap-1">
                {(() => {
                  const meta = extractAIMeta(entry.attachments);
                  return meta ? <AIReasoningPeek meta={meta} /> : null;
                })()}
                <FeedbackButtons
                  targetType="voice_response"
                  targetId={entry.id}
                  sessionId={sessionId}
                  agentType="voice"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const EXAMPLE_PROMPTS = [
  "Let's plan the auth flow",
  'What are the open questions for this milestone?',
  'Walk me through the data model',
  'Help me scope this for one sprint',
];

type MicState = 'checking' | 'granted' | 'denied' | 'missing' | 'unsupported';

function useMicPermissionState(): MicState {
  const [state, setState] = useState<MicState>('checking');

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        if (!cancelled) setState('unsupported');
        return;
      }
      // Prefer the Permissions API when available — it doesn't prompt.
      type PermStatus = {
        state: PermissionState;
        addEventListener?: (e: string, f: () => void) => void;
      };
      type PermsLike = { query: (descriptor: { name: string }) => Promise<PermStatus> };
      const perms = (navigator as Navigator & { permissions?: PermsLike }).permissions;
      if (perms) {
        try {
          const status = await perms.query({ name: 'microphone' });
          if (cancelled) return;
          if (status.state === 'granted') setState('granted');
          else if (status.state === 'denied') setState('denied');
          else setState('checking'); // 'prompt' — leave neutral, user can click to test
          status.addEventListener?.('change', () => {
            if (cancelled) return;
            if (status.state === 'granted') setState('granted');
            else if (status.state === 'denied') setState('denied');
            else setState('checking');
          });
          return;
        } catch {
          // fall through
        }
      }
      // Fallback: enumerate devices to detect missing-mic case.
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const hasInput = devices.some((d) => d.kind === 'audioinput');
        setState(hasInput ? 'checking' : 'missing');
      } catch {
        if (!cancelled) setState('unsupported');
      }
    };
    probe();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

function EmptyTranscript() {
  const micState = useMicPermissionState();

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-8 text-center max-w-md mx-auto">
      <p className="text-sm text-foreground/80 mb-1">Nothing said yet.</p>
      <p className="text-xs text-muted-foreground/70 mb-5">
        Try saying one of these to your AI facilitator:
      </p>
      <ul className="space-y-1.5 mb-6 w-full">
        {EXAMPLE_PROMPTS.map((p) => (
          <li
            key={p}
            className="text-[12px] text-muted-foreground bg-foreground/[0.04] border border-border/60 rounded-lg px-3 py-2"
          >
            &ldquo;{p}&rdquo;
          </li>
        ))}
      </ul>
      <MicDiagnostic state={micState} />
    </div>
  );
}

function MicDiagnostic({ state }: { state: MicState }) {
  if (state === 'granted' || state === 'checking') {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-success/70">
        <Mic className="h-3 w-3" />
        Mic ready
      </div>
    );
  }
  if (state === 'denied') {
    return (
      <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2 text-left">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">Microphone access denied.</p>
          <p className="text-amber-400/70 mt-0.5">
            Click the lock icon in your browser&apos;s address bar to grant access, then refresh.
          </p>
        </div>
      </div>
    );
  }
  if (state === 'missing') {
    return (
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-foreground/[0.04] border border-border/60 rounded-md px-3 py-2">
        <MicOff className="h-3.5 w-3.5" />
        No microphone detected. Connect a mic and refresh.
      </div>
    );
  }
  // unsupported
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-foreground/[0.04] border border-border/60 rounded-md px-3 py-2">
      <MicOff className="h-3.5 w-3.5" />
      Voice features aren&apos;t supported in this browser.
    </div>
  );
}
