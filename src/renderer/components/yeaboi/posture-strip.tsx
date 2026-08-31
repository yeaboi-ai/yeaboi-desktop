// One cell per thing being reported on, tinted by its state — the terminal's
// ▰▰▰▱▱ meter in pixels, so a machine's readiness and a privacy posture read the
// same way on both surfaces.
//
// The strip is a summary, never the only carrier of a row's state: it reads out
// as one `label`, and the rows below it say the same thing in words. Per-cell
// `title` is a mouse affordance only — children of `role="img"` are
// presentational, so a cell's own text reaches nobody.

import { cn } from '@/lib/utils';

export type PostureTone = 'good' | 'warn' | 'bad' | 'idle';

const TONE_CLASS: Record<PostureTone, string> = {
  good: 'bg-success/70',
  warn: 'bg-warning/70',
  bad: 'bg-destructive/70',
  idle: 'bg-muted-foreground/25',
};

export interface PostureCell {
  key: string;
  tone: PostureTone;
  title: string;
}

export function PostureStrip({
  cells,
  label,
  className,
}: {
  cells: PostureCell[];
  /** What the strip says out loud, e.g. "9 of 19 ready". */
  label: string;
  className?: string;
}) {
  if (cells.length === 0) return null;
  return (
    <div role="img" aria-label={label} className={cn('flex gap-[3px]', className)}>
      {cells.map((cell) => (
        <span
          key={cell.key}
          title={cell.title}
          className={cn('h-1.5 min-w-[3px] flex-1 rounded-full', TONE_CLASS[cell.tone])}
        />
      ))}
    </div>
  );
}
