'use client';

// The two floating clusters the rail does not carry.
//
// Bottom left: settings, the theme toggle, and the scope selects — what you
// are configuring and who you are configuring it for.
// Bottom centre: the world switcher, on its own, because flipping world
// repaints everything and should not sit in a row of small adjustments.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
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
import { isSettingsPath } from '@/lib/nav/rail-rows';
import { cameFrom } from '@/lib/nav/came-from';
import {
  needsAttention,
  type Check as SystemCheckRow,
  type Report,
} from '@/lib/yeaboi/system-check';
import { apiGet } from '@/lib/yeaboi/api';

import { ThemeSwitcher } from '@/components/theme-switcher';
import { WorldSwitcher } from '@/components/audience/world-switcher';
import { useAudience } from '@/components/providers/audience-provider';
import { UpdateCard } from '@/components/system/update-card';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { audiencesForRoute, type Audience } from '@shared/audience';
import { BUTTON, CONTROL, FLOAT } from './dock-float';
import { MusicPocket } from './dock-music';
import { useTeamScope, type Scoped } from './use-team-scope';

/** The padding the counts pill wears while it is still a pill. */
const PILL_PAD = 12;

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

/** A button that changes job in front of you.
 *
 *  Both faces are here and one of them is always leaving: the icon winds a
 *  quarter turn out as the arrow swings in, rather than the two swapping
 *  between frames. */
function SwapIcon({ away, back }: { away: React.ReactElement; back: boolean }) {
  const face = 'absolute h-[14px] w-[14px] transition-all duration-200 ease-out';
  return (
    <span className="relative flex h-[14px] w-[14px] items-center justify-center">
      {cloneElement(away as React.ReactElement<{ className?: string; 'aria-hidden'?: boolean }>, {
        'aria-hidden': true,
        className: `${face} ${back ? 'rotate-90 scale-75 opacity-0' : 'rotate-0 scale-100 opacity-100'}`,
      })}
      <ArrowLeft
        aria-hidden
        className={`${face} ${
          back ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-75 opacity-0'
        }`}
      />
    </span>
  );
}

/** A dot per status and how many are in it. The strip of one cell per check
 *  said the same thing in twenty-one marks; at this size a count reads and a
 *  cell does not. */
const CHECK_TONES: { status: SystemCheckRow['status']; dot: string; says: string }[] = [
  { status: 'ok', dot: 'bg-success/80', says: 'ready' },
  { status: 'missing', dot: 'bg-warning/80', says: 'not set up' },
  { status: 'unsupported', dot: 'bg-destructive/80', says: 'unsupported' },
  { status: 'unknown', dot: 'bg-muted-foreground/40', says: 'unknown' },
];

/** The system check, as a pill on the row.
 *
 *  It was a panel on the dashboard saying two numbers and a strip. The counts
 *  are the whole of what it had to say at a glance, and they fit here. The
 *  page behind it is which ones, and what they want. */
function SystemCheckPill() {
  const [report, setReport] = useState<Report | null>(null);
  const pathname = usePathname();
  const here = Boolean(pathname?.startsWith('/system-check'));

  useEffect(() => {
    apiGet<Report>('/api/system/check').then(
      (payload) => setReport(payload),
      () => setReport(null),
    );
  }, []);

  // Both faces are laid over each other rather than beside each other, so the
  // one thing that moves is the box: its width. The counts are measured
  // because that width has to be a number at both ends — `auto` does not
  // transition, and a max-width standing in for it sits still until it drops
  // below the content and then collapses all at once.
  const face = useRef<HTMLSpanElement>(null);
  const [full, setFull] = useState(0);
  useLayoutEffect(() => {
    const box = face.current;
    if (!box) return;
    const take = () => setFull(box.offsetWidth + PILL_PAD * 2);
    take();
    const watch = new ResizeObserver(take);
    watch.observe(box);
    return () => watch.disconnect();
  }, [report]);

  if (!report || report.checks.length === 0) return null;
  const counts = CHECK_TONES.map((tone) => ({
    ...tone,
    count: report.checks.filter((one) => one.status === tone.status).length,
  })).filter((tone) => tone.count > 0);
  const label = here
    ? 'Back'
    : `System check — ${counts.map((one) => `${one.count} ${one.says}`).join(', ')}`;

  return (
    <Link
      href={here ? cameFrom() : '/system-check'}
      title={label}
      aria-label={label}
      className={`${FLOAT} ${CONTROL} relative flex shrink-0 items-center justify-center overflow-hidden font-code text-[11px] text-muted-foreground transition-[width,color,background-color] duration-200 ease-out hover:bg-secondary/50 hover:text-foreground`}
      style={{ width: here ? BUTTON : full || undefined }}
    >
      {/* On the page it leads to, it is the way back: the pill narrows to a
          button and the two faces cross over in place. */}
      <span
        ref={face}
        className={`absolute flex items-center gap-2.5 whitespace-nowrap transition-opacity duration-200 ease-out ${
          here ? 'opacity-0' : 'opacity-100'
        }`}
      >
        {counts.map((tone) => (
          <span key={tone.status} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.count}
          </span>
        ))}
      </span>
      <ArrowLeft
        aria-hidden
        className={`absolute h-[14px] w-[14px] transition-opacity duration-200 ease-out ${
          here ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </Link>
  );
}

export function DockControls({ cmdHeld }: { cmdHeld: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { audience, setAudience } = useAudience();
  const scope = useTeamScope(audience);
  // The same test the rail uses, so the gear lights wherever the rail is
  // holding settings — including the page or two settings has adopted that
  // keep a top-level route of their own.
  const settingsActive = isSettingsPath(pathname);

  const feedbackActive = Boolean(pathname?.startsWith('/feedback'));

  // These buttons are a way in and back out again: pressed a second time they
  // return you to the page you left rather than leaving you to find it, which
  // on a surface whose whole nav is its own sections means finding it through
  // Home. Where that is is remembered in one place, because the rail offers
  // the same way back.
  const back = cameFrom();

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
      {/* The row beside the duck rather than in the one on the left: what is
          playing, what the system check found, and telling us something — none
          of them a setting, and he is the one on screen who looks like he
          would pass it on. Clear of his perch, on the row's baseline.
          It retreats with the rest of the dock: a board staged in the window
          is the window, and the app's own chrome gets off it. The transition
          comes with the attribute — see globals.css. */}
      <div
        data-dock="right"
        className="fixed right-[calc(4rem+var(--turn-inset))] bottom-[calc(1rem+var(--turn-inset))] z-40 flex items-center gap-2"
      >
        <MusicPocket />
        <SystemCheckPill />

        <Link
          href={feedbackActive ? back : '/feedback'}
          title={feedbackActive ? 'Back' : 'Send feedback'}
          aria-label={feedbackActive ? 'Leave feedback' : 'Send feedback'}
          className={`${FLOAT} ${CONTROL} flex w-8 shrink-0 items-center justify-center transition-colors ${
            feedbackActive
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          }`}
        >
          <SwapIcon away={<MessageSquare />} back={feedbackActive} />
        </Link>
      </div>

      <div
        data-dock
        className="fixed bottom-[calc(1rem+var(--turn-inset))] left-[calc(0.75rem+var(--turn-inset))] z-40 flex flex-col items-start gap-2 transition-[bottom,left] duration-300 ease-out"
      >
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
            href={settingsActive ? back : '/settings'}
            title={settingsActive ? `Back to ${back}` : 'Settings'}
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
            <SwapIcon away={<Settings />} back={settingsActive} />
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
