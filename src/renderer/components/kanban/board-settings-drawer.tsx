'use client';

import { ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import type { Board, BoardColumn, ColumnCreate, ColumnUpdate } from '@/hooks/use-board';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { BoardSettingsContent } from './board-settings-content';

interface BoardSettingsDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  board: Board;
  projectId?: string;
  projectName?: string | null;
  onCreateColumn: (data: ColumnCreate) => Promise<BoardColumn | null>;
  onUpdateColumn: (columnId: string, data: ColumnUpdate) => Promise<BoardColumn | null>;
  onDeleteColumn: (columnId: string, reassignTo?: string) => Promise<boolean>;
  onReorderColumns: (orderedIds: string[]) => Promise<boolean>;
}

export function BoardSettingsDrawer({
  open,
  onOpenChange,
  board,
  projectId,
  projectName,
  onCreateColumn,
  onUpdateColumn,
  onDeleteColumn,
  onReorderColumns,
}: BoardSettingsDrawerProps) {
  const [expanded, setExpanded] = useState(false);

  // The Sheet's max-width is bumped to full when expanded so the workflow
  // diagram has room to breathe. Header buttons toggle expand and open the
  // dedicated /projects/[id]/board-settings page in a new tab.
  const settingsHref = projectId ? `/sessions/${projectId}/board-settings` : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={expanded ? 'sm:max-w-none w-full' : 'sm:max-w-xl'}>
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SheetTitle>
                Board settings
                {projectName && (
                  <span className="ml-2 font-normal text-white/50">— {projectName}</span>
                )}
              </SheetTitle>
              <SheetDescription>
                Customize columns, WIP limits, and lifecycle roles. Changes broadcast to other
                viewers in real time.
              </SheetDescription>
            </div>

            {/* Expand + open-in-tab. The X close button lives further right
                via SheetContent's built-in close button. */}
            <div className="flex shrink-0 items-center gap-1 pr-8">
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-label={expanded ? 'Collapse drawer' : 'Expand drawer'}
                title={expanded ? 'Collapse' : 'Expand to full width'}
                className="rounded-md p-1.5 text-white/40 hover:bg-white/5 hover:text-white/80"
              >
                {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              {settingsHref && (
                <Link
                  href={settingsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in new tab"
                  title="Open settings in a new tab"
                  className="rounded-md p-1.5 text-white/40 hover:bg-white/5 hover:text-white/80"
                >
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className={`flex-1 overflow-y-auto ${expanded ? 'px-10 py-8' : 'px-6 py-5'}`}>
          <BoardSettingsContent
            board={board}
            layout={expanded ? 'page' : 'drawer'}
            onCreateColumn={onCreateColumn}
            onUpdateColumn={onUpdateColumn}
            onDeleteColumn={onDeleteColumn}
            onReorderColumns={onReorderColumns}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
