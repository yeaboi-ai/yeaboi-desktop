'use client';

import { useProviderHealthContext } from '@/components/providers/provider-health-provider';
import type { FeatureAvailability, HealthFeatureName } from '@/lib/types/health';

const ALWAYS_AVAILABLE: FeatureAvailability = { available: true };

/**
 * Read-only access to the system health snapshot driving feature gating.
 *
 * Returns a stable shape even before the first fetch lands so callers can
 * unconditionally use `chat.available && ...`. Defaults to "available"
 * during the loading window to avoid flashes of disabled state on cold load.
 */
export function useProviderHealth() {
  const { summary, isLoading, refresh } = useProviderHealthContext();
  const features = summary?.features ?? {};

  const lookup = (name: HealthFeatureName): FeatureAvailability =>
    features[name] ?? ALWAYS_AVAILABLE;

  return {
    isLoading,
    refresh,
    chat: lookup('chat'),
    summary: lookup('summary'),
    niko: lookup('niko'),
    wireframe: lookup('wireframe'),
    vision: lookup('vision'),
    voice: lookup('voice'),
    video: lookup('video'),
    usage: summary?.usage ?? null,
    providers: summary?.providers ?? {},
  };
}
