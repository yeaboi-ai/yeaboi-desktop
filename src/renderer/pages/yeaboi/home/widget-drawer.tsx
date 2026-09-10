'use client';

// Which widgets the dashboard draws, and in what order.
//
// A drawer rather than a page: arranging the dashboard is something you do
// while looking at it, and a settings screen you have to leave to see the
// result is a settings screen you have to visit twice.

import { ArrowDown, ArrowUp } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { WIDGET_IDS, type WidgetId, type WidgetPrefs } from '@shared/widgets';

export function WidgetDrawer({
  open,
  onOpenChange,
  prefs,
  titles,
  onChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  prefs: WidgetPrefs;
  titles: Record<WidgetId, string>;
  onChange: (patch: Partial<WidgetPrefs>) => void;
}) {
  // Stored order first, then anything it predates — the same rule the
  // dashboard draws by, so this list is what you are about to see.
  const order: WidgetId[] = [
    ...prefs.order,
    ...WIDGET_IDS.filter((id) => !prefs.order.includes(id)),
  ];
  const off = new Set(prefs.hidden);

  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange({ order: next });
  };

  const toggle = (id: WidgetId) =>
    onChange({
      hidden: off.has(id) ? prefs.hidden.filter((one) => one !== id) : [...prefs.hidden, id],
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Arrange the dashboard</SheetTitle>
          <SheetDescription>Which widgets it draws, and in what order.</SheetDescription>
        </SheetHeader>
        <ul className="divide-y divide-border/40">
          {order.map((id, index) => (
            <li key={id} className="flex items-center gap-3 py-2.5">
              <span
                className={`min-w-0 flex-1 truncate font-body text-[13px] ${
                  off.has(id) ? 'text-muted-foreground/60' : 'text-foreground'
                }`}
              >
                {titles[id]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${titles[id]} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Move ${titles[id]} down`}
                disabled={index === order.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown className="size-3.5" aria-hidden />
              </Button>
              <Switch
                checked={!off.has(id)}
                onCheckedChange={() => toggle(id)}
                aria-label={`Show ${titles[id]}`}
              />
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
