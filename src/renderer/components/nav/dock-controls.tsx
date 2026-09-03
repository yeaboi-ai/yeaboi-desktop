'use client';

// The two floating clusters the rail does not carry.
//
// Bottom left: settings, the theme toggle, and the scope selects — what you
// are configuring and who you are configuring it for.
// Bottom centre: the world switcher, on its own, because flipping world
// repaints everything and should not sit in a row of small adjustments.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronsUpDown, Settings } from 'lucide-react';

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
  return (
    <div className="relative">
      {/* The select carries the floating treatment itself. Wrapped in a panel
          it read as a dropdown inside a box — two borders for one control. */}
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={`${FLOAT} ${CONTROL} cursor-pointer appearance-none py-0 pl-3 pr-7 font-body text-[11px] text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring`}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
    </div>
  );
}

export function DockControls({ cmdHeld }: { cmdHeld: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { audience, setAudience } = useAudience();
  const scope = useTeamScope(audience);
  const settingsActive = Boolean(pathname?.startsWith('/settings'));

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
      <div className="fixed bottom-4 left-3 z-40 flex flex-col items-start gap-2">
        {/* Loud enough to interrupt, so it sits above the row rather than in
            it. Renders nothing when there is nothing to say. */}
        <div className="w-[230px] empty:hidden">
          <UpdateCard />
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            title="Settings"
            aria-label="Settings"
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

      {/* Bottom centre, above Niko's bar rather than under it — that bar owns
          this column and is the thing people reach for; the world switcher is
          a rare, deliberate flip. */}
      <div className={`fixed bottom-[92px] left-1/2 z-40 -translate-x-1/2 ${FLOAT} p-1`}>
        <WorldSwitcher onSwitch={flip} />
      </div>
    </>
  );
}
