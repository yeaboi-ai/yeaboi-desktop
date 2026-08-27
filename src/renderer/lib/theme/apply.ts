import type { ColorScheme, ThemeDoc, ThemeId, TokenMap } from "./types";

export function applyThemeTokens(el: HTMLElement, tokens: TokenMap): void {
  for (const [key, value] of Object.entries(tokens)) {
    el.style.setProperty(`--${key}`, value);
  }
}

export function setThemeAttributes(el: HTMLElement, themeId: ThemeId, colorScheme: ColorScheme): void {
  el.dataset.theme = themeId;
  el.dataset.colorScheme = colorScheme;
}

export function applyTheme(el: HTMLElement, theme: ThemeDoc, themeId: ThemeId): void {
  applyThemeTokens(el, theme.tokens);
  setThemeAttributes(el, themeId, theme.color_scheme);
}

export function tokensToInlineStyleString(tokens: TokenMap): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    parts.push(`--${key}:${value}`);
  }
  return `:root{${parts.join(";")}}`;
}
