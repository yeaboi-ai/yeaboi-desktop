'use client';

// The live planning session: the canvas as the base layer (diagrams,
// wireframes, the AI's drawing surface), with chat and the living blueprint
// as floating drawers over it — the web app's layout, restored. The same
// status-gated fullscreen states wrap it (resume / review / recap), and
// canvasFullscreen hides all chrome (Escape brings it back).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Check,
  ClipboardList,
  Copy,
  FileText,
  MessageSquareText,
  MonitorPlay,
  Pencil,
  X,
} from 'lucide-react';
import CanvasEngine from '@/components/canvas/CanvasEngine';
import { CanvasErrorBoundary } from '@/components/canvas/CanvasErrorBoundary';
import { SimulatorViewport, type SimScreen } from '@/components/canvas/simulator-viewport';
import { useCanvasState } from './use-canvas-state';
import { ChatPanel } from '@/components/session/chat-panel';
import { ParticipantList } from '@/components/session/participant-list';
import { ReviewScreen } from '@/components/session/review-screen';
import { ResumeScreen } from '@/components/session/resume-screen';
import { RecapScreen, buildRecapEntries } from '@/components/session/recap-screen';
import { AISettingsDrawer } from '@/components/session/ai-settings-drawer';
import { AgentIntentStrip } from '@/components/session/agent-intent-strip';
import { BlueprintPanel } from '@/components/blueprint/blueprint-panel';
import { DebugPanel } from '@/components/session/debug-drawer';
import { ShortcutsOverlay } from '@/components/session/shortcuts-overlay';
import { CommandPalette } from '@/components/session/command-palette';
import { CheatsheetSheet } from '@/components/session/cheatsheet-sheet';
import { useSessionShortcuts, type SessionShortcut } from '@/hooks/use-session-shortcuts';
import { useSessionWs } from '@/hooks/use-session-ws';
import { useBlueprint } from '@/hooks/use-blueprint';
import { useSuggestions } from '@/hooks/use-suggestions';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import { duckQuip } from '@/lib/duck-events';
import { PersonaSuggestionPopup, OutputSuggestionPopup } from './suggestion-popups';
import { useSessionData } from './use-session-data';
import { useChatState } from './use-chat-state';
import { useAiState } from './use-ai-state';
import { useSessionEvents } from './use-session-events';

const STATUS_COLOR: Record<string, string> = {
  created: 'bg-zinc-500/20 text-zinc-400',
  lobby: 'bg-blue-500/20 text-blue-400',
  live: 'bg-success/20 text-success',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-violet-500/20 text-violet-400',
};

export default function SessionPage() {
  const { id: projectId, sessionId } = useParams<{ id: string; sessionId: string }>();
  const router = useRouter();
  const confirm = useConfirm();
  const { authFetch } = useAuthFetch();

  const data = useSessionData(sessionId, projectId);
  const { session, setSession } = data;
  const ai = useAiState();
  const { connected, events, send } = useSessionWs(sessionId);
  const { blueprint, updateSection, setEditing } = useBlueprint();
  const chat = useChatState({
    sessionId,
    projectId,
    myDisplayName: data.myDisplayName,
    setAiThinking: ai.setAiThinking,
    wsSend: send,
  });
  const suggestions = useSuggestions({ projectId, sessionId, wsEvents: events });

  // Blueprint-adjacent UI state fed by WS events.
  const [blueprintHistoryToken, setBlueprintHistoryToken] = useState(0);
  const [sectionUpdatesByMessageId, setSectionUpdatesByMessageId] = useState<
    Record<string, string[]>
  >({});
  const [undoTargetByMessageId, setUndoTargetByMessageId] = useState<Record<string, string>>({});
  const [recentlyCompletedSection, setRecentlyCompletedSection] = useState<{
    section: string;
    at: number;
  } | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<
    Array<{ user_id: string; name: string; email: string; color: string }>
  >([]);

  useSessionEvents({
    events,
    connected,
    setMessages: chat.setMessages,
    setTypingUsersMap: chat.setTypingUsersMap,
    setSession,
    updateSection,
    setBlueprintHistoryToken,
    setSectionUpdatesByMessageId,
    setUndoTargetByMessageId,
    setRecentlyCompletedSection,
    setPresenceUsers,
    ai,
  });

  // ── The canvas base layer ──────────────────────────────────────────────
  const canvas = useCanvasState({ sessionId, authFetch, ready: data.ready, events });
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  // ── Page chrome state ──────────────────────────────────────────────────
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [sidePaneOpen, setSidePaneOpen] = useState(true);
  const [sideTab, setSideTab] = useState<'blueprint' | 'debug'>('blueprint');
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const [showResumeScreen, setShowResumeScreen] = useState(false);
  const resumeScreenShown = useRef(false);
  const [recapState, setRecapState] = useState<{
    callStartedAt: number;
    durationSeconds: number;
    sinceMs?: number;
  } | null>(null);
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);

  // Personas (slug → name) so historical AI bubbles keep the face of the
  // persona that sent them. Video-avatar previews are a web feature; the
  // desktop resolves to the persona's SVG only.
  const [blueprintPersonas, setBlueprintPersonas] = useState<
    Array<{ id: string; slug: string; name: string }>
  >([]);
  useEffect(() => {
    if (!data.ready) return;
    authFetch('/api/blueprint-personas')
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (Array.isArray(list)) setBlueprintPersonas(list);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ready]);

  // ── Initial load: session + blueprint + messages ───────────────────────
  useEffect(() => {
    if (!data.ready) return;
    let cancelled = false;
    (async () => {
      const [sessionResp, blueprintResp, messagesResp] = await Promise.all([
        authFetch(`/api/sessions/${sessionId}`),
        authFetch(`/api/projects/${projectId}/blueprint`),
        authFetch(`/api/sessions/${sessionId}/messages`),
      ]);
      if (cancelled) return;
      if (sessionResp.ok) {
        const s = await sessionResp.json();
        setSession(s);
        if (s.status === 'live' || s.status === 'lobby' || s.status === 'created') {
          duckQuip('session.started');
        }
      }
      if (blueprintResp.ok) {
        const bp = await blueprintResp.json();
        Object.entries(bp.content as Record<string, string>).forEach(([section, content]) => {
          updateSection(section, content, bp.version_number);
        });
      }
      if (messagesResp.ok) {
        const msgs = await messagesResp.json();
        chat.setMessages(msgs);
        // Show the resume screen when reopening a session that already has
        // history — unless it was just created or is already active here.
        const params = new URLSearchParams(window.location.search);
        const isNew = params.has('new');
        const wasActive = sessionStorage.getItem(`session-active-${sessionId}`);
        if (msgs.length > 0 && !isNew && !wasActive && !resumeScreenShown.current) {
          resumeScreenShown.current = true;
          setShowResumeScreen(true);
        }
        sessionStorage.setItem(`session-active-${sessionId}`, '1');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, projectId, data.ready]);

  // Coverage on mount + whenever the blueprint version moves.
  useEffect(() => {
    void data.fetchCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.fetchCoverage, blueprint.version]);

  // The duck announces the blueprint being finalize-ready — once.
  const readyQuippedRef = useRef(false);
  useEffect(() => {
    if (data.coverageOverall >= 80 && !readyQuippedRef.current) {
      readyQuippedRef.current = true;
      duckQuip('session.ready-to-finalize', {
        route: `/projects/${projectId}/sessions/${sessionId}`,
      });
    }
  }, [data.coverageOverall, projectId, sessionId]);

  // ...and new AI suggestions for the blueprint.
  const lastSuggestionCountRef = useRef(0);
  useEffect(() => {
    if (suggestions.pending.length > lastSuggestionCountRef.current) {
      duckQuip('blueprint.suggestion');
    }
    lastSuggestionCountRef.current = suggestions.pending.length;
  }, [suggestions.pending.length]);

  // ── Handlers ───────────────────────────────────────────────────────────
  const handleAiConfigChange = useCallback(
    (patch: Record<string, unknown>) => {
      data.patchAiConfig(patch, {
        addNote: chat.addSystemMessage,
        refreshMessages: chat.refreshMessages,
      });
    },
    [data, chat.addSystemMessage, chat.refreshMessages],
  );

  const handleBlueprintSave = useCallback(
    async (section: string, content: string) => {
      const resp = await authFetch(`/api/projects/${projectId}/blueprint/sections/${section}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (resp.ok) {
        const bp = await resp.json();
        updateSection(section, content, bp.version_number);
        send({
          type: 'blueprint_update',
          payload: { section, content, version: bp.version_number },
        });
      }
      setEditing(null);
    },
    [projectId, updateSection, setEditing, send, authFetch],
  );

  const handleUndoAiUpdate = useCallback(
    async (messageId: string) => {
      const snapshotId = undoTargetByMessageId[messageId];
      if (!snapshotId) return;
      try {
        const res = await authFetch(`/api/projects/${projectId}/blueprint/restore/${snapshotId}`, {
          method: 'POST',
        });
        if (res.ok) {
          setUndoTargetByMessageId((prev) => {
            const next = { ...prev };
            delete next[messageId];
            return next;
          });
          setSectionUpdatesByMessageId((prev) => {
            const next = { ...prev };
            delete next[messageId];
            return next;
          });
          toast.success({ title: 'Undone — blueprint reverted', timeout: 4000 });
        } else {
          toast.show({ title: "Couldn't undo — try again", timeout: 4000 });
        }
      } catch {
        toast.show({ title: "Couldn't undo — try again", timeout: 4000 });
      }
    },
    [projectId, undoTargetByMessageId, authFetch],
  );

  const openRecap = useCallback(() => {
    if (chat.messages.length === 0) return;
    const first = new Date(chat.messages[0]!.created_at).getTime();
    const last = new Date(chat.messages[chat.messages.length - 1]!.created_at).getTime();
    setRecapState({
      callStartedAt: first,
      durationSeconds: Math.max(0, Math.round((last - first) / 1000)),
    });
  }, [chat.messages]);

  const wrapUp = useCallback(async () => {
    const ok = await confirm({
      title: 'Wrap up session?',
      message:
        "You'll review your blueprint, fill any gaps with sensible defaults, and preview the kanban tasks before finalizing.",
      confirmLabel: 'Wrap up',
    });
    if (ok) void data.changeStatus('reviewing');
  }, [confirm, data]);

  // ── Keyboard shortcuts (help overlay + Cmd-K palette share this list) ──
  const sessionShortcuts: SessionShortcut[] = useMemo(
    () => [
      {
        id: 'shortcuts.help',
        label: 'Show keyboard shortcuts',
        keys: '?',
        group: 'Misc',
        run: (e) => {
          e.preventDefault();
          setShortcutsOpen((o) => !o);
        },
      },
      {
        id: 'ui.command-palette',
        label: 'Command palette',
        keys: 'mod+k',
        group: 'Misc',
        allowInInputs: true,
        run: (e) => {
          e.preventDefault();
          setPaletteOpen((o) => !o);
        },
      },
      {
        id: 'ui.toggle-blueprint',
        label: 'Toggle blueprint pane',
        keys: 'i',
        group: 'Navigation',
        run: (e) => {
          e.preventDefault();
          setSidePaneOpen((o) => !o);
        },
      },
      {
        id: 'ui.toggle-chat',
        label: 'Toggle chat drawer',
        keys: 'c',
        group: 'Navigation',
        run: (e) => {
          e.preventDefault();
          setChatOpen((o) => !o);
        },
      },
      {
        id: 'canvas.fullscreen',
        label: 'Canvas fullscreen',
        keys: 'f',
        group: 'Navigation',
        run: (e) => {
          e.preventDefault();
          setCanvasFullscreen((o) => !o);
        },
      },
      {
        id: 'ui.ai-settings',
        label: 'AI settings',
        keys: 's',
        group: 'Navigation',
        run: (e) => {
          e.preventDefault();
          setAiSettingsOpen((o) => !o);
        },
      },
      {
        id: 'session.recap',
        label: 'View session recap',
        keys: '',
        group: 'Navigation',
        run: () => openRecap(),
      },
      {
        id: 'session.wrap-up',
        label: 'Wrap up session',
        keys: '',
        group: 'Navigation',
        run: () => void wrapUp(),
      },
    ],
    [openRecap, wrapUp],
  );
  useSessionShortcuts(sessionShortcuts);

  // Escape walks out of canvas fullscreen — the one key everyone tries.
  useEffect(() => {
    if (!canvasFullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCanvasFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canvasFullscreen]);

  const readOnly = session?.status === 'completed' || session?.status === 'archived';

  const resolvePersonaAvatar = useCallback(
    (speakerName?: string | null) => {
      if (!speakerName) return null;
      const normalized = speakerName.trim().toLowerCase();
      const persona =
        blueprintPersonas.find(
          (p) => p.name.toLowerCase() === normalized || p.slug.toLowerCase() === normalized,
        ) ??
        blueprintPersonas.find(
          (p) =>
            p.name.toLowerCase().includes(normalized) || normalized.includes(p.slug.toLowerCase()),
        );
      if (!persona) return null;
      return { videoPreviewUrl: null, slug: persona.slug };
    },
    [blueprintPersonas],
  );

  // Wirescreens with real HTML are what the device simulator can run.
  const simScreens: SimScreen[] = useMemo(
    () =>
      canvas.nodes
        .filter((node) => {
          const html = (node.data as { html?: unknown })?.html;
          return (
            node.type === 'wirescreen' &&
            !(node.id ?? '').startsWith('__skeleton') &&
            typeof html === 'string' &&
            html.length > 0
          );
        })
        .map((node) => {
          const nodeData = node.data as Record<string, unknown>;
          return {
            id: node.id,
            name: String(nodeData['label'] ?? node.id),
            kind: (nodeData['kind'] as string) || 'screen',
            html: String(nodeData['html'] ?? ''),
            device: nodeData['device'],
            triggerFrom: nodeData['triggerFrom'],
            width: nodeData['width'],
            height: nodeData['height'],
          } as SimScreen;
        }),
    [canvas.nodes],
  );

  // ── Status-gated fullscreen states ─────────────────────────────────────
  if (!session) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-foreground/[0.20] animate-pulse" />
          <span className="text-sm text-muted-foreground/50 font-medium">Loading session...</span>
        </div>
      </div>
    );
  }

  if (showResumeScreen && (session.status === 'live' || session.status === 'paused')) {
    return (
      <ResumeScreen
        sessionId={sessionId}
        projectId={projectId}
        onContinue={() => {
          setShowResumeScreen(false);
          authFetch(`/api/sessions/${sessionId}/resume`, { method: 'POST' }).catch(() => {});
        }}
      />
    );
  }

  if (session.status === 'reviewing') {
    return (
      <ReviewScreen
        projectId={projectId}
        sessionId={sessionId}
        onComplete={() => {
          duckQuip('wizard.committed', { route: '/board' });
          router.push(`/projects/${projectId}/sessions/${sessionId}/completed`);
        }}
        onCancel={() => void data.changeStatus('live')}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background flex flex-col">
      {/* ── Header bar (gone in canvas fullscreen; Escape brings it back) ── */}
      <header
        className={`flex items-center gap-3 px-4 h-14 shrink-0 border-b border-border/60 bg-background/90 ${canvasFullscreen ? 'hidden' : ''}`}
      >
        <button
          onClick={() => router.push(`/projects/${projectId}`)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground/70 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-all shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Exit
        </button>

        <div className="flex items-center gap-2 min-w-0">
          {editingTitle ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    void data.saveTitle(titleDraft);
                    setEditingTitle(false);
                  }
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                autoFocus
                className="text-sm font-medium text-foreground/90 bg-foreground/[0.10] border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary/50 w-48"
              />
              <button
                onClick={() => {
                  void data.saveTitle(titleDraft);
                  setEditingTitle(false);
                }}
                className="p-0.5 text-success"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setEditingTitle(false)}
                className="p-0.5 text-muted-foreground/70 hover:text-foreground/80"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span
              className="text-sm font-medium text-foreground/90 truncate cursor-pointer hover:text-foreground group/title max-w-[280px]"
              title="Click to rename"
              onClick={() => {
                setTitleDraft(session.title || '');
                setEditingTitle(true);
              }}
            >
              {session.title || 'Planning Session'}
              <Pencil className="inline-block h-3 w-3 ml-1.5 opacity-0 group-hover/title:opacity-50 transition-opacity" />
            </span>
          )}
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium shrink-0 ${STATUS_COLOR[session.status] || 'bg-zinc-500/20 text-zinc-400'}`}
          >
            {session.status}
          </span>
          <button
            onClick={() => {
              void navigator.clipboard.writeText(session.join_code).then(() => {
                setJoinCodeCopied(true);
                setTimeout(() => setJoinCodeCopied(false), 1500);
              });
            }}
            className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground font-mono shrink-0 transition-colors"
            title="Copy join code"
          >
            #{session.join_code}
            {joinCodeCopied ? (
              <Check className="h-2.5 w-2.5 text-success" />
            ) : (
              <Copy className="h-2.5 w-2.5" />
            )}
          </button>
        </div>

        <div className="flex-1" />

        {/* Connection dot — the WS is the session's lifeline. */}
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-success' : 'bg-destructive animate-pulse'}`}
          title={connected ? 'Connected' : 'Reconnecting…'}
        />

        <ParticipantList
          participants={session.participants || []}
          connected={connected}
          activeUsers={presenceUsers}
          currentUserIsHost={data.currentUserIsHost}
          onChangeParticipantRole={async (participantId, role) => {
            try {
              await data.changeParticipantRole(participantId, role);
              toast.success({
                title: role === 'co_host' ? 'Promoted to co-host' : 'Demoted to member',
              });
            } catch {
              toast.warning({ title: "Couldn't change role" });
            }
          }}
        />

        {readOnly && (
          <span className="text-[9px] font-body text-muted-foreground/40 px-2 py-0.5 rounded-md bg-muted/20 border border-border/30">
            View only
          </span>
        )}
        {chat.messages.length > 0 && (
          <button
            type="button"
            onClick={openRecap}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground hover:text-foreground bg-foreground/[0.05] hover:bg-foreground/[0.08] ring-1 ring-border/70 transition-colors"
            title="View session recap"
          >
            <ClipboardList className="h-3 w-3" />
            Recap
          </button>
        )}
        {data.coverageOverall >= 80 &&
          (session.status === 'live' || session.status === 'paused') && (
            <span className="text-[9px] font-body text-blue-400/70 px-2 py-0.5 rounded-md bg-blue-400/10 border border-blue-400/15">
              Ready to finalize
            </span>
          )}
        {(session.status === 'live' || session.status === 'paused') && (
          <button
            onClick={() => void wrapUp()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-success/10 text-success hover:bg-success/20 text-[11px] font-medium transition-colors border border-success/15"
          >
            Wrap up session
          </button>
        )}
        {simScreens.length > 0 && (
          <button
            onClick={() => setSimulatorOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${simulatorOpen ? 'text-foreground bg-foreground/[0.08]' : 'text-muted-foreground/70 hover:text-foreground/80'}`}
            title="Run the wireframes in the device simulator"
          >
            <MonitorPlay className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={() => setChatOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${chatOpen ? 'text-foreground bg-foreground/[0.08]' : 'text-muted-foreground/70 hover:text-foreground/80'}`}
          title="Toggle chat drawer (C)"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setSidePaneOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${sidePaneOpen ? 'text-foreground bg-foreground/[0.08]' : 'text-muted-foreground/70 hover:text-foreground/80'}`}
          title="Toggle blueprint pane (I)"
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* ── Canvas base layer + floating drawers ── */}
      <div className="flex-1 relative min-h-0">
        <div className="absolute inset-0 z-0 isolate">
          <CanvasErrorBoundary>
            <CanvasEngine
              key={canvas.canvasEpoch}
              initialNodes={canvas.nodes}
              initialEdges={canvas.edges}
              onNodesChange={(nodes) => canvas.setNodes(nodes)}
              onEdgesChange={(edges) => canvas.setEdges(edges)}
              sessionId={sessionId}
              authFetch={authFetch}
              onClearCanvas={canvas.clear}
              chatOpen={chatOpen && !canvasFullscreen}
              blueprintOpen={sidePaneOpen && !canvasFullscreen}
              fullscreen={canvasFullscreen}
              onToggleFullscreen={() => setCanvasFullscreen((v) => !v)}
            />
          </CanvasErrorBoundary>
          <SimulatorViewport
            open={simulatorOpen}
            sessionId={sessionId}
            screens={simScreens}
            onClose={() => setSimulatorOpen(false)}
            leftInset={chatOpen && !canvasFullscreen ? 420 : 0}
            rightInset={sidePaneOpen && !canvasFullscreen ? 440 : 0}
          />
        </div>

        {/* Chat drawer (left, floating over the canvas) */}
        {chatOpen && !canvasFullscreen && (
          <div className="absolute left-0 top-0 bottom-0 z-10 w-[420px] flex flex-col border-r border-border/60 bg-background/95 backdrop-blur-sm">
            {ai.agentIntent && (
              <AgentIntentStrip
                intent={ai.agentIntent.intent}
                etaMs={ai.agentIntent.eta_ms}
                onCancel={() => {
                  ai.setAgentIntent(null);
                  void chat.sendMessage('/skip');
                }}
              />
            )}
            <div className="flex-1 min-h-0">
              <ChatPanel
                messages={chat.messages}
                onSend={(content) => void chat.sendMessage(content)}
                onSendAttachment={chat.sendAttachment}
                onEditMessage={chat.editMessage}
                onToggleReaction={chat.toggleReaction}
                currentUserId={data.currentUserId}
                aiThinking={ai.aiThinking}
                persona={(session.ai_config?.['persona'] as string) ?? 'default'}
                resolvePersonaAvatar={resolvePersonaAvatar}
                userAvatarUrl={data.myAvatarUrl}
                sectionUpdatesByMessageId={sectionUpdatesByMessageId}
                undoTargetByMessageId={undoTargetByMessageId}
                onUndoAiUpdate={handleUndoAiUpdate}
                onLoadOlderMessages={chat.loadOlderMessages}
                typingUsers={Object.entries(chat.typingUsersMap)
                  .filter(([uid]) => uid !== data.currentUserId)
                  .map(([uid, entry]) => ({ user_id: uid, name: entry.name }))}
                onTypingSignal={chat.signalTyping}
                mentionableParticipants={data.teamMembers
                  .filter((m) => m.id !== data.currentUserId && m.name)
                  .map((m) => ({ id: m.id, name: (m.name as string) || m.email }))}
                readOnly={readOnly}
                sessionId={sessionId}
                autoFocusInput
              />
            </div>
          </div>
        )}

        {sidePaneOpen && !canvasFullscreen && (
          <aside className="absolute right-0 top-0 bottom-0 z-10 w-[440px] border-l border-border/60 flex flex-col min-h-0 bg-background/95 backdrop-blur-sm">
            <div className="flex items-center gap-1 px-3 h-10 shrink-0 border-b border-border/40">
              {(['blueprint', 'debug'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={sideTab === t}
                  onClick={() => setSideTab(t)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    sideTab === t
                      ? 'bg-foreground/[0.10] text-foreground'
                      : 'text-muted-foreground/70 hover:text-foreground/80'
                  }`}
                >
                  {t === 'blueprint' ? 'Blueprint' : 'Debug'}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {sideTab === 'blueprint' ? (
                <BlueprintPanel
                  content={blueprint.content}
                  version={blueprint.version}
                  editingSection={blueprint.editingSection}
                  coverageScores={data.coverageScores}
                  focusSections={session.focus_sections ?? null}
                  onEdit={(s) => setEditing(s)}
                  onSave={handleBlueprintSave}
                  onCancel={() => setEditing(null)}
                  readOnly={readOnly}
                  projectId={projectId}
                  currentUserId={data.currentUserId}
                  historyInvalidationToken={blueprintHistoryToken}
                  onHistoryRestored={() => setBlueprintHistoryToken((t) => t + 1)}
                  pendingSuggestions={suggestions.pending}
                  onAcceptSuggestion={(id, edited) => void suggestions.accept(id, edited)}
                  onRejectSuggestion={(id) => void suggestions.reject(id)}
                  onBulkAcceptSuggestionSection={(section) =>
                    void suggestions.bulkAcceptSection(section)
                  }
                  recentlyCompletedSection={recentlyCompletedSection}
                />
              ) : (
                <DebugPanel
                  sessionId={sessionId}
                  intents={[]}
                  pipelineStarts={[]}
                  pipelineMetrics={[]}
                  designTokens={null}
                  renderItems={[]}
                  pendingMessages={[]}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── AI settings dock (bottom pill) ── */}
      <AISettingsDrawer
        aiConfig={{
          assertiveness: (session.ai_config?.['assertiveness'] as string) ?? 'balanced',
          muted: false,
          persona: (session.ai_config?.['persona'] as string) ?? 'default',
          involvement: session.ai_config?.['involvement'] as string | undefined,
          paused_until: (session.ai_config?.['paused_until'] as string | null | undefined) ?? null,
          pace:
            (session.ai_config?.['pace'] as 'fast' | 'balanced' | 'deep' | undefined) ?? 'balanced',
          library: (session.ai_config?.['library'] as 'shadcn' | 'custom' | undefined) ?? 'shadcn',
          technical_comfort:
            (session.ai_config?.['technical_comfort'] as
              'non_technical' | 'comfortable' | 'expert' | undefined) ?? 'comfortable',
        }}
        onConfigChange={handleAiConfigChange}
        aiSpeaking={ai.aiThinking}
        open={aiSettingsOpen}
        onToggle={() => setAiSettingsOpen((v) => !v)}
        contextOpen={sidePaneOpen}
        onToggleContext={() => setSidePaneOpen((v) => !v)}
        personaRecommendations={data.personaRecs}
      />

      {/* ── Popups ── */}
      {ai.personaSuggestion && (
        <PersonaSuggestionPopup
          persona={ai.personaSuggestion.persona}
          label={ai.personaSuggestion.label}
          reason={ai.personaSuggestion.reason}
          onAccept={() => {
            const previousPersona =
              (session.ai_config?.['persona'] as string | undefined) ?? 'default';
            const targetLabel = ai.personaSuggestion!.label;
            handleAiConfigChange({ persona: ai.personaSuggestion!.persona });
            ai.setPersonaSuggestion(null);
            toast.success({
              title: `Switched to ${targetLabel}`,
              timeout: 5000,
              action: {
                label: 'Undo',
                onClick: () => {
                  handleAiConfigChange({ persona: previousPersona });
                  toast.show({ title: 'Reverted to previous persona', timeout: 3000 });
                },
              },
            });
          }}
          onDismiss={() => ai.setPersonaSuggestion(null)}
        />
      )}
      {ai.outputSuggestion && (
        <OutputSuggestionPopup
          outputType={ai.outputSuggestion.output_type}
          label={ai.outputSuggestion.label}
          reason={ai.outputSuggestion.reason}
          onAccept={async () => {
            const { output_type, label } = ai.outputSuggestion!;
            ai.setOutputSuggestion(null);
            try {
              const res = await authFetch(
                `/api/projects/${projectId}/outputs/${output_type}/generate`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ payload: {} }),
                },
              );
              if (res.ok) toast.success({ title: `Generating ${label}…`, timeout: 4000 });
              else toast.show({ title: `${label} generation failed`, timeout: 4000 });
            } catch {
              toast.show({ title: `${label} generation failed`, timeout: 4000 });
            }
          }}
          onDismiss={() => {
            ai.dismissedOutputsRef.current.add(ai.outputSuggestion!.output_type);
            ai.setOutputSuggestion(null);
          }}
        />
      )}

      {/* ── Recap overlay ── */}
      {recapState && (
        <RecapScreen
          open
          sessionId={sessionId}
          callStartedAt={recapState.callStartedAt}
          durationSeconds={recapState.durationSeconds}
          entries={buildRecapEntries(chat.messages, recapState.sinceMs)}
          allEntries={buildRecapEntries(chat.messages)}
          title={session.title ?? null}
          onClose={() => setRecapState(null)}
        />
      )}

      {/* ── Overlays ── */}
      <ShortcutsOverlay
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        shortcuts={sessionShortcuts}
      />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        shortcuts={sessionShortcuts}
        onSwitchPersona={(personaId) => handleAiConfigChange({ persona: personaId })}
        inCall={false}
      />
      <CheatsheetSheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
    </div>
  );
}
