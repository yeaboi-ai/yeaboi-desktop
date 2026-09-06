'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { OverlayFlag } from '@/components/ui/overlay-flag';

type Side = 'left' | 'right' | 'top' | 'bottom';

// A sheet floats off the window's edges rather than filling one of them: the
// rail, the dock and every card in this app are objects sitting on the page,
// and a panel welded to three sides is the only thing that was not. It clears
// the edge by the same margin they do, and travels far enough on the way out
// to take that margin with it.
const INSET = 'inset-4';

/** Two widths, and no third. A panel is a column of fields or rows; wide is
 *  for the few sheets that hold an editor or two columns of one. Every sheet
 *  in the app is one of the two, so a drawer never arrives a different size
 *  from the last one. */
export type SheetWidth = 'panel' | 'wide';

const WIDTHS: Record<SheetWidth, string> = {
  panel: 'sm:max-w-md',
  wide: 'sm:max-w-xl',
};

const SIDE_STYLES: Record<Side, string> = {
  right:
    `fixed ${INSET} left-auto w-[calc(100%-2rem)] ` +
    'data-[starting-style]:translate-x-[calc(100%+1rem)] ' +
    'data-[ending-style]:translate-x-[calc(100%+1rem)]',
  left:
    `fixed ${INSET} right-auto w-[calc(100%-2rem)] ` +
    'data-[starting-style]:-translate-x-[calc(100%+1rem)] ' +
    'data-[ending-style]:-translate-x-[calc(100%+1rem)]',
  bottom:
    `fixed ${INSET} top-auto max-h-[calc(90vh-2rem)] ` +
    'data-[starting-style]:translate-y-[calc(100%+1rem)] ' +
    'data-[ending-style]:translate-y-[calc(100%+1rem)]',
  top:
    `fixed ${INSET} bottom-auto max-h-[calc(90vh-2rem)] ` +
    'data-[starting-style]:-translate-y-[calc(100%+1rem)] ' +
    'data-[ending-style]:-translate-y-[calc(100%+1rem)]',
};

const SIDE_SWIPE: Record<Side, 'right' | 'left' | 'down' | 'up'> = {
  right: 'right',
  left: 'left',
  bottom: 'down',
  top: 'up',
};

function Sheet({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-[270] bg-black/50 backdrop-blur-sm',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        'transition-opacity duration-200',
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  width = 'panel',
  showCloseButton = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  side?: Side;
  width?: SheetWidth;
  showCloseButton?: boolean;
}) {
  return (
    <DrawerPrimitive.Portal>
      <SheetOverlay />
      <DrawerPrimitive.Popup
        data-slot="sheet-content"
        className={cn(
          'z-[280] flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 shadow-2xl outline-none',
          'transition-transform duration-200 ease-out',
          SIDE_STYLES[side],
          side === 'right' || side === 'left' ? WIDTHS[width] : '',
          className,
        )}
        {...props}
      >
        {/* Only mounted while the popup is: the page underneath stops paging
            for exactly as long as this is up. */}
        <OverlayFlag name="sheet" />
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
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1 px-5 py-4 border-b border-border/60', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        'mt-auto flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60',
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-sm font-semibold text-foreground', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
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
};
