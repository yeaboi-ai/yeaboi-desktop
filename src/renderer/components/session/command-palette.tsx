"use client";

import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { formatShortcut, type SessionShortcut } from "@/hooks/use-session-shortcuts";

const PERSONAS = [
  { id: "default", label: "Senior Engineer" },
  { id: "pm", label: "Product Manager" },
  { id: "architect", label: "System Architect" },
  { id: "mentor", label: "Patient Mentor" },
  { id: "challenger", label: "Devil's Advocate" },
] as const;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Same shortcuts array fed to the help overlay — single source of truth. */
  shortcuts: SessionShortcut[];
  /** Switch persona. Pass the persona id. */
  onSwitchPersona: (personaId: string) => void;
  /** True when a call is active (some commands are gated on this). */
  inCall: boolean;
}

export function CommandPalette({ open, onOpenChange, shortcuts, onSwitchPersona, inCall }: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} label="Session command palette">
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>

        {/* Switch persona group — surfaces the most-used in-call action */}
        <CommandGroup heading="Switch persona">
          {PERSONAS.map((p) => (
            <CommandItem
              key={p.id}
              value={`switch persona ${p.label} ${p.id}`}
              onSelect={() => onSwitchPersona(p.id)}
            >
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Direct shortcut actions, grouped */}
        {(() => {
          const visible = shortcuts; // Cmd-K shows everything, including no-keybind entries
          const groups = visible.reduce<Record<string, SessionShortcut[]>>((acc, s) => {
            const g = s.group ?? "Misc";
            (acc[g] ??= []).push(s);
            return acc;
          }, {});
          const order: Array<keyof typeof groups> = ["Call", "Agent", "Navigation", "Misc"];
          return order
            .filter((g) => groups[g]?.length)
            .map((g) => (
              <CommandGroup key={g} heading={g}>
                {groups[g].map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`${s.label} ${s.id}`}
                    onSelect={() => {
                      // Synthesize a minimal KeyboardEvent so handlers that
                      // call preventDefault don't crash.
                      s.run(new KeyboardEvent("keydown"));
                    }}
                    shortcut={s.keys ? formatShortcut(s.keys) : undefined}
                    disabled={s.id.startsWith("call.") && !inCall}
                  >
                    {s.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ));
        })()}
      </CommandList>
    </CommandDialog>
  );
}
