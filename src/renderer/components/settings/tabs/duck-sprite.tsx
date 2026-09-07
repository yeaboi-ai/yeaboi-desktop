// The duck as the pet window draws him: the same layer stack as
// public/pet/index.html, in the same order, persona included.
//
// The base sprite alone is not the duck — it is rough under the wing and the
// sunglasses, because those layers always cover it. Drawing it on its own
// shows the mess.

import { PET_OUTFIT_RISE, petOutfit } from '@shared/pet-outfit';
import type { PersonaId } from '@shared/personas';

const FEET = [
  { src: '/pet/assets/duck-foot-back.png', key: 'foot-back', className: 'preview-foot-back' },
  { src: '/pet/assets/duck-foot-front.png', key: 'foot-front', className: 'preview-foot-front' },
];
const WING = { src: '/pet/assets/duck-wing.png', key: 'wing' };
const GLASSES = { src: '/pet/assets/duck-glasses.png', key: 'glasses' };

const overlay = 'absolute top-0 left-0 block h-auto w-full';

/** `walking` gives the rig the pet window's gait: feet stepping out of phase,
 *  the body bobbing in time with them, the wing working. */
export function DuckSprite({
  width,
  filter,
  persona,
  walking = false,
}: {
  width: number;
  filter?: string;
  persona?: PersonaId;
  walking?: boolean;
}) {
  const outfit = persona ? petOutfit(persona) : null;
  const raised = { top: `${-PET_OUTFIT_RISE * 100}%` };
  return (
    <div
      className={`relative shrink-0${walking ? ' preview-walking' : ''}`}
      style={{ width, filter }}
      aria-hidden="true"
    >
      {/* The base is in flow, so it gives the stack its height; every other
          layer is a full-canvas overlay pinned to the same box. */}
      <img src="/pet/assets/duck-body.png" alt="" className="preview-body block h-auto w-full" />
      {FEET.map((layer) => (
        <img key={layer.key} src={layer.src} alt="" className={`${overlay} ${layer.className}`} />
      ))}
      {outfit?.body && (
        <img src={`/pet/${outfit.body}`} alt="" className={overlay} style={raised} />
      )}
      <img src={WING.src} alt="" className={`${overlay} preview-wing`} />
      <img src={GLASSES.src} alt="" className={overlay} />
      {outfit && <img src={`/pet/${outfit.top}`} alt="" className={overlay} style={raised} />}
    </div>
  );
}
