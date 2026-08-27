"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Mic, Square, Play, Pause, Trash2, Paperclip, FileText, Image, FileSpreadsheet, X, Pencil, Check, Smile, SmilePlus, Target } from "lucide-react";
import { filterCommands, type SlashCommand } from "@/lib/slash-commands";
import { FeedbackButtons } from "@/components/ui/feedback-buttons";
import { AIReasoningPeek, extractAIMeta } from "./ai-reasoning-peek";
import { extractQuickReplies } from "@/lib/quick-replies";
import { PersonaThumbnail } from "./persona-thumbnail";
import { SECTION_LABELS } from "@/components/blueprint/blueprint-section";
import { EmojiPicker } from "./emoji-picker";
import { highlightChildren } from "@/lib/highlight-glossary";
import { GlossaryProvider } from "@/components/glossary-term";

interface Attachment {
  filename: string;
  original_name: string;
  url: string;
  content_type: string;
  size: number;
  size_formatted: string;
}

interface ChatMessage {
  id: string;
  content: string;
  message_type: "chat" | "ai" | "system" | "voice_chat" | "voice_ai";
  user_id: string | null;
  user_name?: string;
  speaker_name?: string | null;
  audio_url?: string | null;
  attachments?: Attachment[] | null;
  original_content?: string | null;
  is_enhanced?: boolean;
  reactions?: Record<string, string[]> | null;
  created_at: string;
}

const PERSONA_LABELS: Record<string, string> = {
  default: "Senior Engineer",
  pm: "Product Manager",
  architect: "System Architect",
  mentor: "Patient Mentor",
  challenger: "Devil's Advocate",
};

const STARTER_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Admin dashboard",
    prompt: `Idea: Build "Sentinel" — a user-management dashboard for B2B SaaS admins. The app handles their team's user lifecycle: inviting, role assignment, access audit, and offboarding.

Target user: IT/security admins at 50–500 person companies who currently juggle this through Google Workspace + a spreadsheet.

Core surfaces I want to see:
- A Users dashboard as the landing page — searchable/filterable table of every user, with status (active / pending / suspended), role, last login, and risk flags. Bulk actions across selected rows.
- A User detail screen showing the full audit trail for one person — recent logins, role changes, accessed resources, MFA status.
- An Invite modal triggered from the dashboard's "Invite" button — email field, role selector, optional message, and a "send invite" CTA. Should NOT be a separate page.
- A Role editor drawer that slides in when you click a role badge — lets you swap roles inline without leaving the user list. Shows what permissions each role has.
- A Bulk-suspend confirmation modal when admins suspend multiple users at once — shows the affected count, lists the names, requires typing "suspend" to confirm.

Design tone: institutional but not boring. Should feel trustworthy and dense — admins need information density, not whitespace. Think Linear or Stripe Dashboard, not Notion.`,
  },
  {
    label: "Loan platform",
    prompt: `Idea: Build "Ledger" — a loan origination and servicing platform for community lenders (credit unions, regional banks, CDFIs) running 500–5,000 active loans.

Target user: loan officers and underwriters who currently work in a mix of legacy core-banking screens, Excel models, and email threads.

Core surfaces:
- A Loans dashboard — searchable/filterable table of every loan with borrower, balance, rate, status (current / 30dpd / 60dpd / 90dpd / charge-off), next payment due, and risk flags. Aggregate KPIs at the top (total outstanding, delinquency rate, average rate).
- A Loan detail screen — borrower info, full amortisation schedule, payment history with timestamps, document vault, and a side panel with covenants and any flagged exceptions.
- A New Application wizard — multi-step (applicant → financials → collateral → terms → review) but rendered as a single drawer with a progress rail, NOT a separate page per step.
- An Underwriting workspace — DTI / LTV / debt-service-coverage calculations on the left, decision form on the right (approve / decline / counter), inline notes thread.
- A Payment posting modal triggered from a loan row — amount, date, allocation breakdown (principal / interest / fees), and confirm.
- A Delinquency queue — kanban-style columns by aging bucket, drag a loan into "contacted today" or "escalate to legal".

Design tone: serious financial software — dense tables, monospaced numbers, muted palette with one strong accent for action buttons. Bloomberg-terminal vibes, not consumer fintech.`,
  },
  {
    label: "Landing page",
    prompt: `Idea: Build a marketing landing page for "Hum" — a founder-facing tool that turns customer support emails into prioritised product feedback.

Target visitor: early-stage SaaS founders who hit the page from Twitter, ProductHunt, or a podcast ad. They need to "get it" within 8 seconds.

Core surfaces (single long-scroll page, but each section is its own surface):
- Hero — punchy one-line headline, subhead, primary CTA ("Connect your inbox"), secondary CTA ("Watch a 90-second demo"). Background should hint at the product (maybe a faded UI mock).
- Social proof strip — logos of 6–8 recognisable B2B SaaS companies using it.
- Problem section — the founder's current reality: support inbox chaos, themes lost, eng prioritising the loudest customer not the most painful one.
- How it works — 3 steps with screenshots: connect inbox → AI clusters tickets into themes → dashboard ranks themes by revenue impact.
- Feature grid — 6 features in a 3×2 grid with small icons, short headline, one-sentence body.
- Pricing — 3 tiers (Solo / Team / Scale) side by side, "most popular" badge on Team.
- Testimonial block — 3 quotes from named founders with company logos and headshots.
- FAQ — 6 expandable rows.
- Final CTA banner — bold headline, single CTA button, no other distractions.
- Footer — minimal, with company name, copyright, three link columns (Product / Company / Legal).

Design tone: confident and modern — strong type hierarchy, generous spacing, one accent colour. Closer to Linear or Vercel than to a 2015-era SaaS landing page.`,
  },
  {
    label: "Todo app",
    prompt: `Idea: Build a minimal todo app — single user, no accounts, runs entirely client-side.

Core surfaces:
- A Today view as the landing page — single column list of tasks, click to toggle complete, swipe (or press Delete) to remove. Input at the top to add a new task. Footer shows "X items left" and a "Clear completed" button.
- A Task detail drawer that slides in from the right when you click a task — title, optional notes, optional due date, optional priority (low / medium / high). Save / cancel.
- An empty state when there are no tasks — friendly illustration or icon, one line of copy, and a hint to type in the input above.

Design tone: calm and tidy. Soft neutrals, one accent colour for completed-state checkmarks. Think Things 3 or TickTick, not Microsoft To Do.`,
  },
  {
    label: "Complex API",
    prompt: `Idea: Design the API and system architecture for "Pulse" — a real-time analytics platform that ingests events from customer apps, runs aggregations on the fly, and exposes dashboards + a query API.

Scale targets: 100k events/sec sustained ingest, 1M concurrent dashboard viewers, p99 query latency < 200ms for the last 24h, < 2s for any 90-day window.

What I want to see:
- A System architecture diagram showing every component: SDK (clients) → ingest gateway → Kafka → stream processor → hot store (ClickHouse or similar) → cold store (S3 + Parquet) → query API → dashboard frontend. Include Redis for rate-limit + auth caching, and a metadata Postgres for accounts/projects/api-keys.
- A Data flow diagram for a single event from SDK to dashboard — with the path for "live tail" (sub-second) vs "historical query" (last 90d).
- The HTTP/REST API surface — endpoints, methods, auth, key request/response shapes for: ingest (POST /v1/events), query (POST /v1/query with a small JSON DSL), projects/keys CRUD, billing usage.
- The streaming protocol for live dashboards — websocket vs SSE, subscription model, how backpressure and reconnect work.
- A Failure-modes diagram — what happens when Kafka is down, when ClickHouse is degraded, when a customer floods us with 10x their normal volume.

Output should be diagrams + structured spec, not screen mockups — this is a backend / architecture design exercise.`,
  },
  {
    label: "Cloud architecture",
    prompt: `Idea: Design the full cloud architecture for "Orbit" — a multi-tenant B2B SaaS platform on AWS, serving 200 enterprise customers with strict data-isolation, SOC2 + GDPR compliance, and 99.95% SLA.

What I want diagrammed:
- Network topology — VPC layout across 3 AZs in us-east-1 with a DR region (eu-west-1). Public subnets (ALB, NAT), private app subnets, isolated data subnets. Transit Gateway for cross-account access. PrivateLink for customer-facing endpoints.
- Compute layer — ECS Fargate services behind an Application Load Balancer, separate task definitions for API, async workers, scheduled jobs. Auto-scaling rules.
- Data layer — Aurora PostgreSQL (multi-AZ, read replicas, per-tenant schema with row-level security), DynamoDB for hot session/auth state, S3 for customer uploads (per-tenant prefix + KMS-CMK), ElastiCache Redis for caching.
- Identity & secrets — IAM roles per service, AWS SSO for human access, Secrets Manager + rotation, KMS keys per tenant for envelope encryption.
- Observability — CloudWatch logs/metrics, X-Ray tracing, OpenTelemetry collector, central log aggregation, alerting via SNS → PagerDuty.
- CI/CD — CodePipeline for app, Terraform Cloud for infra, GitHub Actions for tests, blue/green deploys via ECS.
- Security — WAF in front of ALB, GuardDuty, Security Hub, VPC flow logs, Macie scanning S3 for PII leaks.
- Compliance & DR — daily Aurora snapshots cross-region, RPO 1h / RTO 4h, audit logging to a separate locked AWS account.

Render this as architecture diagrams (network, data flow, deployment) — not UI screens.`,
  },
];

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  onSendVoiceNote?: (blob: Blob) => Promise<void>;
  onSendAttachment?: (file: File) => Promise<void>;
  onEditMessage?: (messageId: string, content: string) => Promise<{ vocabulary_updated?: boolean }>;
  /** Toggle a reaction on a message. Server stores per-user toggle and broadcasts via WS. */
  onToggleReaction?: (messageId: string, emoji: string) => Promise<void> | void;
  /** Current user id, used to highlight the user's own reactions. */
  currentUserId?: string | null;
  /** Called when the user types — used to clear an unread badge owned by the parent. */
  onUserActivity?: () => void;
  aiThinking: boolean;
  persona?: string;
  /** Preview URL of the persona's video character. When present the AI avatar
   * renders the first frame of the video; otherwise it falls back to the
   * persona slug's SVG. */
  personaVideoPreviewUrl?: string | null;
  /** Per-message lookup so historical AI messages keep the avatar of the
   * persona that sent them (rather than inheriting the currently active one).
   * Match is by `speaker_name`. Returning null falls back to the live values. */
  resolvePersonaAvatar?: (speakerName?: string | null) => { videoPreviewUrl: string | null; slug: string } | null;
  userAvatarUrl?: string | null;
  sectionUpdatesByMessageId?: Record<string, string[]>;
  /** Map AI message id → snapshot id to restore. When set, renders an inline
   * "Undo" button under the bubble. */
  undoTargetByMessageId?: Record<string, string>;
  onUndoAiUpdate?: (messageId: string) => void;
  /** Fetch older messages before the current list head. Returns true if more
   * may still exist, false when the head of history is reached. When omitted
   * or always returning false, the "Load older" affordance never appears. */
  onLoadOlderMessages?: () => Promise<boolean>;
  /** List of OTHER session participants currently typing. Rendered above the
   * input as a subtle "Omar is typing…" line. The parent owns the dedup,
   * TTL, and self-filtering logic. */
  typingUsers?: { user_id: string; name: string }[];
  /** Fire-and-forget signal that this user is typing. Called debounced from
   * the input change handler. */
  onTypingSignal?: () => void;
  /** Session participants (excluding self) — feeds the @mention autocomplete.
   * Backend matches by first-word-of-name so the visible label can be either
   * full or first-word. */
  mentionableParticipants?: { id: string; name: string }[];
  readOnly?: boolean;
  sessionId?: string;
  placeholder?: string;
  autoFocusInput?: boolean;
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const hours = d.getHours().toString().padStart(2, "0");
  const mins = d.getMinutes().toString().padStart(2, "0");
  const time = `${hours}:${mins}`;
  // If today, just show time; otherwise show date + time
  if (d.toDateString() === now.toDateString()) return time;
  const day = d.getDate();
  const month = d.toLocaleString("default", { month: "short" });
  return `${day} ${month}, ${time}`;
}

// ─── Inline voice note player for messages ─────────────────────────────────

function VoiceNotePlayer({ audioUrl }: { audioUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const rafRef = useRef<number>(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateDuration = () => {
      const d = audio.duration;
      if (d && isFinite(d) && d > 0) setAudioDuration(d);
    };
    const onEnd = () => { setPlaying(false); setCurrentTime(0); updateDuration(); };
    // WebM files often report Infinity duration — force calculation by seeking
    const onLoaded = () => {
      if (!isFinite(audio.duration)) {
        audio.currentTime = 1e10; // seek to end to force duration calc
        audio.addEventListener("seeked", function onSeeked() {
          audio.removeEventListener("seeked", onSeeked);
          updateDuration();
          audio.currentTime = 0; // reset to start
        }, { once: true });
      } else {
        updateDuration();
      }
    };
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("ended", onEnd);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Smooth progress updates via requestAnimationFrame while playing
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setCurrentTime(audio.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (audio.ended || audio.currentTime >= (audio.duration || 0)) {
        audio.currentTime = 0;
      }
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }

  const validDuration = audioDuration > 0 && isFinite(audioDuration);
  const progress = validDuration ? (currentTime / audioDuration) * 100 : 0;

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !validDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audioDuration;
    setCurrentTime(Math.floor(audio.currentTime));
  }

  return (
    <div className="flex items-center gap-2.5 mb-1.5">
      <audio ref={audioRef} src={audioUrl} preload="auto" />
      <button
        onClick={toggle}
        className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors ${
          playing
            ? "bg-success/20 text-success"
            : "bg-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.15] hover:text-foreground/90"
        }`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <div
          className="flex-1 h-6 flex items-center cursor-pointer group"
          onClick={seek}
        >
          <div className="w-full h-1.5 rounded-full bg-foreground/[0.10] overflow-hidden relative">
            <div
              className={`h-full rounded-full ${
                playing ? "bg-success/70" : "bg-white/25"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0 w-7 text-right">
          {validDuration ? formatTime(playing ? currentTime : audioDuration) : "0:00"}
        </span>
      </div>
    </div>
  );
}

// ─── Attachment card ─────────────────────────────────────────────────────────

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.content_type.startsWith("image/");
  const ext = attachment.original_name.split(".").pop()?.toLowerCase() || "";

  const Icon = isImage ? Image
    : ext === "pdf" ? FileText
    : ["xlsx", "xls", "csv"].includes(ext) ? FileSpreadsheet
    : FileText;

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-foreground/[0.05] hover:bg-foreground/[0.08] border border-border/60 transition-colors mb-1.5 max-w-[260px]"
    >
      {isImage ? (
        <img
          src={attachment.url}
          alt={attachment.original_name}
          className="w-10 h-10 rounded object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded bg-foreground/[0.06] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-muted-foreground/70" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-foreground/70 truncate">{attachment.original_name}</p>
        <p className="text-[9px] text-muted-foreground/40">{attachment.size_formatted}</p>
      </div>
    </a>
  );
}

// ─── Preview player (before sending) ────────────────────────────────────────

function PreviewPlayer({ audioUrl, duration, onDiscard, onSend, sending }: {
  audioUrl: string;
  duration: number;
  onDiscard: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnd = () => setPlaying(false);
    audio.addEventListener("ended", onEnd);
    return () => audio.removeEventListener("ended", onEnd);
  }, []);

  return (
    <div className="border-t border-border/60 p-3 flex items-center gap-2 shrink-0">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />
      <button
        onClick={onDiscard}
        disabled={sending}
        className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.10] text-destructive/70 hover:bg-destructive/15 hover:text-destructive disabled:opacity-30 transition-colors"
        title="Discard"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={toggle}
        className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.15] hover:text-foreground/90 transition-colors"
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </button>
      <span className="text-xs text-muted-foreground/70 tabular-nums flex-1">{formatTime(duration)}</span>
      <button
        onClick={onSend}
        disabled={sending}
        className="flex items-center justify-center w-9 h-9 rounded-xl bg-success/20 text-success hover:bg-success/30 disabled:opacity-30 transition-colors"
        title="Send voice note"
      >
        {sending ? (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-success/30 border-t-emerald-400 animate-spin" />
        ) : (
          <Send className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

// ─── ChatPanel ──────────────────────────────────────────────────────────────

export function ChatPanel({ messages, onSend, onSendVoiceNote, onSendAttachment, onEditMessage, onToggleReaction, currentUserId, onUserActivity, aiThinking, persona, personaVideoPreviewUrl, resolvePersonaAvatar, userAvatarUrl, sectionUpdatesByMessageId, undoTargetByMessageId, onUndoAiUpdate, onLoadOlderMessages, typingUsers, onTypingSignal, mentionableParticipants, readOnly, sessionId, placeholder, autoFocusInput }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstScrollWithMessagesRef = useRef(false);
  // Voice notes are a web-app feature. The desktop keeps playback of notes
  // already in the history; recording never activates (no onSendVoiceNote is
  // passed), so the recorder is an inert stand-in.
  const recorder: {
    state: string;
    audioBlob: Blob | null;
    audioUrl: string | null;
    duration: number;
    startRecording: () => void;
    stopRecording: () => void;
    discard: () => void;
  } = {
    state: "idle",
    audioBlob: null,
    audioUrl: null,
    duration: 0,
    startRecording: () => {},
    stopRecording: () => {},
    discard: () => {},
  };
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  // Map AI message id → section it opens (only set on messages whose section
  // differs from the previous AI turn's section). Drives the inline "now
  // working on X" marker that prefaces each topic-shift in the message stream.
  const sectionTransitionByMessageId = useMemo(() => {
    const out: Record<string, string> = {};
    if (!sectionUpdatesByMessageId) return out;
    let lastSection: string | null = null;
    for (const m of messages) {
      if (m.message_type !== "ai") continue;
      const updated = sectionUpdatesByMessageId[m.id];
      const section = updated && updated.length > 0 ? updated[0] : null;
      if (!section) continue;
      if (section !== lastSection) {
        out[m.id] = section;
        lastSection = section;
      }
    }
    return out;
  }, [messages, sectionUpdatesByMessageId]);

  const startEdit = useCallback((msg: ChatMessage) => {
    setEditingId(msg.id);
    setEditText(msg.content);
    setTimeout(() => editRef.current?.focus(), 50);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !onEditMessage || !editText.trim()) return;
    setEditSaving(true);
    try {
      await onEditMessage(editingId, editText.trim());
      setEditingId(null);
      setEditText("");
    } catch (e) {
      console.error("Failed to save edit:", e);
    } finally {
      setEditSaving(false);
    }
  }, [editingId, editText, onEditMessage]);

  // File attachment state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Slash command picker state
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [subOptions, setSubOptions] = useState<{ command: string; options: string[] } | null>(null);
  const filteredCommands = showCommands ? filterCommands(input) : [];
  const inputRef = useRef<HTMLInputElement>(null);
  const commandListRef = useRef<HTMLDivElement>(null);

  // @mention autocomplete state. `startIdx` is the position of the `@`
  // trigger in the input; on selection we replace `input.slice(startIdx)`
  // with `@<firstname> `. Closed when null.
  const [mentionState, setMentionState] = useState<{ startIdx: number; query: string } | null>(null);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const filteredMentions = (mentionState && mentionableParticipants
    ? mentionableParticipants.filter((p) => {
        const first = p.name.split(" ", 1)[0].toLowerCase();
        const q = mentionState.query.toLowerCase();
        return q === "" || first.startsWith(q) || p.name.toLowerCase().includes(q);
      })
    : []).slice(0, 6);

  // Auto-focus input when drawer opens (after morph animation)
  useEffect(() => {
    if (autoFocusInput) {
      const t = setTimeout(() => inputRef.current?.focus(), 400);
      return () => clearTimeout(t);
    }
  }, [autoFocusInput]);

  // Auto-resize the chat textarea whenever `input` changes, including
  // programmatic clears (handleSubmit calls setInput("")). The onChange-only
  // path didn't fire on programmatic resets, so the textarea stayed tall
  // after sending a long message until the user typed again.
  useEffect(() => {
    const el = inputRef.current as unknown as HTMLTextAreaElement | null;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(38, Math.min(el.scrollHeight, 128)) + "px";
  }, [input]);

  // Message history (arrow up/down to cycle through previous messages, persisted to sessionStorage)
  const storageKey = typeof window !== "undefined" ? `chat-history:${window.location.pathname}` : "";
  const sentHistory = useRef<string[]>([]);
  const historyLoaded = useRef(false);
  if (!historyLoaded.current && typeof window !== "undefined") {
    try { sentHistory.current = JSON.parse(sessionStorage.getItem(storageKey) || "[]"); } catch { /* ignore */ }
    historyLoaded.current = true;
  }
  const historyIndex = useRef(-1);
  const savedDraft = useRef("");

  // Word-by-word reveal for AI messages (skip initial load)
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealedWords, setRevealedWords] = useState(0);
  const fullTextRef = useRef("");
  const prevMsgCountRef = useRef(-1);

  useEffect(() => {
    if (prevMsgCountRef.current === -1) {
      prevMsgCountRef.current = messages.length;
      return;
    }
    if (messages.length > prevMsgCountRef.current) {
      const last = messages[messages.length - 1];
      if (last?.message_type === "ai" && last.content) {
        fullTextRef.current = last.content;
        setRevealingId(last.id);
        setRevealedWords(0);
      }
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    if (!revealingId) return;
    const words = fullTextRef.current.split(/(\s+)/);
    if (revealedWords >= words.length) {
      setRevealingId(null);
      return;
    }
    const timer = setTimeout(() => setRevealedWords((w) => w + 2), 20);
    return () => clearTimeout(timer);
  }, [revealingId, revealedWords]);

  // Jump-to-latest state. We auto-scroll on new messages ONLY when the user
  // is already near the bottom; otherwise they're reading older history and
  // we'd yank them out of it. A small pill announces "N new" and lets them
  // jump back when ready.
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [newSinceScrolledUp, setNewSinceScrolledUp] = useState(0);
  const prevMessageCountForJumpRef = useRef(messages.length);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    const atBottom = distanceFromBottom < 50;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
    if (atBottom) setNewSinceScrolledUp(0);
  }, []);

  // Increment the "new since you scrolled up" counter when messages arrive
  // and the user is not at the bottom.
  useEffect(() => {
    const prev = prevMessageCountForJumpRef.current;
    prevMessageCountForJumpRef.current = messages.length;
    if (messages.length > prev && !isAtBottomRef.current) {
      setNewSinceScrolledUp((n) => n + (messages.length - prev));
    }
  }, [messages.length]);

  useEffect(() => {
    if (!scrollRef.current) return;
    // First scroll after history loads must jump instantly — otherwise the
    // smooth animation visibly rips through every past message on rejoin.
    if (!firstScrollWithMessagesRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
      if (messages.length > 0) firstScrollWithMessagesRef.current = true;
      return;
    }
    // Live updates (new messages, word-by-word AI stream) keep using smooth
    // scroll — but ONLY if the user is already at the bottom. If they've
    // scrolled up to read history, leave them alone; the Jump-to-latest pill
    // is how they come back.
    if (isAtBottomRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length, revealedWords]);

  const jumpToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setNewSinceScrolledUp(0);
  }, []);

  // Pagination state — "Load older messages" affordance. The button is shown
  // until the parent's onLoadOlderMessages returns false (meaning the head of
  // history has been reached) or the prop is undefined.
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean>(!!onLoadOlderMessages);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Captures scrollHeight just before older messages are prepended so the
  // useLayoutEffect below can restore the visual position (otherwise the
  // viewport snaps to top and the user loses their place).
  const preLoadScrollHeightRef = useRef<number | null>(null);

  const handleLoadOlder = useCallback(async () => {
    if (!onLoadOlderMessages || loadingOlder) return;
    preLoadScrollHeightRef.current = scrollRef.current?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const more = await onLoadOlderMessages();
      setHasMoreOlder(more);
    } finally {
      setLoadingOlder(false);
    }
  }, [onLoadOlderMessages, loadingOlder]);

  // Restore scroll position after older messages prepend so the user stays
  // anchored on the message they were reading. Runs synchronously before
  // paint so there's no visible flash.
  useLayoutEffect(() => {
    if (preLoadScrollHeightRef.current === null) return;
    const el = scrollRef.current;
    if (!el) {
      preLoadScrollHeightRef.current = null;
      return;
    }
    const delta = el.scrollHeight - preLoadScrollHeightRef.current;
    if (delta > 0) {
      el.scrollTop = delta;
      // Match the new scroll position to our internal "is at bottom?" tracker
      // so the auto-scroll-on-new-message guard stays correct.
      const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
      isAtBottomRef.current = distanceFromBottom < 50;
    }
    preLoadScrollHeightRef.current = null;
  }, [messages.length]);

  // Scroll selected command into view
  useEffect(() => {
    if (!showCommands || !commandListRef.current) return;
    const item = commandListRef.current.children[selectedIndex + 1] as HTMLElement; // +1 for header
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, showCommands]);

  // Show/hide command picker based on input
  // Debounce the typing-signal broadcast so we don't hammer the server with
  // an HTTP request on every keystroke. Anything within 2s of the last
  // signal is suppressed; the server-side event has a 3s TTL on each
  // receiving client, so 2s renewal keeps the indicator alive while typing
  // continues.
  const lastTypingSignalRef = useRef(0);
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);
    // Typing in the chat input counts as "reading" — clear the unread badge
    // the same way Slack/WhatsApp do once you actually engage with the chat.
    if (val.length > 0) {
      onUserActivity?.();
      // Broadcast "I'm typing" at most every 2 s.
      if (onTypingSignal && Date.now() - lastTypingSignalRef.current > 2000) {
        lastTypingSignalRef.current = Date.now();
        onTypingSignal();
      }
    }
    if (subOptions && !val.startsWith(`/${subOptions.command}`)) {
      setSubOptions(null);
    }
    if (val.startsWith("/") && !val.includes(" ")) {
      setShowCommands(true);
      setSelectedIndex(0);
    } else {
      setShowCommands(false);
    }
    // @mention detection — find the last unbroken `@<word>` segment before
    // the caret and (if present) open the picker. The trigger closes as soon
    // as the user types whitespace or moves the caret past the segment.
    if (mentionableParticipants && mentionableParticipants.length > 0) {
      const caret = e.target.selectionStart ?? val.length;
      const before = val.slice(0, caret);
      const match = before.match(/(^|[\s,.!?])@([\w.-]*)$/);
      if (match) {
        const atIdx = before.length - match[2].length - 1;
        setMentionState({ startIdx: atIdx, query: match[2] });
        setMentionSelectedIdx(0);
      } else {
        setMentionState(null);
      }
    }
  }, [subOptions, onUserActivity, onTypingSignal, mentionableParticipants]);

  // Insert the selected participant's first name at the mention trigger
  // location and close the picker. Backend matches @firstname → user_id.
  const selectMention = useCallback((participant: { id: string; name: string }) => {
    if (!mentionState) return;
    const first = participant.name.split(" ", 1)[0];
    const before = input.slice(0, mentionState.startIdx);
    const after = input.slice(mentionState.startIdx + 1 + mentionState.query.length);
    const insertion = `@${first} `;
    const next = `${before}${insertion}${after}`;
    setInput(next);
    setMentionState(null);
    // Restore caret just after the inserted mention.
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        const pos = before.length + insertion.length;
        try { el.setSelectionRange?.(pos, pos); } catch { /* ignore */ }
      }
    }, 0);
  }, [mentionState, input]);

  const selectCommand = useCallback((cmd: SlashCommand) => {
    if (cmd.args && cmd.args.includes("|")) {
      // Show sub-options picker
      const options = cmd.args.split("|").map((s) => s.trim());
      setSubOptions({ command: cmd.name, options });
      setSelectedIndex(0);
      setShowCommands(false);
      setInput(`/${cmd.name} `);
    } else if (cmd.args) {
      setInput(`/${cmd.name} `);
      setShowCommands(false);
    } else {
      setInput(`/${cmd.name}`);
      onSend(`/${cmd.name}`);
      setInput("");
      setShowCommands(false);
    }
    inputRef.current?.focus();
  }, [onSend]);

  const selectSubOption = useCallback((option: string) => {
    if (!subOptions) return;
    const full = `/${subOptions.command} ${option}`;
    onSend(full);
    setInput("");
    setSubOptions(null);
    inputRef.current?.focus();
  }, [subOptions, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Sub-option picker navigation
    if (subOptions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, subOptions.options.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectSubOption(subOptions.options[selectedIndex]);
      } else if (e.key === "Escape") {
        setSubOptions(null);
        setInput("");
      }
      return;
    }
    // Slash command picker navigation
    if (showCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
      } else if (e.key === "Escape") {
        setShowCommands(false);
      }
      return;
    }
    // @mention picker navigation — same keyboard contract as slash.
    if (mentionState && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIdx((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(filteredMentions[mentionSelectedIdx]);
        return;
      } else if (e.key === "Escape") {
        setMentionState(null);
        return;
      }
    }

    // Escape blurs input
    if (e.key === "Escape") {
      inputRef.current?.blur();
      return;
    }

    // Enter to submit, Shift+Enter for new line
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim()) {
        sentHistory.current.unshift(input.trim());
        if (sentHistory.current.length > 50) sentHistory.current.pop();
        try { sessionStorage.setItem(storageKey, JSON.stringify(sentHistory.current)); } catch { /* ignore */ }
        historyIndex.current = -1;
        savedDraft.current = "";
        onSend(input.trim());
        setInput("");
        setShowCommands(false);
      }
      return;
    }

    // Message history cycling (like a terminal)
    const history = sentHistory.current;
    if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      if (historyIndex.current === -1) {
        savedDraft.current = input;
      }
      const next = Math.min(historyIndex.current + 1, history.length - 1);
      historyIndex.current = next;
      setInput(history[next]);
    } else if (e.key === "ArrowDown" && historyIndex.current >= 0) {
      e.preventDefault();
      const next = historyIndex.current - 1;
      historyIndex.current = next;
      setInput(next < 0 ? savedDraft.current : history[next]);
    }
  }, [showCommands, filteredCommands, selectedIndex, selectCommand, input, mentionState, filteredMentions, mentionSelectedIdx, selectMention]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sentHistory.current.unshift(input.trim());
    if (sentHistory.current.length > 50) sentHistory.current.pop();
    try { sessionStorage.setItem(storageKey, JSON.stringify(sentHistory.current)); } catch { /* ignore */ }
    historyIndex.current = -1;
    savedDraft.current = "";
    onSend(input.trim());
    setInput("");
    setShowCommands(false);
  }

  async function handleSendVoice() {
    if (!recorder.audioBlob || !onSendVoiceNote) return;
    setSending(true);
    try {
      await onSendVoiceNote(recorder.audioBlob);
      recorder.discard();
    } finally {
      setSending(false);
    }
  }

  async function handleSendFile() {
    if (!pendingFile || !onSendAttachment) return;
    setSending(true);
    try {
      await onSendAttachment(pendingFile);
      setPendingFile(null);
    } finally {
      setSending(false);
    }
  }

  // Smart quick-reply suggestions — extract from last AI message
  const quickReplies = (() => {
    const lastAi = [...messages].reverse().find((m) => m.message_type === "ai");
    if (!lastAi || aiThinking) return [];
    return extractQuickReplies(lastAi.content || "");
  })();

  // Drag and drop
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && onSendAttachment) setPendingFile(file);
  }

  return (
    <GlossaryProvider
      onAskAi={(term) => {
        // "Ask the AI" in a glossary popover sends a project-aware follow-up
        // into the session. The facilitator already has the blueprint and
        // prior turns in its context, so we don't need to repeat the project
        // brief here — just point at the term.
        onSend(
          `Tell me more about "${term}" and how it applies to what we're planning.`,
        );
      }}
    >
    <div
      className="flex flex-col flex-1 min-h-0 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary/30 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Paperclip className="h-6 w-6 text-primary/50 mx-auto mb-2" />
            <p className="text-xs text-primary/60 font-medium">Drop file to attach</p>
          </div>
        </div>
      )}
      {/* Jump-to-latest pill — appears when user has scrolled up off the
          bottom. Styled to match the rest of the chat chrome: muted secondary
          surface, soft border, subtle hover. Positioned above the chip/quick-
          reply row so it doesn't sit on top of those affordances. */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-32 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/80 backdrop-blur-md border border-border/70 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shadow-sm"
          aria-label={newSinceScrolledUp > 0 ? `Jump to ${newSinceScrolledUp} new messages` : "Jump to latest"}
        >
          {newSinceScrolledUp > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/20 text-primary text-[9px] font-medium">
              {newSinceScrolledUp}
            </span>
          )}
          <span>{newSinceScrolledUp > 0 ? "new" : "Latest"}</span>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Load-older affordance — only shown when pagination is wired and
            the head of history hasn't been reached yet. */}
        {onLoadOlderMessages && hasMoreOlder && messages.length > 0 && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="px-3 py-1 rounded-full text-[10px] text-muted-foreground/70 hover:text-foreground bg-foreground/[0.04] hover:bg-foreground/[0.08] border border-border/60 transition-colors disabled:opacity-50"
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {messages.map((msg) => {
          const isAi = msg.message_type === "ai";
          const isUser = msg.message_type === "chat";
          const isSystem = msg.message_type === "system";
          const sectionStart = sectionTransitionByMessageId[msg.id];

          return isSystem ? (
          <div
            key={msg.id}
            className="flex items-center gap-2 text-muted-foreground/40 text-center text-[11px] py-1"
          >
                <div className="flex-1 border-t border-border/60" />
                <span className="text-muted-foreground/40 shrink-0 text-center" dangerouslySetInnerHTML={{
                  __html: (msg.content || "").replace(/\*\*(.+?)\*\*/g, '<span class="text-muted-foreground font-semibold">$1</span>')
                }} />
                <div className="flex-1 border-t border-border/60" />
          </div>
          ) : (
          <Fragment key={msg.id}>
            {sectionStart && (
              <div className="flex items-center gap-2 pt-1 pb-2 animate-in fade-in duration-300">
                <div className="ml-12 flex items-center gap-1.5 shrink-0">
                  <Target aria-hidden="true" className="h-3 w-3 text-success/60" />
                  <span className="text-[9px] uppercase tracking-wider text-success/70 font-semibold">
                    {SECTION_LABELS[sectionStart] || sectionStart}
                  </span>
                </div>
                <div className="flex-1 h-px bg-success/15" />
              </div>
            )}
          <div className={`group/msg flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
            <div className="shrink-0 mt-0.5">
              {isAi ? (() => {
                const resolved = resolvePersonaAvatar?.(msg.speaker_name);
                return (
                  <PersonaThumbnail
                    videoPreviewUrl={resolved?.videoPreviewUrl ?? personaVideoPreviewUrl}
                    slug={resolved?.slug ?? persona}
                    alt={msg.speaker_name || ""}
                    expandable
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
                  />
                );
              })() : (
                userAvatarUrl ? (
                  <img
                    src={userAvatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-primary/20 ring-1 ring-white/10 flex items-center justify-center">
                    <span className="text-[12px] font-semibold text-primary/80">
                      {(msg.user_name || msg.speaker_name || "U").charAt(0).toUpperCase()}
                    </span>
                  </div>
                )
              )}
            </div>
            {/* Bubble */}
            <div className={`min-w-0 max-w-[85%] ${isAi ? "" : "flex flex-col items-end"}`}>
              <div className="flex items-end gap-1.5">
              <div className={`relative break-words overflow-hidden text-sm rounded-xl p-3 ${
                isAi
                  ? "bg-foreground/[0.05] border border-border/70"
                  : "bg-foreground/[0.06]"
              }`}>
                {/* Edit button — only on own editable messages */}
                {!isAi && !readOnly && onEditMessage && editingId !== msg.id && msg.message_type !== "system" && (
                  <button
                    onClick={() => startEdit(msg)}
                    className="absolute top-1.5 right-1.5 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1 rounded-md hover:bg-foreground/[0.10] text-muted-foreground/50 hover:text-muted-foreground"
                    title="Edit message"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {isAi && (() => {
                  const aiMeta = extractAIMeta(msg.attachments as unknown as Array<Record<string, unknown>> | null | undefined);
                  return (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[10px] font-medium text-success/80">{msg.speaker_name || PERSONA_LABELS[persona || "default"] || "AI Facilitator"}</span>
                      {aiMeta && <AIReasoningPeek meta={aiMeta} />}
                    </div>
                  );
                })()}
                {isUser && (msg.user_name || msg.speaker_name) && (
                  <span className="text-[10px] font-medium text-muted-foreground/70 block mb-1">
                    {msg.user_name ?? msg.speaker_name}
                  </span>
                )}
                {/* Voice note player */}
                {msg.audio_url && <VoiceNotePlayer audioUrl={msg.audio_url} />}
                {/* Attachment cards (skip _ai_meta sidecar entries) */}
                {msg.attachments?.filter((att) => !!(att as unknown as Record<string, unknown>)?.url).map((att, i) => (
                  <AttachmentCard key={i} attachment={att} />
                ))}
                {/* Inline edit mode */}
                {editingId === msg.id ? (
                  <div className="space-y-2">
                    <textarea
                      ref={editRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") cancelEdit();
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                      }}
                      className="w-full bg-foreground/[0.05] border border-border rounded-lg p-2 text-foreground/90 text-sm resize-none focus:outline-none focus:border-border"
                      rows={Math.min(6, editText.split("\n").length + 1)}
                      disabled={editSaving}
                    />
                    <div className="flex gap-1.5 justify-end">
                      <button
                        onClick={cancelEdit}
                        disabled={editSaving}
                        className="px-2 py-1 rounded-md text-[11px] text-muted-foreground/70 hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editSaving || !editText.trim()}
                        className="px-2 py-1 rounded-md text-[11px] bg-success/20 text-success hover:bg-success/30 disabled:opacity-30 transition-colors flex items-center gap-1"
                      >
                        {editSaving ? (
                          <span className="h-3 w-3 rounded-full border-2 border-success/30 border-t-emerald-400 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Normal content rendering */
                  (() => {
                    let content = msg.content || "";
                    if (msg.id === revealingId && isAi) {
                      const words = content.split(/(\s+)/);
                      content = words.slice(0, revealedWords).join("");
                    }
                    const textContent = content;
                    // Per-message Set: each glossary term highlights only on
                    // its first occurrence so AI messages don't get peppered
                    // with repeats. Only applied to AI messages; user input
                    // is rendered untouched.
                    const seenTerms = new Set<string>();
                    return (
                      <>
                        {textContent && (
                          <div className="text-foreground/80 text-sm [&_strong]:text-foreground [&_strong]:font-semibold [&_em]:italic [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-foreground/[0.10] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[12px] [&_a]:text-info [&_a]:underline">
                            <ReactMarkdown
                              components={isAi ? {
                                p: ({ children }) => <p>{highlightChildren(children, seenTerms)}</p>,
                                li: ({ children }) => <li>{highlightChildren(children, seenTerms)}</li>,
                                strong: ({ children }) => <strong>{highlightChildren(children, seenTerms)}</strong>,
                                em: ({ children }) => <em>{highlightChildren(children, seenTerms)}</em>,
                              } : undefined}
                            >
                              {textContent}
                            </ReactMarkdown>
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
              {/* Feedback buttons for AI messages — sit to the trailing edge
                  of the bubble, not below where the reaction row lives. */}
              {(msg.message_type === "ai" || msg.message_type === "voice_ai") && !readOnly && (
                <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity shrink-0 pb-1 flex flex-col items-end gap-1">
                  <FeedbackButtons
                    targetType={msg.message_type === "voice_ai" ? "voice_response" : "chat_message"}
                    targetId={msg.id}
                    sessionId={sessionId}
                    agentType={msg.message_type === "voice_ai" ? "voice" : "chat"}
                  />
                  {/* Quick-correct affordance — prefills the input with
                      "Actually, " so the user doesn't have to retype context. */}
                  <button
                    type="button"
                    onClick={() => {
                      setInput("Actually, ");
                      setTimeout(() => {
                        const el = inputRef.current;
                        if (el) {
                          el.focus();
                          const len = "Actually, ".length;
                          try { el.setSelectionRange?.(len, len); } catch { /* ignore */ }
                        }
                      }, 0);
                    }}
                    className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground underline underline-offset-2 decoration-dotted"
                    title="Correct this — opens the input with 'Actually, ' prefilled"
                  >
                    Correct
                  </button>
                </div>
              )}
              </div>
              {/* "AI updated X" cue — appears under any AI bubble whose turn
                  triggered one or more blueprint section updates. */}
              {(() => {
                const updatedSections = isAi ? sectionUpdatesByMessageId?.[msg.id] : undefined;
                if (!updatedSections || updatedSections.length === 0) return null;
                const labels = updatedSections.map((s) => SECTION_LABELS[s] || s);
                const summary = labels.length === 1
                  ? `Updated ${labels[0]}`
                  : `Updated ${labels[0]} +${labels.length - 1} more`;
                const canUndo = !!undoTargetByMessageId?.[msg.id] && !!onUndoAiUpdate;
                return (
                  <div
                    className="flex items-center gap-2 mt-1 text-[10px] text-success/70"
                    title={labels.join(", ")}
                  >
                    <div className="flex items-center gap-1">
                      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>{summary}</span>
                    </div>
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => onUndoAiUpdate?.(msg.id)}
                        className="text-muted-foreground/50 hover:text-muted-foreground underline underline-offset-2 decoration-dotted"
                        title="Revert the blueprint changes from this turn"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                );
              })()}
              {/* Reactions row + add-reaction button (hover to reveal) */}
              {!readOnly && onToggleReaction && msg.message_type !== "system" && (
                <div className={`relative flex items-center gap-1 mt-1 ${isUser ? "flex-row-reverse" : ""}`}>
                  {Object.entries(msg.reactions || {}).map(([emoji, userIds]) => {
                    if (!userIds || userIds.length === 0) return null;
                    const reactedByMe = !!currentUserId && userIds.includes(currentUserId);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => onToggleReaction(msg.id, emoji)}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                          reactedByMe
                            ? "bg-success/15 border-success/30 text-success"
                            : "bg-foreground/[0.06] border-border/70 text-muted-foreground hover:bg-foreground/[0.10]"
                        }`}
                        title={reactedByMe ? "Remove your reaction" : `${userIds.length} reacted`}
                      >
                        <span>{emoji}</span>
                        <span className="tabular-nums text-[10px]">{userIds.length}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setReactionPickerFor((cur) => (cur === msg.id ? null : msg.id))}
                    className="opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 rounded-full bg-foreground/[0.06] border border-border/70 text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.10]"
                    title="Add reaction"
                  >
                    <SmilePlus className="h-3 w-3" />
                  </button>
                  {reactionPickerFor === msg.id && (
                    <EmojiPicker
                      compact
                      align={isUser ? "right" : "left"}
                      onPick={(emoji) => onToggleReaction(msg.id, emoji)}
                      onClose={() => setReactionPickerFor(null)}
                    />
                  )}
                </div>
              )}
              {/* Timestamp + edited indicator */}
              {msg.created_at && (
                <span className={`text-[9px] text-muted-foreground/30 mt-0.5 px-1 ${isUser ? "text-right" : ""}`}>
                  {formatTimestamp(msg.created_at)}
                  {msg.original_content && <span className="ml-1 text-muted-foreground/30">(edited)</span>}
                </span>
              )}
            </div>
          </div>
          </Fragment>
          );
        })}
        {aiThinking && (
          <div className="flex gap-2.5">
            <PersonaThumbnail videoPreviewUrl={personaVideoPreviewUrl} slug={persona} alt="" expandable className="w-10 h-10 rounded-full object-cover ring-1 ring-white/10 shrink-0 mt-0.5" />
            <div className="bg-foreground/[0.04] border border-border/60 rounded-xl p-3 animate-pulse">
              <span className="text-[10px] font-medium text-success/60">AI is thinking...</span>
            </div>
          </div>
        )}
      </div>

      {/* First-message example chips — only when the session is brand new and
          the user hasn't typed anything yet. Clicking prefills the input so
          they can edit before sending instead of committing immediately. */}
      {messages.length === 0 && !input && !pendingFile && recorder.state === "idle" && (
        <div className="px-3 py-2 border-t border-border/40">
          <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider font-medium block mb-1.5">Try one of these</span>
          <div className="flex flex-wrap gap-1.5">
            {[
              "Solo dev, building a todo app",
              "Internal admin tool for our team",
              "B2B SaaS dashboard",
              "Continue from the doc I uploaded",
            ].map((example) => (
              <button
                key={example}
                onClick={() => {
                  setInput(example);
                  // Defer focus so React paints the input first
                  setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-foreground/[0.04] border border-border/60 text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground transition-all"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Typing indicator — surfaces other participants' real-time typing.
          Self-filtered upstream (parent omits the current user). Animated
          dots are CSS keyframes inherited from utility classes. */}
      {typingUsers && typingUsers.length > 0 && (
        <div className="px-4 py-1 text-[10px] text-muted-foreground/60 italic shrink-0" aria-live="polite">
          {typingUsers.length === 1
            ? `${typingUsers[0].name} is typing…`
            : typingUsers.length === 2
            ? `${typingUsers[0].name} and ${typingUsers[1].name} are typing…`
            : `${typingUsers.length} people are typing…`}
        </div>
      )}

      {/* Quick reply suggestions */}
      {quickReplies.length > 0 && !pendingFile && recorder.state === "idle" && (
        <div className="px-3 py-2 border-t border-border/40">
          <span className="text-[9px] text-muted-foreground/30 uppercase tracking-wider font-medium block mb-1.5">Quick reply</span>
          <div className="flex flex-wrap gap-1.5">
            {quickReplies.map((reply) => (
              <button
                key={reply}
                onClick={() => onSend(reply)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-primary/10 border border-primary/20 text-primary/80 hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all"
              >
                {reply}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input area — three modes */}
      {recorder.state === "recorded" && recorder.audioUrl ? (
        <PreviewPlayer
          audioUrl={recorder.audioUrl}
          duration={recorder.duration}
          onDiscard={recorder.discard}
          onSend={handleSendVoice}
          sending={sending}
        />
      ) : recorder.state === "recording" ? (
        <div className="border-t border-border/60 p-3 flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{formatTime(recorder.duration)}</span>
            <span className="text-[10px] text-muted-foreground/50">Recording...</span>
          </div>
          <button
            onClick={recorder.stopRecording}
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
            title="Stop recording"
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative border-t border-border/60 shrink-0">
          {/* Sub-option picker (e.g. persona choices) */}
          {subOptions && (
            <div className="absolute bottom-full left-0 right-0 mb-0 mx-2 bg-secondary border border-border rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-1.5 border-b border-border/60">
                <span className="text-[9px] font-medium text-muted-foreground/40 uppercase tracking-wider">/{subOptions.command}</span>
              </div>
              {subOptions.options.map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => selectSubOption(opt)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 transition-colors ${
                    i === selectedIndex ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.05]"
                  }`}
                >
                  <span className="text-xs text-foreground/80 font-medium">{opt}</span>
                </button>
              ))}
            </div>
          )}
          {/* @mention picker — same chrome as slash command picker. */}
          {mentionState && filteredMentions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-0 mx-2 bg-secondary border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-[220px] overflow-y-auto">
              <div className="px-3 py-1.5 border-b border-border/60">
                <span className="text-[9px] font-medium text-muted-foreground/40 uppercase tracking-wider">Mention</span>
              </div>
              {filteredMentions.map((participant, i) => (
                <button
                  key={participant.id}
                  type="button"
                  onClick={() => selectMention(participant)}
                  onMouseEnter={() => setMentionSelectedIdx(i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
                    i === mentionSelectedIdx ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.05]"
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-primary/20 ring-1 ring-white/10 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-primary/80">
                      {participant.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] text-foreground/80 block">{participant.name}</span>
                    <span className="text-[9px] text-muted-foreground/40 font-mono">@{participant.name.split(" ", 1)[0].toLowerCase()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Slash command picker */}
          {showCommands && filteredCommands.length > 0 && !subOptions && (
            <div ref={commandListRef} className="absolute bottom-full left-0 right-0 mb-0 mx-2 bg-secondary border border-border rounded-xl shadow-2xl overflow-hidden z-50 max-h-[280px] overflow-y-auto">
              <div className="px-3 py-1.5 border-b border-border/60">
                <span className="text-[9px] font-medium text-muted-foreground/40 uppercase tracking-wider">Commands</span>
              </div>
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.name}
                  onClick={() => selectCommand(cmd)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`w-full text-left px-3 py-2 flex items-start gap-2.5 transition-colors ${
                    i === selectedIndex ? "bg-foreground/[0.08]" : "hover:bg-foreground/[0.05]"
                  }`}
                >
                  <span className="text-xs text-success/70 font-mono shrink-0 mt-px">/{cmd.name}</span>
                  <div className="min-w-0">
                    <span className="text-[11px] text-muted-foreground block">{cmd.description}</span>
                    {cmd.args && (
                      <span className="text-[9px] text-muted-foreground/30 font-mono">{cmd.args}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Pending file preview */}
          {pendingFile && (
            <div className="mx-3 mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground/[0.05] border border-border/70">
              <FileText className="h-4 w-4 text-muted-foreground/70 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-foreground/70 truncate">{pendingFile.name}</p>
                <p className="text-[9px] text-muted-foreground/40">{(pendingFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
              <button
                onClick={handleSendFile}
                disabled={sending}
                className="px-2.5 py-1 rounded-lg bg-success/20 text-success text-[10px] font-medium hover:bg-success/30 disabled:opacity-30 transition-colors"
              >
                {sending ? "Uploading…" : "Send"}
              </button>
            </div>
          )}
          {readOnly && (
            <div className="p-3 text-center">
              <p className="text-[10px] font-body text-muted-foreground/40">This release is finalized. Chat is view-only.</p>
            </div>
          )}
          {!readOnly && (
            <div className="px-3 pt-2 pb-1 flex gap-1.5 overflow-x-auto scrollbar-none">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onSend(p.prompt)}
                  className="shrink-0 px-2.5 py-1 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.08] text-muted-foreground hover:text-foreground/90 text-[11px] font-body whitespace-nowrap border border-border/60 transition-colors"
                  title={p.prompt.split("\n")[0]}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
          {!readOnly && <form onSubmit={handleSubmit} className="p-3 flex gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md,.html,.htm,.json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPendingFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!onSendAttachment}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.05] text-muted-foreground/70 hover:bg-foreground/[0.10] hover:text-muted-foreground disabled:opacity-30 transition-colors shrink-0"
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setInput("/");
                setShowCommands(true);
                setSelectedIndex(0);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.05] text-muted-foreground/70 hover:bg-foreground/[0.10] hover:text-muted-foreground transition-colors shrink-0"
              title="Slash commands"
              aria-label="Show slash commands"
            >
              <span className="text-[13px] font-semibold">/</span>
            </button>
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowEmojiPicker((s) => !s)}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.05] text-muted-foreground/70 hover:bg-foreground/[0.10] hover:text-muted-foreground transition-colors"
                title="Insert emoji"
              >
                <Smile className="h-3.5 w-3.5" />
              </button>
              {showEmojiPicker && (
                <EmojiPicker
                  align="left"
                  onPick={(emoji) => {
                    setInput((prev) => prev + emoji);
                    inputRef.current?.focus();
                  }}
                  onClose={() => setShowEmojiPicker(false)}
                />
              )}
            </div>
            <textarea
              ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
              value={input}
              onChange={(e) => {
                (handleInputChange as unknown as React.ChangeEventHandler<HTMLTextAreaElement>)(e);
                // Auto-resize — only grow, never shrink below min
                const el = e.target;
                el.style.height = "auto";
                el.style.height = Math.max(38, Math.min(el.scrollHeight, 128)) + "px";
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => onUserActivity?.()}
              onClick={() => onUserActivity?.()}
              placeholder={placeholder || "Type a message or / for commands..."}
              rows={1}
              className="flex-1 bg-foreground/[0.06] border border-border/70 rounded-xl px-3 py-2 text-sm text-foreground/90 placeholder:text-muted-foreground/30 focus:outline-none focus:border-border transition-colors resize-none overflow-hidden"
              style={{ minHeight: "38px" }}
            />
            {input.trim() ? (
              <button
                type="submit"
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.15] hover:text-foreground/90 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            ) : onSendVoiceNote ? (
              <button
                type="button"
                onClick={recorder.startRecording}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.15] hover:text-foreground/90 disabled:opacity-30 transition-colors"
                title="Record voice note"
              >
                <Mic className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </form>}
        </div>
      )}
    </div>
    </GlossaryProvider>
  );
}
