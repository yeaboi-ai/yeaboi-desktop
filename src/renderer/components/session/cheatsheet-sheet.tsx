"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

const SECTIONS = [
  {
    title: "Steer the conversation",
    examples: [
      "Pause for a sec — let me think.",
      "Go deeper on this point.",
      "What's the riskiest assumption here?",
      "Summarize where we landed.",
    ],
  },
  {
    title: "Get unstuck",
    examples: [
      "Show me a smaller first slice.",
      "What would you build first and why?",
      "Make the opposing case.",
      "What's the simplest design that works?",
    ],
  },
  {
    title: "Use the slash commands",
    examples: [
      "/persona pm — switch to Product Manager",
      "/persona challenger — get critical feedback",
      "/help — list all slash commands",
      "/clear — clear chat",
    ],
  },
  {
    title: "Capture the work",
    examples: [
      "What decisions have we made?",
      "List the open questions.",
      "What action items came out of this?",
      "Walk me through the data model.",
    ],
  },
];

interface CheatsheetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mid-call "Ask the agent" cheatsheet. Rotates through 4 sections every 2 minutes
 * so it stays a fresh discovery surface across long sessions.
 */
export function CheatsheetSheet({ open, onOpenChange }: CheatsheetSheetProps) {
  const [sectionIdx, setSectionIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => {
      setSectionIdx((i) => (i + 1) % SECTIONS.length);
    }, 120_000);
    return () => clearInterval(id);
  }, [open]);

  const current = SECTIONS[sectionIdx];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-warning/90" />
            Ask the agent
          </SheetTitle>
          <SheetDescription>
            Examples to try mid-conversation. Rotates every 2 min.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <p className="text-[10px] uppercase tracking-[0.08em] text-warning/70 font-medium mb-2">
              {current.title}
            </p>
            <ul className="space-y-1.5">
              {current.examples.map((ex) => (
                <li
                  key={ex}
                  className="text-[13px] text-foreground/85 bg-foreground/[0.05] border border-border/60 rounded-lg px-3 py-2"
                >
                  &ldquo;{ex}&rdquo;
                </li>
              ))}
            </ul>
          </section>

          <div className="flex items-center gap-1 pt-2">
            {SECTIONS.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => setSectionIdx(i)}
                aria-label={`Show ${s.title}`}
                aria-current={i === sectionIdx}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i === sectionIdx ? "bg-warning/80" : "bg-foreground/[0.10] hover:bg-foreground/[0.20]"
                }`}
              />
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground/60 pt-2">
            Tip: press <kbd className="font-mono bg-foreground/[0.06] border border-border/70 rounded px-1.5 py-0.5">?</kbd> for keyboard shortcuts, or <kbd className="font-mono bg-foreground/[0.06] border border-border/70 rounded px-1.5 py-0.5">⌘K</kbd> for the command palette.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
