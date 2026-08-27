export type ColorScheme = "light" | "dark";

export type TokenMap = Record<string, string>;

export interface ThemeDoc {
  version: number;
  name: string;
  base_preset: BuiltInPresetId | null;
  color_scheme: ColorScheme;
  tokens: TokenMap;
  auto_light_dark?: AutoLightDark | null;
}

export interface AutoLightDark {
  light_theme_id: ThemeId;
  dark_theme_id: ThemeId;
}

export type BuiltInPresetId =
  | "preset:light"
  | "preset:dark"
  | "preset:midnight"
  | "preset:high-contrast"
  | "preset:sepia"
  | "preset:ember"
  | "preset:ocean"
  | "preset:rose"
  | "preset:sunshine"
  | "preset:forest";

export type ThemeId = BuiltInPresetId | `custom:${string}`;

export type PreferenceMode = "explicit" | "org_default" | "system";

export interface ThemePreference {
  mode: PreferenceMode;
  theme_id?: ThemeId | null;
  auto_light_id?: ThemeId | null;
  auto_dark_id?: ThemeId | null;
}

export interface ResolvedTheme {
  active: ThemeDoc;
  light?: ThemeDoc;
  dark?: ThemeDoc;
  preference: ThemePreference;
  source: "explicit" | "system" | "org_default" | "fallback";
}

export const TOKEN_KEYS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "info",
  "info-foreground",
  "border",
  "input",
  "ring",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8",
  "chart-grid",
  "chart-axis",
  "chart-tooltip-bg",
  "chart-tooltip-fg",
  "canvas-bg",
  "canvas-grid",
  "canvas-grid-strong",
  "canvas-node-bg",
  "canvas-node-fg",
  "canvas-node-border",
  "canvas-edge-default",
  "canvas-edge-selected",
  "canvas-edge-hover",
  "canvas-handle",
  "canvas-selection-fill",
  "canvas-selection-stroke",
  "canvas-minimap-mask",
  "canvas-minimap-node",
  "livekit-tile-bg",
  "livekit-screen-bg",
  "selection-bg",
  "selection-fg",
  "scrollbar-thumb",
  "scrollbar-thumb-hover",
  "grid-placeholder-bg",
  "grid-placeholder-border",
  "glow-primary-shadow",
  "wireframe-bg",
  "wireframe-fg",
  "wireframe-accent",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];
