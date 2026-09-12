'use client';

// One drawer beside the transcript: a resizable panel with the drawer's
// name at the top and its body underneath. One is open at a time; the strip
// decides which.

import { ResizableSheet } from '@/components/ui/resizable-sheet';
import { DRAWERS, type DrawerKind } from '@/lib/planning/drawers';

const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 440;

export function RoomDrawer({
  kind,
  onClose,
  onWidth,
  children,
}: {
  kind: DrawerKind | null;
  onClose: () => void;
  /** The drawn width, so the room can decide push or overlay. */
  onWidth?: (width: number) => void;
  children: React.ReactNode;
}) {
  if (!kind) return null;
  const spec = DRAWERS.find((entry) => entry.kind === kind);
  return (
    <ResizableSheet
      open
      onOpenChange={(open) => !open && onClose()}
      variant="panel"
      storageKey={`room.drawer.${kind}`}
      defaultWidth={DEFAULT_WIDTH}
      minWidth={MIN_WIDTH}
      maxFraction={0.5}
      onWidthChange={onWidth}
      headerSlot={
        <span className="mr-auto pl-2 font-display text-[16px] italic text-muted-foreground">
          {spec?.label}
        </span>
      }
    >
      <div className="px-5 py-4">{children}</div>
    </ResizableSheet>
  );
}
