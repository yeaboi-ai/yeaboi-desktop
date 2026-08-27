"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Sun, Moon, MonitorSmartphone } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { useAuthFetch, getStoredOrgId } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

// Curated subset of BUILTIN_PRESETS for the inline picker. The full list lives
// at /settings/themes — this is the "fast path" right inside General.
const FEATURED_THEMES: { id: string; name: string }[] = [
  { id: "preset:light", name: "Light" },
  { id: "preset:dark", name: "Dark" },
  { id: "preset:midnight", name: "Midnight" },
  { id: "preset:sepia", name: "Sepia" },
  { id: "preset:ocean", name: "Ocean" },
  { id: "preset:sunshine", name: "Sunshine" },
];

const SCHEME_OPTIONS = [
  { id: "light", label: "Light", icon: Sun },
  { id: "system", label: "System", icon: MonitorSmartphone },
  { id: "dark", label: "Dark", icon: Moon },
] as const;

type Brand = { id: string | null; name: string | null; is_active: boolean };
type BrandStatus = { kind: "loading" } | { kind: "default" } | { kind: "branded"; name: string | null };

export function AppearanceSection() {
  const { themeId, preference, presets, setExplicit, setSystemMode } = useTheme();
  const { authFetch, ready } = useAuthFetch();
  // Lazy initializer: if there's no org id yet we already know to show
  // "Default" — avoids synchronously calling setState inside the effect.
  const [brand, setBrand] = useState<BrandStatus>(() => {
    if (typeof window === "undefined") return { kind: "loading" };
    return getStoredOrgId() ? { kind: "loading" } : { kind: "default" };
  });

  useEffect(() => {
    if (!ready) return;
    const orgId = getStoredOrgId();
    if (!orgId) return;
    authFetch(`/api/orgs/${orgId}/brands`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Brand[] | null) => {
        const active = data?.find((b) => b.is_active && b.id);
        setBrand(active ? { kind: "branded", name: active.name } : { kind: "default" });
      })
      .catch(() => {
        logger.warn("Failed to load org brands");
        setBrand({ kind: "default" });
      });
  }, [ready, authFetch]);

  // Resolve the active scheme mode from the preference. "system" mode matches
  // OS preference; "explicit" with a light/dark preset surfaces as Light/Dark.
  const activeScheme: "light" | "dark" | "system" = (() => {
    if (preference.mode === "system") return "system";
    if (preference.mode === "explicit" && preference.theme_id) {
      if (preference.theme_id === "preset:light") return "light";
      if (preference.theme_id === "preset:dark") return "dark";
      // Any other explicit theme — show no scheme highlight (user picked a
      // custom theme below). Fall back to the theme's color_scheme.
      const colorScheme = presets[preference.theme_id as keyof typeof presets]?.color_scheme;
      return colorScheme === "light" ? "light" : "dark";
    }
    return "dark";
  })();

  const handleScheme = (id: "light" | "system" | "dark") => {
    if (id === "system") {
      setSystemMode("preset:light", "preset:dark");
    } else if (id === "light") {
      setExplicit("preset:light");
    } else {
      setExplicit("preset:dark");
    }
  };

  return (
    <div className="space-y-5">
      {/* Color scheme — segmented control */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
          Color scheme
        </p>
        <div className="inline-flex rounded-lg border border-border/40 bg-background p-0.5">
          {SCHEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = activeScheme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleScheme(opt.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-body font-medium transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring/50",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme presets — inline thumbnails */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-body font-medium tracking-[0.1em] uppercase text-muted-foreground">
            Theme
          </p>
          <Link
            href="/settings/themes"
            className="inline-flex items-center gap-1 text-[11px] font-body text-muted-foreground hover:text-foreground transition-colors"
          >
            More themes
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {FEATURED_THEMES.map((t) => {
            const preset = presets[t.id as keyof typeof presets];
            if (!preset) return null;
            const active = themeId === t.id;
            return (
              <ThemeThumb
                key={t.id}
                name={t.name}
                tokens={preset.tokens}
                active={active}
                onClick={() => setExplicit(t.id as Parameters<typeof setExplicit>[0])}
              />
            );
          })}
        </div>
      </div>

      {/* Brand row */}
      <div className="rounded-lg border border-border/40 bg-card/40">
        <div className="px-4 py-3 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-body font-medium text-foreground">Brand the app</p>
              {brand.kind === "branded" && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-body font-medium tracking-wide uppercase bg-primary/15 text-primary">
                  {brand.name ? `Branded · ${brand.name}` : "Custom branded"}
                </span>
              )}
              {brand.kind === "default" && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-body font-medium tracking-wide uppercase bg-muted text-muted-foreground border border-border">
                  Default
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground font-body mt-0.5 leading-relaxed">
              Match the app to a company website — colors, logo, and product name. Admin only.
            </p>
          </div>
          <Link
            href="/settings/organization/brand"
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-body font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Open brand studio
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ThemeThumb({
  name,
  tokens,
  active,
  onClick,
}: {
  name: string;
  tokens: Record<string, string>;
  active: boolean;
  onClick: () => void;
}) {
  // Build a 4-stop gradient that hints at the theme's palette — picks the most
  // visually distinctive token colours and arranges them as a soft strip.
  const stops = [
    tokens["background"] || tokens["card"] || "#000",
    tokens["primary"] || tokens["accent-foreground"] || "#888",
    tokens["accent"] || tokens["secondary"] || "#444",
    tokens["foreground"] || "#fff",
  ];
  const gradient = `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 45%, ${stops[2]} 75%, ${stops[3]} 100%)`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={name}
      className={cn(
        "group flex flex-col gap-1 items-stretch rounded-lg border p-1 transition-all outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "border-primary"
          : "border-border/40 hover:border-border",
      )}
    >
      <div
        className="aspect-square w-full rounded-md"
        style={{ background: gradient, boxShadow: `inset 0 0 0 1px ${tokens["border"] || "rgba(255,255,255,0.05)"}` }}
      />
      <span className="text-[10px] font-body text-foreground text-center truncate">{name}</span>
    </button>
  );
}
