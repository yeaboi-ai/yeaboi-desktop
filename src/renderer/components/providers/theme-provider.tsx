"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { applyTheme } from "@/lib/theme/apply";
import { BUILTIN_PRESETS, DEFAULT_THEME_ID, isBuiltInPresetId } from "@/lib/theme/presets";
import {
  THEME_COOKIE_NAME,
  buildThemeCookieValue,
  parseThemeCookie,
} from "@/lib/theme/boot";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";
import type {
  BuiltInPresetId,
  ColorScheme,
  PreferenceMode,
  ThemeDoc,
  ThemeId,
  ThemePreference,
  TokenMap,
} from "@/lib/theme/types";

const STORAGE_KEY = "theme:preference";
const BROADCAST_NAME = "theme";

interface PreviewState {
  id: ThemeId;
  theme: ThemeDoc;
  // What gets persisted on confirm. Lets us preview not just a single
  // explicit theme, but also "follow system" or "use org default".
  pendingPreference: ThemePreference;
  // Display label shown in the preview bar.
  label: string;
}

interface ThemeContextValue {
  themeId: ThemeId;
  theme: ThemeDoc;
  tokens: TokenMap;
  colorScheme: ColorScheme;
  preference: ThemePreference;
  customThemes: Record<string, ThemeDoc>;
  setTheme: (id: ThemeId) => void;
  setSystemMode: (lightId: ThemeId, darkId: ThemeId) => void;
  setExplicit: (id: ThemeId) => void;
  followOrgDefault: () => void;
  presets: typeof BUILTIN_PRESETS;
  refreshFromServer: () => Promise<void>;
  // Preview-then-save: applies tokens to the DOM but does not persist.
  // ``confirmPreview`` persists the queued preference; ``cancelPreview``
  // reverts to the previous persisted state.
  preview: { id: ThemeId; name: string } | null;
  previewTheme: (id: ThemeId) => void;
  previewSystem: (lightId: ThemeId, darkId: ThemeId) => void;
  cancelPreview: () => void;
  confirmPreview: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ResolvedThemePayload {
  active: ThemeDoc;
  light?: ThemeDoc | null;
  dark?: ThemeDoc | null;
  preference: {
    mode: PreferenceMode;
    theme_id?: string | null;
    auto_light_id?: string | null;
    auto_dark_id?: string | null;
  };
  source: "explicit" | "system" | "org_default" | "fallback";
}

function readStoredPreference(): ThemePreference | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ThemePreference;
    if (parsed.mode !== "explicit" && parsed.mode !== "system" && parsed.mode !== "org_default") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredPreference(pref: ThemePreference): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* ignore quota errors */
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  return m ? m.slice(name.length + 1) : null;
}

function writeCookie(name: string, value: string, days = 365): void {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
}

function getSystemColorScheme(): ColorScheme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function isThemeId(id: string | null | undefined): id is ThemeId {
  if (!id) return false;
  return isBuiltInPresetId(id) || id.startsWith("custom:");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const { authFetch, ready: authReady } = useAuthFetch();

  const [preference, setPreference] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") {
      return { mode: "org_default" };
    }
    const stored = readStoredPreference();
    if (stored) return stored;
    const cookie = parseThemeCookie(readCookie(THEME_COOKIE_NAME));
    if (cookie && isThemeId(cookie.id)) {
      return { mode: "explicit", theme_id: cookie.id };
    }
    return { mode: "org_default" };
  });

  // Custom themes resolved from server — keyed by ThemeId. Seeded from the
  // cookie so the first client render matches what SSR painted, avoiding a
  // flash to the default theme before /api/themes/me lands.
  const [customThemes, setCustomThemes] = useState<Record<string, ThemeDoc>>(() => {
    if (typeof window === "undefined") return {};
    const cookie = parseThemeCookie(readCookie(THEME_COOKIE_NAME));
    if (cookie && cookie.tokens && cookie.id.startsWith("custom:")) {
      return {
        [cookie.id]: {
          version: 1,
          name: "Custom",
          base_preset: null,
          color_scheme: cookie.color_scheme,
          tokens: cookie.tokens,
        },
      };
    }
    return {};
  });
  // Org default theme (when preference.mode === 'org_default').
  const [orgDefaultTheme, setOrgDefaultTheme] = useState<ThemeDoc | null>(null);
  const [orgDefaultId, setOrgDefaultId] = useState<ThemeId | null>(null);

  // Preview state — when set, the DOM shows this theme but nothing is
  // persisted. Cleared by confirmPreview (which calls setExplicit) or
  // cancelPreview (which reverts to the persisted preference).
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const resolveTheme = useCallback((): { id: ThemeId; theme: ThemeDoc } => {
    if (preference.mode === "explicit" && preference.theme_id) {
      const id = preference.theme_id;
      if (isBuiltInPresetId(id)) return { id, theme: BUILTIN_PRESETS[id] };
      const custom = customThemes[id];
      if (custom) return { id, theme: custom };
    }
    if (preference.mode === "system") {
      const scheme = getSystemColorScheme();
      const candidate =
        scheme === "dark" ? preference.auto_dark_id : preference.auto_light_id;
      if (candidate) {
        if (isBuiltInPresetId(candidate)) {
          return { id: candidate, theme: BUILTIN_PRESETS[candidate] };
        }
        const custom = customThemes[candidate];
        if (custom) return { id: candidate, theme: custom };
      }
      const fallbackId: ThemeId = scheme === "dark" ? "preset:dark" : "preset:light";
      return { id: fallbackId, theme: BUILTIN_PRESETS[fallbackId] };
    }
    if (preference.mode === "org_default" && orgDefaultTheme && orgDefaultId) {
      return { id: orgDefaultId, theme: orgDefaultTheme };
    }
    return { id: DEFAULT_THEME_ID, theme: BUILTIN_PRESETS[DEFAULT_THEME_ID] };
  }, [preference, customThemes, orgDefaultTheme, orgDefaultId]);

  const resolvedFromPreference = useMemo(() => resolveTheme(), [resolveTheme]);
  // Preview, when set, overrides the persisted preference for display only.
  const resolved = preview ?? resolvedFromPreference;

  // Apply the resolved theme to <html>. The cookie + cross-tab broadcast
  // are skipped during preview so the change can't leak past the current
  // tab until the user explicitly saves it.
  useEffect(() => {
    if (typeof document === "undefined") return;
    applyTheme(document.documentElement, resolved.theme, resolved.id);
    if (preview) return;
    // Tokens always ride along: there is no server render any more, so the
    // index.html boot script is what paints the first frame, and it can only
    // paint what the cookie carries.
    writeCookie(
      THEME_COOKIE_NAME,
      buildThemeCookieValue({
        id: resolved.id,
        color_scheme: resolved.theme.color_scheme,
        tokens: resolved.theme.tokens,
      }),
    );
  }, [resolved, preview]);

  // Cross-tab sync.
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(BROADCAST_NAME);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const data = event.data as ThemePreference | null;
      if (data && (data.mode === "explicit" || data.mode === "system" || data.mode === "org_default")) {
        setPreference(data);
      }
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, []);

  // Listen to system color-scheme changes when in system mode.
  useEffect(() => {
    if (preference.mode !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setPreference((p) => ({ ...p }));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference.mode]);

  // Hydrate from backend once auth is ready.
  const refreshFromServer = useCallback(async () => {
    if (!authReady) return;
    try {
      const r = await authFetch("/api/themes/me");
      if (!r.ok) return;
      const data = (await r.json()) as ResolvedThemePayload;
      // Stash custom themes from active/light/dark in our cache.
      const cache: Record<string, ThemeDoc> = {};
      const stash = (id: string | null | undefined, doc: ThemeDoc | null | undefined) => {
        if (!id || !doc) return;
        if (id.startsWith("custom:")) cache[id] = doc;
      };
      stash(data.preference.theme_id ?? null, data.active);
      stash(data.preference.auto_light_id ?? null, data.light ?? null);
      stash(data.preference.auto_dark_id ?? null, data.dark ?? null);
      if (Object.keys(cache).length) {
        setCustomThemes((prev) => ({ ...prev, ...cache }));
      }
      if (data.source === "org_default") {
        setOrgDefaultTheme(data.active);
        // We don't know the underlying id when source=org_default since the
        // resolver returns the resolved theme directly. Leave id as null and
        // rely on theme content for application; server will tell us its
        // identity via explicit selection later.
        setOrgDefaultId(null);
      }
      const serverPref = data.preference;
      const next: ThemePreference = {
        mode: serverPref.mode,
        theme_id: (serverPref.theme_id as ThemeId | null) ?? null,
        auto_light_id: (serverPref.auto_light_id as ThemeId | null) ?? null,
        auto_dark_id: (serverPref.auto_dark_id as ThemeId | null) ?? null,
      };
      setPreference((prev) => {
        // Only adopt server preference if it differs and the local was not
        // explicitly set ahead of time. Local overrides win until persisted.
        if (
          prev.mode === next.mode &&
          prev.theme_id === next.theme_id &&
          prev.auto_light_id === next.auto_light_id &&
          prev.auto_dark_id === next.auto_dark_id
        ) {
          return prev;
        }
        return next;
      });
    } catch (err) {
      logger.warn("theme: failed to refresh from server", err);
    }
  }, [authFetch, authReady]);

  useEffect(() => {
    if (authReady) void refreshFromServer();
  }, [authReady, refreshFromServer]);

  // Fetch any custom theme on demand when the user picks one whose tokens
  // we haven't cached yet (e.g. they just applied a brand and the apply
  // returned a fresh custom:<uuid> that ``refreshFromServer`` hasn't seen).
  // Without this, ``resolveTheme`` falls back to the dark preset and the
  // colors only update on next reload.
  useEffect(() => {
    if (!authReady) return;
    const wanted = new Set<string>();
    const consider = (id: ThemeId | string | null | undefined) => {
      if (!id || typeof id !== "string") return;
      if (!id.startsWith("custom:")) return;
      if (customThemes[id]) return;
      wanted.add(id);
    };
    if (preference.mode === "explicit") consider(preference.theme_id);
    if (preference.mode === "system") {
      consider(preference.auto_light_id);
      consider(preference.auto_dark_id);
    }
    if (wanted.size === 0) return;
    let cancelled = false;
    void (async () => {
      const fetched: Record<string, ThemeDoc> = {};
      for (const id of wanted) {
        const presetId = id.slice("custom:".length);
        try {
          const r = await authFetch(`/api/themes/presets/${presetId}`);
          if (!r.ok) continue;
          const preset = (await r.json()) as {
            id: string;
            name: string;
            color_scheme: ColorScheme;
            base_preset: string | null;
            tokens: TokenMap;
            version?: number;
          };
          fetched[id] = {
            version: preset.version ?? 1,
            name: preset.name,
            base_preset: (preset.base_preset as ThemeDoc["base_preset"]) ?? null,
            color_scheme: preset.color_scheme,
            tokens: preset.tokens,
          };
        } catch (err) {
          logger.warn("theme: failed to fetch custom preset on demand", err);
        }
      }
      if (cancelled || Object.keys(fetched).length === 0) return;
      setCustomThemes((prev) => ({ ...prev, ...fetched }));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authFetch,
    authReady,
    customThemes,
    preference.mode,
    preference.theme_id,
    preference.auto_light_id,
    preference.auto_dark_id,
  ]);

  const persistPreference = useCallback(
    async (next: ThemePreference) => {
      if (!authReady) return;
      try {
        const r = await authFetch("/api/users/me/theme-preference", {
          method: "PUT",
          body: JSON.stringify({
            mode: next.mode,
            theme_id: next.theme_id ?? null,
            auto_light_id: next.auto_light_id ?? null,
            auto_dark_id: next.auto_dark_id ?? null,
          }),
        });
        if (!r.ok) {
          logger.warn("theme: failed to persist preference", r.status);
        }
      } catch (err) {
        logger.warn("theme: error persisting preference", err);
      }
    },
    [authFetch, authReady],
  );

  const updatePreference = useCallback(
    (next: ThemePreference) => {
      setPreference(next);
      writeStoredPreference(next);
      channelRef.current?.postMessage(next);
      void persistPreference(next);
    },
    [persistPreference],
  );

  const setExplicit = useCallback(
    (id: ThemeId) => {
      updatePreference({ mode: "explicit", theme_id: id });
    },
    [updatePreference],
  );

  const setSystemMode = useCallback(
    (lightId: ThemeId, darkId: ThemeId) => {
      updatePreference({
        mode: "system",
        auto_light_id: lightId,
        auto_dark_id: darkId,
      });
    },
    [updatePreference],
  );

  const followOrgDefault = useCallback(() => {
    setPreview(null);
    updatePreference({ mode: "org_default" });
  }, [updatePreference]);

  // ── Preview-then-save ──────────────────────────────────────────────
  const previewTheme = useCallback(
    (id: ThemeId) => {
      const pending: ThemePreference = { mode: "explicit", theme_id: id };
      if (isBuiltInPresetId(id)) {
        setPreview({
          id,
          theme: BUILTIN_PRESETS[id],
          pendingPreference: pending,
          label: BUILTIN_PRESETS[id].name,
        });
        return;
      }
      const cached = customThemes[id];
      if (cached) {
        setPreview({ id, theme: cached, pendingPreference: pending, label: cached.name });
        return;
      }
      // Not in cache → fetch then set.
      if (!authReady || !id.startsWith("custom:")) return;
      const presetId = id.slice("custom:".length);
      void (async () => {
        try {
          const r = await authFetch(`/api/themes/presets/${presetId}`);
          if (!r.ok) return;
          const preset = (await r.json()) as {
            id: string;
            name: string;
            color_scheme: ColorScheme;
            base_preset: string | null;
            tokens: TokenMap;
            version?: number;
          };
          const doc: ThemeDoc = {
            version: preset.version ?? 1,
            name: preset.name,
            base_preset: (preset.base_preset as ThemeDoc["base_preset"]) ?? null,
            color_scheme: preset.color_scheme,
            tokens: preset.tokens,
          };
          setCustomThemes((prev) => ({ ...prev, [id]: doc }));
          setPreview({ id, theme: doc, pendingPreference: pending, label: doc.name });
        } catch (err) {
          logger.warn("theme: preview fetch failed", err);
        }
      })();
    },
    [authFetch, authReady, customThemes],
  );

  const previewSystem = useCallback(
    (lightId: ThemeId, darkId: ThemeId) => {
      // Resolve which one the OS is currently asking for so the live
      // preview matches what the user would actually see.
      const scheme = getSystemColorScheme();
      const candidate = scheme === "dark" ? darkId : lightId;
      const fallbackId: ThemeId =
        scheme === "dark" ? "preset:dark" : "preset:light";
      const pending: ThemePreference = {
        mode: "system",
        auto_light_id: lightId,
        auto_dark_id: darkId,
      };
      const apply = (id: ThemeId, doc: ThemeDoc) =>
        setPreview({
          id,
          theme: doc,
          pendingPreference: pending,
          label: `Match my system · currently ${scheme}`,
        });
      if (isBuiltInPresetId(candidate)) {
        apply(candidate, BUILTIN_PRESETS[candidate]);
        return;
      }
      const cached = customThemes[candidate];
      if (cached) {
        apply(candidate, cached);
        return;
      }
      // Custom not in cache — fall back to the matching built-in for the
      // immediate preview, then upgrade after the fetch lands.
      apply(fallbackId, BUILTIN_PRESETS[fallbackId]);
      if (!authReady || !candidate.startsWith("custom:")) return;
      const presetId = candidate.slice("custom:".length);
      void (async () => {
        try {
          const r = await authFetch(`/api/themes/presets/${presetId}`);
          if (!r.ok) return;
          const preset = (await r.json()) as {
            id: string;
            name: string;
            color_scheme: ColorScheme;
            base_preset: string | null;
            tokens: TokenMap;
            version?: number;
          };
          const doc: ThemeDoc = {
            version: preset.version ?? 1,
            name: preset.name,
            base_preset: (preset.base_preset as ThemeDoc["base_preset"]) ?? null,
            color_scheme: preset.color_scheme,
            tokens: preset.tokens,
          };
          setCustomThemes((prev) => ({ ...prev, [candidate]: doc }));
          apply(candidate, doc);
        } catch (err) {
          logger.warn("theme: preview-system fetch failed", err);
        }
      })();
    },
    [authFetch, authReady, customThemes],
  );

  const cancelPreview = useCallback(() => {
    setPreview(null);
  }, []);

  const confirmPreview = useCallback(() => {
    setPreview((current) => {
      if (current) {
        updatePreference(current.pendingPreference);
      }
      return null;
    });
  }, [updatePreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeId: resolved.id,
      theme: resolved.theme,
      tokens: resolved.theme.tokens,
      colorScheme: resolved.theme.color_scheme,
      preference,
      customThemes,
      setTheme: setExplicit,
      setExplicit,
      setSystemMode,
      followOrgDefault,
      presets: BUILTIN_PRESETS,
      refreshFromServer,
      preview: preview ? { id: preview.id, name: preview.label } : null,
      previewTheme,
      previewSystem,
      cancelPreview,
      confirmPreview,
    }),
    [
      resolved,
      preference,
      customThemes,
      setExplicit,
      setSystemMode,
      followOrgDefault,
      refreshFromServer,
      preview,
      previewTheme,
      previewSystem,
      cancelPreview,
      confirmPreview,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export type { PreferenceMode };
