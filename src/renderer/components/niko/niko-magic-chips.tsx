"use client";

import {
  Plus,
  BarChart3,
  Compass,
  Play,
  ShieldCheck,
  Layout,
  PlusSquare,
  ArrowUpDown,
  Calendar,
  UserPlus,
  FilePlus,
  Users,
  Layers,
  AlertTriangle,
  TrendingUp,
  Bell,
  Info,
} from "lucide-react";
import type { NikoMagicPrompt } from "@/hooks/use-niko";

const ICON_MAP: Record<string, React.ElementType> = {
  plus: Plus,
  "bar-chart": BarChart3,
  compass: Compass,
  play: Play,
  "shield-check": ShieldCheck,
  layout: Layout,
  "plus-square": PlusSquare,
  "arrow-up-down": ArrowUpDown,
  calendar: Calendar,
  "user-plus": UserPlus,
  "file-plus": FilePlus,
  users: Users,
  layers: Layers,
  "alert-triangle": AlertTriangle,
  "trending-up": TrendingUp,
  bell: Bell,
  info: Info,
};

interface NikoMagicChipsProps {
  prompts: NikoMagicPrompt[];
  onSelect: (prompt: string) => void;
}

export function NikoMagicChips({ prompts, onSelect }: NikoMagicChipsProps) {
  if (!prompts.length) return null;

  return (
    <div className="flex flex-col gap-1.5 px-1">
      <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider px-1">
        Quick actions
      </p>
      {prompts.map((p) => {
        const Icon = ICON_MAP[p.icon || ""] || Compass;
        return (
          <button
            key={p.prompt}
            onClick={() => onSelect(p.prompt)}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-muted/40 hover:text-foreground"
          >
            <Icon className="size-3.5 shrink-0 text-primary/60" />
            <span>{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
