// The Slack channel, chosen from the workspace instead of hunted for in the
// Slack client and pasted.
//
// Three states, in this order: a picker when the engine can list channels, a
// text box with the reason when it cannot, and a text box with an invitation
// when there is no bot token yet. A workspace has hundreds of channels, so the
// picker is a searchable sheet rather than a select.

import { useEffect, useMemo, useState } from 'react';
import { Hash, Lock, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { type SettingField, type SlackChannel, loadSlackChannels } from '@/lib/yeaboi/settings';

const INPUT_CLASS =
  'mt-1 w-full rounded-lg border border-border/40 bg-secondary/40 px-3 py-2 font-mono text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-primary/40 focus:outline-none';

export function SlackChannelRow({
  field,
  hasToken,
  onPick,
}: {
  field: SettingField;
  /** Without a bot token there is nothing to list. */
  hasToken: boolean;
  onPick: (channelId: string) => void;
}) {
  const [channels, setChannels] = useState<SlackChannel[] | null>(null);
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [typed, setTyped] = useState(field.value);

  useEffect(() => {
    if (!hasToken) return;
    let cancelled = false;
    loadSlackChannels().then(
      (payload) => {
        if (cancelled) return;
        setChannels(payload?.channels ?? null);
        setReason(payload?.reason ?? '');
      },
      () => !cancelled && setChannels(null),
    );
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = channels ?? [];
    return needle ? all.filter((c) => c.name.toLowerCase().includes(needle)) : all;
  }, [channels, query]);

  const chosen = (channels ?? []).find((c) => c.id === field.value);
  const canPick = hasToken && channels !== null && channels.length > 0;

  if (!canPick) {
    return (
      <div>
        <input
          value={typed}
          aria-label={field.label}
          placeholder="C0123456789"
          onChange={(event) => setTyped(event.target.value)}
          onBlur={() => typed !== field.value && onPick(typed.trim())}
          className={INPUT_CLASS}
        />
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
          {!hasToken
            ? 'Save a bot token to pick from a list.'
            : reason || 'Your yeaboi engine cannot list channels yet — paste the channel ID.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
          {chosen ? `#${chosen.name}` : field.value || 'no channel chosen'}
        </span>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          Choose channel…
        </Button>
      </div>
      {reason && <p className="mt-1.5 text-[11px] text-muted-foreground/80">{reason}</p>}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-[380px] flex-col gap-3 sm:max-w-[380px]">
          <SheetHeader>
            <SheetTitle>Choose a channel</SheetTitle>
            <SheetDescription>Where ceremonies and reports are posted.</SheetDescription>
          </SheetHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              value={query}
              placeholder="Search channels"
              aria-label="Search channels"
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => {
                  onPick(channel.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-secondary/50"
              >
                {channel.is_private ? (
                  <Lock className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <Hash className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                No channel matches that.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
