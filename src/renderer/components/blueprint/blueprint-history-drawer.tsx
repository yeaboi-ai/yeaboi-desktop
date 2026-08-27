'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, History as HistoryIcon, Lock, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

import { BlueprintDiff } from '@/components/blueprint/blueprint-diff';
import {
  useBlueprintHistory,
  type SnapshotDetail,
  type SnapshotListItem,
} from '@/hooks/use-blueprint-history';
import { labelForCreatedBy } from '@/lib/blueprint-labels';

const SECTION_LABELS: Record<string, string> = {
  project_overview: 'Project Overview',
  goals_constraints: 'Goals & Constraints',
  users_personas: 'Users & Personas',
  team_capacity: 'Team & Capacity',
  architecture: 'Architecture',
  tech_stack: 'Tech Stack',
  api_integrations: 'API & Integrations',
  ui_ux: 'UI/UX',
  security_compliance: 'Security & Compliance',
  infrastructure: 'Infrastructure',
  risks_unknowns: 'Risks & Unknowns',
  out_of_scope: 'Out of Scope',
  open_questions: 'Open Questions',
};

interface BlueprintHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  iterationId: string | null;
  /** Current live blueprint content — used as the comparison base when
   *  diffing a selected snapshot. */
  currentContent: Record<string, string>;
  /** Live blueprint version_number — the row whose `version_number`
   *  matches this is the current state and shouldn't offer Restore. */
  currentVersion?: number;
  /** Whether the active iteration is locked. Locked iterations show
   *  history but disable the Restore button. */
  iterationLocked?: boolean;
  /** Bumped by the parent when a `blueprint_update` WS event arrives so
   *  the drawer auto-refreshes the snapshot list. */
  invalidationToken?: number;
  /** Logged-in user's id, used for "You" personalization in author labels. */
  currentUserId?: string | null;
  onRestored?: (newVersion: number) => void;
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const delta = Math.max(0, Date.now() - t);
  const sec = Math.round(delta / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function BlueprintHistoryDrawer({
  open,
  onOpenChange,
  projectId,
  iterationId,
  currentContent,
  currentVersion,
  iterationLocked = false,
  invalidationToken,
  currentUserId,
  onRestored,
}: BlueprintHistoryDrawerProps) {
  const {
    snapshots,
    loading,
    error,
    hasMore,
    loadMore,
    setSelectedId,
    selectedDetail,
    selectedLoading,
    restore,
    restoring,
  } = useBlueprintHistory({
    projectId,
    iterationId,
    invalidationToken,
    enabled: open,
  });

  // Snapshot we're confirming a restore for. Inline (lives inside the
  // drawer) — a separate Dialog would z-fight with the Sheet's overlay.
  const [confirmRow, setConfirmRow] = useState<SnapshotListItem | null>(null);

  // Show "what this version changed vs the previous version" so the chip
  // and the diff view describe the same thing. ``diff_from_previous`` is
  // what `update_section` records on every write — old/new for the
  // section(s) that changed.
  const detailDiff = useMemo(() => {
    if (!selectedDetail) return null;
    const dfp = selectedDetail.diff_from_previous;
    if (!dfp || Object.keys(dfp).length === 0) return null;
    const old: Record<string, string> = {};
    const next: Record<string, string> = {};
    for (const [slug, change] of Object.entries(dfp)) {
      old[slug] = change.old || '';
      next[slug] = change.new || '';
    }
    return { old, new: next };
  }, [selectedDetail]);

  // Sections that would change if the user clicks Restore on a row — i.e.
  // diff between the candidate snapshot and the current live blueprint.
  const sectionsThatWillChange = useMemo(() => {
    if (!confirmRow) return [];
    const target = (confirmRow.id === selectedDetail?.id ? selectedDetail.content : null) ?? null;
    // We may not have the candidate's content cached yet. Fall back to the
    // intersection of currentContent slugs to keep the wording safe.
    if (!target) return [];
    const out: string[] = [];
    const slugs = new Set([...Object.keys(target), ...Object.keys(currentContent || {})]);
    for (const slug of slugs) {
      if ((target[slug] || '') !== ((currentContent || {})[slug] || '')) out.push(slug);
    }
    return out.sort();
  }, [confirmRow, selectedDetail, currentContent]);

  // When the user confirms a row that wasn't previously expanded, we need
  // its content to render the "will change" list. Pull it via the hook.
  useEffect(() => {
    if (confirmRow && confirmRow.id !== selectedDetail?.id) {
      setSelectedId(confirmRow.id);
    }
  }, [confirmRow, selectedDetail, setSelectedId]);

  // Header content depends on which mode we're in.
  let headerTitle: React.ReactNode;
  let headerSubtitle: React.ReactNode;
  if (confirmRow) {
    headerTitle = (
      <>
        <button
          type="button"
          className="text-muted-foreground/70 hover:text-foreground/90"
          onClick={() => setConfirmRow(null)}
          aria-label="Cancel restore"
          disabled={restoring}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        Restore v{confirmRow.version_number}?
      </>
    );
    headerSubtitle = 'Review the change before restoring.';
  } else if (selectedDetail) {
    headerTitle = (
      <>
        <button
          type="button"
          className="text-muted-foreground/70 hover:text-foreground/90"
          onClick={() => setSelectedId(null)}
          aria-label="Back to history"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        v{selectedDetail.version_number} · {relativeTime(selectedDetail.created_at)}
      </>
    );
    headerSubtitle = `By ${labelForCreatedBy(selectedDetail.created_by, { currentUserId, serverLabel: selectedDetail.created_by_label })}`;
  } else {
    headerTitle = (
      <>
        <HistoryIcon className="h-4 w-4 text-muted-foreground" />
        Blueprint history
      </>
    );
    headerSubtitle = iterationLocked
      ? 'Iteration is locked — restore is disabled.'
      : 'Pick a version to view the change, or restore.';
  }

  const doRestore = async () => {
    if (!confirmRow) return;
    const idToRestore = confirmRow.id;
    await restore(idToRestore, {
      onRestored: (v) => {
        onRestored?.(v);
        setConfirmRow(null);
        setSelectedId(null);
        onOpenChange(false);
      },
    });
  };

  // Reset the inline confirmation when the drawer closes (via the X, the
  // overlay click, or the parent toggling `open`). Done in the change
  // handler instead of a useEffect to avoid the set-state-in-effect lint
  // rule.
  const handleOpenChange = (next: boolean) => {
    if (!next) setConfirmRow(null);
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border/70 px-4 py-3 space-y-1">
          <SheetTitle className="flex items-center gap-2 text-sm font-medium">
            {headerTitle}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground/70">
            {headerSubtitle}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-3 rounded-md border border-destructive/20 bg-destructive/[0.05] px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {confirmRow ? (
            <RestoreConfirmPane
              row={confirmRow}
              currentUserId={currentUserId}
              loading={selectedLoading && (!selectedDetail || selectedDetail.id !== confirmRow.id)}
              willChange={sectionsThatWillChange}
              detail={selectedDetail && selectedDetail.id === confirmRow.id ? selectedDetail : null}
              restoring={restoring}
              onCancel={() => setConfirmRow(null)}
              onConfirm={doRestore}
            />
          ) : selectedDetail ? (
            <div className="p-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Changes introduced in this version.
              </div>
              {selectedLoading ? (
                <div className="text-sm text-muted-foreground/70">Loading diff…</div>
              ) : detailDiff ? (
                <BlueprintDiff oldContent={detailDiff.old} newContent={detailDiff.new} />
              ) : (
                <div className="text-sm text-muted-foreground/70">
                  No recorded changes — this is the initial version of the iteration.
                </div>
              )}
              <div className="pt-2">
                {currentVersion !== undefined &&
                selectedDetail.version_number === currentVersion ? (
                  <div className="w-full rounded-md bg-success/10 border border-success/30 px-3 py-2 text-xs text-success/85 text-center">
                    This is the current blueprint state — nothing to restore.
                  </div>
                ) : (
                  <Button
                    size="sm"
                    disabled={iterationLocked || restoring}
                    onClick={() => {
                      const row = snapshots.find((s) => s.id === selectedDetail.id) || null;
                      setConfirmRow(row);
                    }}
                    className="w-full"
                  >
                    {iterationLocked ? (
                      <>
                        <Lock className="h-3 w-3 mr-1.5" />
                        Iteration locked
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3 w-3 mr-1.5" />
                        Restore v{selectedDetail.version_number}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {snapshots.map((s) => {
                const author = labelForCreatedBy(s.created_by, {
                  currentUserId,
                  serverLabel: s.created_by_label,
                });
                const isCurrent =
                  currentVersion !== undefined && s.version_number === currentVersion;
                return (
                  <li
                    key={s.id}
                    className={
                      'px-4 py-3 transition-colors ' +
                      (isCurrent
                        ? 'bg-success/[0.04] border-l-2 border-success/50'
                        : 'hover:bg-foreground/[0.04]')
                    }
                  >
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => setSelectedId(s.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground/95">
                            v{s.version_number}
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center rounded-full bg-success/15 text-success text-[10px] font-medium px-1.5 py-0.5 tracking-wide">
                              Current
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
                          {relativeTime(s.created_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{author}</div>
                      {s.changed_sections.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {s.changed_sections.map((slug) => (
                            <span
                              key={slug}
                              className="inline-flex items-center rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {SECTION_LABELS[slug] || slug}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                    {!isCurrent && (
                      <div className="mt-2 flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={iterationLocked || restoring}
                          onClick={() => setConfirmRow(s)}
                          className="h-7 text-xs"
                          title={iterationLocked ? 'Iteration is locked' : 'Restore this version'}
                        >
                          {iterationLocked ? (
                            <Lock className="h-3 w-3 mr-1" />
                          ) : (
                            <RotateCcw className="h-3 w-3 mr-1" />
                          )}
                          Restore
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
              {snapshots.length === 0 && !loading && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground/70">
                  No history yet.
                </li>
              )}
              {hasMore && (
                <li className="px-4 py-3 text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={loadMore}
                    disabled={loading}
                    className="text-xs"
                  >
                    {loading ? 'Loading…' : 'Load older'}
                  </Button>
                </li>
              )}
              {loading && snapshots.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-muted-foreground/70">Loading…</li>
              )}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface RestoreConfirmPaneProps {
  row: SnapshotListItem;
  currentUserId?: string | null;
  loading: boolean;
  detail: SnapshotDetail | null;
  willChange: string[];
  restoring: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function RestoreConfirmPane({
  row,
  currentUserId,
  loading,
  detail,
  willChange,
  restoring,
  onCancel,
  onConfirm,
}: RestoreConfirmPaneProps) {
  const author = labelForCreatedBy(row.created_by, {
    currentUserId,
    serverLabel: row.created_by_label,
  });

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-md border border-warning/30 bg-warning/[0.06] p-3 flex gap-2">
        <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <div className="text-xs text-amber-100/85 leading-relaxed">
          Restoring will replace the current blueprint with the contents of{' '}
          <span className="font-medium">v{row.version_number}</span>. A new snapshot is created
          automatically, so you can roll back to where you are now.
        </div>
      </div>

      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-muted-foreground/70">Author</dt>
        <dd className="text-foreground/90">{author}</dd>
        <dt className="text-muted-foreground/70">Saved</dt>
        <dd className="text-foreground/90">{relativeTime(row.created_at)}</dd>
        {row.changed_sections.length > 0 && (
          <>
            <dt className="text-muted-foreground/70">Original change</dt>
            <dd className="text-foreground/90">
              {row.changed_sections.map((s) => SECTION_LABELS[s] || s).join(', ')}
            </dd>
          </>
        )}
      </dl>

      <div>
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
          What will change in your current blueprint
        </div>
        {loading || !detail ? (
          <div className="text-xs text-muted-foreground/70">Computing diff…</div>
        ) : willChange.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            This version matches your current blueprint exactly — restoring is a no-op.
          </div>
        ) : (
          <ul className="space-y-1 text-xs">
            {willChange.map((slug) => (
              <li
                key={slug}
                className="flex items-center gap-2 rounded bg-foreground/[0.05] px-2 py-1.5 text-foreground/95"
              >
                <RotateCcw className="h-3 w-3 text-warning/80" />
                {SECTION_LABELS[slug] || slug}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground/70 leading-relaxed">
        The voice agent&apos;s deletion memory for this iteration is cleared so it won&apos;t
        silently re-strip restored content on its next extraction.
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={restoring}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={restoring || (!loading && willChange.length === 0)}
        >
          {restoring ? 'Restoring…' : `Restore v${row.version_number}`}
        </Button>
      </div>
    </div>
  );
}
