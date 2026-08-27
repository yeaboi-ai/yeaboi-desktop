import { BUILTIN_PRESETS, DEFAULT_THEME_ID, isBuiltInPresetId } from "./presets";
import { tokensToInlineStyleString } from "./apply";
import type { ColorScheme, ThemeDoc, ThemeId, TokenMap } from "./types";

export const THEME_COOKIE_NAME = "theme";

export interface ThemeCookiePayload {
  id: ThemeId;
  color_scheme: ColorScheme;
  tokens?: TokenMap;
}

export interface BootedTheme {
  id: ThemeId;
  color_scheme: ColorScheme;
  tokens: TokenMap;
  source: "cookie" | "fallback";
}

export function parseThemeCookie(value: string | undefined | null): ThemeCookiePayload | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    const parsed = JSON.parse(decoded);
    if (typeof parsed !== "object" || !parsed) return null;
    if (typeof parsed.id !== "string" || (parsed.color_scheme !== "light" && parsed.color_scheme !== "dark")) {
      return null;
    }
    return parsed as ThemeCookiePayload;
  } catch {
    return null;
  }
}

export function bootThemeFromCookie(cookieValue: string | undefined | null): BootedTheme {
  const parsed = parseThemeCookie(cookieValue);
  if (parsed) {
    if (isBuiltInPresetId(parsed.id)) {
      const preset = BUILTIN_PRESETS[parsed.id];
      return { id: parsed.id, color_scheme: preset.color_scheme, tokens: preset.tokens, source: "cookie" };
    }
    if (parsed.tokens) {
      return {
        id: parsed.id,
        color_scheme: parsed.color_scheme,
        tokens: parsed.tokens,
        source: "cookie",
      };
    }
  }
  const fallback = BUILTIN_PRESETS[DEFAULT_THEME_ID];
  return {
    id: DEFAULT_THEME_ID,
    color_scheme: fallback.color_scheme,
    tokens: fallback.tokens,
    source: "fallback",
  };
}

export function bootInlineStyle(tokens: TokenMap): string {
  return tokensToInlineStyleString(tokens);
}

export function buildThemeCookieValue(payload: ThemeCookiePayload): string {
  return encodeURIComponent(JSON.stringify(payload));
}

export function themeFromId(id: ThemeId, customTokens?: TokenMap, customColorScheme?: ColorScheme): ThemeDoc | null {
  if (isBuiltInPresetId(id)) return BUILTIN_PRESETS[id];
  if (customTokens && customColorScheme) {
    return {
      version: 1,
      name: "Custom",
      base_preset: null,
      color_scheme: customColorScheme,
      tokens: customTokens,
    };
  }
  return null;
}
