"use client";

import { Volume2, VolumeX, Settings2, ChevronDown, ChevronUp, PauseCircle, PlayCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { usePlainLanguage } from "@/hooks/use-plain-language";
import { useReducedColor } from "@/hooks/use-reduced-color";
import { AskExamplesPeek } from "./ask-examples-peek";

export interface Voice {
  id: string;
  name: string;
  description: string;
}

export interface AIConfig {
  assertiveness: string;
  muted: boolean;
  persona?: string;
  involvement?: string;
  paused_until?: string | null;
  agent_camera_off?: boolean;
  /** Per-persona character overrides for THIS session only. Keyed by persona
   *  slug ("default", "pm", "architect", ...). The Studio sets the global
   *  default on persona.video_avatar_id; this map lets a user pick a
   *  different character for one persona on one session without touching the
   *  Studio. Each persona has its own slot so switching personas mid-call
   *  doesn't carry an override forward. */
  video_avatar_overrides?: Record<string, string | null>;
  /** Component library mode for wireframe generation. "shadcn" injects
   *  canonical shadcn class patterns into per-screen prompts so output
   *  inherits a Linear/Stripe-grade baseline. "custom" generates bespoke
   *  Tailwind from scratch. Defaults to "shadcn" for new sessions. */
  library?: "shadcn" | "custom";
  /** Per-persona question budget. "fast" rotates personas after ~3 questions,
   *  "balanced" matches today's behaviour (~5), "deep" lets each persona
   *  stay longer (~8). Backed by backend/src/app/services/pace.py. */
  pace?: "fast" | "balanced" | "deep";
  /** User's comfort with technical terms. "non_technical" makes the AI
   *  explain jargon inline; "expert" makes it terse; "comfortable" is the
   *  default. Backed by backend/src/app/services/facilitator.py
   *  TECHNICAL_COMFORT_PROMPTS. */
  technical_comfort?: "non_technical" | "comfortable" | "expert";
}

interface AIControlsProps {
  aiConfig: AIConfig;
  onConfigChange: (patch: Partial<AIConfig>) => void;
  voices: Voice[];
  aiSpeaking?: boolean;
}

const PERSONAS = [
  { id: "default", label: "Senior Engineer", description: "Sharp, opinionated, drives decisions", icon: "\u{1F6E0}" },
  { id: "pm", label: "Product Manager", description: "User-focused, prioritizes features by impact", icon: "\u{1F4CB}" },
  { id: "architect", label: "System Architect", description: "Deep technical, focuses on scalability and patterns", icon: "\u{1F3D7}" },
  { id: "mentor", label: "Patient Mentor", description: "Explains concepts, asks teaching questions", icon: "\u{1F393}" },
  { id: "challenger", label: "Devil's Advocate", description: "Questions everything, stress-tests ideas", icon: "\u{1F525}" },
] as const;

const ASSERTIVENESS_LEVELS = [
  { value: "passive", label: "Passive", plainLabel: "Quiet", description: "Only speaks when asked" },
  { value: "balanced", label: "Balanced", plainLabel: "Even", description: "Interjects at natural pauses" },
  { value: "active", label: "Active", plainLabel: "Pushy", description: "Guides firmly, keeps pace high" },
] as const;

export const INVOLVEMENT_LEVELS = [
  { value: "observer", label: "Observer", plainLabel: "Watches quietly", description: "Silent — only speaks when summoned" },
  { value: "responsive", label: "Responsive", plainLabel: "Answers when asked", description: "Answers when addressed; doesn't interrupt" },
  { value: "facilitator", label: "Facilitator", plainLabel: "Helps the meeting", description: "Speaks at natural breaks; balances air-time" },
  { value: "driver", label: "Driver", plainLabel: "Leads the meeting", description: "Pushes the agenda on every turn" },
] as const;
export const INVOLVEMENT_DEFAULT = "facilitator";

export const EMOTIONS = [
  { value: "neutral", label: "Neutral" },
  { value: "happy", label: "Happy" },
  { value: "serious", label: "Serious" },
  { value: "excited", label: "Excited" },
  { value: "calm", label: "Calm" },
] as const;

export function AIControls({ aiConfig, onConfigChange, voices, aiSpeaking = false }: AIControlsProps) {
  const [open, setOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const [plainLanguage, setPlainLanguage] = usePlainLanguage();
  const [reducedColor, setReducedColor] = useReducedColor();
  const labelOf = <T extends { label: string; plainLabel?: string }>(item: T) =>
    plainLanguage && item.plainLabel ? item.plainLabel : item.label;

  const currentAssertiveness =
    ASSERTIVENESS_LEVELS.find((l) => l.value === aiConfig.assertiveness) ?? ASSERTIVENESS_LEVELS[1];
  const currentInvolvement =
    INVOLVEMENT_LEVELS.find((l) => l.value === (aiConfig.involvement ?? INVOLVEMENT_DEFAULT))
    ?? INVOLVEMENT_LEVELS[2]; // fallback to "facilitator"

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between px-4 py-2 border-t border-border">
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">AI Facilitator</span>
          <AskExamplesPeek persona={aiConfig.persona} />
          {aiSpeaking && (
            <Badge
              variant="secondary"
              className={`text-[10px] h-4 px-1.5 bg-primary/15 text-primary border-primary/20 ${reducedMotion ? "" : "animate-pulse"}`}
            >
              speaking
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Inline pause/resume — sets paused_until 5min from now (or clears it) */}
          <button
            onClick={() => {
              const isPaused = !!aiConfig.paused_until && new Date(aiConfig.paused_until) > new Date();
              onConfigChange({
                paused_until: isPaused ? null : new Date(Date.now() + 5 * 60_000).toISOString(),
              });
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={aiConfig.paused_until ? "Resume agent" : "Pause agent for 5 minutes"}
            aria-label={aiConfig.paused_until ? "Resume agent" : "Pause agent"}
          >
            {!!aiConfig.paused_until && new Date(aiConfig.paused_until) > new Date() ? (
              <PlayCircle className="h-3.5 w-3.5 text-warning" />
            ) : (
              <PauseCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
            )}
          </button>
          {/* Inline mute toggle — always visible */}
          <button
            onClick={() => onConfigChange({ muted: !aiConfig.muted })}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            title={aiConfig.muted ? "Unmute AI voice" : "Mute AI voice"}
          >
            {aiConfig.muted ? (
              <VolumeX className="h-3.5 w-3.5 text-muted-foreground/60" />
            ) : (
              <Volume2 className="h-3.5 w-3.5 text-primary" />
            )}
          </button>
          <CollapsibleTrigger className="flex items-center justify-center h-6 w-6 rounded hover:bg-accent transition-colors">
            {open ? (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </CollapsibleTrigger>
        </div>
      </div>

      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-4">
          <Separator />

          {/* Persona selector */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Persona</Label>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {PERSONAS.map((persona) => {
                const active = (aiConfig.persona ?? "default") === persona.id;
                return (
                  <button
                    key={persona.id}
                    onClick={() => onConfigChange({ persona: persona.id })}
                    className={`
                      flex-shrink-0 flex flex-col items-center gap-0.5 py-2 px-2.5 rounded-lg transition-colors text-center min-w-[80px]
                      ${active
                        ? "bg-primary/15 border border-primary/30 ring-1 ring-primary/20"
                        : "bg-secondary/40 hover:bg-secondary/70 border border-transparent"
                      }
                    `}
                  >
                    <span className="text-base leading-none">{persona.icon}</span>
                    <span className={`text-[10px] font-medium leading-tight ${active ? "text-primary" : "text-foreground"}`}>
                      {persona.label}
                    </span>
                    <span className="text-[9px] text-muted-foreground leading-tight">
                      {persona.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mute with label */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Voice output</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{aiConfig.muted ? "Off" : "On"}</span>
              <Switch
                checked={!aiConfig.muted}
                onCheckedChange={(checked) => onConfigChange({ muted: !checked })}
                className="scale-75"
              />
            </div>
          </div>

          {/* Involvement — multi-user gating: how often the agent actually speaks */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Involvement</Label>
              <span className="text-xs font-medium">{labelOf(currentInvolvement)}</span>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label="Involvement mode">
              {INVOLVEMENT_LEVELS.map((level) => {
                const active = (aiConfig.involvement ?? INVOLVEMENT_DEFAULT) === level.value;
                return (
                  <button
                    key={level.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => onConfigChange({ involvement: level.value })}
                    title={level.description}
                    className={`
                      flex-1 text-[11px] py-1.5 px-1 rounded transition-colors font-medium
                      ${active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                      }
                    `}
                  >
                    {labelOf(level)}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{currentInvolvement.description}</p>
          </div>

          {/* Assertiveness — tone axis (separate from involvement frequency) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Assertiveness</Label>
              <span className="text-xs font-medium">{labelOf(currentAssertiveness)}</span>
            </div>
            <div className="flex gap-1">
              {ASSERTIVENESS_LEVELS.map((level) => {
                const active = aiConfig.assertiveness === level.value;
                return (
                  <button
                    key={level.value}
                    onClick={() => onConfigChange({ assertiveness: level.value })}
                    title={level.description}
                    className={`
                      flex-1 text-[11px] py-1.5 px-1 rounded transition-colors font-medium
                      ${active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
                      }
                    `}
                  >
                    {labelOf(level)}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground">{currentAssertiveness.description}</p>
          </div>

          <Separator />

          {/* Display + input preferences. Persisted in localStorage. */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Plain-language labels</Label>
                <p className="text-[10px] text-muted-foreground/70">
                  {plainLanguage ? '"Helps the meeting" instead of "Facilitator"' : "Show jargon labels"}
                </p>
              </div>
              <Switch
                checked={plainLanguage}
                onCheckedChange={setPlainLanguage}
                className="scale-75"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs text-muted-foreground">Colorblind-safe transcript</Label>
                <p className="text-[10px] text-muted-foreground/70">
                  Wong palette + leading symbol per speaker
                </p>
              </div>
              <Switch
                checked={reducedColor}
                onCheckedChange={setReducedColor}
                className="scale-75"
              />
            </div>
          </div>

          {/* Voice settings are now configured per-persona in Studio */}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
