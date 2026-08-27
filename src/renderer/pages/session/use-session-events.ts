'use client';

// The session's WS event switch, planning-only. The web app's switch also
// handled a dozen canvas/wireframe/pipeline event families and one voice
// event (ai_speaking) — those types are ignored here; the backend can keep
// broadcasting them to web clients without breaking the desktop.

import { useEffect, useRef } from 'react';
import { toast } from '@/components/ui/toast';
import type { WsEvent } from '@/lib/ws';
import { duckQuip } from '@/lib/duck-events';
import type { ChatMessage } from './use-chat-state';
import type { SessionData } from './use-session-data';
import type { useAiState } from './use-ai-state';

// Section labels for the "blueprint just grew" toast. Kept local so the
// handler renders them without importing the whole blueprint panel.
const SECTION_LABEL_MAP: Record<string, string> = {
  project_overview: 'Project Overview',
  goals_constraints: 'Goals & Constraints',
  users_personas: 'Users & Personas',
  team_capacity: 'Team & Capacity',
  architecture: 'Architecture',
  tech_stack: 'Tech Stack',
  api_integrations: 'API & Integrations',
  ui_ux: 'UI / UX',
  security_compliance: 'Security & Compliance',
  infrastructure: 'Infrastructure',
  risks_unknowns: 'Risks & Unknowns',
  out_of_scope: 'Out of Scope',
  open_questions: 'Open Questions',
};

interface UseSessionEventsArgs {
  events: WsEvent[];
  connected: boolean;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setTypingUsersMap: React.Dispatch<
    React.SetStateAction<Record<string, { name: string; expiresAt: number }>>
  >;
  setSession: React.Dispatch<React.SetStateAction<SessionData | null>>;
  updateSection: (section: string, content: string, version?: number) => void;
  setBlueprintHistoryToken: React.Dispatch<React.SetStateAction<number>>;
  setSectionUpdatesByMessageId: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setUndoTargetByMessageId: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setRecentlyCompletedSection: React.Dispatch<
    React.SetStateAction<{ section: string; at: number } | null>
  >;
  setPresenceUsers: React.Dispatch<
    React.SetStateAction<Array<{ user_id: string; name: string; email: string; color: string }>>
  >;
  ai: ReturnType<typeof useAiState>;
}

export function useSessionEvents({
  events,
  connected,
  setMessages,
  setTypingUsersMap,
  setSession,
  updateSection,
  setBlueprintHistoryToken,
  setSectionUpdatesByMessageId,
  setUndoTargetByMessageId,
  setRecentlyCompletedSection,
  setPresenceUsers,
  ai,
}: UseSessionEventsArgs) {
  const processedEventCountRef = useRef(0);
  const {
    setAiThinking,
    setAgentStatus,
    setAgentIntent,
    setPersonaSuggestion,
    setOutputSuggestion,
    dismissedOutputsRef,
  } = ai;

  // The duck reads the connection state: startled on a drop, relieved on the
  // way back. The first connect is silent — nothing "reconnected".
  const everConnectedRef = useRef(false);
  useEffect(() => {
    if (connected) {
      if (everConnectedRef.current) duckQuip('session.reconnected');
      everConnectedRef.current = true;
    } else if (everConnectedRef.current) {
      duckQuip('session.disconnected');
    }
  }, [connected]);

  useEffect(() => {
    const total = events.length;
    let startIdx = processedEventCountRef.current;
    if (startIdx > total) startIdx = 0; // guard against unmount-remount resets
    if (startIdx >= total) return;
    const newEvents = events.slice(startIdx);
    processedEventCountRef.current = total;

    for (const latest of newEvents) {
      if (!latest) continue;

      switch (latest.type) {
        case 'chat_message': {
          const msg = latest.payload as unknown as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          break;
        }
        case 'message_updated': {
          const updated = latest.payload as {
            id: string;
            content: string;
            original_content?: string;
          };
          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id
                ? { ...m, content: updated.content, original_content: updated.original_content }
                : m,
            ),
          );
          break;
        }
        case 'message_reaction': {
          const r = latest.payload as {
            message_id: string;
            reactions: Record<string, string[]>;
          };
          setMessages((prev) =>
            prev.map((m) => (m.id === r.message_id ? { ...m, reactions: r.reactions } : m)),
          );
          break;
        }
        case 'ai_stream_start':
        case 'ai_stream_token':
          // Tokens don't render as a live bubble; the thinking indicator
          // stays up until ai_stream_end delivers the full message.
          break;
        case 'ai_stream_end': {
          const {
            final_id,
            content,
            speaker_name: spk,
            created_at,
          } = latest.payload as {
            final_id: string;
            content: string;
            speaker_name: string;
            created_at: string;
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === final_id)) return prev;
            return [
              ...prev,
              {
                id: final_id,
                content,
                message_type: 'ai' as const,
                user_id: null,
                speaker_name: spk,
                created_at,
              },
            ];
          });
          setAiThinking(false);
          break;
        }
        case 'blueprint_update': {
          const {
            section,
            content: bpContent,
            version,
            triggered_by_message_id,
            undo_target_snapshot_id,
            source,
          } = latest.payload as {
            section: string;
            content: string;
            version: number;
            triggered_by_message_id?: string;
            undo_target_snapshot_id?: string;
            source?: string;
          };
          updateSection(section, bpContent, version);
          setBlueprintHistoryToken((t) => t + 1);
          // Stamp the originating AI bubble so the chat can show an "AI just
          // updated Tech Stack" cue under that exact message. Capped at 5.
          if (triggered_by_message_id) {
            setSectionUpdatesByMessageId((prev) => {
              const existing = prev[triggered_by_message_id] || [];
              if (existing.includes(section) || existing.length >= 5) return prev;
              return { ...prev, [triggered_by_message_id]: [...existing, section] };
            });
            if (undo_target_snapshot_id) {
              setUndoTargetByMessageId((prev) => ({
                ...prev,
                [triggered_by_message_id]: undo_target_snapshot_id,
              }));
            }
          }
          // "Blueprint is growing" toast — skip user edits and restores.
          if (source && source !== 'user' && source !== 'restore') {
            const label = SECTION_LABEL_MAP[section] || section;
            toast.success({
              title: `${label} updated`,
              description: 'Blueprint just grew from this turn.',
              timeout: 2400,
            });
          }
          break;
        }
        case 'section_completed': {
          const sp = latest.payload as { section: string; score: number };
          setRecentlyCompletedSection({ section: sp.section, at: Date.now() });
          break;
        }
        case 'session_focus_update': {
          const payload = latest.payload as { focus_sections: string[] | null };
          setSession((s) => (s ? { ...s, focus_sections: payload.focus_sections } : s));
          break;
        }
        case 'ai_thinking': {
          const thinking =
            !!(latest.payload as { thinking: boolean })?.thinking ||
            (!!(latest as Record<string, unknown>)['thinking'] as boolean);
          setAiThinking(thinking);
          break;
        }
        case 'agent_status': {
          const agentPayload = latest.payload as { status: string };
          const s = agentPayload?.status;
          if (
            s === 'extracting' ||
            s === 'joining' ||
            s === 'ready' ||
            s === 'connected' ||
            s === 'detaching'
          ) {
            setAgentStatus(s);
          } else if (s === 'tts_error') {
            setAgentStatus('connected'); // degraded but present
          } else if (s === 'disconnected' || s === 'detached' || s === 'error') {
            setAgentStatus('disconnected');
          }
          break;
        }
        case 'suggest_persona': {
          const suggestion = latest.payload as { persona: string; label: string; reason: string };
          setPersonaSuggestion(suggestion);
          break;
        }
        case 'suggest_output': {
          const p = latest.payload as { output_type: string; label: string; reason: string };
          if (dismissedOutputsRef.current.has(p.output_type)) break;
          setOutputSuggestion((existing) => existing ?? p);
          break;
        }
        case 'agent_intent': {
          const p = latest.payload as { intent: string; eta_ms: number | null };
          if (!p || !p.intent) setAgentIntent(null);
          else setAgentIntent({ intent: p.intent, eta_ms: p.eta_ms ?? null });
          break;
        }
        case 'presence_update': {
          const { users } = latest.payload as {
            users: Array<{ user_id: string; name: string; email: string; color: string }>;
          };
          if (users) setPresenceUsers(users);
          break;
        }
        case 'user_typing': {
          const { user_id, name } = latest.payload as { user_id: string; name: string };
          if (!user_id) break;
          const TYPING_TTL_MS = 3000;
          setTypingUsersMap((prev) => ({
            ...prev,
            [user_id]: { name, expiresAt: Date.now() + TYPING_TTL_MS },
          }));
          break;
        }
        default:
          // Canvas, wireframe, pipeline, and voice events — web-only.
          break;
      }
    }
  }, [
    events,
    setMessages,
    setTypingUsersMap,
    setSession,
    updateSection,
    setBlueprintHistoryToken,
    setSectionUpdatesByMessageId,
    setUndoTargetByMessageId,
    setRecentlyCompletedSection,
    setPresenceUsers,
    setAiThinking,
    setAgentStatus,
    setAgentIntent,
    setPersonaSuggestion,
    setOutputSuggestion,
    dismissedOutputsRef,
  ]);
}
