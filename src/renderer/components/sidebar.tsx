'use client';

// The rail: the world lockup, the roster (Team), and three rows — Projects,
// Sessions, Settings. Everything else in the app hangs off one of those two
// ways of working, so nothing else is listed here. Which row is lit is
// lib/nav/sections.ts's activeRailRow, so a mode page opened inside a project
// keeps Projects lit.

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useLocation } from 'react-router';
import Link from 'next/link';
import { ThemeSwitcher } from './theme-switcher';
import { WorldSwitcher } from '@/components/audience/world-switcher';
import { useAudience } from '@/components/providers/audience-provider';
import {
  SETTINGS_ITEM,
  activeRailRow,
  navItems,
  projectsHref,
  type IconKey,
  type RailRow,
} from '@/lib/nav/sections';
import { audiencesForRoute, type Audience } from '@shared/audience';
import { DEFAULT_ROUTE } from '@/lib/yeaboi/routes';
import { LayoutGrid, Settings, ChevronsUpDown, Sunrise } from 'lucide-react';
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

const ICONS: Record<IconKey, typeof LayoutGrid> = {
  projects: LayoutGrid,
  sessions: Sunrise,
  settings: Settings,
};

const ROW_CLASS =
  'flex items-center gap-2.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-body font-medium justify-center md:justify-start';

export function Sidebar() {
  const pathname = usePathname();
  const { search } = useLocation();
  const router = useRouter();
  const { audience, setAudience } = useAudience();
  const { authFetch, ready } = useAuthFetch();
  const items = navItems(audience);
  const active = activeRailRow(pathname ?? '', search);

  // Flipping the world while standing in the other world's route would leave
  // the page orphaned from the nav — go home instead.
  const flipAudience = (next: Audience) => {
    if (next === audience) return;
    setAudience(next);
    const worlds = pathname ? audiencesForRoute(pathname) : [];
    if (worlds.length > 0 && !worlds.includes(next)) router.push(DEFAULT_ROUTE);
  };
  // The dot ignores dismissal — it is the quiet permanent reminder that
  // What's new has something; the dismissible card is the loud half.
  const updateState = useUpdateState();
  const updateDot = updateIndicatorVisible(updateState, null);

  // The three rows in order, for Cmd+Up/Down.
  const rows: { key: RailRow; href: string }[] = [
    { key: 'projects', href: projectsHref(audience) },
    { key: 'sessions', href: '/sessions' },
    { key: 'settings', href: SETTINGS_ITEM.href },
  ];

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

  // Cmd+P / Cmd+S for the rows, Cmd+B for the board (kept, unlisted), and
  // Cmd+Up/Down to cycle the three rows.
  useEffect(() => {
    const shortcuts: Record<string, string> = {
      p: projectsHref(audience),
      b: '/board',
      s: SETTINGS_ITEM.href,
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const href = shortcuts[e.key.toLowerCase()];
      if (href) {
        e.preventDefault();
        router.push(href);
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const currentIdx = rows.findIndex((row) => row.key === active);
        const idx = currentIdx === -1 ? (e.key === 'ArrowDown' ? -1 : 0) : currentIdx;
        const next =
          e.key === 'ArrowDown' ? (idx + 1) % rows.length : (idx - 1 + rows.length) % rows.length;
        router.push(rows[next]!.href);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, audience, active]);

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

  const rowStyle = (lit: boolean) => ({
    boxShadow: lit && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
    transition: 'background-color 250ms ease, box-shadow 150ms ease, color 150ms ease',
  });
  const rowClass = (lit: boolean) =>
    `${ROW_CLASS} ${
      lit
        ? 'bg-secondary text-foreground'
        : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
    }`;

  return (
    <aside
      className={`fixed left-0 bottom-0 w-[56px] md:w-[180px] border-r border-border/60 bg-background flex flex-col z-40 overflow-visible transition-opacity duration-300 ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
      // The provider-health banner pads <html> to push page content down, but
      // padding cannot move a fixed element — this reads the banner's height.
      style={{ top: 'var(--banner-h, 0px)' }}
    >
      {/* The lockup names the world and goes home; its chevron flips the world. */}
      <div className="pt-4 pb-2">
        <WorldSwitcher onSwitch={flipAudience} onHome={() => router.push(DEFAULT_ROUTE)} />
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

      {/* The two ways to work. */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 md:px-3 pt-3 min-h-0">
        {items.map(({ href, label, icon }) => {
          const Icon = ICONS[icon];
          const lit = active === icon;
          return (
            <Link
              key={href}
              href={href}
              className={rowClass(lit)}
              style={rowStyle(lit)}
              title={label}
              aria-current={lit ? 'page' : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden md:inline">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-2 md:px-3 pb-4 flex flex-col gap-1">
        <UpdateCard />
        {/* The theme switcher is a popover trigger, so it sits beside the
            settings link rather than inside it — a button may not live inside
            an anchor. */}
        <div className="border-t border-border/40 pt-2 mt-1 flex flex-col md:flex-row items-center gap-1">
          <Link
            href={SETTINGS_ITEM.href}
            className={`flex-1 min-w-0 ${rowClass(active === 'settings')}`}
            style={rowStyle(active === 'settings')}
            title={SETTINGS_ITEM.label}
            aria-current={active === 'settings' ? 'page' : undefined}
          >
            <span className="relative shrink-0">
              <Settings className="h-3.5 w-3.5" />
              {updateDot && (
                <span className="md:hidden absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
              )}
            </span>
            <span className="hidden md:inline">{SETTINGS_ITEM.label}</span>
            {updateDot && (
              <span
                className="hidden md:inline-block ml-auto h-1.5 w-1.5 rounded-full bg-amber-400"
                title="An update is ready. See What's new."
              />
            )}
          </Link>
          <ThemeSwitcher />
        </div>
      </div>
    </aside>
  );
}
