'use client';

// The two floating clusters the rail does not carry.
//
// Bottom left: settings, the theme toggle, and the scope selects — what you
// are configuring and who you are configuring it for.
// Bottom centre: the world switcher, on its own, because flipping world
// repaints everything and should not sit in a row of small adjustments.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Check,
  ChevronsUpDown,
  Gauge,
  Lock,
  MessageSquare,
  ScrollText,
  Settings,
  Sparkles,
  Stethoscope,
  Wrench,
} from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { opsSection, type IconKey } from '@/lib/nav/sections';

import { ThemeSwitcher } from '@/components/theme-switcher';
import { WorldSwitcher } from '@/components/audience/world-switcher';
import { useAudience } from '@/components/providers/audience-provider';
import { UpdateCard } from '@/components/system/update-card';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { audiencesForRoute, type Audience } from '@shared/audience';
import { useTeamScope, type Scoped } from './use-team-scope';

/** The floating treatment every control in here is cut from. Each one is its
 *  own object — a single panel made them read as one compound control, and
 *  they are three unrelated decisions. */
const FLOAT = 'rounded-2xl bg-card/85 shadow-xl ring-1 ring-border/60 backdrop-blur-md';
/** Every floating control is this tall, so the row has one baseline. */
const CONTROL = 'h-8';

function ScopeSelect({
  value,
  options,
  onChange,
  label,
}: {
  value: string | null;
  options: Scoped[];
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.id === value) ?? options[0];

  // A popover rather than a `<select>`. The native menu is drawn by the OS in
  // the OS's own style — it lands on a dark floating panel looking like a
  // system dialog that wandered in, and none of the app's tokens reach it.
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className={`${FLOAT} ${CONTROL} flex items-center gap-2 pl-3 pr-2 font-body text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
          >
            <span className="max-w-[120px] truncate">{current?.name ?? label}</span>
            <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
          </button>
        }
      />
      <PopoverContent side="top" align="start" className="w-52 p-1">
        <div role="menu" aria-label={label} className="flex flex-col gap-0.5">
          {options.map((option) => {
            const active = option.id === current?.id;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setOpen(false);
                  onChange(option.id);
                }}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-body text-[12px] transition-colors duration-150 ${
                  active
                    ? 'bg-secondary/60 text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                }`}
              >
                <Check className={`h-3 w-3 shrink-0 ${active ? 'opacity-100' : 'opacity-0'}`} />
                <span className="truncate">{option.name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A face for each of the drawer's pages. The rail's own map does not carry
 *  them — it never draws these. */
const OPS_ICONS: Partial<Record<IconKey, typeof Settings>> = {
  ceremonies: CalendarDays,
  provenance: ScrollText,
  usage: Gauge,
  'whats-new': Sparkles,
  'system-check': Stethoscope,
  privacy: Lock,
  feedback: MessageSquare,
};

/** Ops, as a menu on the row rather than a third of a sidebar.
 *
 * It is the section the rail leaves out — settings-adjacent pages rather than
 * things you run — so it opens beside settings, in the same shape the scope
 * selects open in. */
function OpsMenu({ cmdHeld }: { cmdHeld: boolean }) {
  const pathname = usePathname();
  const { audience } = useAudience();
  const [open, setOpen] = useState(false);
  const section = opsSection(audience);
  if (!section) return null;

  const here = (href: string) => Boolean(pathname?.startsWith(href));
  const active = section.items.some((item) => here(item.href));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            title={section.label ?? 'Ops'}
            aria-label={section.label ?? 'Ops'}
            className={`${FLOAT} ${CONTROL} flex w-8 items-center justify-center transition-colors ${
              active || open
                ? 'text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
            style={{
              boxShadow: active
                ? `inset 0 0 0 1px var(--${cmdHeld ? 'primary' : 'border'})`
                : undefined,
            }}
          >
            <Wrench className="h-[14px] w-[14px]" />
          </button>
        }
      />
      <PopoverContent side="top" align="start" className="w-52 p-1">
        <div role="menu" aria-label={section.label ?? 'Ops'} className="flex flex-col gap-0.5">
          {section.items.map((item) => {
            const Icon = OPS_ICONS[item.icon] ?? Settings;
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-body text-[12px] transition-colors duration-150 ${
                  here(item.href)
                    ? 'bg-secondary/60 text-foreground'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function DockControls({ cmdHeld }: { cmdHeld: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { audience, setAudience } = useAudience();
  const scope = useTeamScope(audience);
  const settingsActive = Boolean(pathname?.startsWith('/settings'));

  // Where settings was reached from. The gear is a way in and back out again:
  // pressed a second time it returns you to the page you left rather than
  // leaving you to find it, which on a surface whose whole nav is its own
  // sections means finding it through Home.
  const cameFrom = useRef(DEFAULT_ROUTE);
  useEffect(() => {
    if (pathname && !pathname.startsWith('/settings')) cameFrom.current = pathname;
  }, [pathname]);

  // Flipping world while standing in the other world's route would leave the
  // page orphaned from the nav — go home instead.
  const flip = (next: Audience) => {
    if (next === audience) return;
    setAudience(next);
    const worlds = pathname ? audiencesForRoute(pathname) : [];
    if (worlds.length > 0 && !worlds.includes(next)) router.push(DEFAULT_ROUTE);
  };

  return (
    <>
      <div data-dock className="fixed bottom-4 left-3 z-40 flex flex-col items-start gap-2">
        {/* Loud enough to interrupt, so it sits above the row rather than in
            it. Renders nothing when there is nothing to say. */}
        <div className="w-[230px] empty:hidden">
          <UpdateCard />
        </div>

        <div className="flex items-center gap-2">
          {/* The world switcher leads the row: it is the widest choice on it —
              everything else is scoped inside whichever world it names. */}
          <div className={`${FLOAT} ${CONTROL} flex items-center px-1`}>
            <WorldSwitcher onSwitch={flip} />
          </div>

          <Link
            href={settingsActive ? cameFrom.current : '/settings'}
            title={settingsActive ? `Back to ${cameFrom.current}` : 'Settings'}
            aria-label={settingsActive ? 'Leave settings' : 'Settings'}
            className={`${FLOAT} ${CONTROL} flex w-8 items-center justify-center transition-colors ${
              settingsActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
            style={{
              boxShadow: settingsActive
                ? `inset 0 0 0 1px var(--${cmdHeld ? 'primary' : 'border'})`
                : undefined,
            }}
          >
            <Settings className="h-[14px] w-[14px]" />
          </Link>

          <OpsMenu cmdHeld={cmdHeld} />

          <div className={`${FLOAT} ${CONTROL} flex w-8 items-center justify-center`}>
            <ThemeSwitcher />
          </div>

          {/* Scope, and only where there is a choice to make: one org is not a
              decision, and the agents world has neither. */}
          {scope.loaded && audience !== 'agents' && scope.teams.length > 0 && (
            <ScopeSelect
              label="Team"
              value={scope.teamId}
              options={scope.teams}
              onChange={scope.chooseTeam}
            />
          )}

          {scope.loaded && audience !== 'agents' && scope.orgs.length > 1 && (
            <ScopeSelect
              label="Organisation"
              value={scope.orgId}
              options={scope.orgs}
              onChange={scope.chooseOrg}
            />
          )}
        </div>
      </div>
    </>
  );
}
