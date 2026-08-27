"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ExternalLink, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { GlossaryEntry } from "@/lib/glossary";
import { recordDismissal } from "@/lib/term-learning-state";

/**
 * Context that lets a glossary popover hand off to the surrounding chat —
 * "Ask the AI" sends a project-aware follow-up message into the session.
 * Mounted by chat-panel.tsx (planning session) and chat-widget.tsx (global
 * widget). When unset, the "Ask the AI" affordance is hidden.
 */
interface GlossaryContextValue {
  onAskAi: (term: string, definition: string) => void;
}

const GlossaryContext = createContext<GlossaryContextValue | null>(null);

export function GlossaryProvider({
  onAskAi,
  children,
}: {
  onAskAi: GlossaryContextValue["onAskAi"];
  children: ReactNode;
}) {
  return (
    <GlossaryContext.Provider value={{ onAskAi }}>
      {children}
    </GlossaryContext.Provider>
  );
}

interface GlossaryTermProps {
  /** The text that the user actually sees (preserves the original casing/word
   *  form from the chat message, e.g. "APIs" even if the glossary key is "api"). */
  matchedText: string;
  /** The resolved glossary entry. */
  entry: GlossaryEntry;
  /** Optional context-aware override for `entry.contextHint`. Wave 3 fills
   *  this in from the backend's per-message `term_context` WS event. */
  contextOverride?: string;
  /** Fired when the user clicks "Got it". Wave 3 wires this to the dismissal
   *  counter — Wave 2 leaves it as an optional hook so the prop surface is
   *  set up before persistence lands. */
  onDismiss?: (slug: string) => void;
}

/**
 * Inline clickable term used inside AI chat bubbles. Renders a subtle
 * dotted-underline button; clicking opens a Popover with the term's
 * definition, contextual hint, examples, and learn-more links.
 */
export function GlossaryTerm({ matchedText, entry, contextOverride, onDismiss }: GlossaryTermProps) {
  const [open, setOpen] = useState(false);
  // Drives the .is-bursting CSS state on the "Got it" host. Set true on click,
  // cleared after the popover closes so the burst replays cleanly next time.
  const [bursting, setBursting] = useState(false);
  const hint = contextOverride ?? entry.contextHint;
  // Pick up the surrounding chat's "ask the AI" handoff, if a provider is
  // mounted. When absent (e.g. used on a static page), the affordance is
  // hidden so the popover degrades gracefully.
  const glossaryContext = useContext(GlossaryContext);

  function handleAskAi() {
    if (!glossaryContext) return;
    glossaryContext.onAskAi(entry.term, entry.definition);
    // Close the popover immediately so the user sees the message they just
    // "sent" arrive in the chat thread, followed by the AI's reply.
    recordDismissal(entry.slug);
    onDismiss?.(entry.slug);
    setOpen(false);
  }

  function handleGotIt() {
    // Fire the confetti while the popover is still open so the host element
    // doesn't unmount mid-animation. Persist the dismissal immediately, then
    // close the popover after the burst is visible.
    setBursting(true);
    recordDismissal(entry.slug);
    onDismiss?.(entry.slug);
    window.setTimeout(() => {
      setOpen(false);
      // Re-arm the burst so the next open can replay it.
      window.setTimeout(() => setBursting(false), 200);
    }, 450);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={(p) => (
          <button
            type="button"
            {...p}
            className="
              glossary-term-trigger
              inline underline decoration-dotted decoration-[#e5a630]/70 underline-offset-[3px]
              hover:decoration-[#e5a630] hover:text-[#e5a630]
              focus:outline-none focus-visible:ring-1 focus-visible:ring-[#e5a630]/60 rounded-sm
              transition-colors cursor-help
            "
            aria-label={`Explain ${entry.term}`}
          >
            {matchedText}
          </button>
        )}
      />
      <PopoverContent
        side="top"
        align="start"
        className="
          glossary-popover w-80 space-y-2.5 text-[13px]
          data-[starting-style]:scale-[0.82]
          data-[ending-style]:scale-[0.94]
          duration-[260ms]
          ease-[cubic-bezier(0.34,1.56,0.64,1)]
        "
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-foreground">{entry.term}</span>
          <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">term</span>
        </div>
        <p className="text-foreground/90 leading-relaxed">{entry.definition}</p>
        {hint && (
          <div className="rounded-md bg-foreground/[0.04] px-2.5 py-1.5">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
              What the AI meant
            </p>
            <p className="text-[12px] text-foreground/85 leading-relaxed">{hint}</p>
          </div>
        )}
        {entry.examples.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
              For example
            </p>
            <ul className="list-disc ml-4 space-y-0.5 text-[12px] text-foreground/85">
              {entry.examples.map((ex) => (
                <li key={ex}>{ex}</li>
              ))}
            </ul>
          </div>
        )}
        {entry.learnMore.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 mb-1">
              Learn more
            </p>
            <ul className="space-y-0.5">
              {entry.learnMore.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glossary-learn-more text-[12px] text-[#e5a630] hover:underline inline-flex items-center gap-1"
                  >
                    {link.label}
                    <ExternalLink className="glossary-arrow h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {glossaryContext && (
          <button
            type="button"
            onClick={handleAskAi}
            className="
              mt-1 w-full inline-flex items-center justify-center gap-1.5
              text-[12px] font-medium text-[#e5a630]
              bg-[#e5a630]/10 hover:bg-[#e5a630]/20
              border border-[#e5a630]/30 hover:border-[#e5a630]/50
              rounded-md py-1.5 px-2.5
              transition-colors
            "
          >
            <Sparkles className="h-3 w-3" />
            Ask the AI
          </button>
        )}
        <div className="pt-1 flex justify-end">
          <span className={`glossary-confetti-host${bursting ? " is-bursting" : ""}`}>
            <span className="glossary-confetti-piece" aria-hidden="true" />
            <span className="glossary-confetti-piece" aria-hidden="true" />
            <span className="glossary-confetti-piece" aria-hidden="true" />
            <button
              type="button"
              onClick={handleGotIt}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-foreground/[0.04]"
            >
              Got it
            </button>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
