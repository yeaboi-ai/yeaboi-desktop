// How the room lays out around the chat: whether an open drawer pushes the
// transcript aside or slides over its edge. The column never drops below its
// reading width — a drawer that would make it do so overlays instead.

export interface RoomGeometry {
  /** The icon strip on the right edge, always present. */
  stripWidth: number;
  /** The transcript's reading width (`--room-w`). */
  roomWidth: number;
  /** Breathing room either side of the column. */
  gutter: number;
}

export const ROOM_GEOMETRY: RoomGeometry = { stripWidth: 44, roomWidth: 704, gutter: 24 };

export type RoomMode = 'push' | 'overlay';

export interface RoomLayout {
  mode: RoomMode;
  /** The width left for the transcript's column, gutters included. */
  column: number;
}

export function roomLayout(
  innerWidth: number,
  drawerWidth: number,
  geometry: RoomGeometry = ROOM_GEOMETRY,
): RoomLayout {
  const free = innerWidth - geometry.stripWidth;
  const needed = geometry.roomWidth + 2 * geometry.gutter;
  if (drawerWidth <= 0) return { mode: 'push', column: Math.max(0, free) };
  const pushed = free - drawerWidth;
  if (pushed >= needed) return { mode: 'push', column: pushed };
  return { mode: 'overlay', column: Math.max(0, free) };
}

/** A drawer's stored width, clamped to what the window can give it. */
export function clampDrawerWidth(
  width: number,
  innerWidth: number,
  minWidth = 360,
  maxFraction = 0.5,
): number {
  const max = Math.max(minWidth, Math.floor(innerWidth * maxFraction));
  return Math.min(max, Math.max(minWidth, Math.round(width)));
}
