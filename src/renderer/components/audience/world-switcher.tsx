'use client';

// The menu behind the rail's mascot. The shell lives in one world at a time
// and the world repaints the chrome, so the mascot states which world you are
// in; this popover is where it flips — a deliberate gesture, matching an act
// that swaps the whole nav — and, in the Team world, where the roster is
// chosen. Its copy comes from WORLD_COPY, the same source the full-screen
// chooser reads. The update card sits at its foot, under the mascot's dot.

import type { ReactElement } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BetaChip } from '@/components/yeaboi/beta-chip';
import { UpdateCard } from '@/components/system/update-card';
import { WORLD_MASCOT } from '@/lib/audience/worlds';
import { useAudience } from '@/components/providers/audience-provider';
import { useRoster } from '@/hooks/use-roster';
import { audiencesShown, WORLD_COPY, type Audience } from '@shared/audience';

const SELECT =
  'w-full appearance-none cursor-pointer text-[11px] font-body bg-transparent border border-border/40 rounded-md pl-2 pr-6 py-1 text-muted-foreground hover:border-border focus:outline-none focus:ring-1 focus:ring-ring';

function RosterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
    </label>
  );
}

export function WorldPopover({
  open,
  onOpenChange,
  onSwitch,
  trigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitch: (audience: Audience) => void;
  /** The element the popover hangs off; it receives the trigger's handlers. */
  trigger: ReactElement;
}) {
  const { audience, soloEnabled } = useAudience();
  const roster = useRoster(audience);

  const choose = (next: Audience) => {
    onOpenChange(false);
    onSwitch(next);
  };

  const showOrgs = audience === 'team' && roster.orgs.length > 1;
  const showTeams = audience === 'team' && roster.teams.length > 0;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent side="right" align="start" sideOffset={12} className="w-64 p-1.5">
        <div role="menu" aria-label="World" className="flex flex-col gap-0.5">
          {audiencesShown(soloEnabled).map((key) => {
            const world = WORLD_COPY[key];
            const active = key === audience;
            const RowMascot = WORLD_MASCOT[key];
            return (
              <button
                key={key}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(key)}
                className={`flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-150 ${
                  active ? 'bg-secondary/60' : 'hover:bg-secondary/40'
                }`}
                style={{
                  boxShadow: active ? `inset 2px 0 0 0 ${world.accentBright}` : 'none',
                }}
              >
                <span className="shrink-0 pt-0.5">
                  <RowMascot size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="font-display text-[13px]"
                      style={{ color: active ? world.accentBright : 'var(--foreground)' }}
                    >
                      {world.title}
                    </span>
                    {world.beta && <BetaChip dim={!active} />}
                    {active && (
                      <Check
                        className="ml-auto h-3 w-3 shrink-0"
                        style={{ color: world.accentBright }}
                      />
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-body text-foreground/80">
                    {world.verb}
                  </span>
                  <span className="mt-1 block text-[10px] font-body text-muted-foreground leading-relaxed">
                    {world.capabilities.join(', ')}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {(showOrgs || showTeams) && (
          <div className="mt-1.5 flex flex-col gap-1.5 border-t border-border/40 px-1 pt-2 pb-1">
            {showOrgs && (
              <RosterSelect
                label="Organisation"
                value={roster.currentOrgId ?? ''}
                options={roster.orgs}
                onChange={(id) => void roster.chooseOrg(id)}
              />
            )}
            {showTeams && (
              <RosterSelect
                label="Team"
                value={roster.currentTeamId ?? ''}
                options={roster.teams}
                onChange={roster.chooseTeam}
              />
            )}
          </div>
        )}

        <div className="px-1 pt-1 empty:hidden">
          <UpdateCard />
        </div>
      </PopoverContent>
    </Popover>
  );
}
