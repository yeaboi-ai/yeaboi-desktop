import type {
  ChapterSummary,
  ClientChapter,
  ExtractedItem,
  Highlight,
  SessionExtraction,
} from '@/components/session/recap-doc';

export interface RecapCallMeta {
  title?: string | null;
  durationSeconds: number;
  startedAt: number;
}

/** Render a session recap as Granola-style markdown — H2 sections, bullets,
 *  blockquoted key-moment quotes. Output is paste-ready for Notion / Slack /
 *  Linear and can be copied via the "Copy as Markdown" header action. */
export function renderRecapMarkdown(
  data: SessionExtraction,
  chapters: ClientChapter[],
  meta: RecapCallMeta,
): string {
  const parts: string[] = [];

  const title = meta.title?.trim() || 'Session recap';
  parts.push(`# ${title}`);
  parts.push(
    `*${formatDuration(meta.durationSeconds)} · ${new Date(meta.startedAt).toLocaleString()}*`,
  );

  if (data.summary) {
    parts.push('');
    parts.push('## TL;DR');
    parts.push(data.summary);
  }

  if (data.highlights.length > 0) {
    parts.push('');
    parts.push('## Key moments');
    for (const h of data.highlights) {
      parts.push(renderHighlight(h));
    }
  }

  parts.push('');
  parts.push(`## Decisions${countSuffix(data.decisions)}`);
  parts.push(...renderItems(data.decisions));

  parts.push('');
  parts.push(`## Action items${countSuffix(data.action_items)}`);
  parts.push(...renderItems(data.action_items, { checkbox: true }));

  parts.push('');
  parts.push(`## Open questions${countSuffix(data.open_questions)}`);
  parts.push(...renderItems(data.open_questions));

  const mergedChapters = mergeChapters(chapters, data.chapter_summaries);
  if (mergedChapters.length > 0) {
    parts.push('');
    parts.push('## Chapters');
    for (const c of mergedChapters) {
      parts.push(`### ${c.label}`);
      if (c.summary) {
        parts.push(c.summary);
      }
    }
  }

  return parts.join('\n');
}

function renderItems(items: ExtractedItem[], opts: { checkbox?: boolean } = {}): string[] {
  if (items.length === 0) {
    return ['_None._'];
  }
  const prefix = opts.checkbox ? '- [ ] ' : '- ';
  return items.map((it) => `${prefix}${it.text}${it.ts ? ` _(${formatTimeChip(it.ts)})_` : ''}`);
}

function renderHighlight(h: Highlight): string {
  const attribution = [h.speaker, h.ts ? formatTimeChip(h.ts) : ''].filter(Boolean).join(' · ');
  return `> ${h.quote}${attribution ? `\n> — ${attribution}` : ''}`;
}

function mergeChapters(
  clientChapters: ClientChapter[],
  aiSummaries: ChapterSummary[],
): Array<{ label: string; summary: string }> {
  if (clientChapters.length === 0) {
    // No client-derived chapters (e.g. shared/exported view) — fall back to AI's own list.
    return aiSummaries.map((c) => ({ label: c.label, summary: c.summary }));
  }
  const byLabel = new Map(aiSummaries.map((c) => [c.label.toLowerCase(), c]));
  return clientChapters.map((c) => ({
    label: c.label,
    summary: byLabel.get(c.label.toLowerCase())?.summary ?? '',
  }));
}

function countSuffix(items: ExtractedItem[]): string {
  return items.length > 0 ? ` (${items.length})` : '';
}

function formatDuration(s: number): string {
  if (s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatTimeChip(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
