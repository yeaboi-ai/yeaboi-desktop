"use client";

import { Check, Eye, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/providers/theme-provider";

/**
 * Global preview-then-save banner. Anchored at the top of the viewport so it
 * stays visible even if the user navigates to /projects, /board, etc. to see
 * how the theme looks elsewhere before committing.
 */
export function ThemePreviewBar() {
  const { preview, cancelPreview, confirmPreview } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  if (!preview) return null;

  const onThemesPage = pathname?.startsWith("/settings/themes") ?? false;

  return (
    <div className="fixed top-0 left-0 right-0 z-[300] pointer-events-none">
      <div className="mx-auto max-w-5xl px-4 pt-3 pointer-events-auto">
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-warning/60 bg-warning/15 backdrop-blur-md shadow-2xl"
          style={{
            // Inline style so the banner is unmistakable even if the
            // previewed theme has a low-contrast warning color token.
            background: "color-mix(in srgb, var(--warning) 18%, var(--card))",
          }}
        >
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-warning/25 border border-warning/50 flex items-center justify-center">
                <Eye className="h-4 w-4 text-warning" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-body font-semibold text-foreground flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
                    Previewing
                  </span>
                  <span className="text-foreground/90">— {preview.name}</span>
                </p>
                <p className="text-[11px] font-body text-muted-foreground truncate">
                  Colors apply across the app right now. Save to keep them, or cancel to revert.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!onThemesPage && (
                <Link
                  href="/settings/themes"
                  className="px-3 py-1.5 rounded-md text-[11px] font-body border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                >
                  Back to themes
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  cancelPreview();
                  if (!onThemesPage) {
                    // Stay where they are — preview is gone, page reverts.
                  }
                }}
                className="px-3 py-1.5 rounded-md text-[11px] font-body border border-border bg-card hover:border-destructive/50 hover:text-destructive text-foreground transition-colors inline-flex items-center gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmPreview();
                  if (!onThemesPage) router.refresh();
                }}
                className="px-3.5 py-1.5 rounded-md text-[11px] font-body bg-primary text-primary-foreground hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 shadow-sm"
              >
                <Check className="h-3.5 w-3.5" />
                Save & apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
