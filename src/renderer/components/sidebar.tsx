'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThemeSwitcher } from './theme-switcher';
import { WorldSwitcher } from '@/components/audience/world-switcher';
import { useAudience } from '@/components/providers/audience-provider';
import { navItems, navSections, type IconKey } from '@/lib/nav/sections';
import { audiencesForRoute, type Audience } from '@shared/audience';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import {
  LayoutGrid,
  Columns3,
  Settings,
  ChevronsUpDown,
  Home,
  MessageSquareText,
  BarChart3,
  Sunrise,
  RotateCcw,
  Spade,
  TrendingUp,
  Presentation,
  Rocket,
  Bot,
  CalendarCheck,
  CalendarClock,
  Coins,
  Sparkles,
  Map,
  FileClock,
  ShieldCheck,
  Gauge,
  Megaphone,
  Stethoscope,
  Lock,
} from 'lucide-react';
import {
  useAuthFetch,
  getStoredOrgId,
  setStoredOrgId,
  getStoredTeamId,
  setStoredTeamId,
  dispatchTeamChange,
} from '@/hooks/use-auth-fetch';
import { updateIndicatorVisible } from '@shared/update';
import { useUpdateState } from '@/hooks/use-update-state';
import { UpdateCard } from '@/components/system/update-card';
import { logger } from '@/lib/logger';

// The nav inventory lives in lib/nav/sections.ts, per audience world; this
// map turns its icon keys into components.
const ICONS: Record<IconKey, typeof LayoutGrid> = {
  home: Home,
  projects: LayoutGrid,
  board: Columns3,
  roadmap: Map,
  analysis: BarChart3,
  standup: Sunrise,
  retro: RotateCcw,
  poker: Spade,
  performance: TrendingUp,
  reporting: Presentation,
  ship: Rocket,
  review: CalendarCheck,
  'agent-usage': Coins,
  'agent-advisor': Sparkles,
  'agent-standup': Bot,
  'agent-security': ShieldCheck,
  ceremonies: CalendarClock,
  provenance: FileClock,
  usage: Gauge,
  'whats-new': Megaphone,
  'system-check': Stethoscope,
  privacy: Lock,
  feedback: MessageSquareText,
};

const CMD_SHORTCUTS: Record<string, string> = {
  p: '/projects',
  b: '/board',
  s: '/settings',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { audience, setAudience } = useAudience();
  const { authFetch, ready } = useAuthFetch();
  const sections = navSections(audience);
  const items = navItems(audience);

  // Flipping the world while standing in the other world's route would leave
  // the page orphaned from the nav — go home instead.
  const flipAudience = (next: Audience) => {
    if (next === audience) return;
    setAudience(next);
    const worlds = pathname ? audiencesForRoute(pathname) : [];
    if (worlds.length > 0 && !worlds.includes(next)) router.push(DEFAULT_ROUTE);
  };
  // The nav dot ignores dismissal — it is the quiet permanent reminder that
  // What's New has something; the dismissible card is the loud half.
  const updateState = useUpdateState();
  const updateDot = updateIndicatorVisible(updateState, null);

  // All nav routes in order for arrow key cycling — main nav, then bottom section
  const allRoutes = [...items.map((n) => n.href), '/settings'];

  // Detect Cmd/Ctrl held for border glow on active item
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

  // Cmd+P/B/D/A/S + Cmd+Arrow shortcuts for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Letter shortcuts
      const href = CMD_SHORTCUTS[e.key.toLowerCase()];
      if (href) {
        e.preventDefault();
        router.push(href);
        return;
      }

      // Arrow up/down to cycle through tabs
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = allRoutes.findIndex((r) => pathname?.startsWith(r));
        const idx = currentIdx === -1 ? 0 : currentIdx;
        const next =
          e.key === 'ArrowDown'
            ? (idx + 1) % allRoutes.length
            : (idx - 1 + allRoutes.length) % allRoutes.length;
        router.push(allRoutes[next]);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [router, pathname, allRoutes]);

  const [orgs, setOrgs] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // Orgs and teams scope the planning workspace, which Solo and Team share
    // (the stored ids scope /api/projects); the agents world reads local
    // session telemetry and has neither.
    if (audience === 'agents') {
      setLoaded(true);
      return;
    }
    const storedOrg = getStoredOrgId();
    const storedTeam = getStoredTeamId();
    setCurrentOrgId(storedOrg);
    setCurrentTeamId(storedTeam);

    // Fetch orgs and teams in parallel, then reveal
    const loadAll = async () => {
      try {
        const orgResp = await authFetch('/api/orgs');
        const orgData = orgResp.ok ? await orgResp.json() : [];
        setOrgs(orgData);

        const orgId = storedOrg || (orgData.length > 0 ? orgData[0].id : null);
        if (!storedOrg && orgId) {
          setStoredOrgId(orgId);
          setCurrentOrgId(orgId);
        }

        if (orgId) {
          const teamResp = await authFetch(`/api/orgs/${orgId}/teams`);
          const teamData = teamResp.ok ? await teamResp.json() : [];
          setTeams(teamData);
          if (!storedTeam && teamData.length > 0) {
            setStoredTeamId(teamData[0].id);
            setCurrentTeamId(teamData[0].id);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoaded(true);
      }
    };

    loadAll();
  }, [ready, authFetch, audience]);

  // Re-fetch teams when window regains focus
  const fetchTeams = useCallback(
    (orgId: string) => {
      authFetch(`/api/orgs/${orgId}/teams`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          setTeams(data);
          if (!getStoredTeamId() && data.length > 0) {
            setStoredTeamId(data[0].id);
            setCurrentTeamId(data[0].id);
          }
        })
        .catch(() => logger.warn('Failed to refresh teams'));
    },
    [authFetch],
  );

  useEffect(() => {
    if (!currentOrgId || !ready) return;
    const handleFocus = () => fetchTeams(currentOrgId);
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [currentOrgId, ready, fetchTeams]);

  // Longest-prefix wins, so /projects/new/from-roadmap lights Roadmap and
  // not Projects too.
  const activeHref = items
    .map((item) => item.href)
    .filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) =>
    href === '/settings' ? pathname?.startsWith(href) : activeHref === href;

  return (
    <aside
      className={`fixed left-0 bottom-0 w-[56px] md:w-[180px] border-r border-border/60 bg-background flex flex-col z-40 overflow-visible transition-opacity duration-300 ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
      // The provider-health banner pads <html> to push page content down, but
      // padding cannot move a fixed element — this reads the banner's height.
      style={{ top: 'var(--banner-h, 0px)' }}
    >
      {/* Brand and world are one lockup: the mascot names the world you are
          in, and the whole thing opens the switcher. */}
      <div className="pt-4 pb-2">
        <WorldSwitcher onSwitch={flipAudience} />
      </div>

      {/* Org switcher — only shown when user belongs to multiple orgs.
          Team-world only: solo keeps the scoping data, not the roster UI. */}
      {audience === 'team' && orgs.length > 1 && (
        <div className="px-3 md:px-5 pt-3 hidden md:block">
          <div className="relative mb-2">
            <select
              value={currentOrgId || ''}
              onChange={async (e) => {
                const newOrgId = e.target.value;
                setStoredOrgId(newOrgId);
                setCurrentOrgId(newOrgId);
                localStorage.removeItem('current_team_id');
                setCurrentTeamId(null);
                // Re-fetch teams for the new org
                try {
                  const r = await authFetch(`/api/orgs/${newOrgId}/teams`);
                  const data = r.ok ? await r.json() : [];
                  setTeams(data);
                  if (data.length > 0) {
                    setStoredTeamId(data[0].id);
                    setCurrentTeamId(data[0].id);
                  }
                } catch {
                  /* ignore */
                }
                dispatchTeamChange();
              }}
              className="w-full appearance-none cursor-pointer text-[10px] font-body bg-transparent border border-border/40 rounded-md pl-2 pr-6 py-1 text-muted-foreground hover:border-border focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>
      )}

      {/* Team switcher — the roster affordance, so team-world only */}
      {audience === 'team' && teams.length > 0 && (
        <div className="px-3 md:px-5 pb-3 hidden md:block">
          <div className="relative">
            <select
              value={currentTeamId || ''}
              onChange={(e) => {
                setStoredTeamId(e.target.value);
                setCurrentTeamId(e.target.value);
                dispatchTeamChange();
              }}
              className="w-full appearance-none cursor-pointer text-[10px] font-body bg-transparent border border-border/40 rounded-md pl-2 pr-6 py-1 text-muted-foreground hover:border-border focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronsUpDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/50" />
          </div>
        </div>
      )}

      {/* Nav — sectioned, and scrollable now that both surfaces live in it. */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 md:px-3 overflow-y-auto min-h-0">
        {sections.map((section, index) => (
          <div key={section.label ?? `top-${index}`} className="flex flex-col gap-0.5">
            {section.label && (
              <p
                data-audience-accented
                className="hidden md:block px-3 pt-3 pb-1 text-[10px] font-body font-semibold uppercase tracking-widest"
                style={{
                  color: 'color-mix(in srgb, var(--audience-accent) 55%, var(--muted-foreground))',
                }}
              >
                {section.label}
              </p>
            )}
            {section.items.map(({ href, label, icon }) => {
              const Icon = ICONS[icon];
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all duration-250 justify-center md:justify-start ${
                    isActive(href)
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                  style={{
                    boxShadow:
                      isActive(href) && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
                    transition:
                      'background-color 250ms ease, box-shadow 150ms ease, color 150ms ease',
                  }}
                  title={label}
                >
                  <span className="relative shrink-0">
                    <Icon className="h-3.5 w-3.5" />
                    {href === '/whats-new' && updateDot && (
                      <span className="md:hidden absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                    )}
                  </span>
                  <span className="hidden md:inline">{label}</span>
                  {href === '/whats-new' && updateDot && (
                    <span className="hidden md:inline-block ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-2 md:px-3 pb-4 flex flex-col gap-1">
        <UpdateCard />
        {/* The theme switcher is a popover trigger, so it sits beside the
            settings link rather than inside it — a button may not live inside
            an anchor. */}
        <div className="border-t border-border/40 pt-2 mt-1 flex flex-col md:flex-row items-center gap-1">
          <Link
            href="/settings"
            className={`flex flex-1 min-w-0 items-center gap-2.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all justify-center md:justify-start ${
              isActive('/settings')
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
            style={{
              boxShadow:
                isActive('/settings') && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
              transition: 'background-color 250ms ease, box-shadow 150ms ease, color 150ms ease',
            }}
            title="Settings"
          >
            <Settings className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden md:inline">Settings</span>
          </Link>
          <ThemeSwitcher />
        </div>
      </div>
    </aside>
  );
}
