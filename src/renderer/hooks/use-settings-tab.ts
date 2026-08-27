"use client";

// Tab selection for /settings. The web app kept this in location.hash; under
// the desktop's hash router the hash IS the route, so the tab rides in a
// ?tab= search param instead.

import { useCallback } from "react";
import { useSearchParams } from "react-router";

export const SETTINGS_TAB_IDS = ["profile", "appearance", "ai"] as const;

export type SettingsTab = (typeof SETTINGS_TAB_IDS)[number];

const TAB_SET: ReadonlySet<string> = new Set(SETTINGS_TAB_IDS);

export function useSettingsTab() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") ?? "";
  const tab: SettingsTab = TAB_SET.has(raw) ? (raw as SettingsTab) : "profile";

  const setTab = useCallback(
    (next: SettingsTab) => {
      setParams((current) => {
        const updated = new URLSearchParams(current);
        updated.set("tab", next);
        return updated;
      });
    },
    [setParams],
  );

  return { tab, setTab };
}
