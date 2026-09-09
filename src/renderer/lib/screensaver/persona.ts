// Who the screensaver's duck is: the same preference the desktop duck reads,
// resolved once per takeover. `dressed` hands a scene the art with the
// persona's layers on; a Duck Yard rotating on its own also gets the whole
// wardrobe, so its crowd is a mix.

import { normalizePetPrefs } from '@shared/pet-prefs';
import { DEFAULT_PERSONA, ROTATE, resolvePersona, type PersonaChoice } from '@shared/personas';
import type { DuckArt } from './duck-rig';
import type { Wardrobe } from './duck-art';
import type { Scene } from './scene';
import { DuckYard } from './scenes/duck-yard';

/** The stored choice; the default when the bridge is not there (a plain browser). */
export async function readPersonaChoice(): Promise<PersonaChoice> {
  try {
    const stored = await window.yeaboi?.getPetPrefs?.();
    return normalizePetPrefs(stored).persona;
  } catch {
    return DEFAULT_PERSONA;
  }
}

export function dressed(
  scene: Scene,
  art: DuckArt,
  wardrobe: Wardrobe,
  choice: PersonaChoice,
): void {
  const persona = resolvePersona(choice, Date.now());
  scene.setArt({ ...art, outfits: persona ? wardrobe[persona] : undefined });
  if (scene instanceof DuckYard) {
    scene.setWardrobe(choice === ROTATE ? Object.values(wardrobe) : null);
  }
}
