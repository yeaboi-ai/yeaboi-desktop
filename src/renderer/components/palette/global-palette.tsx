'use client';

// Find anything: one dialog over every destination the window has. The list
// is ranked and grouped by lib/yeaboi/palette.ts from whatever the sources
// have loaded; this draws it, walks it with the arrow keys, and opens what is
// chosen. It shares the session palette's frame (ui/command.tsx) but not its
// list, whose order is the order rows registered, not the order they rank.
// The rail and the title bar stay clear of the veil: the palette is a way to
// go somewhere, not a replacement for the ways already on screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { WORLD_COPY, audiencesForRoute, audiencesShown, type Audience } from '@shared/audience';
import { useNikoContext } from '@/components/niko/niko-provider';
import { useAudience } from '@/components/providers/audience-provider';
import { usePalette } from '@/components/providers/palette-provider';
import { useUpdateState } from '@/hooks/use-update-state';
import { usePaletteSources } from '@/hooks/yeaboi/use-palette-sources';
import { visibleRailDestinations } from '@/lib/nav/rail-catalogue';
import { railLucideIcon } from '@/lib/nav/rail-icons';
import { checkForUpdate } from '@/lib/yeaboi/api';
import { allCards } from '@/lib/yeaboi/capabilities';
import {
  PALETTE_EMPTY,
  PALETTE_PLACEHOLDER,
  PALETTE_UNAVAILABLE,
  actionHits,
  groupHits,
  moveSelection,
  pageHits,
  projectHits,
  rankHits,
  sessionHits,
  settingHits,
  type PaletteActionId,
  type PaletteHit,
} from '@/lib/yeaboi/palette';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { shapeSessions } from '@/lib/yeaboi/sessions';
import { cn } from '@/lib/utils';

export function GlobalPalette() {
  const { isOpen, query, open, close } = usePalette();
  const { audience, soloEnabled, setAudience } = useAudience();
  const { setIsOpen: setNikoOpen } = useNikoContext();
  const update = useUpdateState();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { caps, projects, sessions, settings } = usePaletteSources(isOpen);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // The input starts as the field that opened it left it, on every open.
  useEffect(() => {
    if (isOpen) {
      setText(query);
      setSelected(0);
    }
  }, [isOpen, query]);

  const now = useMemo(() => new Date(), [isOpen]);
  const hits = useMemo<PaletteHit[]>(() => {
    const cards = caps ? allCards(caps) : [];
    const shaped = sessions ? shapeSessions(sessions, cards, now) : [];
    return [
      ...projectHits(projects ?? [], audience),
      ...sessionHits(shaped),
      ...pageHits(visibleRailDestinations(soloEnabled), caps, audience),
      ...settingHits(settings ?? []),
      ...actionHits(audience, update, audiencesShown(soloEnabled)),
    ];
  }, [caps, projects, sessions, settings, audience, soloEnabled, update, now]);

  const shown = useMemo(() => rankHits(hits, text), [hits, text]);
  const sections = useMemo(() => groupHits(shown), [shown]);
  const indexOf = useMemo(() => new Map(shown.map((hit, index) => [hit.id, index])), [shown]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, shown]);

  const runAction = (action: PaletteActionId): void => {
    if (action === 'check-updates') {
      void checkForUpdate();
      navigate('/whats-new');
      return;
    }
    if (action === 'ask-niko') {
      setNikoOpen(true);
      return;
    }
    const world = action.slice('switch-world:'.length) as Audience;
    setAudience(world);
    // A page the new world does not own would be orphaned from the rail.
    const worlds = audiencesForRoute(pathname);
    if (worlds.length > 0 && !worlds.includes(world)) navigate(DEFAULT_ROUTE);
  };

  const choose = (hit: PaletteHit): void => {
    close();
    if (hit.action) runAction(hit.action);
    else if (hit.href) navigate(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) =>
        moveSelection(current, event.key === 'ArrowDown' ? 1 : -1, shown.length),
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = shown[selected];
      if (hit) choose(hit);
    }
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(next) => (next ? open() : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            'fixed top-[var(--titlebar-h)] right-0 bottom-0 left-[var(--rail-w)] z-[280]',
            'bg-background/70 backdrop-blur-sm',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150',
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            'fixed top-[20vh] left-[calc(50%_+_var(--rail-w)_/_2)] z-[290] -translate-x-1/2',
            'w-[min(640px,calc(100vw_-_var(--rail-w)_-_2rem))]',
            'rounded-2xl bg-card ring-1 ring-border/70 shadow-2xl outline-none overflow-hidden',
            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
            'transition-[opacity,transform] duration-150',
          )}
          aria-label={PALETTE_PLACEHOLDER}
        >
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
            <input
              autoFocus
              type="text"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setSelected(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={PALETTE_PLACEHOLDER}
              aria-label={PALETTE_PLACEHOLDER}
              className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          <div ref={listRef} role="listbox" className="max-h-[60vh] overflow-y-auto p-1">
            {sections.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground/70">
                {PALETTE_EMPTY}
              </p>
            )}
            {sections.map((section) => (
              <div key={section.key} role="group" className="py-1">
                <div className="px-3 py-1 font-body text-[11px] text-muted-foreground/70">
                  {section.title}
                </div>
                {section.hits.map((hit) => (
                  <Row
                    key={hit.id}
                    hit={hit}
                    selected={indexOf.get(hit.id) === selected}
                    onHover={() => setSelected(indexOf.get(hit.id) ?? 0)}
                    onChoose={() => choose(hit)}
                  />
                ))}
              </div>
            ))}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Row({
  hit,
  selected,
  onHover,
  onChoose,
}: {
  hit: PaletteHit;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
}) {
  const Icon = railLucideIcon(hit.icon);
  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onChoose}
      onMouseEnter={onHover}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        selected ? 'bg-foreground/[0.06] text-foreground' : 'text-foreground/80',
        !hit.available && 'opacity-50',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{hit.title}</span>
        {hit.detail && (
          <span className="block truncate text-[11px] text-muted-foreground">{hit.detail}</span>
        )}
      </span>
      {!hit.available && (
        <span className="shrink-0 text-[11px] text-muted-foreground">{PALETTE_UNAVAILABLE}</span>
      )}
      {hit.world && (
        <span className="shrink-0 rounded px-1.5 text-[10px] text-muted-foreground/80 ring-1 ring-border/70">
          {WORLD_COPY[hit.world].title}
        </span>
      )}
    </div>
  );
}
