"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthFetch } from "./use-auth-fetch";
import { logger } from "@/lib/logger";

type Rating = "thumbs_up" | "thumbs_down";
type TargetType = "chat_message" | "voice_response" | "session" | "transcript";
type AgentType = "chat" | "voice" | "platform_chat";

interface FeedbackEntry {
  id: string;
  rating: Rating;
}

interface SubmitParams {
  targetType: TargetType;
  targetId: string;
  sessionId?: string;
  agentType: AgentType;
  rating: Rating;
  comment?: string;
  context?: Record<string, unknown>;
}

export function useFeedback(sessionId?: string) {
  const { authFetch, ready } = useAuthFetch();
  const [ratings, setRatings] = useState<Map<string, FeedbackEntry>>(new Map());
  const hydratedRef = useRef(false);

  // Hydrate existing feedback for this session on mount
  useEffect(() => {
    if (!ready || !sessionId || hydratedRef.current) return;
    hydratedRef.current = true;

    authFetch(`/api/feedback-proxy?session_id=${sessionId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: Array<{ id: string; target_id: string; rating: Rating }>) => {
        const map = new Map<string, FeedbackEntry>();
        for (const item of items) {
          if (item.target_id) {
            map.set(item.target_id, { id: item.id, rating: item.rating });
          }
        }
        setRatings(map);
      })
      .catch(() => logger.warn("Failed to hydrate feedback"));
  }, [ready, sessionId, authFetch]);

  const submitFeedback = useCallback(
    async (params: SubmitParams) => {
      // Optimistic update
      const key = params.targetId;
      setRatings((prev) => {
        const next = new Map(prev);
        next.set(key, { id: "", rating: params.rating });
        return next;
      });

      try {
        const resp = await authFetch("/api/feedback-proxy", {
          method: "POST",
          body: JSON.stringify({
            target_type: params.targetType,
            target_id: params.targetId,
            session_id: params.sessionId,
            agent_type: params.agentType,
            rating: params.rating,
            comment: params.comment,
            context: params.context,
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          setRatings((prev) => {
            const next = new Map(prev);
            next.set(key, { id: data.id, rating: data.rating });
            return next;
          });
        }
      } catch {
        // Revert on failure
        setRatings((prev) => {
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
        logger.warn("Failed to submit feedback");
      }
    },
    [authFetch],
  );

  const retractFeedback = useCallback(
    async (targetId: string) => {
      const entry = ratings.get(targetId);
      if (!entry?.id) return;

      // Optimistic removal
      setRatings((prev) => {
        const next = new Map(prev);
        next.delete(targetId);
        return next;
      });

      try {
        const resp = await authFetch(`/api/feedback-proxy?id=${entry.id}`, {
          method: "DELETE",
        });
        if (!resp.ok && resp.status !== 204) {
          // Revert on failure
          setRatings((prev) => {
            const next = new Map(prev);
            next.set(targetId, entry);
            return next;
          });
        }
      } catch {
        setRatings((prev) => {
          const next = new Map(prev);
          next.set(targetId, entry);
          return next;
        });
        logger.warn("Failed to retract feedback");
      }
    },
    [authFetch, ratings],
  );

  const getRating = useCallback(
    (targetId: string): Rating | null => {
      return ratings.get(targetId)?.rating ?? null;
    },
    [ratings],
  );

  return { submitFeedback, retractFeedback, getRating };
}
