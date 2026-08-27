"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks, HelpCircle, RefreshCw } from "lucide-react";

import { useAuthFetch } from "@/hooks/use-auth-fetch";

interface ExtractedItem {
  text: string;
  ts: string | null;
}

export interface SessionExtraction {
  decisions: ExtractedItem[];
  action_items: ExtractedItem[];
  open_questions: ExtractedItem[];
}

interface ExtractionPanelProps {
  sessionId: string;
  /** When provided, clicking an item with a ts seeks the transcript to that
   *  timestamp. Optional — falls through to a no-op when not supplied. */
  onSeekTo?: (isoTs: string) => void;
  /** When true, allows the user to regenerate the extraction. Host-only on the
   *  backend; the UI just shows the button. */
  canRegenerate?: boolean;
}

const SECTIONS: Array<{
  key: keyof SessionExtraction;
  label: string;
  Icon: typeof CheckCircle2;
  tone: string;
}> = [
  { key: "decisions", label: "Decisions", Icon: CheckCircle2, tone: "text-success" },
  { key: "action_items", label: "Action items", Icon: ListChecks, tone: "text-warning" },
  { key: "open_questions", label: "Open questions", Icon: HelpCircle, tone: "text-info" },
];

export function ExtractionPanel({ sessionId, onSeekTo, canRegenerate }: ExtractionPanelProps) {
  const { authFetch, ready } = useAuthFetch();
  const [data, setData] = useState<SessionExtraction | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await authFetch(`/api/sessions/${sessionId}/extraction`);
      if (resp.ok) setData((await resp.json()) as SessionExtraction);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessionId]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const resp = await authFetch(`/api/sessions/${sessionId}/extraction/regenerate`, { method: "POST" });
      if (resp.ok) setData((await resp.json()) as SessionExtraction);
    } finally {
      setRegenerating(false);
    }
  };

  const totalItems =
    (data?.decisions.length ?? 0) +
    (data?.action_items.length ?? 0) +
    (data?.open_questions.length ?? 0);

  return (
    <div className="rounded-xl bg-foreground/[0.02] border border-border/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Captured from this session</h3>
        {canRegenerate && (
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            aria-label="Regenerate extraction"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground/70 hover:text-foreground/90 hover:bg-foreground/[0.05] transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />
            Regenerate
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-[12px] text-muted-foreground/70">Loading...</p>
      ) : totalItems === 0 ? (
        <p className="text-[12px] text-muted-foreground/70">
          Captured items will appear once we&apos;ve processed the call.
          {canRegenerate ? " Use Regenerate if extraction looks stale." : " Extraction runs automatically when the session completes."}
        </p>
      ) : (
        <div className="space-y-4">
          {SECTIONS.map(({ key, label, Icon, tone }) => {
            const items = data?.[key] ?? [];
            return (
              <section key={key}>
                <p className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] font-medium mb-1.5 ${tone}`}>
                  <Icon className="h-3 w-3" />
                  {label} ({items.length})
                </p>
                {items.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground/50 pl-4">— None</p>
                ) : (
                  <ul className="space-y-1">
                    {items.map((it, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-muted-foreground/50 text-[10px] mt-0.5 select-none">•</span>
                        {it.ts && onSeekTo ? (
                          <button
                            type="button"
                            onClick={() => onSeekTo(it.ts!)}
                            className="text-[12px] text-foreground/90 hover:text-foreground text-left transition-colors"
                          >
                            {it.text}
                          </button>
                        ) : (
                          <span className="text-[12px] text-foreground/90">{it.text}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
