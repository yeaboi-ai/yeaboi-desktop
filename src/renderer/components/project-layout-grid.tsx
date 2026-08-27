'use client';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { Children, type ReactElement, type ReactNode } from 'react';
import {
  ResponsiveGridLayout,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout';
import { Maximize2, Minimize2, EyeOff, GripHorizontal } from 'lucide-react';

interface DashboardGridProps {
  layouts: ResponsiveLayouts;
  onLayoutChange: (layout: Layout, layouts: ResponsiveLayouts) => void;
  visiblePanelIds: string[];
  onHide: (panelId: string) => void;
  onToggleExpand: (panelId: string) => void;
  isExpanded: (panelId: string) => boolean;
  children: ReactNode;
}

export function DashboardGrid({
  layouts,
  onLayoutChange,
  visiblePanelIds,
  onHide,
  onToggleExpand,
  isExpanded,
  children,
}: DashboardGridProps) {
  const { containerRef, width } = useContainerWidth({ initialWidth: 1200 });

  const visibleSet = new Set(visiblePanelIds);

  const visibleChildren = Children.toArray(children).filter((child) => {
    const el = child as ReactElement;
    return el.key && visibleSet.has(String(el.key).replace(/^\.\$/, ''));
  });

  return (
    <div ref={containerRef} className="project-layout-grid">
      <ResponsiveGridLayout
        width={width}
        layouts={layouts}
        breakpoints={{ lg: 1200, md: 996, sm: 768 }}
        cols={{ lg: 12, md: 8, sm: 4 }}
        rowHeight={80}
        dragConfig={{ enabled: true, handle: '.panel-drag-handle' }}
        resizeConfig={{ enabled: true, handles: ['se', 'sw'] }}
        onLayoutChange={onLayoutChange}
        compactor={verticalCompactor}
        margin={[24, 24]}
        containerPadding={[0, 0]}
      >
        {visibleChildren.map((child) => {
          const el = child as ReactElement;
          const key = String(el.key).replace(/^\.\$/, '');
          const expanded = isExpanded(key);
          return (
            <div key={key} className="relative group/card">
              {/* Top-left: drag handle */}
              <div
                className="panel-drag-handle absolute -top-1 left-1/2 -translate-x-1/2 z-20 p-1 rounded-md hover:bg-white/[0.06] transition-all cursor-grab active:cursor-grabbing opacity-0 group-hover/card:opacity-100"
                title="Drag to move"
              >
                <GripHorizontal className="size-5 text-foreground/50" />
              </div>
              {/* Top-right: expand + hide */}
              <div className="absolute top-3 right-3 z-20 flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity duration-200">
                <button
                  onClick={() => onToggleExpand(key)}
                  className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title={expanded ? 'Collapse' : 'Expand'}
                >
                  {expanded ? (
                    <Minimize2 className="size-5 text-muted-foreground/60" />
                  ) : (
                    <Maximize2 className="size-5 text-muted-foreground/60" />
                  )}
                </button>
                <button
                  onClick={() => onHide(key)}
                  className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Hide panel"
                >
                  <EyeOff className="size-5 text-muted-foreground/60" />
                </button>
              </div>
              <div className="h-full overflow-auto">{el}</div>
            </div>
          );
        })}
      </ResponsiveGridLayout>
    </div>
  );
}
