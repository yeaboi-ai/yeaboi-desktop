"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

export interface FieldLayoutEntry {
  key: string;
  label: string;
  type: string;
  source: "builtin" | "custom";
  placement: "main" | "sidebar" | "header";
  visible: boolean;
  required: boolean;
  options?: string[] | null;
}

export interface TicketTemplateLite {
  id: string;
  slug: string;
  name: string;
  icon: string;
  is_system: boolean;
  field_layout?: FieldLayoutEntry[];
}

// Module-scoped cache so every component that needs template metadata shares
// a single fetch — the board can have hundreds of cards, all of which want to
// resolve template_id → {slug, name, icon}.
let cachedPromise: Promise<TicketTemplateLite[]> | null = null;
let cachedAt = 0;
const STALE_MS = 60_000;

export function useTicketTemplates() {
  const { authFetch, ready } = useAuthFetch();
  const [templates, setTemplates] = useState<TicketTemplateLite[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!ready) return;

    const now = Date.now();
    if (cachedPromise && now - cachedAt < STALE_MS) {
      cachedPromise.then((data) => {
        if (!cancelledRef.current) setTemplates(data);
      });
      return;
    }

    cachedPromise = (async () => {
      try {
        const resp = await authFetch("/api/ticket-templates");
        if (!resp.ok) return [];
        const data = (await resp.json()) as TicketTemplateLite[];
        cachedAt = Date.now();
        return data;
      } catch {
        return [];
      }
    })();

    cachedPromise.then((data) => {
      if (!cancelledRef.current) setTemplates(data);
    });

    return () => {
      cancelledRef.current = true;
    };
  }, [authFetch, ready]);

  return templates;
}

// Bust the cache after a CRUD op in the studio so other tabs see fresh data
// without waiting the full STALE_MS window.
export function invalidateTicketTemplatesCache(): void {
  cachedPromise = null;
  cachedAt = 0;
}
