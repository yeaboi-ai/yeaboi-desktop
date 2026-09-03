'use client';

import * as React from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';

import { cn } from '@/lib/utils';

function TooltipProvider({ delay = 200, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider delay={delay} {...props} />;
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: TooltipPrimitive.Popup.Props & {
  sideOffset?: number;
}) {
  return (
    <TooltipPrimitive.Portal>
      {/* The z-index sits on the positioner: it is the stacking context, so a
          popup's own z-index cannot lift it above the fixed rail. */}
      <TooltipPrimitive.Positioner sideOffset={sideOffset} className="z-[300]">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'max-w-xs rounded-md bg-secondary px-2 py-1 text-[11px] text-foreground/95 ring-1 ring-white/10 shadow-lg',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150',
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent };
