'use client';

// The chat feed: initial history, optimistic sends, edits, reactions,
// typing indicators, and pagination. WS-driven mutations (new messages,
// streamed AI replies) land through the setters this hook returns — the
// event switch lives in use-session-events.ts.

import { useCallback, useEffect, useState } from 'react';
import { useAuthFetch } from '@/hooks/use-auth-fetch';

export interface ChatMessage {
  id: string;
  content: string;
  message_type: 'chat' | 'ai' | 'system' | 'voice_chat' | 'voice_ai';
  user_id: string | null;
  user_name?: string;
  speaker_name?: string | null;
  reactions?: Record<string, string[]> | null;
  original_content?: string | null;
  audio_url?: string | null;
  created_at: string;
}

interface UseChatStateArgs {
  sessionId: string;
  projectId: string;
  myDisplayName: string;
  setAiThinking: (thinking: boolean) => void;
  /** Broadcast the optimistic bubble to other participants. */
  wsSend: (event: { type: string; payload: Record<string, unknown> }) => void;
}

export function useChatState({
  sessionId,
  projectId,
  myDisplayName,
  setAiThinking,
  wsSend,
}: UseChatStateArgs) {
  const { authFetch, ready } = useAuthFetch();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Map user_id → {name, expiresAt} for "X is typing…". Each user_typing WS
  // event extends the TTL; the interval below prunes stale entries.
  const [typingUsersMap, setTypingUsersMap] = useState<
    Record<string, { name: string; expiresAt: number }>
  >({});

  useEffect(() => {
    if (Object.keys(typingUsersMap).length === 0) return;
    const interval = setInterval(() => {
      setTypingUsersMap((prev) => {
        const now = Date.now();
        let changed = false;
        const next: typeof prev = {};
        for (const [uid, entry] of Object.entries(prev)) {
          if (entry.expiresAt > now) next[uid] = entry;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [typingUsersMap]);

  const refreshMessages = useCallback(() => {
    authFetch(`/api/sessions/${sessionId}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((msgs: ChatMessage[]) => setMessages(msgs))
      .catch(() => {});
  }, [sessionId, authFetch]);

  /** Local system note (config changes, /help output) — never persisted. */
  const addSystemMessage = useCallback((text: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `system-${Date.now()}`,
        content: text,
        message_type: 'system' as const,
        user_id: null,
        created_at: new Date().toISOString(),
      },
    ]);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      // Client-side slash commands that never reach the model.
      if (content.startsWith('/')) {
        const [cmd] = content.slice(1).split(' ');
        if (cmd === 'help') {
          const { SLASH_COMMANDS } = await import('@/lib/slash-commands');
          const categories = [...new Set(SLASH_COMMANDS.map((c) => c.category))];
          const helpText = categories
            .map((cat) => {
              const cmds = SLASH_COMMANDS.filter((c) => c.category === cat);
              return `**${cat}**\n${cmds.map((c) => `\`/${c.name}\` — ${c.description}`).join('\n')}`;
            })
            .join('\n\n');
          addSystemMessage(helpText);
          return;
        }
        if (cmd === 'clear') {
          setMessages([]);
          return;
        }
        if (cmd === 'export') {
          const bpResp = await authFetch(`/api/sessions/${projectId}/blueprint`);
          if (bpResp.ok) {
            const bp = await bpResp.json();
            const md = Object.entries(bp.content as Record<string, string>)
              .filter(([, v]) => v)
              .map(
                ([k, v]) =>
                  `## ${k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}\n\n${v}`,
              )
              .join('\n\n---\n\n');
            const blob = new Blob([md], { type: 'text/markdown' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'blueprint.md';
            a.click();
            URL.revokeObjectURL(url);
            addSystemMessage('Blueprint exported as markdown.');
          }
          return;
        }
      }

      // Optimistic bubble, labeled the way the server will label it so the
      // name doesn't flicker when the persisted record comes back.
      const tempMsg: ChatMessage = {
        id: `temp-${Date.now()}`,
        content,
        message_type: 'chat',
        user_id: 'self',
        user_name: myDisplayName,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);
      setAiThinking(true);

      wsSend({
        type: 'chat_message',
        payload: {
          id: tempMsg.id,
          content,
          message_type: 'chat',
          user_id: 'self',
          user_name: myDisplayName,
          created_at: tempMsg.created_at,
        },
      });

      // The facilitator runs in the background; its reply arrives over WS
      // (ai_stream_end clears the thinking indicator). The web app also
      // sidecar'd the canvas wireframes here — gone with the canvas.
      const resp = await authFetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) {
        setAiThinking(false);
        return;
      }
      // Reconcile the optimistic bubble with the persisted record (real id +
      // server-authored speaker label).
      try {
        const persisted = (await resp.json()) as Partial<ChatMessage> & { id: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempMsg.id
              ? {
                  ...m,
                  id: persisted.id,
                  user_name: undefined,
                  speaker_name: persisted.speaker_name ?? m.user_name,
                  created_at: persisted.created_at ?? m.created_at,
                }
              : m,
          ),
        );
      } catch {
        /* response not JSON — leave the temp bubble */
      }
    },
    [sessionId, projectId, myDisplayName, authFetch, setAiThinking, wsSend, addSystemMessage],
  );

  const sendAttachment = useCallback(
    async (file: File) => {
      const tempMsg: ChatMessage = {
        id: `temp-file-${Date.now()}`,
        content: `Uploading ${file.name}...`,
        message_type: 'chat',
        user_id: 'self',
        user_name: myDisplayName,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMsg]);
      setAiThinking(true);

      const formData = new FormData();
      formData.append('file', file);
      const resp = await authFetch(`/api/sessions/${sessionId}/chat-attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!resp.ok) {
        setAiThinking(false);
        return;
      }
      // Poll history until the AI reply lands (attachments don't stream).
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const historyResp = await authFetch(`/api/sessions/${sessionId}/messages`);
        if (historyResp.ok) {
          const allMsgs = (await historyResp.json()) as ChatMessage[];
          setMessages(allMsgs);
          if (allMsgs.length > 0 && allMsgs[allMsgs.length - 1]!.message_type === 'ai') {
            setAiThinking(false);
            return;
          }
        }
      }
      setAiThinking(false);
    },
    [sessionId, myDisplayName, authFetch, setAiThinking],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string) => {
      const resp = await authFetch(`/api/sessions/${sessionId}/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!resp.ok) throw new Error(`Failed to edit message: ${resp.status}`);
      const data = await resp.json();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, content: data.content, original_content: data.original_content }
            : m,
        ),
      );
      return { vocabulary_updated: data.vocabulary_updated };
    },
    [sessionId, authFetch],
  );

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      const resp = await authFetch(`/api/sessions/${sessionId}/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as {
        message_id: string;
        reactions: Record<string, string[]>;
      };
      setMessages((prev) =>
        prev.map((m) => (m.id === data.message_id ? { ...m, reactions: data.reactions } : m)),
      );
    },
    [sessionId, authFetch],
  );

  const signalTyping = useCallback(() => {
    authFetch(`/api/sessions/${sessionId}/typing`, { method: 'POST' }).catch(() => {
      /* best-effort */
    });
  }, [sessionId, authFetch]);

  /** Cursor pagination backwards from the current list head. Returns whether
   *  more history may still exist. */
  const loadOlderMessages = useCallback(async (): Promise<boolean> => {
    if (messages.length === 0) return false;
    const PAGE_SIZE = 50;
    const oldest = messages[0]!;
    try {
      const res = await authFetch(
        `/api/sessions/${sessionId}/messages?before=${oldest.id}&limit=${PAGE_SIZE}`,
      );
      if (!res.ok) return false;
      const older = (await res.json()) as ChatMessage[];
      if (older.length === 0) return false;
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = older.filter((m) => !seen.has(m.id));
        return [...fresh, ...prev];
      });
      return older.length >= PAGE_SIZE;
    } catch {
      return false;
    }
  }, [sessionId, messages, authFetch]);

  return {
    ready,
    messages,
    setMessages,
    typingUsersMap,
    setTypingUsersMap,
    refreshMessages,
    addSystemMessage,
    sendMessage,
    sendAttachment,
    editMessage,
    toggleReaction,
    signalTyping,
    loadOlderMessages,
  };
}
