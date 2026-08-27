import type { Board, Card } from '@/hooks/use-board';
import type { BoardGroupBy } from '@/lib/preferences';
import { formatWaveHeader } from '@/components/session/completion-wizard-helpers';
import { Layers, Rocket, type LucideIcon } from 'lucide-react';

/**
 * A horizontal swim lane in the board view. Lanes are derived client-side
 * from card metadata (wave, assignee, priority, …). Each lane carries a
 * `cardIds` set so the board can split each pipeline column into the cells
 * that fall under each lane without re-running per-axis logic in render.
 */
export interface Lane {
  key: string;
  label: string;
  subLabel?: string;
  /** Optional Tailwind class for a small swatch in the lane header. */
  swatchClass?: string;
  /**
   * When set, the lane header renders a richer chip (colored bg + icon +
   * `badgeNumeral`) instead of the plain dot. Currently used by wave lanes.
   */
  badgeClass?: string;
  badgeNumeral?: string;
  icon?: LucideIcon;
  cardIds: Set<string>;
}

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;
const PRIORITY_SWATCH: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
};

interface AssigneeInfo {
  id: string | null;
  name: string;
}

/**
 * Derive lanes from the current (already-filtered) board for a given axis.
 *
 * Returns a single "all" lane when groupBy is "off" so the BoardView can use
 * a uniform render path. The order of lanes is the visual order in the UI.
 *
 * Cards without a value for the axis (no assignee, no priority…) go to a
 * trailing "unset" lane so they're never lost; the lane is hidden by the UI
 * if it ends up empty.
 */
export function deriveLanes(board: Board, groupBy: BoardGroupBy): Lane[] {
  const allCards: Card[] = board.columns.flatMap((c) => c.cards);

  if (groupBy === 'off' || allCards.length === 0) {
    return [
      {
        key: 'all',
        label: '',
        cardIds: new Set(allCards.map((c) => c.id)),
      },
    ];
  }

  switch (groupBy) {
    case 'wave':
      return buildWaveLanes(allCards);
    case 'assignee':
      return buildAssigneeLanes(allCards);
    case 'priority':
      return buildPriorityLanes(allCards);
    case 'project':
      return buildProjectLanes(allCards);
    case 'label':
      return buildLabelLanes(allCards);
    case 'parent':
      return buildParentLanes(allCards);
    default:
      return [
        {
          key: 'all',
          label: '',
          cardIds: new Set(allCards.map((c) => c.id)),
        },
      ];
  }
}

/**
 * Per-wave visual identity. Stable, cycles by `wave % length` so adjacent
 * waves get distinct hues but the colors remain deterministic across renders.
 * Wave 0 anchors on the app primary so the kickoff wave always reads as the
 * "main" lane regardless of how many waves a project ends up with.
 */
const WAVE_PALETTE: Array<{ badgeClass: string; swatchClass: string }> = [
  { badgeClass: 'bg-primary/15 text-primary', swatchClass: 'bg-primary' },
  { badgeClass: 'bg-violet-500/15 text-violet-300', swatchClass: 'bg-violet-500' },
  { badgeClass: 'bg-amber-500/15 text-amber-300', swatchClass: 'bg-amber-500' },
  { badgeClass: 'bg-emerald-500/15 text-emerald-300', swatchClass: 'bg-emerald-500' },
  { badgeClass: 'bg-pink-500/15 text-pink-300', swatchClass: 'bg-pink-500' },
  { badgeClass: 'bg-sky-500/15 text-sky-300', swatchClass: 'bg-sky-500' },
];

function buildWaveLanes(cards: Card[]): Lane[] {
  const waves = new Map<number, string[]>();
  const unwaved: string[] = [];
  for (const card of cards) {
    if (typeof card.wave === 'number') {
      const list = waves.get(card.wave) ?? [];
      list.push(card.id);
      waves.set(card.wave, list);
    } else {
      unwaved.push(card.id);
    }
  }

  const lanes: Lane[] = Array.from(waves.entries())
    .sort(([a], [b]) => a - b)
    .map(([wave, ids]) => {
      const palette = WAVE_PALETTE[wave % WAVE_PALETTE.length]!;
      return {
        key: `wave:${wave}`,
        label: `Wave ${wave}`,
        subLabel: formatWaveHeader(wave, ids.length),
        swatchClass: palette.swatchClass,
        badgeClass: palette.badgeClass,
        badgeNumeral: `W${wave}`,
        // Wave 0 is the parallel kickoff (rocket); subsequent waves stack on
        // their predecessor (layers). One distinction is enough — we don't
        // need a different icon per wave number.
        icon: wave === 0 ? Rocket : Layers,
        cardIds: new Set(ids),
      };
    });

  if (unwaved.length > 0) {
    lanes.push({
      key: 'wave:unwaved',
      label: 'Unwaved',
      subLabel: `${unwaved.length} ${unwaved.length === 1 ? 'card' : 'cards'} without a wave`,
      swatchClass: 'bg-white/30',
      cardIds: new Set(unwaved),
    });
  }

  return lanes;
}

function buildAssigneeLanes(cards: Card[]): Lane[] {
  const buckets = new Map<string, { info: AssigneeInfo; ids: string[] }>();
  for (const card of cards) {
    const key = card.assignee_id ?? '__unassigned__';
    const name = card.assignee_id
      ? card.assignee_name || card.assignee_email || 'Unknown'
      : 'Unassigned';
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.ids.push(card.id);
    } else {
      buckets.set(key, { info: { id: card.assignee_id ?? null, name }, ids: [card.id] });
    }
  }

  return Array.from(buckets.entries())
    .sort(([keyA, a], [keyB, b]) => {
      // Unassigned always last.
      if (keyA === '__unassigned__') return 1;
      if (keyB === '__unassigned__') return -1;
      return a.info.name.localeCompare(b.info.name);
    })
    .map(([key, { info, ids }]) => ({
      key: `assignee:${key}`,
      label: info.name,
      subLabel: `${ids.length} ${ids.length === 1 ? 'card' : 'cards'}`,
      cardIds: new Set(ids),
    }));
}

function buildPriorityLanes(cards: Card[]): Lane[] {
  const buckets = new Map<string, string[]>();
  for (const card of cards) {
    const key = card.priority ?? '__none__';
    const list = buckets.get(key) ?? [];
    list.push(card.id);
    buckets.set(key, list);
  }

  const orderedKeys = [...PRIORITY_ORDER, '__none__'];
  const lanes: Lane[] = [];
  for (const key of orderedKeys) {
    const ids = buckets.get(key);
    if (!ids || ids.length === 0) continue;
    const isNone = key === '__none__';
    lanes.push({
      key: `priority:${key}`,
      label: isNone ? 'No priority' : capitalize(key),
      subLabel: `${ids.length} ${ids.length === 1 ? 'card' : 'cards'}`,
      swatchClass: isNone ? 'bg-white/20' : (PRIORITY_SWATCH[key] ?? 'bg-white/30'),
      cardIds: new Set(ids),
    });
  }
  return lanes;
}

function buildProjectLanes(cards: Card[]): Lane[] {
  const buckets = new Map<string, { name: string; ids: string[] }>();
  for (const card of cards) {
    const id = card.project_id ?? '__noproject__';
    const name = card.project_name ?? 'Unknown project';
    const bucket = buckets.get(id);
    if (bucket) {
      bucket.ids.push(card.id);
    } else {
      buckets.set(id, { name, ids: [card.id] });
    }
  }

  return Array.from(buckets.entries())
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))
    .map(([id, { name, ids }]) => ({
      key: `project:${id}`,
      label: name,
      subLabel: `${ids.length} ${ids.length === 1 ? 'card' : 'cards'}`,
      cardIds: new Set(ids),
    }));
}

function buildLabelLanes(cards: Card[]): Lane[] {
  // v1 uses primary-label assignment: a card with multiple labels appears in
  // its first label's lane only. Multi-lane (ghost-card) rendering is a
  // follow-up — tracked in Phase 2 of the board UX plan.
  const buckets = new Map<string, string[]>();
  const unlabeled: string[] = [];
  for (const card of cards) {
    const first = card.labels?.[0];
    if (first) {
      const list = buckets.get(first) ?? [];
      list.push(card.id);
      buckets.set(first, list);
    } else {
      unlabeled.push(card.id);
    }
  }

  const lanes: Lane[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, ids]) => ({
      key: `label:${label}`,
      label,
      subLabel: `${ids.length} ${ids.length === 1 ? 'card' : 'cards'}`,
      cardIds: new Set(ids),
    }));

  if (unlabeled.length > 0) {
    lanes.push({
      key: 'label:__none__',
      label: 'Unlabeled',
      subLabel: `${unlabeled.length} ${unlabeled.length === 1 ? 'card' : 'cards'}`,
      swatchClass: 'bg-white/20',
      cardIds: new Set(unlabeled),
    });
  }

  return lanes;
}

function buildParentLanes(cards: Card[]): Lane[] {
  // Build the parent-id → lane mapping. Lookup of a parent's friendly_id +
  // title comes from the same card list (parent is itself a card).
  const cardById = new Map(cards.map((c) => [c.id, c] as const));
  const buckets = new Map<string, string[]>();
  for (const card of cards) {
    const key = card.parent_card_id ?? '__top__';
    const list = buckets.get(key) ?? [];
    list.push(card.id);
    buckets.set(key, list);
  }

  return Array.from(buckets.entries())
    .sort(([keyA], [keyB]) => {
      if (keyA === '__top__') return -1;
      if (keyB === '__top__') return 1;
      const a = cardById.get(keyA);
      const b = cardById.get(keyB);
      return (a?.title ?? '').localeCompare(b?.title ?? '');
    })
    .map(([key, ids]) => {
      if (key === '__top__') {
        return {
          key: 'parent:top',
          label: 'Top-level',
          subLabel: `${ids.length} ${ids.length === 1 ? 'card' : 'cards'} with no parent`,
          swatchClass: 'bg-white/20',
          cardIds: new Set(ids),
        };
      }
      const parent = cardById.get(key);
      const parentLabel = parent
        ? `${parent.friendly_id ?? parent.id.slice(0, 6)} · ${parent.title}`
        : `Parent ${key.slice(0, 6)}`;
      return {
        key: `parent:${key}`,
        label: parentLabel,
        subLabel: `${ids.length} ${ids.length === 1 ? 'child' : 'children'}`,
        cardIds: new Set(ids),
      };
    });
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/* ───── Lane summary chips ─────────────────────────────────────────── */

export interface LanePrioritySummary {
  priority: 'critical' | 'high' | 'medium' | 'low' | 'none';
  swatchClass: string;
  label: string;
  count: number;
}

const PRIORITY_SUMMARY_ORDER: LanePrioritySummary['priority'][] = [
  'critical',
  'high',
  'medium',
  'low',
  'none',
];

const PRIORITY_LABEL: Record<LanePrioritySummary['priority'], string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'No priority',
};

/**
 * Per-lane priority breakdown. Returns one entry per priority bucket that
 * has at least one card, in canonical critical → none order.
 */
export function summarisePriorities(cards: Card[]): LanePrioritySummary[] {
  const counts: Record<LanePrioritySummary['priority'], number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    none: 0,
  };
  for (const card of cards) {
    const key = (card.priority as LanePrioritySummary['priority'] | undefined) ?? 'none';
    if (key in counts) counts[key] += 1;
    else counts.none += 1;
  }
  return PRIORITY_SUMMARY_ORDER.filter((p) => counts[p] > 0).map((p) => ({
    priority: p,
    swatchClass: p === 'none' ? 'bg-white/25' : (PRIORITY_SWATCH[p] ?? 'bg-white/25'),
    label: PRIORITY_LABEL[p],
    count: counts[p],
  }));
}
