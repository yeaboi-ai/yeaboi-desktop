'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProjectBoardSettings } from '@/components/kanban/project-board-settings';
import { BoardToolbar, ViewMode } from '@/components/kanban/board-toolbar';
import { BoardView } from '@/components/kanban/board-view';
import { BulkActionsBar } from '@/components/kanban/bulk-actions-bar';
import { ListView } from '@/components/kanban/list-view';
import { CardDetail } from '@/components/kanban/card-detail';
import { ShortcutHelp } from '@/components/ui/shortcut-help';
import { useBoard, Card as CardType } from '@/hooks/use-board';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
import { useBoardSelection } from '@/hooks/use-board-selection';
import { useBoardShortcuts } from '@/hooks/use-board-shortcuts';
import { getPref, setPref, type BoardGroupBy, type BoardSortKey } from '@/lib/preferences';
import { sortCards } from '@/lib/board-sort';
import { deriveLanes } from '@/lib/board-lanes';
import { decodeBoardUrlState, encodeBoardUrlState } from '@/lib/url-state';
import { Loader2 } from 'lucide-react';

interface SessionOption {
  id: string;
  title: string | null;
  projectId?: string;
}

export default function GlobalBoardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <GlobalBoardContent />
    </Suspense>
  );
}

function GlobalBoardContent() {
  const searchParams = useSearchParams();
  const initialProject = searchParams.get('project');
  const initialCard = searchParams.get('card');
  const { authFetch } = useAuthFetch();

  // Always fetch global board — filtering is client-side
  const { board, loading, error, moveCard, createCard, updateCard, deleteCard, refetch } = useBoard(
    null,
    authFetch,
  );

  const [selectedProject, setSelectedProject] = useState<string | null>(initialProject);
  const [selectedSession, setSelectedSession] = useState<string>('');
  const [view, setView] = useState<ViewMode>('board');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => getPref('board.density'));
  const [sortBy, setSortBy] = useState<BoardSortKey>(() => getPref('board.sortBy'));
  const [groupBy, setGroupByState] = useState<BoardGroupBy>(() => getPref('board.groupBy'));
  // Lazy initial: read once. Setting groupBy via the dropdown flips this to
  // true so the auto-default-to-Wave logic stops overriding the user's choice.
  const [groupByExplicit, setGroupByExplicitState] = useState<boolean>(() =>
    getPref('board.groupByExplicit'),
  );

  // Wraps the dropdown setter so explicit toggles persist + record intent.
  const setGroupBy = useCallback((next: BoardGroupBy) => {
    setGroupByState(next);
    setGroupByExplicitState(true);
  }, []);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { selectedIds, toggle: toggleSelection, clear: clearSelection } = useBoardSelection();

  // Extract unique project names from cards
  const projectOptions = useMemo(
    () =>
      board
        ? Array.from(
            new Map(
              board.columns.flatMap((col) =>
                col.cards
                  .filter((c) => c.session_id && c.session_name)
                  .map((c) => [c.session_id!, c.session_name!] as [string, string]),
              ),
            ),
          )
        : [],
    [board],
  );

  // Extract all sessions from cards, with their session_id
  const allSessions = useMemo(() => {
    if (!board) return [];
    const map = new Map<string, SessionOption>();
    board.columns.forEach((col) =>
      col.cards.forEach((c) => {
        if (c.session_id && c.session_title) {
          map.set(c.session_id, {
            id: c.session_id,
            title: c.session_title,
            projectId: c.session_id,
          });
        }
      }),
    );
    return Array.from(map.values());
  }, [board]);

  // Show all sessions when no project selected, or filter by selected project
  const sessionOptions = useMemo(() => {
    if (!selectedProject) return allSessions;
    return allSessions.filter((s) => s.projectId === selectedProject);
  }, [allSessions, selectedProject]);

  // Extract unique labels from cards
  const labelOptions = useMemo(() => {
    if (!board) return [];
    const labels = new Set<string>();
    board.columns.forEach((col) =>
      col.cards.forEach((c) => c.labels?.forEach((l) => labels.add(l))),
    );
    return Array.from(labels).sort();
  }, [board]);

  // Fetch team members for assignee filter
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await authFetch('/api/team-proxy');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled) {
          setTeamMembers(
            (data as { id: string; name: string | null }[])
              .filter((m) => m.name)
              .map((m) => ({ id: m.id, name: m.name! }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch]);

  // Client-side filtering plus a synthetic "Blocked" lane.
  // Blocked is a derived view: cards keep their real column server-side, but
  // any card with is_blocked=true is hoisted out into a virtual lane between
  // the start state (Backlog) and the next column. The lane is read-only — to
  // unblock, resolve the upstream blocker.
  const filteredBoard = useMemo(() => {
    if (!board) return null;
    // Apply user filters and the chosen sort within each column. Blocked
    // cards stay in their real columns — the red `is_blocked` indicator on
    // each card already flags them; a separate lane added more visual noise
    // than value.
    const columns = board.columns.map((col) => ({
      ...col,
      cards: sortCards(
        col.cards.filter((card) => {
          if (selectedProject && card.session_id !== selectedProject) return false;
          if (selectedSession && card.session_id !== selectedSession) return false;
          if (assigneeFilter && card.assignee_id !== assigneeFilter) return false;
          if (labelFilter.length > 0 && !labelFilter.some((l) => card.labels?.includes(l)))
            return false;
          return true;
        }),
        sortBy,
      ),
    }));

    return { ...board, columns };
  }, [board, selectedProject, selectedSession, assigneeFilter, labelFilter, sortBy]);

  // Lane derivation for the swim-lane render. When groupBy === "off" this is
  // a single all-cards lane; otherwise lanes are bucketed by axis.
  const lanes = useMemo(
    () => (filteredBoard ? deriveLanes(filteredBoard, groupBy) : []),
    [filteredBoard, groupBy],
  );

  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProject(projectId || null);
    setSelectedSession('');
  }, []);

  const handleSessionChange = useCallback(
    (sessionId: string) => {
      setSelectedSession(sessionId);
      // Auto-select project when picking a session without a project filter
      if (sessionId && !selectedProject) {
        const session = allSessions.find((s) => s.id === sessionId);
        if (session?.projectId) {
          setSelectedProject(session.projectId);
        }
      }
    },
    [selectedProject, allSessions],
  );

  // Live poll
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch]);

  // Persist density + sort + groupBy across reloads.
  useEffect(() => {
    setPref('board.density', density);
  }, [density]);
  useEffect(() => {
    setPref('board.sortBy', sortBy);
  }, [sortBy]);
  useEffect(() => {
    setPref('board.groupBy', groupBy);
  }, [groupBy]);
  useEffect(() => {
    setPref('board.groupByExplicit', groupByExplicit);
  }, [groupByExplicit]);

  // Auto-default to Group by Wave for fresh boards. Fires once, only when the
  // user has never picked a groupBy explicitly AND the board has waved cards.
  // Uses the render-time sync pattern (react.dev "you might not need an
  // effect") — `autoDefaulted` ratchets to true on first apply so the call
  // can't loop. After this, groupBy stays whatever the user picks; the
  // explicit flag means future visits respect their preference.
  const [autoDefaulted, setAutoDefaulted] = useState(false);
  if (
    !autoDefaulted &&
    !groupByExplicit &&
    board &&
    groupBy === 'off' &&
    board.columns.some((col) => col.cards.some((c) => typeof c.wave === 'number'))
  ) {
    setAutoDefaulted(true);
    setGroupByState('wave');
  }

  const hasFilters =
    !!search ||
    !!priorityFilter ||
    !!selectedProject ||
    !!selectedSession ||
    labelFilter.length > 0 ||
    !!assigneeFilter;

  // Serialise current view to a URL query so the saved-views menu can store it.
  // Includes filters, density, sort, and groupBy so a saved view restores the
  // user's full lens onto the board, not just filters.
  const currentViewQuery = useMemo(() => {
    const params = encodeBoardUrlState(
      {
        q: search || null,
        priority: priorityFilter || null,
        labels: labelFilter.length ? labelFilter.join(',') : null,
        assignee: assigneeFilter || null,
        density,
        // Only persist non-default sort/groupBy so the URL stays clean for
        // simple views.
        sortBy: sortBy === 'manual' ? null : sortBy,
        groupBy: groupBy === 'off' ? null : groupBy,
      },
      new URLSearchParams(),
    );
    return params.toString();
  }, [search, priorityFilter, labelFilter, assigneeFilter, density, sortBy, groupBy]);

  const applySavedView = useCallback(
    (query: string) => {
      const state = decodeBoardUrlState(new URLSearchParams(query));
      setSearch(state.q ?? '');
      setPriorityFilter(state.priority ?? '');
      setLabelFilter(state.labels ? state.labels.split(',').filter(Boolean) : []);
      setAssigneeFilter(state.assignee ?? '');
      if (state.density) setDensity(state.density);
      if (state.sortBy) setSortBy(state.sortBy);
      // Restoring a saved view counts as an explicit user choice — flip the
      // explicit flag so the auto-default-to-Wave logic doesn't override the
      // restored grouping (or restored "off") on the next load.
      if (state.groupBy) {
        setGroupBy(state.groupBy);
      } else {
        setGroupBy('off');
      }
    },
    [setGroupBy],
  );

  // Bulk actions backed by /api/cards-bulk-proxy. Optimistic refetch.
  const bulkPatch = useCallback(
    async (patch: Record<string, unknown>) => {
      if (selectedIds.size === 0) return;
      await authFetch('/api/cards-bulk-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds], patch }),
      });
      await refetch();
      clearSelection();
    },
    [authFetch, selectedIds, refetch, clearSelection],
  );

  const bulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await Promise.all(
      [...selectedIds].map((id) =>
        authFetch(`/api/cards-proxy/${id}`, { method: 'DELETE' }).catch(() => null),
      ),
    );
    await refetch();
    clearSelection();
  }, [authFetch, selectedIds, refetch, clearSelection]);

  // Keyboard shortcuts.
  useBoardShortcuts({
    onFocusSearch: () => searchInputRef.current?.focus(),
    onShowHelp: () => setHelpOpen(true),
    onEscape: () => {
      if (selectedCard) setSelectedCard(null);
      else if (helpOpen) setHelpOpen(false);
      else clearSelection();
    },
  });

  const handleAgentApprove = async (cardId: string) => {
    try {
      await authFetch(`/api/agent-approve-proxy/${cardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      refetch();
    } catch {
      // best-effort
    }
  };

  const handleAgentReject = async (cardId: string, feedback: string) => {
    try {
      await authFetch(`/api/agent-approve-proxy/${cardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', feedback }),
      });
      refetch();
    } catch {
      // best-effort
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex flex-col flex-1 px-6 py-6 max-w-full">
        {/* Page header */}
        <div className="mb-5">
          <h1 className="text-lg font-semibold tracking-tight">Board</h1>
        </div>

        {/* Toolbar */}
        <div className="mb-5">
          <BoardToolbar
            view={view}
            onViewChange={setView}
            search={search}
            onSearchChange={setSearch}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            projectFilter={selectedProject || ''}
            onProjectFilterChange={handleProjectChange}
            projectOptions={projectOptions}
            sessionFilter={selectedSession}
            onSessionFilterChange={handleSessionChange}
            sessionOptions={sessionOptions}
            labelFilter={labelFilter}
            onLabelFilterChange={setLabelFilter}
            labelOptions={labelOptions}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={setAssigneeFilter}
            assigneeOptions={teamMembers}
            density={density}
            onDensityChange={setDensity}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            currentViewQuery={currentViewQuery}
            onApplyView={applySavedView}
            onShowHelp={() => setHelpOpen(true)}
            onShowSettings={() => {
              // The settings drawer customises one project's board at a time.
              // Auto-pick the first project when the user opens it on the
              // global view so the gear is always usable.
              if (!selectedProject && projectOptions.length > 0) {
                handleProjectChange(projectOptions[0][0]);
              }
              setSettingsOpen(true);
            }}
            searchInputRef={searchInputRef}
          />
        </div>

        {/* Board content */}
        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {filteredBoard && view === 'board' && (
          <div className="flex-1 overflow-x-auto">
            <BoardView
              board={filteredBoard}
              lanes={lanes}
              groupBy={groupBy}
              search={search}
              priorityFilter={priorityFilter}
              onMoveCard={moveCard}
              onUpdateCard={updateCard}
              onCreateCard={createCard}
              onDeleteCard={deleteCard}
              onAgentApprove={handleAgentApprove}
              onAgentReject={handleAgentReject}
              initialCardId={initialCard}
              density={density}
              hasFilters={hasFilters}
              selectedIds={selectedIds}
              onSelectToggle={(cardId, ev, order) => toggleSelection(cardId, ev, order)}
            />
          </div>
        )}

        {filteredBoard && view === 'list' && (
          <ListView
            board={filteredBoard}
            search={search}
            priorityFilter={priorityFilter}
            onCardClick={(card) => setSelectedCard(card)}
          />
        )}

        {view === 'list' && (
          <CardDetail
            card={selectedCard}
            onClose={() => setSelectedCard(null)}
            onUpdate={async (cardId, data) => {
              const updated = await updateCard(cardId, data);
              if (updated) setSelectedCard(updated);
              return updated;
            }}
            onDelete={async (cardId) => {
              await deleteCard(cardId);
              setSelectedCard(null);
              return true;
            }}
            onAgentApprove={handleAgentApprove}
            onAgentReject={handleAgentReject}
          />
        )}

        {/* Bulk-actions bar — appears when ≥1 card is shift-selected. */}
        {filteredBoard && (
          <BulkActionsBar
            count={selectedIds.size}
            columns={filteredBoard.columns.filter((c) => !c.virtual)}
            onMoveTo={(columnId) => bulkPatch({ column_id: columnId })}
            onSetPriority={(priority) => bulkPatch({ priority })}
            onDelete={bulkDelete}
            onClear={clearSelection}
          />
        )}

        <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />

        {selectedProject && (
          <ProjectBoardSettings
            projectId={selectedProject}
            projectName={projectOptions.find(([id]) => id === selectedProject)?.[1] ?? null}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onColumnsChanged={refetch}
          />
        )}
      </main>
    </div>
  );
}
