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
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);
}

export interface WidgetPrefs {
  /** The widgets on the dashboard, in the order they are drawn. */
  order: WidgetId[];
  /** Widgets switched off. Kept rather than removed from `order`, so turning
   *  one back on returns it to where it was rather than to the end. */
  hidden: WidgetId[];
}

export const WIDGET_DEFAULTS: WidgetPrefs = {
  order: [...WIDGET_IDS],
  hidden: [],
};

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
  };
}

export function mergeWidgetPrefs(current: WidgetPrefs, patch: unknown): WidgetPrefs {
  const incoming = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  return normalizeWidgetPrefs({ ...current, ...incoming });
}
