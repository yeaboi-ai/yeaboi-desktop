'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, X } from 'lucide-react';

import { useProviderHealthContext } from '@/components/providers/provider-health-provider';
import { cn } from '@/lib/utils';
import type { FeatureAvailability, HealthSummary } from '@/lib/types/health';
import { providerFailureDetail, providerLabel } from '@shared/provider-copy';

const DISMISS_KEY_PREFIX = 'provider-health-banner.dismissed.';

/** Fingerprint the current outage so dismiss only hides THIS specific
 * incident — a fresh failure with a different code/provider/`since` (or a
 * different active-failover target) shows the banner again. */
function fingerprint(summary: HealthSummary): string {
  if (summary.usage?.status === 'hard_blocked') return 'hard_blocked';
  const provider_parts = Object.entries(summary.providers ?? {})
    .filter(([, p]) => p.status && p.status !== 'ok')
    .map(([name, p]) => `${name}:${p.error_code ?? 'x'}:${p.since ?? ''}`)
    .sort();
  // Include active-failover targets so the banner refreshes when we swap
  // back to the primary (degraded → ok) or to a different backup.
  const failover_parts = Object.entries(summary.features ?? {})
    .filter(([, info]) => info.mode === 'degraded')
    .map(([name, info]) => `${name}->${info.active_provider ?? '?'}`)
    .sort();
  return [...provider_parts, ...failover_parts].join('|');
}

interface BannerContent {
  variant: 'credit' | 'spend' | 'degraded';
  title: string;
  detail: string;
  affectedFeatures: string[];
}

const FEATURE_LABELS: Record<string, string> = {
  chat: 'Chat',
  summary: 'Summarization',
  niko: 'Niko',
  wireframe: 'Wireframes',
  vision: 'Vision',
  voice: 'Voice agent',
  video: 'Video',
};

function pickBanner(summary: HealthSummary): BannerContent | null {
  if (summary.usage?.status === 'hard_blocked') {
    return {
      variant: 'spend',
      title: 'Monthly AI spend cap reached — calls paused',
      detail: `Month-to-date spend of $${summary.usage.month_to_date_usd.toFixed(2)} has hit your hard cap. Raise the limit in Settings → Integrations to resume.`,
      affectedFeatures: Object.keys(summary.features ?? {}),
    };
  }

  const unhealthyProviders = Object.entries(summary.providers ?? {})
    .filter(([, p]) => p.status && p.status !== 'ok')
    .map(([name, p]) => ({ name, ...p }));

  if (unhealthyProviders.length === 0) return null;

  const unavailableFeatures = Object.entries(summary.features ?? {})
    .filter(([, info]) => info.mode === 'unavailable' || info.available === false)
    .map(([name]) => name);

  const degradedFeatures = Object.entries(summary.features ?? {})
    .filter(([, info]) => info.mode === 'degraded')
    .map(([name, info]: [string, FeatureAvailability]) => ({ name, info }));

  // If anything is hard-down, the red variant wins — the user has at least
  // one feature that won't work at all.
  if (unavailableFeatures.length > 0) {
    const provNames = unhealthyProviders.map((p) => providerLabel(p.name)).join(', ');
    const isCredit = unhealthyProviders.some((p) => p.error_code === 'PROVIDER_CREDIT_EXHAUSTED');
    const isAuth = unhealthyProviders.some((p) => p.error_code === 'PROVIDER_INVALID_KEY');
    const byok = unhealthyProviders.some((p) => p.scope === 'org');

    let title = `${provNames} is having trouble`;
    if (byok && isAuth) {
      title = `Your ${provNames} API key is invalid`;
    } else if (byok && isCredit) {
      title = `Your ${provNames} API key is out of credits`;
    } else if (isCredit) {
      title = `${provNames} API key is out of credits`;
    } else if (isAuth) {
      title = `${provNames} API key is invalid`;
    }

    const worst =
      unhealthyProviders.find((p) => p.error_code === 'PROVIDER_INVALID_KEY') ??
      unhealthyProviders[0];
    const detail = providerFailureDetail(worst.error_code, worst.name, byok);

    return {
      variant: 'credit',
      title,
      detail,
      affectedFeatures: unavailableFeatures,
    };
  }

  // No hard-down features, but at least one degraded feature → amber banner.
  if (degradedFeatures.length > 0) {
    // All degraded features should share the same primary→backup pair in
    // the common case (a single provider outage). Surface the first one in
    // the title; the rest get listed under "Affected".
    const first = degradedFeatures[0];
    const primary = providerLabel(first.info.primary_provider ?? unhealthyProviders[0].name);
    const backup = providerLabel(first.info.active_provider ?? 'backup');
    const featureLabel = FEATURE_LABELS[first.name] ?? first.name;

    return {
      variant: 'degraded',
      title: `${primary} is degraded — ${featureLabel} is using ${backup} as a backup`,
      detail: `Responses may differ in style until ${primary} recovers.`,
      affectedFeatures: degradedFeatures.map((d) => d.name),
    };
  }

  return null;
}

export function ProviderHealthBanner() {
  const { summary } = useProviderHealthContext();
  const ref = useRef<HTMLDivElement>(null);
  const content = summary ? pickBanner(summary) : null;
  const fp = summary && content ? fingerprint(summary) : '';
  const dismissKey = fp ? DISMISS_KEY_PREFIX + fp : '';

  // Sync dismissed state with the current fingerprint. A new outage code or
  // provider produces a new fingerprint and the banner shows again.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!dismissKey) return;
    setDismissed(sessionStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  const visible = !!content && !dismissed;

  // Push the rest of the page down by the banner's actual measured height so
  // floating headers (session bar, toolbars) don't overlap the banner. Uses
  // a CSS custom property on <html> so any fixed-position element can read
  // it via `top: calc(var(--banner-h, 0px) + ...)` if it needs to.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty('--banner-h', '0px');
      root.style.paddingTop = '';
      return;
    }
    const update = () => {
      const h = ref.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty('--banner-h', `${h}px`);
      root.style.paddingTop = `${h}px`;
    };
    update();
    const ro = new ResizeObserver(update);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      root.style.setProperty('--banner-h', '0px');
      root.style.paddingTop = '';
    };
  }, [visible]);

  if (!visible) return null;

  const onDismiss = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  const isDegraded = content.variant === 'degraded';
  const isAmber = content.variant === 'spend' || isDegraded;
  return (
    <div
      ref={ref}
      role="alert"
      data-variant={content.variant}
      className={cn(
        'fixed inset-x-0 top-0 z-50 w-full border-b backdrop-blur-md text-foreground',
        isAmber ? 'border-warning/40' : 'border-destructive/40',
      )}
      style={{
        background: `color-mix(in srgb, var(${isAmber ? '--warning' : '--destructive'}) 15%, var(--background))`,
      }}
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="flex-1 min-w-0 text-sm">
          <div className="font-medium">{content.title}</div>
          <div className="mt-0.5 text-[13px] opacity-90 leading-snug">{content.detail}</div>
          {content.affectedFeatures.length > 0 && (
            <div className="mt-1 text-[12px] opacity-75">
              {isDegraded ? 'Affected' : 'Disabled'}:{' '}
              {content.affectedFeatures.map((f) => FEATURE_LABELS[f] ?? f).join(', ')}
            </div>
          )}
        </div>
        <Link
          href="/settings/credentials"
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] font-medium hover:bg-foreground/10 transition-colors"
        >
          Manage keys
          <ExternalLink className="h-3 w-3" />
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss alert"
          title="Hide for this session"
          className="shrink-0 rounded-md p-1 text-current/60 hover:bg-foreground/10 hover:text-current transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
