'use client';

// Niko's state, for the whole window. Mounted once in providers.tsx so the
// panel keeps its conversation across route changes.
//
// The transport is the yeaboi sidecar over the preload bridge — NDJSON, not
// SSE, and no Authorization header anywhere: the bearer token never leaves the
// main process (lib/yeaboi/api.ts). The hook's shape is unchanged from the
// version that talked to the planning platform, so the seven components under
// components/niko/ consume it exactly as before.

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { duckQuip } from '@/lib/duck-events';
import { logger } from '@/lib/logger';
import {
  type NikoSuggestion,
  type NikoTurnState,
  cancelTurn,
  createConversation,
  emptyTurn,
  loadConversation,
  loadSuggestions,
  messagesOf,
  reduceTurn,
  sendTurn,
} from '@/lib/yeaboi/niko';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NikoMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  toolResults?: Array<{ name: string; success: boolean; error?: string }>;
}

/** A chip the empty panel offers. Named for the components that render it. */
export type NikoMagicPrompt = NikoSuggestion;

const STORAGE_KEY = 'niko_conversation_id';

/** Where the panel thinks the user is. The backend maps it to a capability. */
function routeOf(pathname: string | null): string {
  return pathname && pathname.startsWith('/') ? pathname : '/home';
}

/** A turn's state as the message the panel draws. */
function turnMessage(id: string, turn: NikoTurnState): NikoMessage {
  return {
    id,
    role: 'assistant',
    content: turn.error ? `Sorry — ${turn.error}` : turn.text,
    toolCalls: turn.toolCalls.map((call) => ({ name: call.name, input: {} })),
    toolResults: turn.toolCalls
      .filter((call) => call.ok !== undefined)
      .map((call) => ({ name: call.name, success: !!call.ok, error: call.error })),
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useNiko() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<NikoMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [magicPrompts, setMagicPrompts] = useState<NikoMagicPrompt[]>([]);
  /** Niko's last navigation suggestion; the panel pushes it and clears it. */
  const [suggestedRoute, setSuggestedRoute] = useState('');

  const pathname = usePathname();
  const { data: session } = useSession();
  const route = routeOf(pathname);
  // Readable from stopStreaming mid-turn, before React commits.
  const opRef = useRef('');

  useEffect(() => {
    try {
      if (conversationId) localStorage.setItem(STORAGE_KEY, conversationId);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private window or blocked storage — the thread just won't survive a reload */
    }
  }, [conversationId]);

  // The chips follow the screen: different questions are worth asking on
  // /agents/usage than on /team/retro.
  useEffect(() => {
    let mounted = true;
    loadSuggestions(route)
      .then((data) => {
        if (mounted) setMagicPrompts(data.suggestions ?? []);
      })
      .catch(() => {
        if (mounted) setMagicPrompts([]);
      });
    return () => {
      mounted = false;
    };
  }, [route]);

  // Replay the stored thread the first time the panel opens on it.
  useEffect(() => {
    if (!isOpen || !conversationId || messages.length > 0) return;
    let mounted = true;
    loadConversation(conversationId)
      .then((conversation) => {
        if (!mounted) return;
        setMessages(
          messagesOf(conversation).map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            toolCalls: message.toolCalls.map((call) => ({ name: call.name, input: {} })),
            toolResults: message.toolCalls
              .filter((call) => call.ok !== undefined)
              .map((call) => ({ name: call.name, success: !!call.ok, error: call.error })),
          })),
        );
      })
      .catch(() => {
        // Gone (a purge from the terminal's hub) — start fresh rather than
        // leaving the panel pointed at a thread that no longer exists.
        if (mounted) setConversationId(null);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, conversationId, messages.length]);

  const sendMessage = useCallback(
    async (content: string) => {
      const question = content.trim();
      if (isStreaming || !question) return;

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: question },
        { id: assistantId, role: 'assistant', content: '', toolCalls: [], toolResults: [] },
      ]);
      setIsStreaming(true);
      opRef.current = '';

      let turn = emptyTurn();
      try {
        const thread = conversationId ?? (await createConversation()).id;
        setConversationId(thread);
        await sendTurn(
          thread,
          question,
          (line) => {
            turn = reduceTurn(turn, line);
            if (turn.opId) opRef.current = turn.opId;
            const snapshot = turn;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantId ? turnMessage(assistantId, snapshot) : m)),
            );
          },
          { route, userName: session?.user?.name ?? '' },
        );
        if (turn.route) setSuggestedRoute(turn.route);
        if (turn.warnings.length) logger.warn('niko: turn warnings', { warnings: turn.warnings });
        if (!turn.error && !turn.cancelled) duckQuip('niko.reply');
      } catch (error) {
        logger.warn('niko: turn failed', { error: (error as Error).message });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && !m.content
              ? { ...m, content: "I couldn't reach the backend. Is yeaboi still running?" }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        opRef.current = '';
      }
    },
    [isStreaming, conversationId, route, session?.user?.name],
  );

  const togglePanel = useCallback(() => setIsOpen((prev) => !prev), []);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  const stopStreaming = useCallback(() => {
    // No op line means no cancel seam — the contract's own rule: a Stop button
    // on a turn that cannot stop would be a lie.
    if (!opRef.current) return;
    void cancelTurn(opRef.current).catch(() => undefined);
  }, []);

  const clearSuggestedRoute = useCallback(() => setSuggestedRoute(''), []);

  return {
    isOpen,
    setIsOpen,
    messages,
    conversationId,
    isStreaming,
    magicPrompts,
    suggestedRoute,
    clearSuggestedRoute,
    sendMessage,
    togglePanel,
    startNewConversation,
    stopStreaming,
  };
}
