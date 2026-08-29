'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ThemeSwitcher } from './theme-switcher';
import { Duck } from '@design/primitives/Duck';
import { Wordmark } from '@design/primitives/Wordmark';
import {
  LayoutGrid,
  Columns3,
  Settings,
  LogOut,
  Palette,
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
  CalendarClock,
  Coins,
  Sparkles,
  Map,
  FileClock,
  ShieldCheck,
  Gauge,
  Megaphone,
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

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
}

interface NavSection {
  label: string | null;
  items: NavItem[];
}

// One nav for both surfaces: the planning workspace and the yeaboi (TUI
// parity) modes. The yeaboi hrefs are the manifest's paths verbatim
// (lib/yeaboi/routes.json) — the sidebar is a view over that registry, not a
// second list of truths.
const NAV_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [{ href: '/home', label: 'Home', icon: Home }],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/projects', label: 'Projects', icon: LayoutGrid },
      { href: '/board', label: 'Board', icon: Columns3 },
    ],
  },
  {
    label: 'Humans',
    items: [
      { href: '/humans/planning', label: 'Planning', icon: MessageSquareText },
      { href: '/humans/planning/roadmap', label: 'Roadmap', icon: Map },
      { href: '/humans/analysis', label: 'Analysis', icon: BarChart3 },
      { href: '/humans/standup', label: 'Standup', icon: Sunrise },
      { href: '/humans/retro', label: 'Retro', icon: RotateCcw },
      { href: '/humans/poker', label: 'Poker', icon: Spade },
      { href: '/humans/performance', label: 'Performance', icon: TrendingUp },
      { href: '/humans/reporting', label: 'Reporting', icon: Presentation },
      { href: '/humans/ship', label: 'Ship', icon: Rocket },
    ],
  },
  {
    label: 'Agents',
    items: [
      { href: '/agents/usage', label: 'Usage', icon: Coins },
      { href: '/agents/advisor', label: 'Advisor', icon: Sparkles },
      { href: '/agents/standup', label: 'Standup', icon: Bot },
      { href: '/agents/security', label: 'Security', icon: ShieldCheck },
    ],
  },
  {
    label: 'Ops',
    items: [
      { href: '/ceremonies', label: 'Ceremonies', icon: CalendarClock },
      { href: '/provenance', label: 'Provenance', icon: FileClock },
      { href: '/usage', label: 'Usage', icon: Gauge },
      { href: '/whats-new', label: "What's New", icon: Megaphone },
      { href: '/feedback', label: 'Feedback', icon: MessageSquareText },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

const CMD_SHORTCUTS: Record<string, string> = {
  p: '/projects',
  b: '/board',
  s: '/settings',
};

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { authFetch, ready } = useAuthFetch();
  // The nav dot ignores dismissal — it is the quiet permanent reminder that
  // What's New has something; the dismissible card is the loud half.
  const updateState = useUpdateState();
  const updateDot = updateIndicatorVisible(updateState, null);

  // All nav routes in order for arrow key cycling — main nav, then bottom section
  const allRoutes = [...NAV_ITEMS.map((n) => n.href), '/settings/themes', '/settings'];

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
  }, [ready, authFetch]);

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

  if (!session) return null;

  // Longest-prefix wins, so /humans/planning/roadmap lights Roadmap and not
  // Planning too.
  const activeHref = NAV_ITEMS.map((item) => item.href)
    .filter((href) => pathname === href || pathname?.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) =>
    href === '/settings' || href === '/settings/themes'
      ? pathname?.startsWith(href)
      : activeHref === href;

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 w-[56px] md:w-[180px] border-r border-border/60 bg-background flex flex-col z-40 overflow-visible transition-opacity duration-300 ${
        loaded ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Org switcher — only shown when user belongs to multiple orgs */}
      {orgs.length > 1 && (
        <div className="px-3 md:px-5 pt-3 hidden md:block">
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
            className="w-full text-[10px] font-body bg-transparent border border-border/40 rounded px-2 py-1 text-muted-foreground mb-2"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Logo + notification bell */}
      <div className="flex items-center justify-between px-3 md:px-5 pt-5 pb-6">
        <Link href="/projects" className="flex items-center gap-2 min-w-0">
          <BrandWordmark />
        </Link>
      </div>

      {/* Team switcher */}
      {teams.length > 0 && (
        <div className="px-3 md:px-5 pb-3 hidden md:block">
          <select
            value={currentTeamId || ''}
            onChange={(e) => {
              setStoredTeamId(e.target.value);
              setCurrentTeamId(e.target.value);
              dispatchTeamChange();
            }}
            className="w-full text-[10px] font-body bg-transparent border border-border/40 rounded px-2 py-1 text-muted-foreground"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Nav — sectioned, and scrollable now that both surfaces live in it. */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 md:px-3 overflow-y-auto min-h-0">
        {NAV_SECTIONS.map((section, index) => (
          <div key={section.label ?? `top-${index}`} className="flex flex-col gap-0.5">
            {section.label && (
              <p className="hidden md:block px-3 pt-3 pb-1 text-[9px] font-body font-semibold uppercase tracking-widest text-muted-foreground/50">
                {section.label}
              </p>
            )}
            {section.items.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 px-2 md:px-3 py-1.5 rounded-lg text-xs font-body font-medium transition-all duration-250 justify-center md:justify-start ${
                  isActive(href)
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
                style={{
                  boxShadow: isActive(href) && cmdHeld ? 'inset 0 0 0 1px var(--primary)' : 'none',
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
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-2 md:px-3 pb-4 flex flex-col gap-1">
        <UpdateCard />
        <Link
          href="/settings/themes"
          className={`flex items-center gap-2.5 px-2 md:px-3 py-2 rounded-lg text-xs font-body font-medium transition-all justify-center md:justify-start ${
            pathname?.startsWith('/settings/themes')
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
          title="Themes"
        >
          <Palette className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline">Themes</span>
        </Link>
        <Link
          href="/settings"
          className={`flex items-center gap-2.5 px-2 md:px-3 py-2 rounded-lg text-xs font-body font-medium transition-all justify-center md:justify-start ${
            isActive('/settings') && !pathname?.startsWith('/settings/themes')
              ? 'bg-secondary text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
          style={{
            boxShadow:
              isActive('/settings') && !pathname?.startsWith('/settings/themes') && cmdHeld
                ? 'inset 0 0 0 1px var(--primary)'
                : 'none',
            transition: 'background-color 250ms ease, box-shadow 150ms ease, color 150ms ease',
          }}
          title="Settings"
        >
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden md:inline">Settings</span>
        </Link>

        {/* User profile */}
        <div className="border-t border-border/40 pt-2 mt-1">
          <Link
            href="/settings"
            className="hidden md:flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors group"
            title="Profile & Settings"
          >
            {session.user?.image ? (
              <img src={session.user.image} alt="" className="w-6 h-6 rounded-full shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-body font-semibold text-primary">
                  {(session.user?.name ?? session.user?.email ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-body font-medium text-foreground truncate leading-tight">
                {session.user?.name ?? 'User'}
              </p>
              <p className="text-[9px] font-body text-muted-foreground/50 truncate leading-tight">
                {session.user?.email}
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <ThemeSwitcher />
              </span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  signOut({ callbackUrl: '/auth/signin' });
                }}
                className="text-muted-foreground/30 hover:text-foreground transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          </Link>

          {/* Mobile: avatar + theme switcher + sign out */}
          <div className="md:hidden flex flex-col items-center gap-1">
            <Link href="/settings" title="Profile">
              {session.user?.image ? (
                <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <span className="text-[10px] font-body font-semibold text-primary">
                    {(session.user?.name ?? session.user?.email ?? '?').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </Link>
            <ThemeSwitcher compact />
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="flex items-center justify-center px-2 py-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground transition-colors"
              title="Sign out"
            >
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function BrandWordmark() {
  // The duck is the brand. The org-configurable name/logo from the web app's
  // BrandProvider is intentionally not consulted here.
  return (
    <>
      <Duck state="idle" size={28} />
      <span className="hidden md:inline w-[96px] shrink-0" aria-label="yeaboi">
        <Wordmark text="YEABOI" />
      </span>
    </>
  );
}
