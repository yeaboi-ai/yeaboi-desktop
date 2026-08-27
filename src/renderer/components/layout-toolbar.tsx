"use client";

import { useState, useRef, useEffect } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardPanelDef } from "@/hooks/use-project-layout";

interface HiddenPanelsMenuProps {
  hiddenPanels: DashboardPanelDef[];
  onShow: (panelId: string) => void;
}

export function HiddenPanelsMenu({ hiddenPanels, onShow }: HiddenPanelsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (hiddenPanels.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="xs"
        onClick={() => setOpen(!open)}
      >
        <Eye className="size-3" />
        <span>{hiddenPanels.length} hidden</span>
      </Button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-[100] min-w-[180px] rounded-lg border border-border bg-popover p-2 shadow-lg animate-scale-in">
          <p className="text-[10px] font-body font-medium tracking-[0.15em] uppercase text-muted-foreground/60 px-2 py-1.5">
            Hidden panels
          </p>
          {hiddenPanels.map((panel) => (
            <button
              key={panel.id}
              onClick={() => { onShow(panel.id); if (hiddenPanels.length === 1) setOpen(false); }}
              className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-left hover:bg-muted/50 transition-colors"
            >
              <Eye className="size-3.5 text-primary/70 shrink-0" />
              <span className="text-xs font-body text-foreground">
                {panel.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
