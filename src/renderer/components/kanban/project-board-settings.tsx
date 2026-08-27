"use client";

import { useAuthFetch } from "@/hooks/use-auth-fetch";
import {
  type BoardColumn,
  type ColumnCreate,
  type ColumnUpdate,
  useBoard,
} from "@/hooks/use-board";
import { BoardSettingsDrawer } from "./board-settings-drawer";

interface ProjectBoardSettingsProps {
  projectId: string;
  projectName?: string | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onColumnsChanged?: () => void;
}

/**
 * Mounts a per-project useBoard so the settings drawer mutates the *real*
 * project board rather than the global merged-by-name view used on the
 * org-wide board page.
 */
export function ProjectBoardSettings({
  projectId,
  projectName,
  open,
  onOpenChange,
  onColumnsChanged,
}: ProjectBoardSettingsProps) {
  const { authFetch } = useAuthFetch();
  const { board, createColumn, updateColumn, deleteColumn, reorderColumns } = useBoard(
    projectId,
    authFetch,
  );

  if (!board) return null;

  const handleCreate = async (data: ColumnCreate): Promise<BoardColumn | null> => {
    const result = await createColumn(data);
    onColumnsChanged?.();
    return result;
  };

  const handleUpdate = async (
    columnId: string,
    data: ColumnUpdate,
  ): Promise<BoardColumn | null> => {
    const result = await updateColumn(columnId, data);
    onColumnsChanged?.();
    return result;
  };

  const handleDelete = async (columnId: string, reassignTo?: string): Promise<boolean> => {
    const result = await deleteColumn(columnId, reassignTo);
    onColumnsChanged?.();
    return result;
  };

  const handleReorder = async (orderedIds: string[]): Promise<boolean> => {
    const result = await reorderColumns(orderedIds);
    onColumnsChanged?.();
    return result;
  };

  return (
    <BoardSettingsDrawer
      open={open}
      onOpenChange={onOpenChange}
      board={board}
      projectId={projectId}
      projectName={projectName ?? null}
      onCreateColumn={handleCreate}
      onUpdateColumn={handleUpdate}
      onDeleteColumn={handleDelete}
      onReorderColumns={handleReorder}
    />
  );
}
