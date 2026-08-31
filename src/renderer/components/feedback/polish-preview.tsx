'use client';

// The AI Polish proposal, shown before it replaces anything.
//
// The terminal has had this step since the feature shipped; the desktop used to
// overwrite the draft in place, which meant a rewrite you disliked had eaten
// what you wrote. Nothing here mutates the draft — the page does that, and only
// when "Use this" is pressed.

import { Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface Polished {
  title: string;
  description: string;
}

function Column({
  eyebrow,
  title,
  description,
  muted,
}: {
  eyebrow: string;
  title: string;
  description: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="font-body text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <p
        className={
          muted
            ? 'font-body text-[14px] leading-snug text-muted-foreground'
            : 'font-body text-[14px] leading-snug font-medium text-foreground'
        }
      >
        {title || 'Untitled'}
      </p>
      <p
        className={`max-h-72 overflow-y-auto text-[12.5px] leading-relaxed whitespace-pre-wrap ${
          muted ? 'text-muted-foreground/80' : 'text-foreground/90'
        }`}
      >
        {description}
      </p>
    </div>
  );
}

export function PolishPreview({
  mine,
  polished,
  onUse,
  onKeep,
}: {
  mine: Polished;
  polished: Polished;
  onUse: () => void;
  onKeep: () => void;
}) {
  return (
    <section className="animate-slide-up overflow-hidden rounded-2xl bg-card ring-1 ring-border/60 motion-reduce:animate-none">
      <header className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        <Wand2 className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="font-body text-[13.5px] font-medium text-foreground">
          A rewrite, for you to compare
        </h2>
      </header>

      <div className="grid sm:grid-cols-2 sm:divide-x sm:divide-border/50">
        <div className="px-5 py-4">
          <Column
            eyebrow="What you wrote"
            title={mine.title}
            description={mine.description}
            muted
          />
        </div>
        <div className="border-t border-border/50 px-5 py-4 sm:border-t-0">
          <Column eyebrow="The rewrite" title={polished.title} description={polished.description} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 bg-secondary/25 px-5 py-3.5">
        <Button size="sm" onClick={onUse}>
          Use this
        </Button>
        <Button variant="outline" size="sm" onClick={onKeep}>
          Keep mine
        </Button>
        <p className="font-body text-[11.5px] text-muted-foreground">Nothing is sent either way.</p>
      </div>
    </section>
  );
}
