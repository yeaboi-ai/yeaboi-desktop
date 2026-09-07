'use client';

// The way into the visualiser's settings from where the bars are.

import { SlidersHorizontal } from 'lucide-react';
import { VisualizerControls } from '@/components/music/visualizer-controls';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function VisualizerStyleButton() {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden />
            Style
          </button>
        }
      />
      <PopoverContent side="bottom" align="end" sideOffset={6} className="w-[360px] p-3">
        <VisualizerControls compact />
      </PopoverContent>
    </Popover>
  );
}
