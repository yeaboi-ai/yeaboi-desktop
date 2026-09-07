// Where the one embed frame sits. The frame lives at the window's root and is
// laid over a slot the Music page owns, so leaving the page hides the frame
// without unmounting it — an unmounted frame is a stopped player.
//
// Pure: the host measures, this decides.

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** `slot`: over the page's slot. `hidden`: off-route, clipped to nothing. */
export type DockMode = 'slot' | 'hidden';

export interface FrameStyle extends Rect {
  visible: boolean;
}

export const HIDDEN_FRAME: FrameStyle = { left: 0, top: 0, width: 0, height: 0, visible: false };

export function frameStyle(slot: Rect | null, mode: DockMode): FrameStyle {
  if (mode !== 'slot' || !slot) return HIDDEN_FRAME;
  const width = Math.round(slot.width);
  const height = Math.round(slot.height);
  if (width <= 0 || height <= 0) return HIDDEN_FRAME;
  return { left: Math.round(slot.left), top: Math.round(slot.top), width, height, visible: true };
}

/** Same placement, so the host can skip a style write. */
export function sameFrame(a: FrameStyle, b: FrameStyle): boolean {
  return (
    a.visible === b.visible &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}
