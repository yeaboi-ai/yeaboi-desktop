'use client';

// What has run, newest first, narrowed to one mode by a row of plain words:
// the live one in the foreground, the rest muted. The rows are GlimpseList's.

import { GlimpseList } from '@/components/yeaboi/glimpse-list';
import { ALL_MODES, filterRecent, recentFilters } from '@/lib/home/menu';
import { sessionRows } from '@/lib/yeaboi/glimpse';
import type { ShapedSession } from '@/lib/yeaboi/sessions';

export function ModeFilter({
  options,
  value,
  onChange,
}: {
  options: { key: string; title: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  // One option is no choice; the word row appears once there is something to narrow.
  if (options.length <= 2) return null;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-body" role="group">
      {options.map((option) => {
        const live = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            aria-pressed={live}
            onClick={() => onChange(option.key)}
            className={`transition-colors ${live ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {option.title}
          </button>
        );
      })}
    </p>
  );
}

export function RecentList({
  rows,
  cards,
  filter,
  onFilter,
  empty,
  action,
}: {
  rows: ShapedSession[];
  cards: { key: string; title: string }[];
  filter: string;
  onFilter: (key: string) => void;
  empty: string;
  action?: { label: string; href: string };
}) {
  const options = recentFilters(cards, rows);
  const key = options.some((option) => option.key === filter) ? filter : ALL_MODES;
  return (
    <>
      <ModeFilter options={options} value={key} onChange={onFilter} />
      <div className={options.length > 2 ? 'mt-3' : ''}>
        <GlimpseList rows={sessionRows(filterRecent(rows, key))} empty={empty} action={action} />
      </div>
    </>
  );
}
