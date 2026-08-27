"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

type Side = "left" | "right" | "top" | "bottom"

const SIDE_STYLES: Record<Side, string> = {
  right:
    "fixed top-0 right-0 h-full w-full sm:max-w-md " +
    "data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
  left:
    "fixed top-0 left-0 h-full w-full sm:max-w-md " +
    "data-[starting-style]:-translate-x-full data-[ending-style]:-translate-x-full",
  bottom:
    "fixed left-0 right-0 bottom-0 w-full max-h-[90vh] " +
    "data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full",
  top:
    "fixed left-0 right-0 top-0 w-full max-h-[90vh] " +
    "data-[starting-style]:-translate-y-full data-[ending-style]:-translate-y-full",
}

const SIDE_SWIPE: Record<Side, "right" | "left" | "down" | "up"> = {
  right: "right",
  left: "left",
  bottom: "down",
  top: "up",
}

function Sheet({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-[270] bg-black/50 backdrop-blur-sm",
        "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        "transition-opacity duration-200",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  side?: Side
  showCloseButton?: boolean
}) {
  return (
    <DrawerPrimitive.Portal>
      <SheetOverlay />
      <DrawerPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          "z-[280] bg-card ring-1 ring-border/70 shadow-2xl outline-none flex flex-col",
          "transition-transform duration-200 ease-out",
          SIDE_STYLES[side],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DrawerPrimitive.Close
            className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/[0.05] transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </DrawerPrimitive.Close>
        )}
      </DrawerPrimitive.Popup>
    </DrawerPrimitive.Portal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1 px-5 py-4 border-b border-border/60", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-sm font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SIDE_SWIPE,
}
