// The room's drawers and its keys, as data. The strip draws DRAWERS in order;
// one is open at a time; a key opens one, Escape closes it, ? opens the
// shortcuts sheet. Pure (test/drawers.test.ts).

export type DrawerKind = 'blueprint' | 'context' | 'integrations' | 'video' | 'recap' | 'settings';

export interface DrawerSpec {
  kind: DrawerKind;
  label: string;
  /** The bare key that opens it, when there is one. */
  hotkey?: string;
  /** False while the drawer is a placeholder for a later step. */
  ready: boolean;
}

export const DRAWERS: readonly DrawerSpec[] = [
  { kind: 'blueprint', label: 'Blueprint', hotkey: 'i', ready: true },
  { kind: 'context', label: 'Context', ready: true },
  { kind: 'integrations', label: 'Integrations', ready: true },
  { kind: 'video', label: 'Video', hotkey: 'v', ready: false },
  { kind: 'recap', label: 'Recap', hotkey: 'r', ready: false },
  { kind: 'settings', label: 'Settings', hotkey: 's', ready: false },
];

export const NOT_READY_LINE = 'Arrives with the next step.';

export type RoomKeyAction =
  { type: 'open'; kind: DrawerKind } | { type: 'close' } | { type: 'shortcuts' } | null;

/** What a bare key does in the room. While typing, only Escape counts. */
export function roomKey(key: string, typing: boolean): RoomKeyAction {
  if (key === 'Escape') return { type: 'close' };
  if (typing) return null;
  if (key === '?') return { type: 'shortcuts' };
  const drawer = DRAWERS.find((spec) => spec.hotkey === key && spec.ready);
  return drawer ? { type: 'open', kind: drawer.kind } : null;
}

/** The next open drawer after pressing a strip button: the same one closes. */
export function toggleDrawer(open: DrawerKind | null, kind: DrawerKind): DrawerKind | null {
  return open === kind ? null : kind;
}
