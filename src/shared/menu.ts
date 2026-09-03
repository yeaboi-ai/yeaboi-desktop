// The menu bar's inventory, as data: every page a menu opens, with its label
// and shortcut. Pure, so the main process builds the menu from it and the
// renderer's tests hold every route here registered and reachable.

import { projectsHref, type Audience } from './audience';

export interface MenuPage {
  label: string;
  /** A route, optionally with a query string. */
  route: string;
  accelerator?: string;
}

export const FILE_PAGES: readonly MenuPage[] = [
  { label: 'New project…', route: '/projects?new=1', accelerator: 'CmdOrCtrl+N' },
  { label: 'New session…', route: '/sessions', accelerator: 'CmdOrCtrl+Shift+N' },
];

/** The Go menu: the rail's rows and the board, per world. */
export function goPages(audience: Audience): readonly MenuPage[] {
  return [
    { label: 'Home', route: '/home' },
    { label: 'Projects', route: projectsHref(audience), accelerator: 'CmdOrCtrl+P' },
    { label: 'Sessions', route: '/sessions' },
    { label: 'Settings', route: '/settings', accelerator: 'CmdOrCtrl+S' },
    { label: 'Board', route: '/board', accelerator: 'CmdOrCtrl+B' },
  ];
}

/** The pages about the app, by their own titles: the title bar's buttons. */
export const ABOUT_PAGES: readonly MenuPage[] = [
  { label: "What's new", route: '/whats-new' },
  { label: 'System check', route: '/system-check' },
  { label: 'Privacy', route: '/privacy' },
  { label: 'Feedback', route: '/feedback' },
];

export const UPDATES_PAGES: readonly MenuPage[] = [{ label: "What's new", route: '/whats-new' }];

export const PRIVACY_PAGES: readonly MenuPage[] = [
  { label: 'What leaves this machine', route: '/privacy' },
  { label: 'System check', route: '/system-check' },
];

export const FEEDBACK_PAGES: readonly MenuPage[] = [
  { label: 'Send feedback…', route: '/feedback' },
  { label: 'Report a bug…', route: '/feedback?type=bug' },
  { label: 'Request a feature…', route: '/feedback?type=feature' },
];

/** Every pathname the menu bar can open in a world, query strings dropped. */
export function menuPathnames(audience: Audience): string[] {
  const pages = [
    ...FILE_PAGES,
    ...goPages(audience),
    ...UPDATES_PAGES,
    ...PRIVACY_PAGES,
    ...FEEDBACK_PAGES,
  ];
  return [...new Set(pages.map((page) => page.route.split('?')[0]!))];
}
