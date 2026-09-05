// The sidebar's nav inventory, per audience world. Pure data — icons are
// string keys the sidebar maps onto lucide components — so world membership
// is testable in the node lane (test/nav-sections.test.ts).
//
// The yeaboi hrefs are the manifest's paths verbatim (lib/yeaboi/routes.json)
// — the sidebar is a view over that registry, not a second list of truths.

import type { Audience } from '@shared/audience';

export type IconKey =
  | 'home'
  | 'projects'
  | 'board'
  | 'roadmap'
  | 'analysis'
  | 'standup'
  | 'retro'
  | 'poker'
  | 'performance'
  | 'reporting'
  | 'ship'
  | 'review'
  | 'agent-usage'
  | 'agent-advisor'
  | 'agent-standup'
  | 'agent-security'
  | 'ceremonies'
  | 'provenance'
  | 'usage'
  | 'whats-new'
  | 'system-check'
  | 'privacy'
  | 'feedback';

export interface NavItemSpec {
  href: string;
  label: string;
  icon: IconKey;
}

export interface NavSectionSpec {
  label: string | null;
  items: NavItemSpec[];
}

const HOME: NavSectionSpec = {
  label: null,
  items: [{ href: '/home', label: 'Home', icon: 'home' }],
};

const OPS: NavSectionSpec = {
  label: 'Ops',
  items: [
    { href: '/ceremonies', label: 'Ceremonies', icon: 'ceremonies' },
    { href: '/provenance', label: 'Provenance', icon: 'provenance' },
    { href: '/usage', label: 'Usage', icon: 'usage' },
    { href: '/whats-new', label: "What's New", icon: 'whats-new' },
    { href: '/system-check', label: 'System Check', icon: 'system-check' },
    { href: '/privacy', label: 'Privacy', icon: 'privacy' },
    { href: '/feedback', label: 'Feedback', icon: 'feedback' },
  ],
};

// Projects and Board are registered routes with no nav door: Niko navigates to
// them and a deep link opens them, but the sidebar stops offering them. Guarded
// by test/nav-sections.test.ts, so restoring one is a deliberate act.
const TEAM_SECTIONS: NavSectionSpec[] = [
  HOME,
  {
    label: 'Team',
    items: [
      // Planning lives in the Workspace: project → blueprint → plan.
      { href: '/projects/new/from-roadmap', label: 'Roadmap', icon: 'roadmap' },
      { href: '/team/analysis', label: 'Analysis', icon: 'analysis' },
      { href: '/team/standup', label: 'Standup', icon: 'standup' },
      { href: '/team/retro', label: 'Retro', icon: 'retro' },
      { href: '/team/poker', label: 'Poker', icon: 'poker' },
      { href: '/team/performance', label: 'Performance', icon: 'performance' },
      { href: '/team/reporting', label: 'Reporting', icon: 'reporting' },
      { href: '/team/ship', label: 'Ship', icon: 'ship' },
    ],
  },
  OPS,
];

// Solo shares the Team world's routes — the pages are the same screens run
// for one person; the nav simply never offers the modes that need a room —
// and adds the one mode that is its own: the Weekly Review.
const SOLO_SECTIONS: NavSectionSpec[] = [
  HOME,
  {
    label: 'Solo',
    items: [
      { href: '/projects/new/from-roadmap', label: 'Roadmap', icon: 'roadmap' },
      { href: '/team/analysis', label: 'Analysis', icon: 'analysis' },
      { href: '/team/standup', label: 'Standup', icon: 'standup' },
      { href: '/team/reporting', label: 'Reporting', icon: 'reporting' },
      { href: '/team/ship', label: 'Ship', icon: 'ship' },
      { href: '/solo/review', label: 'Weekly Review', icon: 'review' },
    ],
  },
  OPS,
];

const AGENTS_SECTIONS: NavSectionSpec[] = [
  HOME,
  {
    label: 'Agents',
    items: [
      { href: '/agents/usage', label: 'Usage', icon: 'agent-usage' },
      { href: '/agents/advisor', label: 'Advisor', icon: 'agent-advisor' },
      { href: '/agents/standup', label: 'Standup', icon: 'agent-standup' },
      { href: '/agents/security', label: 'Security', icon: 'agent-security' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/whats-new', label: "What's New", icon: 'whats-new' },
      { href: '/feedback', label: 'Feedback', icon: 'feedback' },
    ],
  },
];

export function navSections(audience: Audience): NavSectionSpec[] {
  switch (audience) {
    case 'agents':
      return AGENTS_SECTIONS;
    case 'solo':
      return SOLO_SECTIONS;
    default:
      return TEAM_SECTIONS;
  }
}

/** The world's items flattened, for shortcuts and arrow-key cycling. */
export function navItems(audience: Audience): NavItemSpec[] {
  return navSections(audience).flatMap((section) => section.items);
}

/** The floating rail's inventory: Home, then the world's own modes.
 *
 * Ops is deliberately absent — it is a drawer of settings-adjacent pages
 * rather than a set of things you run, and putting it in a rail that is icons
 * by default makes twenty icons out of nine. It gets its own surface.
 */
export function railSections(audience: Audience): NavSectionSpec[] {
  return navSections(audience).filter((section) => section.label !== OPS.label);
}

/** Ops pages the window offers somewhere better.
 *
 *  What's New is what a dashboard tile says, so the tile is the door and a nav
 *  row for the same screen is a second one; Usage is not a page at all any
 *  more, only the tile. Ceremonies and Privacy read as settings sections and
 *  are in the settings rail. A drawer of seven icons for the three things left
 *  is most of why it lost its place to begin with. */
export const OPS_ELSEWHERE: ReadonlySet<string> = new Set([
  '/whats-new',
  '/usage',
  '/ceremonies',
  '/privacy',
]);

/** The section the rail leaves out, for whoever draws the door to it.
 *
 * Null in the worlds that have no Ops — the agents world keeps its two
 * settings-adjacent pages in the rail, so there is nothing left over. */
export function opsSection(audience: Audience): NavSectionSpec | null {
  const section = navSections(audience).find((one) => one.label === OPS.label);
  if (!section) return null;
  const items = section.items.filter((item) => !OPS_ELSEWHERE.has(item.href));
  return items.length > 0 ? { ...section, items } : null;
}
