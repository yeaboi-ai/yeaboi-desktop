'use client';

// All Tips — every discoverability tip in one scroll, the desktop's answer to
// the TUI gallery behind `a`. The three sections are derived from the tips
// themselves (see groupTips); a tip carries no category.

import { useState } from 'react';
import { ArrowUpRight, Check, Copy } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { buildTipsText, cleanTipText, groupTips, tipRoute, type Tip } from '@/lib/yeaboi/tips';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tips: Tip[];
  /** Mode key → card title, from /api/meta/capabilities. */
  titles: Record<string, string>;
  /** Mode key → the card's own accent colour. */
  colors: Record<string, string>;
  onNavigate: (route: string) => void;
}

export function AllTipsSheet({ open, onOpenChange, tips, titles, colors, onNavigate }: Props) {
  const [copied, setCopied] = useState(false);
  const groups = groupTips(tips);

  const copyAll = async () => {
    await navigator.clipboard.writeText(buildTipsText(tips, titles));
    setCopied(true);
    setTimeout(() => setCopied(false), 1_600);
  };

  const open_ = (route: string) => {
    onOpenChange(false);
    onNavigate(route);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader className="pr-12">
          <SheetTitle>All tips</SheetTitle>
          <SheetDescription>
            Everything yeaboi can do — {tips.length} in the rotation.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {groups.map((group) => (
            <section key={group.key}>
              <h3 className="text-[10px] font-body uppercase tracking-[0.08em] text-muted-foreground/70 mb-2">
                {group.title}
              </h3>
              <ul className="space-y-1.5">
                {group.tips.map((tip, i) => {
                  const route = tipRoute(tip);
                  const title = tip.mode_key ? titles[tip.mode_key] : undefined;
                  const color = tip.mode_key ? colors[tip.mode_key] : undefined;
                  return (
                    // Two tips can share a capability key, so the index joins it.
                    <li
                      key={`${tip.key}-${i}`}
                      className="rounded-xl bg-secondary/40 px-3.5 py-2.5 ring-1 ring-border/40"
                    >
                      <p className="text-[12.5px] leading-snug text-foreground">
                        {cleanTipText(tip.text)}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {tip.is_beta ? (
                          <Badge variant="outline" className="border-warning/40 text-warning">
                            BETA
                          </Badge>
                        ) : tip.is_new ? (
                          <Badge variant="outline" className="border-primary/40 text-primary">
                            NEW
                          </Badge>
                        ) : null}
                        {route && title && (
                          <button
                            type="button"
                            onClick={() => open_(route)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                              style={{ background: color }}
                            />
                            opens {title}
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-auto flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60">
          <Button variant="outline" size="sm" onClick={copyAll}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy all'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
