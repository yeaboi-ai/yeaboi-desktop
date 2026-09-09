'use client';

// The rail: a column of squares. The world's mascot at the top goes home and
// holds the world menu; then the squares the reader arranged for this world
// (Projects and Sessions to start, any page after that — @shared/rail); then
// the "+" that arranges them; and at the foot the music pocket and Settings. Which square is
// lit is lib/nav/sections.ts's activeRailRoute, so a mode page opened inside
// a project keeps Projects lit.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocation } from 'react-router';
import { ChevronsUpDown, Plus, Settings } from 'lucide-react';
import { WorldPopover } from '@/components/audience/world-switcher';
import { useAudience } from '@/components/providers/audience-provider';
import { useRail } from '@/components/providers/rail-provider';
import { RailButton } from '@/components/rail/rail-button';
import { RailEditorDialog, type RailEditorMode } from '@/components/rail/rail-editor-dialog';
import { RailItemIcon } from '@/components/rail/rail-item-icon';
import { RailPocket } from '@/components/music/rail-pocket';
import { useMusicPlayer } from '@/components/providers/music-provider';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Separator } from '@/components/ui/separator';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { SETTINGS_ITEM, activeRailRoute } from '@/lib/nav/sections';
import { WORLD_MASCOT } from '@/lib/audience/worlds';
import { audiencesForRoute, WORLD_COPY, type Audience } from '@shared/audience';
import { RAIL_LIMITS } from '@shared/rail';
import { updateIndicatorVisible } from '@shared/update';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { useUpdateState } from '@/hooks/use-update-state';

const isMac = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac');
const MOD = isMac ? '⌘' : 'Ctrl+';

function inEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function Sidebar() {
  const pathname = usePathname() ?? '';
  const { search } = useLocation();
  const router = useRouter();
  const { audience, soloEnabled, setAudience } = useAudience();
  const { items, loaded, removeItem, moveItem, resetWorld } = useRail();
  const confirm = useConfirm();
  const active = activeRailRoute(items, pathname, search, audience);
  const updateDot = updateIndicatorVisible(useUpdateState(), null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [editor, setEditor] = useState<RailEditorMode | null>(null);
  const Mascot = WORLD_MASCOT[audience];
  const { jamming } = useMusicPlayer();

  // Flipping the world while standing in the other world's route would leave
  // the page orphaned from the nav — go home instead.
  const flipAudience = (next: Audience) => {
    if (next === audience) return;
    setAudience(next);
    const worlds = audiencesForRoute(pathname);
    if (worlds.length > 0 && !worlds.includes(next)) router.push(DEFAULT_ROUTE);
  };

  // Detect Cmd/Ctrl held for the ring on the lit square.
  const [cmdHeld, setCmdHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setCmdHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setCmdHeld(false);
    };
    const blur = () => setCmdHeld(false);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Cmd+Up/Down walks the squares and Cmd+1..9 jumps to one. Cmd+P / Cmd+S /
  // Cmd+B are the menu bar's Go menu (src/main/menu.ts), so they are not
  // repeated here.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (inEditableTarget(e) || editor !== null) return;
      const routes = [...items.map((item) => item.route), SETTINGS_ITEM.href];
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const current = active ? routes.indexOf(active) : -1;
        const idx = current === -1 ? (e.key === 'ArrowDown' ? -1 : 0) : current;
        const next =
          e.key === 'ArrowDown'
            ? (idx + 1) % routes.length
            : (idx - 1 + routes.length) % routes.length;
        router.push(routes[next]!);
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const item = items[Number(e.key) - 1];
        if (!item) return;
        e.preventDefault();
        router.push(item.route);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, items, active, editor]);

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset this rail?',
      message: 'Back to Projects and Sessions. Icons and images you added here are forgotten.',
      confirmLabel: 'Reset',
      variant: 'warning',
    });
    if (ok) resetWorld();
  };

  const full = items.length >= RAIL_LIMITS.items;

  return (
    <TooltipProvider>
      <aside
        className={`fixed left-0 bottom-0 w-[var(--rail-w)] border-r border-border/60 bg-background flex flex-col items-center z-40 overflow-visible transition-opacity duration-300 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        // The title bar and the provider-health banner pad the page down, but
        // padding cannot move a fixed element — this reads both heights.
        style={{ top: 'calc(var(--titlebar-h, 0px) + var(--banner-h, 0px))' }}
      >
        {/* The mascot names the world and goes home; its menu flips the world
            when there is more than one. */}
        <div className="relative pt-3 pb-2">
          <RailButton
            label={`Home · ${WORLD_COPY[audience].title}`}
            aria-label="Home"
            lit={pathname === DEFAULT_ROUTE}
            ring={cmdHeld}
            onClick={() => router.push(DEFAULT_ROUTE)}
            onContextMenu={(event) => {
              if (!soloEnabled) return;
              event.preventDefault();
              setWorldOpen(true);
            }}
          >
            <Mascot size={30} jamming={jamming} />
            {updateDot && (
              <span
                aria-hidden
                className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-background"
              />
            )}
          </RailButton>
          {/* One world means nothing to switch to, so the chip goes rather
              than opening a popover with a single row. */}
          {soloEnabled && (
            <WorldPopover
              open={worldOpen}
              onOpenChange={setWorldOpen}
              onSwitch={flipAudience}
              trigger={
                <button
                  type="button"
                  aria-label={`Switch world (now ${WORLD_COPY[audience].title})`}
                  title="Switch world"
                  className="absolute -right-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border/60 opacity-60 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-ring"
                >
                  <ChevronsUpDown className="h-3 w-3" />
                </button>
              }
            />
          )}
        </div>

        <Separator className="w-8" />

        {/* The arranged squares, then the "+". */}
        <nav
          aria-label="Rail"
          className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto py-2 [scrollbar-width:none]"
        >
          {items.map((item, index) => {
            const lit = active === item.route;
            const shortcut = index < 9 ? `${MOD}${index + 1}` : null;
            return (
              <ContextMenu key={item.id}>
                <ContextMenuTrigger render={<div />}>
                  <RailButton
                    href={item.route}
                    label={
                      <span className="flex items-center gap-2">
                        {item.label}
                        {shortcut && (
                          <kbd className="font-mono text-[10px] text-muted-foreground">
                            {shortcut}
                          </kbd>
                        )}
                      </span>
                    }
                    aria-label={item.label}
                    lit={lit}
                    ring={cmdHeld}
                  >
                    <RailItemIcon icon={item.icon} audience={audience} />
                  </RailButton>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onClick={() => setEditor({ kind: 'edit', itemId: item.id })}>
                    Change icon or name…
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem disabled={index === 0} onClick={() => moveItem(item.id, -1)}>
                    Move up
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(item.id, 1)}
                  >
                    Move down
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onClick={() => removeItem(item.id)}>
                    Remove from the rail
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          <ContextMenu>
            <ContextMenuTrigger render={<div />}>
              <RailButton
                label={full ? `The rail holds ${RAIL_LIMITS.items}` : 'Add to the rail'}
                aria-label="Add to the rail"
                dashed
                onClick={() => setEditor({ kind: 'add' })}
              >
                <Plus className="h-5 w-5" />
              </RailButton>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => setEditor({ kind: 'add' })}>
                Add a page…
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => void reset()}>Reset this rail</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </nav>

        <Separator className="w-8" />

        {/* The music pocket, then Settings: the two fixed squares at the foot. */}
        <div className="flex flex-col items-center gap-2 pt-2 pb-3">
          <RailPocket ring={cmdHeld} />
          <RailButton
            href={SETTINGS_ITEM.href}
            label={SETTINGS_ITEM.label}
            lit={active === SETTINGS_ITEM.href}
            ring={cmdHeld}
          >
            <Settings className="h-5 w-5" />
          </RailButton>
        </div>
      </aside>

      <RailEditorDialog mode={editor} onClose={() => setEditor(null)} />
    </TooltipProvider>
  );
}
