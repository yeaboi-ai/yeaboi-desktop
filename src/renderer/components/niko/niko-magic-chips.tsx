'use client';

// The chips that float above the bar before anything is typed.
//
// They come from the backend per screen (`GET /api/niko/suggestions?route=`),
// so what is offered on /agents/usage differs from /team/retro. The glyph is
// the one deviation from the platform this was ported from: the payload already
// carries an `icon`, and yeaboi.ai's test_niko_suggestions.py pins that
// vocabulary against ICON_MAP below — dropping it would leave a tested contract
// with nothing reading it.

import {
  AlertTriangle,
  ArrowUpDown,
  BarChart3,
  Bell,
  Calendar,
  Compass,
  FilePlus,
  Info,
  Layers,
  Layout,
  Play,
  Plus,
  PlusSquare,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import type { NikoMagicPrompt } from '@/hooks/use-niko';

const ICON_MAP: Record<string, React.ElementType> = {
  plus: Plus,
  'bar-chart': BarChart3,
  compass: Compass,
  play: Play,
  'shield-check': ShieldCheck,
  layout: Layout,
  'plus-square': PlusSquare,
  'arrow-up-down': ArrowUpDown,
  calendar: Calendar,
  'user-plus': UserPlus,
  'file-plus': FilePlus,
  users: Users,
  layers: Layers,
  'alert-triangle': AlertTriangle,
  'trending-up': TrendingUp,
  bell: Bell,
  info: Info,
};

interface NikoMagicChipsProps {
  prompts: NikoMagicPrompt[];
  onSelect: (prompt: string) => void;
  /** Chips duck out of the way when the slash palette takes the same space. */
  hidden?: boolean;
}

export function NikoMagicChips({ prompts, onSelect, hidden }: NikoMagicChipsProps) {
  if (!prompts.length) return null;

  return (
    <div
      className="absolute left-1/2 flex items-center justify-center gap-2.5"
      style={{
        bottom: 'calc(100% + 10px)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? 'none' : 'auto',
        transform: hidden ? 'translateX(-50%) translateY(8px)' : 'translateX(-50%)',
      }}
    >
      {prompts.map((prompt, i) => {
        const Icon = ICON_MAP[prompt.icon || ''] || Compass;
        return (
          <button
            key={prompt.prompt}
            onClick={() => onSelect(prompt.prompt)}
            title={prompt.prompt}
            className="flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-3.5 py-1.5 text-[11px] font-body whitespace-nowrap text-muted-foreground transition-all duration-300 hover:border-primary/30 hover:text-foreground/90 hover:shadow-lg hover:shadow-primary/10"
            style={{
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              animationDelay: `${i * 150}ms`,
              animation: 'chipFloat 0.8s ease-out both',
            }}
          >
            <Icon className="size-3 shrink-0 text-primary/60" />
            <span>{prompt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
