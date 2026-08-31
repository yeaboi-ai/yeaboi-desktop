// The System Check payload and the grouping the page renders from. Pure, so the
// paths that only appear against an older backend — no `categories`, a check
// naming a category the payload never declared — are pinned by tests rather than
// discovered in the wild.

export type CheckStatus = 'ok' | 'missing' | 'unsupported' | 'unknown';

export interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  hint: string;
  feature: string;
  category?: string;
}

export interface Category {
  key: string;
  title: string;
  blurb: string;
}

export interface Report {
  summary: string;
  categories?: Category[];
  checks: Check[];
}

export interface Section {
  category: Category;
  /** The rows to render — the filter applies here. */
  rows: Check[];
  /** Readiness of the whole category, never of the filtered subset. */
  ok: number;
  total: number;
}

/** A backend that predates the grouped payload still renders — as one section. */
export const UNGROUPED: Category[] = [
  { key: '', title: 'Optional features', blurb: 'What is ready on this machine' },
];

/** The rows a person would go and do something about. */
export function needsAttention(checks: Check[]): Check[] {
  return checks.filter((check) => check.status !== 'ok');
}

/**
 * Group the checks into render order, dropping sections with nothing to show.
 *
 * A check whose category the payload does not declare falls into the last
 * section rather than off the page — the same rule the backend's
 * `SystemReport.by_category` applies.
 */
export function groupChecks(report: Report, attentionOnly = false): Section[] {
  const grouped = Boolean(report.categories?.length);
  const categories = grouped ? report.categories! : UNGROUPED;
  const declared = new Set(categories.map((category) => category.key));
  const last = categories[categories.length - 1].key;
  const bucket = (check: Check): string => {
    if (!grouped) return categories[0].key;
    const key = check.category ?? '';
    return declared.has(key) ? key : last;
  };

  const attention = new Set(needsAttention(report.checks).map((check) => check.key));
  return categories
    .map((category) => {
      const all = report.checks.filter((check) => bucket(check) === category.key);
      return {
        category,
        rows: attentionOnly ? all.filter((check) => attention.has(check.key)) : all,
        ok: all.filter((check) => check.status === 'ok').length,
        total: all.length,
      };
    })
    .filter((section) => section.rows.length > 0);
}
