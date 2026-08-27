// Money / percent / duration formatters used across the analytics surfaces.
// Single source of truth so a screenshot of the cost overview always reads the
// same way as the per-session row in the table.

export function formatUsd(value: number, opts?: { precise?: boolean }): string {
  const precise = opts?.precise ?? false;
  const minimumFractionDigits = precise ? 4 : 2;
  const maximumFractionDigits = precise ? 4 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

export function formatPct(value: number, opts?: { fractionDigits?: number }): string {
  const fractionDigits = opts?.fractionDigits ?? 0;
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

export function formatDurationMinutes(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes.toFixed(0)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
