// The Studio's section list: four areas, six items, and the mapping between an
// item and the `/studio/:area` segment that addresses it.
//
// Pure, so the route rules are covered in the node lane (test/studio-areas.test.ts).
// The shape mirrors lib/yeaboi/settings-tabs.ts — a list of groups, each with
// rows that are routes — because Studio wears the same frame as Settings.

export type StudioArea = 'blueprint' | 'planning' | 'agent' | 'tickets';

export type StudioItem =
  | 'blueprint:sections'
  | 'blueprint:templates'
  | 'planning:personas'
  | 'agent:harness'
  | 'tickets:templates'
  | 'tickets:generation';

export interface StudioRow {
  item: StudioItem;
  /** The `:area` segment this row is addressed by. */
  segment: string;
  label: string;
  description: string;
}

export interface StudioGroup {
  id: StudioArea;
  label: string;
  /** One line saying what the group configures. */
  description: string;
  rows: readonly StudioRow[];
}

export const STUDIO_GROUPS: readonly StudioGroup[] = [
  {
    id: 'blueprint',
    label: 'Blueprint',
    description: 'What gets planned',
    rows: [
      {
        item: 'blueprint:sections',
        segment: 'sections',
        label: 'Sections',
        description: 'Reusable parts of a planning blueprint',
      },
      {
        item: 'blueprint:templates',
        segment: 'templates',
        label: 'Templates',
        description: 'Combinations of sections for a planning style',
      },
    ],
  },
  {
    id: 'planning',
    label: 'Planning',
    description: 'How planning is run',
    rows: [
      {
        item: 'planning:personas',
        segment: 'personas',
        label: 'Personas',
        description: 'AI facilitators that run planning sessions',
      },
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    description: 'Autonomous code execution',
    rows: [
      {
        item: 'agent:harness',
        segment: 'harness',
        label: 'Project Harness',
        description: 'Per-project scaffold + GitHub setup',
      },
    ],
  },
  {
    id: 'tickets',
    label: 'Tickets',
    description: 'Output of planning',
    rows: [
      {
        item: 'tickets:templates',
        segment: 'ticket-templates',
        label: 'Templates',
        description: 'Field schema + layout for kanban tickets',
      },
      {
        item: 'tickets:generation',
        segment: 'generation',
        label: 'Generation',
        description: 'Presets, granularities and modifiers the wizard uses',
      },
    ],
  },
];

/** Every row, in list order — the order Up and Down move through. */
export const ALL_STUDIO_ROWS: readonly StudioRow[] = STUDIO_GROUPS.flatMap((g) => g.rows);

export const DEFAULT_STUDIO_ITEM: StudioItem = 'blueprint:templates';

export const STUDIO_LEAD =
  'How blueprints, planning sessions, agents and tickets are shaped before a session starts.';

/** The item a `/studio/:area` segment addresses, or the default when it names none. */
export function itemForSegment(segment: string | undefined): StudioItem {
  if (!segment) return DEFAULT_STUDIO_ITEM;
  return ALL_STUDIO_ROWS.find((r) => r.segment === segment)?.item ?? DEFAULT_STUDIO_ITEM;
}

/** The route that addresses an item. */
export function routeForItem(item: StudioItem): string {
  const row = ALL_STUDIO_ROWS.find((r) => r.item === item);
  return row ? `/studio/${row.segment}` : '/studio';
}
