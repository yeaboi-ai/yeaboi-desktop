// Mirror of GET /api/system/health-summary. Keep in sync with
// backend/src/app/routers/system_health.py.

export type ProviderStatus = 'ok' | 'unhealthy';
export type FeatureMode = 'ok' | 'degraded' | 'unavailable';
export type SpendStatus = 'ok' | 'warn' | 'critical' | 'hard_blocked';

export interface ProviderSnapshot {
  status: ProviderStatus | string;
  error_code?: string | null;
  message?: string | null;
  since?: string | null;
  scope?: 'platform' | 'org' | string;
  /**
   * When this provider is currently absorbing traffic that normally belongs
   * to another vendor (the primary is failing), the role names appear here.
   * Empty / undefined when the provider is just serving its own role.
   */
  serving_failover_for?: string[];
}

export interface FeatureAvailability {
  available: boolean;
  /**
   * - "ok"           — primary provider is healthy
   * - "degraded"     — primary down, backup is serving traffic; UI shows
   *                    an amber "using backup" banner
   * - "unavailable"  — primary down with no working backup; UI shows red
   */
  mode?: FeatureMode;
  reason?: string;
  blocking_provider?: string;
  /** Present when `mode === "degraded"` — the primary vendor that's failing. */
  primary_provider?: string;
  /** Present when `mode === "degraded"` — the backup vendor currently serving. */
  active_provider?: string;
  message?: string | null;
}

export interface UsageStatus {
  month_to_date_usd: number;
  soft_limit_usd: number | null;
  hard_limit_usd: number | null;
  percent_of_soft: number | null;
  status: SpendStatus;
}

export interface HealthSummary {
  providers: Record<string, ProviderSnapshot>;
  features: Record<string, FeatureAvailability>;
  usage: UsageStatus;
  fetched_at: string;
}

export const HEALTH_FEATURES = [
  'chat',
  'summary',
  'niko',
  'wireframe',
  'vision',
  'voice',
  'video',
] as const;

export type HealthFeatureName = (typeof HEALTH_FEATURES)[number];
