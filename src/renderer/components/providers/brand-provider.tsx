"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuthFetch, getStoredOrgId } from "@/hooks/use-auth-fetch";
import { logger } from "@/lib/logger";

interface BrandData {
  org_id: string;
  app_name: string | null;
  tagline: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  source_url: string | null;
  theme_id: string | null;
}

interface BrandContextValue {
  brand: BrandData | null;
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_APP_NAME = "planr";

const BrandContext = createContext<BrandContextValue | null>(null);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { authFetch, ready } = useAuthFetch();
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);

  // Track the active org id so brand reloads when the user switches orgs.
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOrgId(getStoredOrgId());
    const handler = () => setOrgId(getStoredOrgId());
    window.addEventListener("team-change", handler);
    return () => window.removeEventListener("team-change", handler);
  }, []);

  const refresh = useCallback(async () => {
    if (!ready) return;
    const id = getStoredOrgId();
    if (!id) {
      setBrand(null);
      return;
    }
    try {
      const r = await authFetch(`/api/orgs/${id}/brand`);
      if (r.ok) setBrand((await r.json()) as BrandData);
    } catch (err) {
      logger.warn("brand-provider: load failed", err);
    }
  }, [authFetch, ready]);

  useEffect(() => {
    void refresh();
  }, [refresh, orgId]);

  // Listen for explicit refresh signals from the brand settings page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => void refresh();
    window.addEventListener("brand-updated", handler);
    return () => window.removeEventListener("brand-updated", handler);
  }, [refresh]);

  const appName = brand?.app_name?.trim() || DEFAULT_APP_NAME;
  const logoUrl = brand?.logo_url || null;
  const faviconUrl = brand?.favicon_url || null;

  // Update document title and favicon when the brand changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title = appName === DEFAULT_APP_NAME ? "Planning Platform" : `${appName} · Planning Platform`;
    if (faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
    }
  }, [appName, faviconUrl]);

  const value = useMemo<BrandContextValue>(
    () => ({ brand, appName, logoUrl, faviconUrl, refresh }),
    [brand, appName, logoUrl, faviconUrl, refresh],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandContextValue {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used inside BrandProvider");
  return ctx;
}
