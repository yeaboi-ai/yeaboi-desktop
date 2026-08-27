"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  sideOffset = 8,
  align = "center",
  side,
  children,
  ...props
}: PopoverPrimitive.Popup.Props & {
  sideOffset?: number
  align?: "start" | "center" | "end"
  /** Preferred placement relative to the trigger. Base UI flips automatically
   *  when there's no room, so this is a hint rather than a hard pin. Omit to
   *  let Base UI pick (current behavior — best fit). */
  side?: "top" | "bottom" | "left" | "right" | "inline-end" | "inline-start"
}) {
  return (
    <PopoverPrimitive.Portal>
      {/* Set the z-index on the Positioner — Base UI's Positioner is the
          element actually inserted into the body portal; styling only the
          inner Popup leaves the outer Positioner without a stacking
          context, so anything higher up the DOM (e.g. a fullscreened
          ChatDrawer at z-[9999], or a regular drawer that grabbed a high
          bringToFront value) renders over the popover. Putting the
          z-index on the Positioner via `style` makes the entire
          floating shell sit above panel layers. 9000 keeps it under
          modal/toast viewports (300 / 400 ranges are still fine because
          Tailwind utilities on those higher layers add their own; this
          just guarantees the popover beats every drawer.). */}
      <PopoverPrimitive.Positioner
        sideOffset={sideOffset}
        align={align}
        side={side}
        style={{ zIndex: 9000 }}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "w-72 rounded-xl bg-popover p-3 text-sm text-foreground/95 ring-1 ring-border/70 shadow-2xl outline-none",
            "data-[starting-style]:opacity-0 data-[starting-style]:scale-95",
            "data-[ending-style]:opacity-0 data-[ending-style]:scale-95",
            "transition-[opacity,transform] duration-150",
            className
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverClose }
