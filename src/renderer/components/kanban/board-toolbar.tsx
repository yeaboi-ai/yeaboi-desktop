"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ChevronDown, Check, HelpCircle, LayoutGrid, Rows3, Rows4, Settings } from "lucide-react";
import { BOARD_SORT_OPTIONS } from "@/lib/board-sort";
import type { BoardGroupBy, BoardSortKey } from "@/lib/preferences";
import { SavedViews } from "./saved-views";

export type ViewMode = "board" | "list";

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

/* ── Custom dropdown (single-select) ─────────────────────────────── */

interface DropdownOption {
  value: string;
  label: string;
}

export function FilterDropdown({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-8 flex items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
          value
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="truncate max-w-[140px]">{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
          <button
            type="button"
            onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
              !value ? "text-foreground bg-accent" : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            }`}
          >
            <Check className={`h-3.5 w-3.5 shrink-0 ${!value ? "opacity-100" : "opacity-0"}`} />
            {placeholder}
          </button>

          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                value === opt.value
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Check className={`h-3.5 w-3.5 shrink-0 ${value === opt.value ? "opacity-100" : "opacity-0"}`} />
              <span className="truncate">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Multi-select dropdown ───────────────────────────────────────── */

function MultiFilterDropdown({
  values,
  onChange,
  options,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: DropdownOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };

  const label =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? options.find((o) => o.value === values[0])?.label ?? values[0]
        : `${values.length} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`h-8 flex items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
          values.length > 0
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="truncate max-w-[140px]">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] left-0 z-50 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50"
            >
              <span className="h-3.5 w-3.5 shrink-0" />
              Clear selection
            </button>
          )}

          {options.map((opt) => {
            const checked = values.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                  checked
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${checked ? "opacity-100" : "opacity-0"}`} />
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Sort dropdown ────────────────────────────────────────────────── */

function SortDropdown({
  value,
  onChange,
}: {
  value: BoardSortKey;
  onChange: (v: BoardSortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = BOARD_SORT_OPTIONS.find((o) => o.key === value) ?? BOARD_SORT_OPTIONS[0]!;
  const active = value !== "manual";

  // Group options by their `group` field, preserving the order in BOARD_SORT_OPTIONS.
  const groups: { name: string; options: typeof BOARD_SORT_OPTIONS }[] = [];
  for (const opt of BOARD_SORT_OPTIONS) {
    const groupName = opt.group ?? "";
    let bucket = groups.find((g) => g.name === groupName);
    if (!bucket) {
      bucket = { name: groupName, options: [] };
      groups.push(bucket);
    }
    bucket.options.push(opt);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Sort: ${current.label}`}
        className={`h-8 flex items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
          active
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate max-w-[160px]">{active ? current.label : "Sort"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 min-w-[220px] max-h-[360px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
          {groups.map((group, i) => (
            <div key={group.name || `g-${i}`}>
              {i > 0 && <div className="my-1 border-t border-border/50" />}
              {group.name && (
                <div className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  {group.name}
                </div>
              )}
              {group.options.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    onChange(opt.key);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    value === opt.key
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  }`}
                >
                  <Check
                    className={`h-3.5 w-3.5 shrink-0 ${value === opt.key ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Group-by dropdown ────────────────────────────────────────────── */

const GROUP_BY_OPTIONS: { value: BoardGroupBy; label: string; description?: string }[] = [
  { value: "off", label: "None", description: "Flat columns" },
  { value: "wave", label: "Wave", description: "Execution order from planning" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "project", label: "Project" },
  { value: "label", label: "Label" },
  { value: "parent", label: "Parent" },
];

function GroupByDropdown({
  value,
  onChange,
}: {
  value: BoardGroupBy;
  onChange: (v: BoardGroupBy) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = GROUP_BY_OPTIONS.find((o) => o.value === value) ?? GROUP_BY_OPTIONS[0]!;
  const active = value !== "off";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Group by: ${current.label}`}
        className={`h-8 flex items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring ${
          active
            ? "border-primary/40 bg-primary/10 text-foreground"
            : "border-border bg-background text-muted-foreground hover:text-foreground"
        }`}
      >
        <Rows4 className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="truncate max-w-[140px]">{active ? current.label : "Group by"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-[calc(100%+4px)] right-0 z-50 min-w-[200px] max-h-[360px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg py-1 animate-in fade-in-0 zoom-in-95">
          {GROUP_BY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full flex items-start gap-2 px-3 py-1.5 text-sm transition-colors ${
                value === opt.value
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              <Check
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  value === opt.value ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="flex flex-col items-start text-left">
                <span className="truncate">{opt.label}</span>
                {opt.description && (
                  <span className="text-[10px] text-muted-foreground/60">
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Toolbar ──────────────────────────────────────────────────────── */

interface BoardToolbarProps {
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
  search: string;
  onSearchChange: (v: string) => void;
  priorityFilter: string;
  onPriorityFilterChange: (v: string) => void;
  projectFilter: string;
  onProjectFilterChange: (v: string) => void;
  projectOptions: [string, string][];
  sessionFilter: string;
  onSessionFilterChange: (v: string) => void;
  sessionOptions: { id: string; title: string | null }[];
  labelFilter: string[];
  onLabelFilterChange: (v: string[]) => void;
  labelOptions: string[];
  assigneeFilter: string;
  onAssigneeFilterChange: (v: string) => void;
  assigneeOptions: { id: string; name: string }[];
  density?: "comfortable" | "compact";
  onDensityChange?: (d: "comfortable" | "compact") => void;
  sortBy?: BoardSortKey;
  onSortByChange?: (v: BoardSortKey) => void;
  groupBy?: BoardGroupBy;
  onGroupByChange?: (v: BoardGroupBy) => void;
  currentViewQuery?: string;
  onApplyView?: (query: string) => void;
  onShowHelp?: () => void;
  onShowSettings?: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

// Forward-ref Input for the search field so the `/` shortcut can focus it.
const SearchInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
  function SearchInputInner(props, ref) {
    return <Input {...props} ref={ref} />;
  },
);

export function BoardToolbar({
  view,
  onViewChange,
  search,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  projectFilter,
  onProjectFilterChange,
  sessionFilter,
  onSessionFilterChange,
  projectOptions,
  sessionOptions,
  labelFilter,
  onLabelFilterChange,
  labelOptions,
  assigneeFilter,
  onAssigneeFilterChange,
  assigneeOptions,
  density = "comfortable",
  onDensityChange,
  sortBy = "manual",
  onSortByChange,
  groupBy = "off",
  onGroupByChange,
  currentViewQuery,
  onApplyView,
  onShowHelp,
  onShowSettings,
  searchInputRef,
}: BoardToolbarProps) {
  const hasFilters =
    search || priorityFilter || projectFilter || sessionFilter || labelFilter.length > 0 || assigneeFilter;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* View toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => onViewChange("board")}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "board" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="3" height="12" rx="1" fill="currentColor" />
              <rect x="5.5" y="1" width="3" height="12" rx="1" fill="currentColor" />
              <rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor" />
            </svg>
            Board
          </span>
        </button>
        <button
          onClick={() => onViewChange("list")}
          className={`px-3 py-1.5 text-sm font-medium border-l border-border transition-colors ${
            view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="2" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="1" y="6" width="12" height="2" rx="1" fill="currentColor" />
              <rect x="1" y="10" width="12" height="2" rx="1" fill="currentColor" />
            </svg>
            List
          </span>
        </button>
      </div>

      {/* Search */}
      <SearchInput
        ref={searchInputRef}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search cards… (press /)"
        className="w-56 h-8 text-sm"
      />

      {/* Project filter */}
      <FilterDropdown
        value={projectFilter}
        onChange={onProjectFilterChange}
        placeholder="All Projects"
        options={projectOptions.map(([id, name]) => ({ value: id, label: name }))}
      />

      {/* Session filter */}
      {sessionOptions.length > 0 && (
        <FilterDropdown
          value={sessionFilter}
          onChange={onSessionFilterChange}
          placeholder="All Sessions"
          options={sessionOptions.map((s) => ({ value: s.id, label: s.title || "Untitled Session" }))}
        />
      )}

      {/* Priority filter */}
      <FilterDropdown
        value={priorityFilter}
        onChange={onPriorityFilterChange}
        placeholder="All priorities"
        options={PRIORITIES.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
      />

      {/* Label filter (multi-select) */}
      {labelOptions.length > 0 && (
        <MultiFilterDropdown
          values={labelFilter}
          onChange={onLabelFilterChange}
          placeholder="All labels"
          options={labelOptions.map((l) => ({ value: l, label: l }))}
        />
      )}

      {/* Assignee filter */}
      <FilterDropdown
        value={assigneeFilter}
        onChange={onAssigneeFilterChange}
        placeholder="All assignees"
        options={assigneeOptions.map((a) => ({ value: a.id, label: a.name }))}
      />

      {/* Clear filters */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearchChange("");
            onPriorityFilterChange("");
            onProjectFilterChange("");
            onSessionFilterChange("");
            onLabelFilterChange([]);
            onAssigneeFilterChange("");
          }}
          className="h-8 text-xs"
        >
          Clear
        </Button>
      )}

      {/* Trailing controls — sort, saved views, density, help — pushed to the right */}
      <div className="ml-auto flex items-center gap-2">
        {onGroupByChange && (
          <GroupByDropdown value={groupBy} onChange={onGroupByChange} />
        )}
        {onSortByChange && (
          <SortDropdown value={sortBy} onChange={onSortByChange} />
        )}
        {currentViewQuery !== undefined && onApplyView && (
          <SavedViews currentQuery={currentViewQuery} onApply={onApplyView} />
        )}
        {onDensityChange && (
          <div className="flex rounded-md border border-border overflow-hidden">
            <button
              type="button"
              aria-pressed={density === "comfortable"}
              onClick={() => onDensityChange("comfortable")}
              title="Comfortable density"
              className={`h-8 px-2 transition-colors ${
                density === "comfortable"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-pressed={density === "compact"}
              onClick={() => onDensityChange("compact")}
              title="Compact density"
              className={`h-8 px-2 border-l border-border transition-colors ${
                density === "compact"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {onShowSettings && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowSettings}
            className="h-8 px-2"
            aria-label="Board settings"
            title="Board settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        )}
        {onShowHelp && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowHelp}
            className="h-8 px-2"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
