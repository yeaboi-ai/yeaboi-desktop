"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuthFetch } from "./use-auth-fetch";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NikoMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  toolResults?: Array<{
    name: string;
    success: boolean;
    result?: unknown;
    error?: string;
  }>;
  createdAt?: string;
}

export interface NikoMagicPrompt {
  label: string;
  prompt: string;
  icon?: string;
}

interface NikoContextPayload {
  page: string;
  project_id?: string;
  session_id?: string;
  board_id?: string;
}

// ─── Context extraction ─────────────────────────────────────────────────────

function extractContextFromPath(pathname: string): NikoContextPayload {
  const ctx: NikoContextPayload = { page: pathname };

  // /projects/[id]/...
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  if (projectMatch) {
    ctx.project_id = projectMatch[1];
  }

  // /projects/[id]/sessions/[sessionId]
  const sessionMatch = pathname.match(/\/sessions\/([^/]+)/);
  if (sessionMatch && sessionMatch[1] !== "new") {
    ctx.session_id = sessionMatch[1];
  }

  return ctx;
}

// ─── SSE Parser ─────────────────────────────────────────────────────────────

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = chunk.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        data = line.slice(6);
      }
    }
    if (data) {
      events.push({ event, data });
    }
  }
  return events;
}

// ─���─ Hook ───────────────────────────────────────────────────────────────────

export function useNiko() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<NikoMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("niko_conversation_id");
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [magicPrompts, setMagicPrompts] = useState<NikoMagicPrompt[]>([]);

  const pathname = usePathname();
  const { authFetch, ready } = useAuthFetch();
  const abortRef = useRef<AbortController | null>(null);

  // Persist conversation ID
  useEffect(() => {
    if (conversationId) {
      localStorage.setItem("niko_conversation_id", conversationId);
    }
  }, [conversationId]);

  // Fetch magic prompts when page changes
  useEffect(() => {
    if (!ready || !pathname) return;
    const ctx = extractContextFromPath(pathname);
    const params = new URLSearchParams({ page: ctx.page });
    if (ctx.project_id) params.set("project_id", ctx.project_id);

    authFetch(`/api/niko/magic-prompts?${params}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setMagicPrompts)
      .catch(() => setMagicPrompts([]));
  }, [pathname, ready, authFetch]);

  // Load conversation history when opening with existing ID
  useEffect(() => {
    if (!isOpen || !conversationId || !ready || messages.length > 0) return;
    authFetch(`/api/niko/conversations/${conversationId}`)
      .then((r) => {
        if (!r.ok) {
          // Conversation not found, start fresh
          setConversationId(null);
          localStorage.removeItem("niko_conversation_id");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.messages) {
          setMessages(
            data.messages.map((m: Record<string, unknown>) => ({
              id: m.id as string,
              role: m.role as "user" | "assistant",
              content: (m.content as string) || "",
              toolCalls: m.tool_calls as NikoMessage["toolCalls"],
              toolResults: m.tool_results as NikoMessage["toolResults"],
              createdAt: m.created_at as string,
            }))
          );
        }
      })
      .catch(() => {});
  }, [isOpen, conversationId, ready, authFetch, messages.length]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!ready || isStreaming || !content.trim()) return;

      const context = extractContextFromPath(pathname || "/");

      // Add user message optimistically
      const userMsg: NikoMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
      };
      setMessages((prev) => [...prev, userMsg]);

      // Prepare assistant message placeholder
      const assistantMsg: NikoMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        toolCalls: [],
        toolResults: [],
      };
      setMessages((prev) => [...prev, assistantMsg]);

      setIsStreaming(true);
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const resp = await authFetch("/api/niko/chat", {
          method: "POST",
          body: JSON.stringify({
            conversation_id: conversationId,
            message: content.trim(),
            context,
          }),
          signal: abort.signal,
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "Unknown error");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: `Error: ${errText}` }
                : m
            )
          );
          setIsStreaming(false);
          return;
        }

        // Read SSE stream
        const reader = resp.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = parseSSEChunk(buffer);

            // Keep unprocessed partial data
            const lastNewline = buffer.lastIndexOf("\n\n");
            if (lastNewline >= 0) {
              buffer = buffer.slice(lastNewline + 2);
            }

            for (const evt of events) {
              try {
                const data = JSON.parse(evt.data);

                if (evt.event === "text") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? { ...m, content: m.content + (data.delta || "") }
                        : m
                    )
                  );
                } else if (evt.event === "tool_call") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? {
                            ...m,
                            toolCalls: [
                              ...(m.toolCalls || []),
                              {
                                name: data.tool_name,
                                input: data.tool_input,
                              },
                            ],
                          }
                        : m
                    )
                  );
                } else if (evt.event === "tool_result") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? {
                            ...m,
                            toolResults: [
                              ...(m.toolResults || []),
                              {
                                name: data.tool_name,
                                success: data.success,
                                result: data.result,
                                error: data.error,
                              },
                            ],
                          }
                        : m
                    )
                  );
                } else if (evt.event === "done") {
                  if (data.conversation_id) {
                    setConversationId(data.conversation_id);
                  }
                } else if (evt.event === "error") {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsg.id
                        ? {
                            ...m,
                            content:
                              m.content +
                              `\n\nError: ${data.error || "Unknown error"}`,
                          }
                        : m
                    )
                  );
                }
              } catch {
                // Ignore parse errors from partial chunks
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content || "Failed to connect to Niko." }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [ready, isStreaming, pathname, conversationId, authFetch]
  );

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    localStorage.removeItem("niko_conversation_id");
  }, []);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    isOpen,
    setIsOpen,
    messages,
    conversationId,
    isStreaming,
    magicPrompts,
    sendMessage,
    togglePanel,
    startNewConversation,
    stopStreaming,
  };
}
