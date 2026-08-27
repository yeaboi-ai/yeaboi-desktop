"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Layout, type LayoutItem, type ResponsiveLayouts } from "react-grid-layout";
import { useAppSetting } from "@/hooks/use-app-setting";

export interface DashboardPanelDef {
  id: string;
  label: string;
  /** Default width in grid columns at the lg breakpoint (1-12). Falls back
   *  to half-width if unset. md/sm sizes are derived proportionally. */
  defaultW?: number;
  /** Default height in row units (1 row = 80px). Falls back to 3. */
  defaultH?: number;
}

interface DashboardLayoutConfig {
  version: number;
  layouts: ResponsiveLayouts;
  hidden: string[];
}

const COLS: Record<string, number> = { lg: 12, md: 8, sm: 4 };
const DEFAULT_W: Record<string, number> = { lg: 6, md: 4, sm: 4 };
const MIN_W: Record<string, number> = { lg: 3, md: 2, sm: 2 };

/** Set resizeHandles per item: bottom-right only. */
function applyResizeHandles(layouts: ResponsiveLayouts): ResponsiveLayouts {
  const result: ResponsiveLayouts = {};
  for (const [bp, items] of Object.entries(layouts)) {
    if (!items) continue;
    result[bp] = items.map((item: LayoutItem) => ({
      ...item,
      resizeHandles: ["se", "sw"],
    }));
  }
  return result;
}

/** Derive (w, h) for a panel at a given breakpoint, honouring `defaultW` /
 *  `defaultH` when supplied, with a sensible fallback. md/sm breakpoints
 *  scale lg widths proportionally so a `defaultW: 12` at lg becomes
 *  full-width at md and sm too, while smaller tiles stack 2-up on md. */
function panelDimensions(panel: DashboardPanelDef, bp: string, cols: number) {
  const fallbackW = DEFAULT_W[bp] || Math.floor(cols / 2);
  const lgCols = COLS.lg || 12;
  const lgW = panel.defaultW ?? Math.floor(lgCols / 2);
  // Scale width proportionally to this breakpoint's column count.
  const scaledW = Math.max(MIN_W[bp] || 2, Math.min(cols, Math.round((lgW / lgCols) * cols)));
  const w = panel.defaultW != null ? scaledW : fallbackW;
  const h = panel.defaultH ?? 3;
  return { w, h };
}

/** Pack panels left-to-right with shelf-style row wrapping that respects
 *  per-panel widths. Returns the placed items in the order callers expect. */
function packPanels(panels: DashboardPanelDef[], bp: string, cols: number) {
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;
  return panels.map((p) => {
    const { w, h } = panelDimensions(p, bp, cols);
    if (cursorX + w > cols) {
      cursorX = 0;
      cursorY += rowH || 3;
      rowH = 0;
    }
    const item = {
      i: p.id,
      x: cursorX,
      y: cursorY,
      w,
      h,
      minW: MIN_W[bp] || 2,
      maxW: cols,
      minH: 2,
      maxH: 8,
    };
    cursorX += w;
    rowH = Math.max(rowH, h);
    return item;
  });
}

function generateDefaultLayouts(panels: DashboardPanelDef[]): ResponsiveLayouts {
  const result: ResponsiveLayouts = {};
  for (const [bp, cols] of Object.entries(COLS)) {
    result[bp] = packPanels(panels, bp, cols);
  }
  return result;
}

function reconcileLayouts(
  layouts: ResponsiveLayouts,
  panels: DashboardPanelDef[],
): ResponsiveLayouts {
  const panelIds = new Set(panels.map((p) => p.id));
  const result: ResponsiveLayouts = {};

  for (const [bp, items] of Object.entries(layouts)) {
    if (!items) continue;
    const cols = COLS[bp] || 4;
    const existing = items.filter((item: LayoutItem) => panelIds.has(item.i));
    const existingIds = new Set(existing.map((item: LayoutItem) => item.i));

    const newItems = panels
      .filter((p) => !existingIds.has(p.id))
      .map((p, idx) => {
        const maxY = existing.length > 0 ? Math.max(...existing.map((item: LayoutItem) => item.y + item.h)) : 0;
        const { w, h } = panelDimensions(p, bp, cols);
        return {
          i: p.id,
          x: (idx * w) % cols,
          y: maxY,
          w,
          h,
          minW: MIN_W[bp] || 2,
          maxW: cols,
          minH: 2,
          maxH: 8,
        };
      });

    result[bp] = [...existing, ...newItems];
  }

  return result;
}

export function useDashboardLayout(panels: DashboardPanelDef[], settingKey: string) {
  const { value: savedConfig, loading, save } = useAppSetting(settingKey);
  const [hidden, setHidden] = useState<string[]>([]);
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() =>
    generateDefaultLayouts(panels),
  );
  const [initialized, setInitialized] = useState(false);
  const skipNextLayoutChange = useRef(false);

  // Load saved config when it arrives
  useEffect(() => {
    if (loading || initialized) return;

    if (savedConfig) {
      try {
        const config: DashboardLayoutConfig = JSON.parse(savedConfig);
        if ((config.version === 2 || config.version === 3) && config.layouts) {
          const reconciled = applyResizeHandles(reconcileLayouts(config.layouts, panels));
          setLayouts(reconciled);
          setHidden(config.hidden || []);
          setInitialized(true);
          return;
        }
      } catch {
        // Invalid config, fall through to defaults
      }
    }

    setLayouts(applyResizeHandles(generateDefaultLayouts(panels)));
    setInitialized(true);
  }, [loading, savedConfig, panels, initialized]);

  const persist = useCallback(
    (newLayouts: ResponsiveLayouts, newHidden: string[]) => {
      const config: DashboardLayoutConfig = {
        version: 3,
        layouts: newLayouts,
        hidden: newHidden,
      };
      save(JSON.stringify(config));
    },
    [save],
  );

  const onLayoutChange = useCallback(
    (_layout: Layout, allLayouts: ResponsiveLayouts) => {
      if (skipNextLayoutChange.current) return;
      const withHandles = applyResizeHandles(allLayouts);
      setLayouts(withHandles);
      persist(withHandles, hidden);
    },
    [persist, hidden],
  );

  const hidePanel = useCallback(
    (panelId: string) => {
      setHidden((prev) => {
        const next = [...prev, panelId];
        persist(layouts, next);
        return next;
      });
    },
    [persist, layouts],
  );

  const showPanel = useCallback(
    (panelId: string) => {
      skipNextLayoutChange.current = true;
      setTimeout(() => { skipNextLayoutChange.current = false; }, 500);
      const panelDef = panels.find((p) => p.id === panelId);
      setLayouts((prevLayouts) => {
        const updated: ResponsiveLayouts = {};
        for (const [bp, items] of Object.entries(prevLayouts)) {
          if (!items) { updated[bp] = items; continue; }
          const cols = COLS[bp] || 4;
          const { w, h } = panelDef
            ? panelDimensions(panelDef, bp, cols)
            : { w: DEFAULT_W[bp] || Math.floor(cols / 2), h: 3 };
          const others = items.filter((it: LayoutItem) => it.i !== panelId);
          const maxY = others.length > 0 ? Math.max(...others.map((it: LayoutItem) => it.y + it.h)) : 0;
          const defaultItem = { i: panelId, w, h, x: 0, y: maxY, minW: MIN_W[bp] || 2, minH: 2, maxW: cols, maxH: 8 };
          const exists = items.some((it: LayoutItem) => it.i === panelId);
          updated[bp] = exists
            ? items.map((item: LayoutItem) => item.i === panelId ? { ...item, ...defaultItem } : item)
            : [...items, defaultItem];
        }
        const withHandles = applyResizeHandles(updated);
        persist(withHandles, hidden.filter((id) => id !== panelId));
        return withHandles;
      });
      setHidden((prev) => prev.filter((id) => id !== panelId));
    },
    [persist, hidden, panels],
  );

  const toggleExpand = useCallback(
    (panelId: string) => {
      setLayouts((prev) => {
        const next: ResponsiveLayouts = {};
        for (const [bp, items] of Object.entries(prev)) {
          if (!items) continue;
          const cols = COLS[bp] || 4;
          next[bp] = items.map((item: LayoutItem) => {
            if (item.i !== panelId) return item;
            // Toggle between 1-wide and full-width
            const defaultW = DEFAULT_W[bp] || Math.floor(cols / 2);
            const isExpanded = item.w >= cols;
            return { ...item, w: isExpanded ? defaultW : cols, h: isExpanded ? 3 : item.h };
          });
        }
        const withHandles = applyResizeHandles(next);
        persist(withHandles, hidden);
        return withHandles;
      });
    },
    [persist, hidden],
  );

  const isExpanded = useCallback(
    (panelId: string): boolean => {
      const lgLayout = layouts.lg;
      if (!lgLayout) return false;
      const item = lgLayout.find((i: LayoutItem) => i.i === panelId);
      return item ? item.w >= (COLS.lg || 4) : false;
    },
    [layouts],
  );

  const visiblePanels = useMemo(
    () => panels.filter((p) => !hidden.includes(p.id)),
    [panels, hidden],
  );

  const hiddenPanels = useMemo(
    () => panels.filter((p) => hidden.includes(p.id)),
    [panels, hidden],
  );

  /** Wipe customisations and recompute layout from each panel's `defaultW`
   *  / `defaultH`. Useful when panel defaults change underfoot — a saved
   *  layout from an older release otherwise pins outdated sizes. */
  const resetLayout = useCallback(() => {
    skipNextLayoutChange.current = true;
    setTimeout(() => { skipNextLayoutChange.current = false; }, 500);
    const fresh = applyResizeHandles(generateDefaultLayouts(panels));
    setLayouts(fresh);
    setHidden([]);
    persist(fresh, []);
  }, [panels, persist]);

  return {
    layouts,
    hidden,
    hiddenPanels,
    onLayoutChange,
    hidePanel,
    showPanel,
    toggleExpand,
    isExpanded,
    visiblePanels,
    resetLayout,
    loading: loading || !initialized,
  };
}
