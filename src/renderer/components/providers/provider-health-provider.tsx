'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-base';

import { toast } from '@/components/ui/toast';
import { logger } from '@/lib/logger';
import type { HealthSummary } from '@/lib/types/health';

interface ProviderHealthContextValue {
  summary: HealthSummary | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const ProviderHealthContext = createContext<ProviderHealthContextValue>({
  summary: null,
  isLoading: false,
  refresh: async () => {},
});

const POLL_MS = 60_000;

/**
 * Polls /api/system/health-summary and exposes the result via context.
 *
 * Pauses polling when the document is hidden so a backgrounded tab doesn't
 * burn requests. Calls refresh() immediately on any 402 response from the
 * app's other fetches, so the banner appears within ~1s rather than waiting
 * for the next 60s tick.
 */
export function ProviderHealthProvider({ children }: { children: React.ReactNode }) {
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/system/health-summary', { credentials: 'include' });
      if (!res.ok) return;
      const body = (await res.json()) as HealthSummary;
      setSummary(body);
      maybeFireSpendToasts(body);
    } catch (err) {
      logger.warn('provider-health refresh failed', err as Error);
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    void refresh();
    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(() => {
        if (!cancelled) void refresh();
      }, POLL_MS);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        void refresh();
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibility);
    const onForce = () => void refresh();
    window.addEventListener('provider-health-refresh', onForce);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('provider-health-refresh', onForce);
    };
  }, [refresh]);

  return (
    <ProviderHealthContext.Provider value={{ summary, isLoading, refresh }}>
      {children}
    </ProviderHealthContext.Provider>
  );
}

export function useProviderHealthContext() {
  return useContext(ProviderHealthContext);
}

/**
 * Trigger an immediate health-summary refresh from anywhere in the app.
 * Wired by `use-auth-fetch` on 402 responses so the banner reflects the
 * outage right after the failing call returns.
 */
export function requestProviderHealthRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('provider-health-refresh'));
}

function maybeFireSpendToasts(summary: HealthSummary) {
  if (typeof window === 'undefined') return;
  const usage = summary.usage;
  if (!usage) return;
  const yyyymm = summary.fetched_at.slice(0, 7);

  if (usage.status === 'warn') {
    const key = `spend.warned.80.${yyyymm}`;
    if (!localStorage.getItem(key)) {
      toast.warning({
        title: 'AI spend is at 80% of your monthly cap',
        description: usageDescription(usage),
      });
      localStorage.setItem(key, '1');
    }
  } else if (usage.status === 'critical') {
    const key = `spend.warned.95.${yyyymm}`;
    if (!localStorage.getItem(key)) {
      toast.error({
        title: 'AI spend is at 95% of your monthly cap',
        description: usageDescription(usage),
      });
      localStorage.setItem(key, '1');
    }
  }
  // hard_blocked is shown by the persistent banner, not a toast.
}

function usageDescription(usage: HealthSummary['usage']): string {
  const spend = usage.month_to_date_usd.toFixed(2);
  const soft = usage.soft_limit_usd?.toFixed(2) ?? '—';
  return `Month-to-date $${spend} of $${soft}. Manage limits in Settings → System.`;
}
