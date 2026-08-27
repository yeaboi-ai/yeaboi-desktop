"use client";

import { useEffect, useState } from "react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";

export interface BlueprintGap {
  section: string;
  label: string;
  score: number;
}

export interface ParsedBullet {
  id: string;       // stable normalized form used as the bullet id
  text: string;     // human-readable bullet text
  section: string;  // owning section slug
}

export interface BlueprintGapsResult {
  loading: boolean;
  /** Per-section scores 0–100 from /blueprint/coverage. */
  scores: Record<string, number>;
  /** Sections below `gapThreshold` (default 60). */
  gaps: BlueprintGap[];
  /** Current blueprint content keyed by section slug — used by the launcher
   *  to render compact previews and let the user pick deep-dive bullets. */
  content: Record<string, string>;
  /** Bullets parsed out of every section, normalized & deduped. */
  bullets: ParsedBullet[];
  /** open_questions section content split into individual questions. */
  openQuestions: string[];
  /** Most recent prior session for this project (if any) — drives the
   *  "Resume last session" mode. */
  previousSessionId: string | null;
  /** Pending suggestion count for that prior session. */
  previousSessionPendingCount: number;
}

const SECTION_LABELS: Record<string, string> = {
  project_overview: "Project Overview",
  goals_constraints: "Goals & Constraints",
  users_personas: "Users & Personas",
  team_capacity: "Team & Capacity",
  architecture: "Architecture",
  tech_stack: "Tech Stack",
  api_integrations: "API & Integrations",
  ui_ux: "UI / UX",
  security_compliance: "Security & Compliance",
  infrastructure: "Infrastructure",
  risks_unknowns: "Risks & Unknowns",
  out_of_scope: "Out of Scope",
  open_questions: "Open Questions",
};

const BULLET_PREFIX_RE = /^\s*[-*•]\s*/;
const WHITESPACE_RE = /\s+/g;

function normalizeBullet(line: string): string {
  return line.replace(BULLET_PREFIX_RE, "").trim().replace(WHITESPACE_RE, " ").toLowerCase();
}

function splitBullets(text: string): Array<{ raw: string; norm: string }> {
  if (!text) return [];
  const out: Array<{ raw: string; norm: string }> = [];
  const seen = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const norm = normalizeBullet(rawLine);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ raw: rawLine.replace(BULLET_PREFIX_RE, "").trimEnd(), norm });
  }
  return out;
}

export function useBlueprintGaps(projectId: string, gapThreshold = 60): BlueprintGapsResult {
  const { authFetch, ready } = useAuthFetch();
  const [state, setState] = useState<BlueprintGapsResult>({
    loading: true,
    scores: {},
    gaps: [],
    content: {},
    bullets: [],
    openQuestions: [],
    previousSessionId: null,
    previousSessionPendingCount: 0,
  });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [covResp, bpResp, sessResp] = await Promise.all([
          authFetch(`/api/projects/${projectId}/blueprint/coverage`),
          authFetch(`/api/projects/${projectId}/blueprint`),
          authFetch(`/api/projects/${projectId}/sessions`),
        ]);
        if (cancelled) return;

        const scores: Record<string, number> = covResp.ok
          ? ((await covResp.json()).scores ?? {})
          : {};
        const content: Record<string, string> = bpResp.ok
          ? ((await bpResp.json()).content ?? {})
          : {};
        const sessions: Array<{ id: string; status: string; created_at: string }> = sessResp.ok
          ? await sessResp.json()
          : [];

        // Bullets — flatten across all sections, keep section provenance.
        const bullets: ParsedBullet[] = [];
        for (const [section, body] of Object.entries(content)) {
          for (const b of splitBullets(body || "")) {
            bullets.push({ id: b.norm, text: b.raw, section });
          }
        }

        // Open questions land as their own list so the launcher can show
        // them directly under "Resume last session".
        const openQuestions = splitBullets(content.open_questions || "").map((b) => b.raw);

        const gaps: BlueprintGap[] = Object.entries(scores)
          .filter(([, v]) => v < gapThreshold)
          .map(([section, score]) => ({
            section,
            label: SECTION_LABELS[section] || section,
            score,
          }))
          .sort((a, b) => a.score - b.score);

        // Most recent completed session — used to pull pending review items.
        const sorted = [...sessions].sort((a, b) =>
          a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
        );
        const prior = sorted.find((s) => s.status !== "live" && s.status !== "lobby") ?? null;
        let previousSessionPendingCount = 0;
        if (prior) {
          const sgResp = await authFetch(
            `/api/projects/${projectId}/blueprint-suggestions?session_id=${prior.id}`,
          );
          if (sgResp.ok && !cancelled) {
            const arr = (await sgResp.json()) as unknown[];
            previousSessionPendingCount = Array.isArray(arr) ? arr.length : 0;
          }
        }

        if (!cancelled) {
          setState({
            loading: false,
            scores,
            gaps,
            content,
            bullets,
            openQuestions,
            previousSessionId: prior?.id ?? null,
            previousSessionPendingCount,
          });
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, ready, authFetch, gapThreshold]);

  return state;
}
