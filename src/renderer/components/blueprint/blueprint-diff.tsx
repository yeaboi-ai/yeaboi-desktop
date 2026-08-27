"use client";

import { useMemo, useState } from "react";

const SECTION_LABELS: Record<string, string> = {
  project_overview: "Project Overview",
  goals_constraints: "Goals & Constraints",
  users_personas: "Users & Personas",
  team_capacity: "Team & Capacity",
  architecture: "Architecture",
  tech_stack: "Tech Stack",
  api_integrations: "API & Integrations",
  ui_ux: "UI/UX",
  security_compliance: "Security & Compliance",
  infrastructure: "Infrastructure",
  risks_unknowns: "Risks & Unknowns",
  out_of_scope: "Out of Scope",
  open_questions: "Open Questions",
};

type DiffOp = { type: "eq" | "add" | "del"; text: string };

/** Line-level LCS diff producing eq/add/del runs for one section.
 *
 * Output preserves the order of `b` for added lines, the order of `a` for
 * removed lines, and shows them interleaved by their natural position so
 * the reader follows the change top-to-bottom.
 */
export function lcsLineDiff(a: string, b: string): DiffOp[] {
  const aLines = a.length === 0 ? [] : a.split("\n");
  const bLines = b.length === 0 ? [] : b.split("\n");
  const m = aLines.length;
  const n = bLines.length;

  // Build LCS DP table.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce ops in order.
  const ops: DiffOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      ops.unshift({ type: "eq", text: aLines[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.unshift({ type: "del", text: aLines[i - 1] });
      i -= 1;
    } else {
      ops.unshift({ type: "add", text: bLines[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    ops.unshift({ type: "del", text: aLines[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    ops.unshift({ type: "add", text: bLines[j - 1] });
    j -= 1;
  }
  return ops;
}

interface BlueprintDiffProps {
  /** Section -> content for the OLDER snapshot. */
  oldContent: Record<string, string>;
  /** Section -> content for the NEWER snapshot (or current state). */
  newContent: Record<string, string>;
}

export function BlueprintDiff({ oldContent, newContent }: BlueprintDiffProps) {
  const [showUnchanged, setShowUnchanged] = useState(false);

  const sections = useMemo(() => {
    const slugs = Array.from(new Set([...Object.keys(oldContent), ...Object.keys(newContent)]));
    return slugs
      .map((slug) => {
        const oldText = oldContent[slug] ?? "";
        const newText = newContent[slug] ?? "";
        const ops = lcsLineDiff(oldText, newText);
        const changed = ops.some((op) => op.type !== "eq");
        return { slug, ops, changed };
      })
      .sort((a, b) => Number(b.changed) - Number(a.changed));
  }, [oldContent, newContent]);

  const visible = showUnchanged ? sections : sections.filter((s) => s.changed);
  const hiddenCount = sections.length - visible.length;

  if (sections.length === 0) {
    return <p className="text-sm text-muted-foreground">No content to compare.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {visible.filter((s) => s.changed).length} section{visible.filter((s) => s.changed).length === 1 ? "" : "s"} changed
        </span>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="hover:text-foreground/90 underline-offset-2 hover:underline"
            onClick={() => setShowUnchanged(true)}
          >
            Show {hiddenCount} unchanged
          </button>
        )}
        {showUnchanged && hiddenCount === 0 && (
          <button
            type="button"
            className="hover:text-foreground/90 underline-offset-2 hover:underline"
            onClick={() => setShowUnchanged(false)}
          >
            Hide unchanged
          </button>
        )}
      </div>

      {visible.map(({ slug, ops, changed }) => (
        <div key={slug} className="rounded-md border border-border/70 bg-foreground/[0.02]">
          <div className="border-b border-border/50 px-3 py-2 text-xs font-medium text-foreground/80 flex items-center justify-between">
            <span>{SECTION_LABELS[slug] || slug}</span>
            {!changed && <span className="text-muted-foreground/50">unchanged</span>}
          </div>
          <pre className="px-3 py-2 text-xs leading-relaxed font-mono whitespace-pre-wrap break-words m-0">
            {ops.map((op, idx) => (
              <div
                key={idx}
                className={
                  op.type === "add"
                    ? "text-success/90 bg-success/[0.06] border-l-2 border-success/40 pl-2"
                    : op.type === "del"
                      ? "text-destructive/80 bg-destructive/[0.05] border-l-2 border-destructive/40 pl-2 line-through decoration-red-400/40"
                      : "text-muted-foreground/70 pl-2"
                }
              >
                {op.type === "add" ? "+ " : op.type === "del" ? "- " : "  "}
                {op.text || " "}
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}
