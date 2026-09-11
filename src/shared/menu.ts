// The menu bar's inventory, as data: every page a menu opens, with its label
// and shortcut. Pure, so the main process builds the menu from it and the
// renderer's tests hold every route here registered and reachable.

import { sessionsHref, type Audience } from './audience';

export interface MenuPage {
  label: string;
  /** A route, optionally with a query string. */
  route: string;
  accelerator?: string;
}

/** A menu item that is not a page: it asks the window for something. */
export interface MenuCommand {
  label: string;
  accelerator?: string;
}

/** The Go menu's first row, and the chord the palette answers to everywhere.
 *  The menu owns it so the renderer never binds it a second time. */
export const PALETTE_COMMAND: MenuCommand = { label: 'Find anything…', accelerator: 'CmdOrCtrl+K' };

export const FILE_PAGES: readonly MenuPage[] = [
  { label: 'New session…', route: '/sessions?new=1', accelerator: 'CmdOrCtrl+N' },
];

/** The Go menu: the home, the rail's rows, the paper, per world. */
export function goPages(audience: Audience): readonly MenuPage[] {
  return [
    { label: 'Home', route: '/home' },
    { label: 'Sessions', route: sessionsHref(audience), accelerator: 'CmdOrCtrl+P' },
    { label: 'Board', route: '/board', accelerator: 'CmdOrCtrl+B' },
    { label: 'Front page', route: '/news' },
    { label: 'Music', route: '/music' },
    { label: 'Settings', route: '/settings', accelerator: 'CmdOrCtrl+S' },
  ];
}

export type MusicCommandId = 'music:toggle' | 'music:next';

export interface MusicMenuCommand extends MenuCommand {
  id: MusicCommandId;
}

/** The Music menu's transport. The menu owns the chords, the way it owns the
 *  palette's, so the renderer never binds them a second time. Shift keeps
 *  them clear of Cmd+M (minimize) and the rail's unshifted Cmd+arrows. */
export const MUSIC_COMMANDS: readonly MusicMenuCommand[] = [
  { id: 'music:toggle', label: 'Play or pause music', accelerator: 'CmdOrCtrl+Shift+M' },
  { id: 'music:next', label: 'Next station or track', accelerator: 'CmdOrCtrl+Shift+.' },
];

export const MUSIC_PAGES: readonly MenuPage[] = [
  { label: 'Music…', route: '/music' },
  { label: 'Player settings…', route: '/settings/music' },
];

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
    ...MUSIC_PAGES,
    ...UPDATES_PAGES,
    ...PRIVACY_PAGES,
    ...FEEDBACK_PAGES,
  ];
  return [...new Set(pages.map((page) => page.route.split('?')[0]!))];
}
