"use client";

import { useCallback, useMemo, useState } from "react";
import { Clock, X, Scissors, Copy, FileText, ClipboardCopy } from "lucide-react";

import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { toast } from "@/components/ui/toast";
import { TranscriptFeed } from "./transcript-feed";
import { TranscriptSearch } from "./transcript-search";
import { RecapDoc, RecapToc, type ClientChapter, type SessionExtraction } from "./recap-doc";
import { mediumOf, type TranscriptMedium } from "./transcript-medium";
import { renderRecapMarkdown } from "@/lib/recap-markdown";

interface CallEntry {
  id: string;
  speaker_name: string | null;
  text: string;
  is_final: boolean;
  created_at: string;
  attachments?: Array<Record<string, unknown>> | null;
  original_content?: string | null;
  /** Backend message_type — `voice_chat`/`voice_ai` for spoken turns,
   *  `chat`/`ai` for typed messages, `system` for markers. Used by the
   *  transcript pane to visually differentiate medium and to filter. */
  message_type?: string;
}

interface ChatMessage {
  id: string;
  content: string;
  message_type: string;
  user_id: string | null;
  speaker_name?: string | null;
  created_at: string;
  attachments?: Array<Record<string, unknown>> | null;
}

interface RecapScreenProps {
  open: boolean;
  sessionId: string;
  callStartedAt: number;
  durationSeconds: number;
  /** Transcript entries scoped to the current call (used to derive chapters
   *  and to populate the default "This call" view of the transcript pane). */
  entries: CallEntry[];
  /** Optional full-session entries spanning every chat + call. When provided
   *  AND strictly larger than `entries`, the transcript pane shows a
   *  segmented "This call / Full session" toggle so the user can swap views.
   *  When omitted, only `entries` are rendered (toggle stays hidden). */
  allEntries?: CallEntry[];
  /** Optional session title — used in the "Copy as Markdown" output. */
  title?: string | null;
  onClose: () => void;
}

/**
 * W6.6.1 — Post-call hero surface.
 *
 * Granola-style notes doc as the primary surface, with the transcript as a
 * reference pane alongside. The doc is composed by `RecapDoc`; this component
 * owns the layout shell, the action buttons, the seek-to-timestamp wiring,
 * and the optional transcript toggle on narrow widths.
 *
 * Chapters are derived client-side from "Switched to **X**" config-change rows
 * already emitted by the session WS, then merged in `RecapDoc` with any
 * per-chapter summaries the backend produced.
 */
export function RecapScreen({
  open,
  sessionId,
  callStartedAt: _callStartedAt,
  durationSeconds,
  entries,
  allEntries,
  title,
  onClose,
}: RecapScreenProps) {
  const { authFetch, ready } = useAuthFetch();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpeakers, setSelectedSpeakers] = useState<Set<string>>(new Set());
  const [transcriptOpen, setTranscriptOpen] = useState(true);
  const [scrollToTs, setScrollToTs] = useState<string | null>(null);
  const [recapData, setRecapData] = useState<SessionExtraction | null>(null);
  const [transcriptScope, setTranscriptScope] = useState<"call" | "session">("call");
  const [selectedMediums, setSelectedMediums] = useState<Set<TranscriptMedium>>(new Set());

  // Toggle only renders when the parent actually has more history to show
  // (i.e. allEntries is provided and strictly longer than the scoped slice).
  const hasFullSession = !!allEntries && allEntries.length > entries.length;
  const displayEntries = transcriptScope === "session" && allEntries ? allEntries : entries;

  // Derive chapters from "Switched to **X**" markers in the entries stream.
  const chapters = useMemo<ClientChapter[]>(() => {
    const markers: Array<{ idx: number; label: string }> = [];
    entries.forEach((e, idx) => {
      if (!e.speaker_name && e.text.startsWith("Switched to ")) {
        const label = e.text.replace(/^Switched to /, "").replace(/\*\*/g, "").trim();
        markers.push({ idx, label });
      }
    });
    if (markers.length === 0) {
      return [];
    }
    return markers.map((m, i) => {
      const start = entries[m.idx]?.created_at ?? entries[0]?.created_at ?? "";
      const nextIdx = markers[i + 1]?.idx ?? entries.length - 1;
      const end = entries[nextIdx]?.created_at ?? start;
      return { id: `chapter-${i}`, label: m.label, startTs: start, endTs: end };
    });
  }, [entries]);

  const handleSeek = useCallback(
    (ts: string) => {
      setScrollToTs(ts);
      // Make sure the transcript pane is visible when a doc click requests a seek.
      setTranscriptOpen(true);
      // If the seek target lives outside the scoped call window (e.g. an
      // older chat reference in a chapter summary), auto-flip the toggle to
      // "Full session" so the row is actually present in the DOM.
      if (allEntries && !entries.some((e) => e.created_at === ts)) {
        if (allEntries.some((e) => e.created_at === ts)) {
          setTranscriptScope("session");
        }
      }
    },
    [allEntries, entries],
  );

  const handleScrollHandled = useCallback(() => {
    // Reset the sentinel so a second click on the same item retriggers the seek.
    setScrollToTs(null);
  }, []);

  const toggleSpeaker = (name: string) => {
    setSelectedSpeakers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleMedium = (m: TranscriptMedium) => {
    setSelectedMediums((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const formatDuration = (s: number) => {
    if (s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Optional redact handler — uses the W5.7.5 endpoint.
  const handleRedact = ready
    ? async (entryId: string) => {
        const resp = await authFetch(`/api/sessions/${sessionId}/messages/${entryId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ redact: true }),
        });
        if (!resp.ok) throw new Error(`Redact failed: ${resp.status}`);
      }
    : undefined;


  const copyAsMarkdown = async () => {
    if (!recapData) {
      toast.warning({ title: "Recap not ready", description: "Wait for the recap to finish loading." });
      return;
    }
    const md = renderRecapMarkdown(recapData, chapters, {
      title: title ?? null,
      durationSeconds,
      startedAt: _callStartedAt,
    });
    try {
      await navigator.clipboard.writeText(md);
      toast.success({ title: "Recap copied as Markdown" });
    } catch {
      toast.warning({ title: "Copy failed", description: "Clipboard access was denied." });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col animate-in fade-in duration-200">
      {/* Header */}
      <div className="border-b border-border/60 px-7 py-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Clock className="h-5 w-5 text-muted-foreground/70 shrink-0" />
          <h2 className="text-base font-semibold text-foreground truncate">
            {title?.trim() || "Session recap"}
          </h2>
          <span className="text-sm text-muted-foreground/70 tabular-nums shrink-0">
            {formatDuration(durationSeconds)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setTranscriptOpen((v) => !v)}
            className={`hidden lg:flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium ring-1 transition-colors ${
              transcriptOpen
                ? "bg-foreground/[0.08] text-foreground/90 ring-border/60"
                : "bg-transparent text-muted-foreground/70 ring-border/60 hover:text-foreground/90 hover:bg-foreground/[0.05]"
            }`}
            title="Toggle transcript pane"
          >
            <FileText className="h-4 w-4" />
            Transcript
          </button>
          <button
            type="button"
            onClick={copyAsMarkdown}
            disabled={!recapData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium bg-foreground/[0.04] text-foreground/80 ring-1 ring-border/60 hover:bg-foreground/[0.08] transition-colors disabled:opacity-50"
            title="Copy the recap as Markdown for pasting into Notion / Slack / Linear"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copy as Markdown
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close recap"
            className="p-2 rounded-lg text-muted-foreground/70 hover:text-foreground/95 hover:bg-foreground/[0.05] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">
        {/* Sticky mini-TOC, xl+ only */}
        <aside className="hidden xl:block w-56 shrink-0 border-r border-border/40 px-5 py-10 overflow-y-auto">
          <RecapToc data={recapData} />
        </aside>

        {/* Recap doc (main column) */}
        <main className="flex-1 overflow-y-auto bg-background">
          <RecapDoc
            sessionId={sessionId}
            chapters={chapters}
            onSeekTo={handleSeek}
            canRegenerate
            onDataLoaded={setRecapData}
          />
        </main>

        {/* Transcript pane (right column) */}
        {transcriptOpen && (
          <aside className="hidden lg:flex w-[460px] shrink-0 flex-col border-l border-border/60 bg-card/40">
            <div className="px-5 pt-5 pb-3 border-b border-border/40 shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold">
                  Transcript
                </p>
                {hasFullSession && (
                  <div
                    role="tablist"
                    aria-label="Transcript scope"
                    className="flex items-center rounded-md bg-foreground/[0.04] p-0.5 ring-1 ring-border/40"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={transcriptScope === "call"}
                      onClick={() => setTranscriptScope("call")}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        transcriptScope === "call"
                          ? "bg-foreground/[0.08] text-foreground/95"
                          : "text-muted-foreground/70 hover:text-foreground/90"
                      }`}
                    >
                      This call
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={transcriptScope === "session"}
                      onClick={() => setTranscriptScope("session")}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        transcriptScope === "session"
                          ? "bg-foreground/[0.08] text-foreground/95"
                          : "text-muted-foreground/70 hover:text-foreground/90"
                      }`}
                      title="Show every chat + call message from this session"
                    >
                      Full session
                    </button>
                  </div>
                )}
              </div>
              <TranscriptSearch
                query={searchQuery}
                onQueryChange={setSearchQuery}
                selectedSpeakers={selectedSpeakers}
                onToggleSpeaker={toggleSpeaker}
                selectedMediums={selectedMediums}
                onToggleMedium={toggleMedium}
                entries={displayEntries}
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              <TranscriptFeed
                entries={displayEntries}
                sessionId={sessionId}
                searchQuery={searchQuery}
                filterSpeakers={selectedSpeakers}
                filterMediums={selectedMediums}
                readOnly
                onRedactEntry={handleRedact}
                scrollToTs={scrollToTs}
                onScrollHandled={handleScrollHandled}
              />
            </div>
          </aside>
        )}
      </div>

    </div>
  );
}

/** Helper: turn the session page's heterogeneous message list into a flat
 *  CallEntry array suitable for RecapScreen.entries.
 *
 *  When `sinceMs` is supplied, messages with `created_at` before that epoch
 *  are dropped — used by the post-call recap to scope to just the call that
 *  ended. Without `sinceMs`, all session messages are returned (history view).
 */
export function buildRecapEntries(messages: ChatMessage[], sinceMs?: number): CallEntry[] {
  return messages
    .filter((m) => m.message_type !== "system" || m.content.startsWith("Switched to "))
    .filter((m) => sinceMs === undefined || new Date(m.created_at).getTime() >= sinceMs)
    .map((m) => ({
      id: m.id,
      speaker_name: m.speaker_name ?? null,
      text: m.content,
      is_final: true,
      created_at: m.created_at,
      attachments: m.attachments,
      message_type: m.message_type,
    }));
}
