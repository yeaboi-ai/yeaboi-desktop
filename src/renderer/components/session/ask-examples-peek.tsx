'use client';

import { Lightbulb } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

/** 6 example prompts per persona, tuned to that persona's strengths. */
const PROMPTS_BY_PERSONA: Record<string, string[]> = {
  default: [
    'Walk me through the architecture',
    "What's the riskiest assumption here?",
    'Help me scope this for one sprint',
    'What are the open technical questions?',
    'Suggest a smaller first slice',
    'What would you build first and why?',
  ],
  pm: [
    "Who is the user we're solving for?",
    "What's the smallest version that delivers value?",
    'What metric will tell us this worked?',
    'What would we cut if we only had one week?',
    'List the top 3 user pain points',
    'What competitors do this well?',
  ],
  architect: [
    'Walk me through the data model',
    'Where would this break at 10x scale?',
    'Which boundaries should be APIs vs. modules?',
    "What's the failure mode if X goes down?",
    'Propose a migration path',
    "What's the simplest design that could work?",
  ],
  mentor: [
    "Explain this concept to me like I'm new",
    'What should I read to understand this better?',
    "What's the right question I'm not asking?",
    'Walk me through your reasoning step by step',
    "What's a common mistake people make here?",
    "What's a good first task to learn this?",
  ],
  challenger: [
    "What's wrong with my plan?",
    'Make the opposing case',
    'What are we ignoring?',
    'Why might this fail?',
    'What would a skeptical reviewer say?',
    'Find the weakest link in this design',
  ],
};

interface AskExamplesPeekProps {
  persona?: string;
  /**
   * Called when a user clicks an example prompt.
   * If omitted, the popover just shows the examples without action.
   */
  onPick?: (prompt: string) => void;
  /** Visual weight of the trigger. Default "subtle". */
  variant?: 'subtle' | 'chip';
}

export function AskExamplesPeek({
  persona = 'default',
  onPick,
  variant = 'subtle',
}: AskExamplesPeekProps) {
  const prompts = PROMPTS_BY_PERSONA[persona] ?? PROMPTS_BY_PERSONA.default;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="What can I ask the agent?"
            className={
              variant === 'chip'
                ? 'flex items-center gap-1 px-2 py-0.5 rounded-md bg-warning/[0.08] border border-warning/15 text-[10px] text-warning/90 hover:bg-warning/[0.14] transition-colors'
                : 'flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-warning/90 transition-colors'
            }
          >
            <Lightbulb className="h-3 w-3" />
            What can I ask?
          </button>
        }
      />
      <PopoverContent align="start" className="w-80">
        <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 font-medium mb-2">
          Try asking the agent
        </p>
        <ul className="space-y-1">
          {prompts.map((p) => (
            <li key={p}>
              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left text-[12px] text-foreground/85 hover:text-foreground hover:bg-foreground/[0.05] rounded-md px-2 py-1.5 transition-colors"
                >
                  &ldquo;{p}&rdquo;
                </button>
              ) : (
                <div className="text-[12px] text-muted-foreground px-2 py-1.5">
                  &ldquo;{p}&rdquo;
                </div>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
