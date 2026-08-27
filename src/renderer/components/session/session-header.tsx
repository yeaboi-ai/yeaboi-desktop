"use client";

import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CheckCircle2, MoreVertical } from "lucide-react";

interface SessionHeaderProps {
  title: string | null;
  status: string;
  joinCode: string;
  onStatusChange?: (status: string) => void;
  onLeave?: () => void;
  isHost: boolean;
}

export function SessionHeader({ title, status, joinCode, onStatusChange, onLeave, isHost }: SessionHeaderProps) {
  const confirm = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const statusColors: Record<string, string> = {
    created: "bg-muted text-muted-foreground",
    lobby: "bg-info/20 text-info",
    live: "bg-success/20 text-success",
    paused: "bg-warning/20 text-warning",
    completed: "bg-purple-500/20 text-purple-400",
  };

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const canPause = isHost && status === "live";
  const canResume = isHost && status === "paused";
  const canEnd = isHost && (status === "live" || status === "paused");
  const showMenu = canPause || canResume || canEnd;

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border">
      {/* Left: title, status badge, join code */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">{title || "Planning Session"}</h2>
        <Badge className={statusColors[status] || ""}>{status}</Badge>
        <span className="text-xs text-muted-foreground font-mono">#{joinCode}</span>
      </div>

      {/* Right: complete button + menu + leave */}
      <div className="flex items-center gap-2">
        {canEnd && (
          <button
            onClick={async () => {
              const ok = await confirm({ title: "Wrap Up Session", message: "Wrap up this session? You'll review your blueprint, fill any gaps, and preview the tasks before finalizing.", confirmLabel: "Wrap up" });
              if (ok) {
                onStatusChange?.("reviewing");
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/15 text-success hover:bg-success/25 text-xs font-medium transition-colors border border-success/20"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete &amp; Generate Board
          </button>
        )}
        {showMenu && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
              title="Session options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 rounded-md border border-border bg-popover shadow-lg z-50 py-1">
                {canPause && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => { onStatusChange?.("paused"); setMenuOpen(false); }}
                  >
                    Pause Session
                  </button>
                )}
                {canResume && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    onClick={() => { onStatusChange?.("live"); setMenuOpen(false); }}
                  >
                    Resume Session
                  </button>
                )}
                {canEnd && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm text-success hover:bg-success/10 transition-colors"
                    onClick={async () => {
                      const ok = await confirm({ title: "Wrap Up Session", message: "Wrap up this session? You'll review your blueprint, fill any gaps, and preview the tasks before finalizing.", confirmLabel: "Wrap up" });
                      if (ok) {
                        onStatusChange?.("reviewing");
                      }
                      setMenuOpen(false);
                    }}
                  >
                    Complete &amp; Generate Board
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onLeave}
          className="text-xs font-body text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-secondary"
        >
          Leave
        </button>
      </div>
    </div>
  );
}
