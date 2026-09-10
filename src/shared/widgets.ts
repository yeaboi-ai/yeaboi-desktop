// The home dashboard's widgets: which exist, which are on, and in what order.
//
// Pure — no Electron import and no React — so main can clamp the stored blob,
// the renderer can clamp the same blob again against the widgets it actually
// draws (`known`), and the tests cover both in the node lane.

/** Every widget id the app ships. The renderer maps each to a component, so a
 *  typo fails the type check rather than drawing a hole. */
export const WIDGET_IDS = [
  'boards',
  'shared',
  'whats-new',
  'usage',
  'coming-up',
  'retro-actions',
  'music',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);
}

/** A widget's footprint, in grid tracks. `w` is clamped against however many
 *  columns the window is showing; `h` is rows of {@link WIDGET_ROW}. */
export interface WidgetSize {
  w: number;
  h: number;
}

/** Height of one row track, in px, and the gap between them. The renderer sets
 *  the grid from these; they live here so the clamps and the CSS agree. */
export const WIDGET_ROW = 24;
export const WIDGET_GAP = 12;

export const MIN_SIZE: WidgetSize = { w: 1, h: 3 };
export const MAX_SIZE: WidgetSize = { w: 4, h: 12 };

export interface WidgetPrefs {
  /** The widgets on the dashboard, in the order they are drawn. */
  order: WidgetId[];
  /** Widgets switched off. Kept rather than removed from `order`, so turning
   *  one back on returns it to where it was rather than to the end. */
  hidden: WidgetId[];
  /** How much room each one takes. A widget with no entry gets its default. */
  sizes: Partial<Record<WidgetId, WidgetSize>>;
}

/** What each widget asks for before anyone has resized it. */
export const WIDGET_SIZES: Record<WidgetId, WidgetSize> = {
  boards: { w: 1, h: 4 },
  shared: { w: 1, h: 3 },
  'whats-new': { w: 1, h: 6 },
  usage: { w: 1, h: 5 },
  'coming-up': { w: 1, h: 4 },
  'retro-actions': { w: 1, h: 4 },
  music: { w: 1, h: 5 },
};

export const WIDGET_DEFAULTS: WidgetPrefs = {
  order: [...WIDGET_IDS],
  hidden: [],
  sizes: {},
};

/** One widget's footprint: what was stored, else what it asks for, clamped.
 *  `columns` is what the window can actually show — a 3-wide widget in a
 *  2-column window is 2 wide, without the stored preference being rewritten. */
export function widgetSize(prefs: WidgetPrefs, id: WidgetId, columns = MAX_SIZE.w): WidgetSize {
  const stored = prefs.sizes[id] ?? WIDGET_SIZES[id];
  return {
    w: clamp(stored.w, MIN_SIZE.w, Math.min(MAX_SIZE.w, Math.max(1, columns))),
    h: clamp(stored.h, MIN_SIZE.h, MAX_SIZE.h),
  };
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, Math.round(value)));
}

/** `id` moved to `index` in the drawn order, as a patch. The index counts
 *  visible widgets, which is what the dashboard hands out; hidden ones keep
 *  their place around the move. */
export function moveWidget(prefs: WidgetPrefs, id: WidgetId, index: number): Partial<WidgetPrefs> {
  const shown = visibleWidgets(prefs).filter((other) => other !== id);
  const at = clamp(index, 0, shown.length);
  const target = shown[at];
  const rest = prefs.order.filter((other) => other !== id);
  const seam = target === undefined ? rest.length : rest.indexOf(target);
  return { order: [...rest.slice(0, seam), id, ...rest.slice(seam)] };
}

export function resizeWidget(
  prefs: WidgetPrefs,
  id: WidgetId,
  size: WidgetSize,
): Partial<WidgetPrefs> {
  return {
    sizes: {
      ...prefs.sizes,
      [id]: { w: clamp(size.w, MIN_SIZE.w, MAX_SIZE.w), h: clamp(size.h, MIN_SIZE.h, MAX_SIZE.h) },
    },
  };
}

/** Switch one widget on or off. Turning it on returns it to where it was. */
export function toggleWidget(prefs: WidgetPrefs, id: WidgetId, on: boolean): Partial<WidgetPrefs> {
  const off = prefs.hidden.filter((other) => other !== id);
  return { hidden: on ? off : [...off, id] };
}

/** The widgets to draw, in order: everything in `order` that is not hidden,
 *  then any widget the stored order predates. */
export function visibleWidgets(prefs: WidgetPrefs, known?: ReadonlySet<string>): WidgetId[] {
  const off = new Set(prefs.hidden);
  const draws = (id: WidgetId) => !off.has(id) && (!known || known.has(id));
  const missing = WIDGET_IDS.filter((id) => !prefs.order.includes(id));
  return [...prefs.order, ...missing].filter(draws);
}

/** Read a stored blob into preferences that will draw: unknown ids dropped,
 *  duplicates collapsed, and every shipped widget present exactly once. */
export function normalizeWidgetPrefs(raw: unknown): WidgetPrefs {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = (value: unknown): WidgetId[] => {
    const seen = new Set<WidgetId>();
    for (const item of Array.isArray(value) ? value : []) {
      if (isWidgetId(item)) seen.add(item);
    }
    return [...seen];
  };
  const order = ids(data['order']);
  return {
    // A widget added after this blob was written joins the end rather than
    // going undrawn.
    order: [...order, ...WIDGET_IDS.filter((id) => !order.includes(id))],
    hidden: ids(data['hidden']),
    sizes: sizes(data['sizes']),
  };
}

function sizes(value: unknown): Partial<Record<WidgetId, WidgetSize>> {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const out: Partial<Record<WidgetId, WidgetSize>> = {};
  for (const [id, size] of Object.entries(raw)) {
    if (!isWidgetId(id) || !size || typeof size !== 'object') continue;
    const { w, h } = size as { w?: unknown; h?: unknown };
    if (typeof w !== 'number' || typeof h !== 'number') continue;
    out[id] = { w: clamp(w, MIN_SIZE.w, MAX_SIZE.w), h: clamp(h, MIN_SIZE.h, MAX_SIZE.h) };
  }
  return out;
}

export function mergeWidgetPrefs(current: WidgetPrefs, patch: unknown): WidgetPrefs {
  const incoming = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  return normalizeWidgetPrefs({ ...current, ...incoming });
}
