import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

// 12 "themes" for the same avataaars character style — hoodies, glasses, beanies,
// suits, beards. One character vibe, different outfits + colour palettes.
//
// Dicebear options are deterministic given seed + the option set passed in, so
// the same preset will always produce the same SVG.

// Avataaars style options — typed loosely since the upstream type is large and
// we only use a curated subset across presets.
type AvataaarsOptions = Parameters<typeof createAvatar<Record<string, unknown>>>[1];

export type Preset = {
  id: string;
  name: string;
  options: AvataaarsOptions;
};

export const PRESETS: Preset[] = [
  {
    id: "classic",
    name: "Classic",
    options: {
      seed: "classic-hoodie",
      top: ["shortHairTheCaesar"],
      accessories: ["round"],
      accessoriesProbability: 100,
      clothing: ["hoodie"],
      clothesColor: ["3c4f5c"],
      facialHair: [],
      backgroundColor: ["b6e3f4"],
      skinColor: ["edb98a"],
    },
  },
  {
    id: "hoodup",
    name: "Hood up",
    options: {
      seed: "hood-up",
      top: ["winterHat03"],
      accessories: ["wayfarers"],
      accessoriesProbability: 100,
      clothing: ["hoodie"],
      clothesColor: ["262e33"],
      facialHair: [],
      backgroundColor: ["ffd5dc"],
      skinColor: ["d08b5b"],
    },
  },
  {
    id: "beanie",
    name: "Beanie",
    options: {
      seed: "beanie",
      top: ["winterHat04"],
      accessories: ["round"],
      accessoriesProbability: 100,
      clothing: ["graphicShirt"],
      clothesColor: ["a7ffc4"],
      facialHair: ["beardLight"],
      facialHairProbability: 100,
      backgroundColor: ["c0aede"],
      skinColor: ["edb98a"],
    },
  },
  {
    id: "ceo",
    name: "CEO",
    options: {
      seed: "ceo",
      top: ["shortHairShortFlat"],
      accessories: ["prescription01"],
      accessoriesProbability: 100,
      clothing: ["blazerAndShirt"],
      clothesColor: ["262e33"],
      facialHair: [],
      backgroundColor: ["d1d4f9"],
      skinColor: ["f8d25c"],
    },
  },
  {
    id: "coder",
    name: "Coder",
    options: {
      seed: "coder",
      top: ["shortHairTheCaesarSidePart"],
      accessories: ["prescription02"],
      accessoriesProbability: 100,
      clothing: ["hoodie"],
      clothesColor: ["25557c"],
      facialHair: ["beardMedium"],
      facialHairProbability: 100,
      backgroundColor: ["ffdfbf"],
      skinColor: ["d08b5b"],
    },
  },
  {
    id: "bookworm",
    name: "Bookworm",
    options: {
      seed: "bookworm",
      top: ["bigHair"],
      accessories: ["prescription02"],
      accessoriesProbability: 100,
      clothing: ["collarAndSweater"],
      clothesColor: ["e6e6e6"],
      facialHair: [],
      backgroundColor: ["b6e3f4"],
      skinColor: ["edb98a"],
    },
  },
  {
    id: "skater",
    name: "Skater",
    options: {
      seed: "skater",
      top: ["dreads01"],
      accessories: ["sunglasses"],
      accessoriesProbability: 100,
      clothing: ["graphicShirt"],
      clothesColor: ["ff5c5c"],
      facialHair: [],
      backgroundColor: ["a7ffc4"],
      skinColor: ["ae5d29"],
    },
  },
  {
    id: "artist",
    name: "Artist",
    options: {
      seed: "artist",
      top: ["bun"],
      accessories: ["wayfarers"],
      accessoriesProbability: 100,
      clothing: ["overall"],
      clothesColor: ["a7ffc4"],
      facialHair: [],
      backgroundColor: ["ffd5dc"],
      skinColor: ["fd9841"],
    },
  },
  {
    id: "athlete",
    name: "Athlete",
    options: {
      seed: "athlete",
      top: ["shortHairShortCurly"],
      accessories: ["sunglasses"],
      accessoriesProbability: 100,
      clothing: ["shirtCrewNeck"],
      clothesColor: ["ff488e"],
      facialHair: [],
      backgroundColor: ["c0aede"],
      skinColor: ["614335"],
    },
  },
  {
    id: "casual",
    name: "Casual",
    options: {
      seed: "casual",
      top: ["shortHairFrizzle"],
      accessories: [],
      accessoriesProbability: 0,
      clothing: ["shirtVNeck"],
      clothesColor: ["65c9ff"],
      facialHair: [],
      backgroundColor: ["d1d4f9"],
      skinColor: ["edb98a"],
    },
  },
  {
    id: "dj",
    name: "DJ",
    options: {
      seed: "dj",
      top: ["hat"],
      accessories: ["sunglasses"],
      accessoriesProbability: 100,
      clothing: ["graphicShirt"],
      clothesColor: ["262e33"],
      facialHair: ["moustacheFancy"],
      facialHairProbability: 100,
      backgroundColor: ["ffd5dc"],
      skinColor: ["d08b5b"],
    },
  },
  {
    id: "explorer",
    name: "Explorer",
    options: {
      seed: "explorer",
      top: ["hijab"],
      accessories: ["round"],
      accessoriesProbability: 100,
      clothing: ["blazerAndSweater"],
      clothesColor: ["3c4f5c"],
      facialHair: [],
      backgroundColor: ["ffdfbf"],
      skinColor: ["fd9841"],
    },
  },
];

export function presetKey(preset: Preset): string {
  return preset.id;
}

export function presetLabel(preset: Preset): string {
  return preset.name;
}

/** Returns a `data:image/svg+xml;utf8,...` URI for use in `<img src>`. */
export function presetToDataUri(preset: Preset): string {
  return createAvatar(avataaars, preset.options).toDataUri();
}

/** Returns the raw SVG string. */
function presetToSvgString(preset: Preset): string {
  return createAvatar(avataaars, preset.options).toString();
}

/** Render the preset SVG to a PNG blob at the requested size. */
export async function presetToBlob(preset: Preset, size = 256): Promise<Blob> {
  const svg = presetToSvgString(preset);
  // Force the SVG root to render at the target size so the rasterised PNG
  // is crisp regardless of the SVG's intrinsic viewBox dimensions.
  const sized = svg
    .replace(/<svg([^>]*)\swidth="[^"]*"/i, `<svg$1`)
    .replace(/<svg([^>]*)\sheight="[^"]*"/i, `<svg$1`)
    .replace(/<svg/i, `<svg width="${size}" height="${size}"`);

  const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "sync";
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load preset SVG"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Failed to encode PNG"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
