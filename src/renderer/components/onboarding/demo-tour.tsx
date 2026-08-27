"use client";

import { useEffect, useState } from "react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";
import { CoachMarks, type CoachMarkStep } from "@/components/ui/coach-marks";

const DEMO_STOPS: CoachMarkStep[] = [
  {
    title: "This is a sample project",
    body: "We pre-built a Plant Care App so you can see how a conversation becomes a blueprint and a board. Delete it whenever you're ready.",
    position: { top: "12%", left: "calc(50% - 180px)" },
  },
  {
    title: "The blueprint",
    body: "Every section here was extracted from the planning session below. No manual writing — the facilitator structures what gets said.",
    position: { top: "40%", left: "32px" },
  },
  {
    title: "The board",
    body: "Those requirements became a kanban — with priorities and dependency chains. No ticket grooming.",
    position: { top: "40%", right: "32px" },
  },
  {
    title: "Start your own",
    body: "When you're ready, create a real project and start a session. You'll get one of these in minutes.",
    position: { bottom: "12%", right: "32px" },
  },
];

/**
 * Mounts the onboarding tour on a demo project. Gated server-side on
 * User.tour_completed_at so dismissal follows the user across devices.
 *
 * Renders nothing until /api/me resolves to avoid a one-frame flash.
 */
export function DemoTour() {
  const { authFetch, ready } = useAuthFetch();
  const [tourSeen, setTourSeen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready) return;
    authFetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => setTourSeen(!!me?.tour_completed_at))
      .catch(() => {
        logger.warn("Failed to load tour status");
        setTourSeen(true);
      });
  }, [ready, authFetch]);

  if (tourSeen === null) return null;

  const markComplete = async () => {
    setTourSeen(true);
    try {
      // Dedicated one-way endpoint (null → now). PATCH /api/me no longer
      // accepts this field — it was client-clearable, which let a misbehaving
      // caller force the tour to re-appear.
      const res = await authFetch("/api/me/tour-complete", { method: "POST" });
      if (!res.ok) {
        logger.warn("Tour completion endpoint returned %d", res.status);
      }
    } catch (e) {
      logger.warn("Failed to persist tour completion", { error: e });
    }
  };

  return (
    <CoachMarks
      steps={DEMO_STOPS}
      gate={{ kind: "server", isSeen: tourSeen, onComplete: markComplete }}
    />
  );
}
