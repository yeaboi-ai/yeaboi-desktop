"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthFetch } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";

export function useAppSetting(key: string) {
  const { authFetch, ready } = useAuthFetch();
  const [value, setValue] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(`app-setting:${key}`);
  });
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ready) return;
    authFetch(`/api/app-settings?key=${encodeURIComponent(key)}`)
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data?.value != null) {
          setValue(data.value);
          localStorage.setItem(`app-setting:${key}`, data.value);
        }
      })
      .catch(() => logger.warn("Failed to fetch app setting: %s", key))
      .finally(() => setLoading(false));
  }, [ready, authFetch, key]);

  const save = useCallback(
    (newValue: string) => {
      setValue(newValue);
      localStorage.setItem(`app-setting:${key}`, newValue);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        authFetch("/api/app-settings", {
          method: "PUT",
          body: JSON.stringify({ key, value: newValue }),
        }).catch(() => logger.warn("Failed to save app setting: %s", key));
      }, 400);
    },
    [authFetch, key],
  );

  return { value, loading, save };
}
