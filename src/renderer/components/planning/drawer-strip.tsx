'use client';

// The room's right edge: one icon per drawer, its name on hover, the open one
// lit; the duck at the foot opens the tips.

import { FileText, Layers, Plug, Video, ClipboardList, SlidersHorizontal } from 'lucide-react';
import { PersonaDuckMark } from '@/components/brand/duck';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { currentPersona } from '@/lib/home/wardrobe';
import { DRAWERS, type DrawerKind } from '@/lib/planning/drawers';
import { cn } from '@/lib/utils';

const ICONS: Record<DrawerKind, typeof FileText> = {
  blueprint: FileText,
  context: Layers,
  integrations: Plug,
  video: Video,
  recap: ClipboardList,
  settings: SlidersHorizontal,
};

export function DrawerStrip({
  open,
  onToggle,
  onTips,
}: {
  open: DrawerKind | null;
  onToggle: (kind: DrawerKind) => void;
  onTips: () => void;
}) {
  return (
    <TooltipProvider>
      <nav
        aria-label="Drawers"
        className="flex w-11 shrink-0 flex-col items-center gap-1 border-l border-border/60 bg-background py-3"
      >
        {DRAWERS.map((spec) => {
          const Icon = ICONS[spec.kind];
          const lit = open === spec.kind;
          return (
            <Tooltip key={spec.kind}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={spec.label}
                    aria-pressed={lit}
                    onClick={() => onToggle(spec.kind)}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-md transition-colors',
                      lit
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  />
                }
              >
                <Icon className="h-4 w-4" />
              </TooltipTrigger>
              <TooltipContent side="left">
                {spec.label}
                {spec.hotkey ? `, ${spec.hotkey}` : ''}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <div className="flex-1" />
        <button
          type="button"
          onClick={onTips}
          aria-label="Tips"
          title="Tips"
          className="rounded-md p-1 transition-colors hover:bg-secondary"
        >
          <PersonaDuckMark persona={currentPersona()} size={22} />
        </button>
      </nav>
    </TooltipProvider>
  );
}
