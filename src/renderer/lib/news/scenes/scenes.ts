// The eleven scenes a story can be pictured in, one per topic and one per
// kind, each a small program over the alphabet's shapes and the props. The
// duck is never drawn here: the scene leaves a stand for it and the
// component puts the sprite there, in colour, over the ink.

import {
  ACCENT,
  DUCK_CELLS,
  FRAME,
  HALF,
  INK,
  PAPER,
  box,
  disc,
  emptyGrid,
  hline,
  line,
  place,
  rect,
  ring,
  sparkle,
  stars,
  triangle,
  vline,
  type Grid,
} from './alphabet';
import {
  CAMERA,
  HAND_TRUCK,
  LECTERN_TOP,
  MIC_HEAD,
  POT_LID,
  ROCKET_FIN,
  ROCKET_NOSE,
  SPOTLIGHT,
  TAPE_MARK,
  TELESCOPE,
  WALL_LAMP,
} from './props';
import type { NewsItem, NewsTopic } from '../types';

export type SceneId =
  | 'vault'
  | 'chamber'
  | 'launchpad'
  | 'stage'
  | 'observatory'
  | 'chalkboard'
  | 'bench'
  | 'kitchen'
  | 'newsstand'
  | 'dock'
  | 'studio';

export const SCENE_IDS: readonly SceneId[] = [
  'vault',
  'chamber',
  'launchpad',
  'stage',
  'observatory',
  'chalkboard',
  'bench',
  'kitchen',
  'newsstand',
  'dock',
  'studio',
];

export interface Scene {
  id: SceneId;
  /** One sentence under the picture. */
  caption: string;
  /** The cell the duck's feet stand on (its left edge, its baseline). */
  stand: { x: number; y: number };
  build(grid: Grid): void;
}

/** Where the ground runs, and where the duck stands on it. */
const GROUND_Y = 108;
const STAND = { x: 22, y: GROUND_Y };

function ground(grid: Grid, y = GROUND_Y): void {
  hline(grid, 0, y, FRAME.w, 2);
}

/** A halftone floor under the ground line. */
function floor(grid: Grid, y = GROUND_Y + 2): void {
  rect(grid, 0, y, FRAME.w, FRAME.h - y, HALF);
}

function mirrored(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

const vault: Scene = {
  id: 'vault',
  caption: 'The detective, outside the vault.',
  stand: STAND,
  build(grid) {
    ground(grid);
    floor(grid);
    // The lamp and its light first, so the door prints over the light.
    place(grid, WALL_LAMP, 168, 10);
    triangle(grid, 178, 23, 158, 198, 50, HALF);
    // The hinge side, then the door: two rings, a bolt row, the wheel.
    rect(grid, 100, 44, 8, 54);
    disc(grid, 146, 70, 36, PAPER);
    ring(grid, 146, 70, 36, 3);
    ring(grid, 146, 70, 28, 1);
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      rect(
        grid,
        Math.round(146 + 32 * Math.cos(angle)) - 1,
        Math.round(70 + 32 * Math.sin(angle)) - 1,
        2,
        2,
      );
    }
    ring(grid, 146, 70, 12, 2);
    disc(grid, 146, 70, 4);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      line(
        grid,
        146,
        70,
        Math.round(146 + 11 * Math.cos(angle)),
        Math.round(70 + 11 * Math.sin(angle)),
        2,
      );
    }
  },
};

const chamber: Scene = {
  id: 'chamber',
  caption: 'The martial artist, before the chamber.',
  stand: STAND,
  build(grid) {
    ground(grid);
    for (const x of [100, 184]) {
      rect(grid, x - 3, 14, 16, 4);
      box(grid, x, 18, 10, 90, 2);
      rect(grid, x + 4, 22, 2, 82, HALF);
      rect(grid, x - 3, 104, 16, 4);
    }
    // The lectern: the slanted top on a body, a seal on its face.
    place(grid, LECTERN_TOP, 130, 64);
    box(grid, 136, 69, 20, 39, 2);
    ring(grid, 146, 86, 6, 1);
    // Three microphones, the middle one live.
    for (const [x, y] of [
      [136, 48],
      [142, 42],
      [148, 48],
    ] as const) {
      place(grid, MIC_HEAD, x, y);
      vline(grid, x + 3, y + 8, 64 - y - 8, 2);
    }
    rect(grid, 145, 45, 2, 2, ACCENT);
  },
};

const launchpad: Scene = {
  id: 'launchpad',
  caption: 'The astronaut, at the pad.',
  stand: STAND,
  build(grid) {
    ground(grid);
    stars(grid, 7, 18, 70);
    disc(grid, 40, 24, 9, HALF);
    ring(grid, 40, 24, 9, 1);
    // The gantry: a braced tower with two arms to the rocket.
    box(grid, 112, 16, 12, 92, 2);
    for (let y = 20; y < 104; y += 12) line(grid, 114, y, 121, y + 10, 1);
    hline(grid, 124, 40, 22, 2);
    hline(grid, 124, 72, 22, 2);
    // The rocket: nose, body, porthole, fins, the exhaust.
    place(grid, ROCKET_NOSE, 146, 22);
    box(grid, 146, 30, 16, 56, 2);
    rect(grid, 148, 32, 12, 52, HALF);
    ring(grid, 154, 48, 5, 2);
    disc(grid, 154, 48, 3, ACCENT);
    place(grid, ROCKET_FIN, 138, 78);
    place(grid, mirrored(ROCKET_FIN), 162, 78);
    rect(grid, 150, 86, 8, 4);
    triangle(grid, 154, 90, 140, 168, 106, HALF);
  },
};

const stage: Scene = {
  id: 'stage',
  caption: 'The DJ, on stage.',
  stand: { x: STAND.x, y: 92 },
  build(grid) {
    // The riser runs the whole frame; the ground line is its front edge.
    hline(grid, 0, 92, FRAME.w, 2);
    rect(grid, 0, 94, FRAME.w, 14, HALF);
    ground(grid);
    for (const x of [104, 172]) {
      box(grid, x, 44, 22, 48, 2);
      ring(grid, x + 11, 58, 7, 2);
      disc(grid, x + 11, 58, 4, HALF);
      ring(grid, x + 11, 78, 7, 2);
      disc(grid, x + 11, 78, 4, HALF);
    }
    place(grid, SPOTLIGHT, 143, 4);
    triangle(grid, 149, 11, 128, 170, 90, HALF);
    place(grid, MIC_HEAD, 145, 48);
    vline(grid, 148, 56, 36, 2);
    hline(grid, 140, 90, 18, 2);
  },
};

const observatory: Scene = {
  id: 'observatory',
  caption: 'The wizard, under the stars.',
  stand: STAND,
  build(grid) {
    ground(grid);
    // The dome on its drum, the slit open to the sky.
    box(grid, 116, 78, 84, 30, 2);
    rect(grid, 118, 80, 80, 26, HALF);
    ring(grid, 158, 80, 42, 3, INK, (_x, y) => y < 80);
    rect(grid, 154, 40, 8, 40, HALF);
    box(grid, 153, 39, 10, 41, 1);
    place(grid, TELESCOPE, 72, 72);
    stars(grid, 11, 26, 64);
    sparkle(grid, 60, 18);
  },
};

const chalkboard: Scene = {
  id: 'chalkboard',
  caption: 'The teacher, at the board.',
  stand: STAND,
  build(grid) {
    ground(grid);
    // The board is ink; the chalk is paper laid back over it.
    box(grid, 100, 20, 96, 62, 3);
    rect(grid, 103, 23, 90, 56, INK);
    hline(grid, 110, 68, 60, 1, PAPER);
    vline(grid, 110, 30, 39, 1, PAPER);
    line(grid, 112, 62, 130, 52, 1, PAPER);
    line(grid, 130, 52, 146, 56, 1, PAPER);
    line(grid, 146, 56, 166, 34, 1, PAPER);
    for (let x = 116; x < 168; x += 12) rect(grid, x, 72, 6, 1, PAPER);
    rect(grid, 176, 30, 12, 1, PAPER);
    rect(grid, 176, 36, 8, 1, PAPER);
    rect(grid, 176, 42, 12, 1, PAPER);
    hline(grid, 176, 48, 12, 1, ACCENT);
    hline(grid, 100, 82, 96, 2);
    rect(grid, 104, 84, 3, 24);
    rect(grid, 189, 84, 3, 24);
  },
};

const bench: Scene = {
  id: 'bench',
  caption: 'The engineer, at the bench.',
  stand: STAND,
  build(grid) {
    ground(grid);
    hline(grid, 96, 76, 104, 5);
    rect(grid, 100, 81, 4, 27);
    rect(grid, 190, 81, 4, 27);
    box(grid, 148, 84, 42, 16, 2);
    rect(grid, 167, 90, 4, 3);
    // The monitor: a dark screen with a prompt and the cursor.
    box(grid, 120, 34, 58, 38, 2);
    rect(grid, 122, 36, 54, 34, INK);
    for (const [y, w] of [
      [40, 20],
      [45, 32],
      [50, 12],
      [55, 26],
    ] as const) {
      rect(grid, 126, y, w, 1, PAPER);
    }
    rect(grid, 126, 61, 6, 1, PAPER);
    rect(grid, 134, 60, 3, 3, ACCENT);
    rect(grid, 146, 72, 6, 4);
    hline(grid, 138, 75, 22, 1);
    box(grid, 100, 62, 18, 14, 2);
    hline(grid, 105, 59, 8, 2);
    vline(grid, 105, 59, 4, 2);
    vline(grid, 111, 59, 4, 2);
  },
};

const kitchen: Scene = {
  id: 'kitchen',
  caption: 'The chef, at the counter.',
  stand: STAND,
  build(grid) {
    ground(grid);
    // The counter with two doors; the hob on top.
    hline(grid, 96, 70, 104, 4);
    rect(grid, 96, 74, 104, 34, HALF);
    box(grid, 104, 78, 40, 26, 2);
    box(grid, 150, 78, 40, 26, 2);
    rect(grid, 138, 90, 2, 4);
    rect(grid, 154, 90, 2, 4);
    hline(grid, 110, 68, 44, 2);
    // The pot, its lid, the flame, and the steam.
    box(grid, 116, 52, 32, 16, 2);
    rect(grid, 118, 54, 28, 12, HALF);
    hline(grid, 110, 58, 6, 2);
    hline(grid, 148, 58, 6, 2);
    place(grid, POT_LID, 116, 47);
    rect(grid, 122, 68, 4, 2, ACCENT);
    rect(grid, 138, 68, 4, 2, ACCENT);
    rect(grid, 122, 30, 3, 14, HALF);
    rect(grid, 130, 24, 3, 20, HALF);
    rect(grid, 138, 32, 3, 12, HALF);
    // A pan hanging from its hook.
    vline(grid, 178, 0, 12, 2);
    ring(grid, 179, 22, 9, 2);
    disc(grid, 179, 22, 6, HALF);
    hline(grid, 186, 21, 12, 2);
  },
};

const newsstand: Scene = {
  id: 'newsstand',
  caption: 'The morning papers, at the stand.',
  stand: STAND,
  build(grid) {
    ground(grid);
    // The kiosk under its awning; the lamp hangs from it.
    hline(grid, 98, 34, 100, 4);
    for (let x = 98; x < 198; x += 8) rect(grid, x, 38, 4, 2);
    box(grid, 104, 40, 92, 68, 2);
    hline(grid, 104, 84, 92, 3);
    rect(grid, 106, 87, 88, 19, HALF);
    vline(grid, 140, 40, 6, 2);
    rect(grid, 138, 46, 5, 3, ACCENT);
    // The stacks on the counter, and the front page pinned up.
    for (const [x, h] of [
      [110, 14],
      [138, 10],
    ] as const) {
      box(grid, x, 84 - h, 24, h, 1);
      for (let y = 84 - h + 3; y < 84; y += 3) hline(grid, x + 1, y, 22, 1, HALF);
    }
    box(grid, 158, 46, 30, 34, 1);
    hline(grid, 161, 50, 24, 3);
    for (let y = 56; y < 78; y += 3) hline(grid, 161, y, 24, 1, HALF);
  },
};

const dock: Scene = {
  id: 'dock',
  caption: 'The wizard, at the dock, with the crates.',
  stand: STAND,
  build(grid) {
    ground(grid);
    // The bay: a rolled shutter with the clock over it, and the crates.
    box(grid, 96, 14, 104, 94, 2);
    for (let y = 18; y < 106; y += 6) hline(grid, 98, y, 100, 1, HALF);
    ring(grid, 148, 8, 7, 1);
    line(grid, 148, 8, 148, 3, 1, ACCENT);
    line(grid, 148, 8, 152, 8, 1, ACCENT);
    for (const [x, y] of [
      [104, 78],
      [136, 78],
      [120, 48],
    ] as const) {
      box(grid, x, y, 30, 30, 2);
      line(grid, x + 2, y + 2, x + 27, y + 27, 1);
      line(grid, x + 27, y + 2, x + 2, y + 27, 1);
    }
    place(grid, HAND_TRUCK, 174, 74);
  },
};

const studio: Scene = {
  id: 'studio',
  caption: 'The DJ, on the mark.',
  stand: STAND,
  build(grid) {
    ground(grid);
    place(grid, TAPE_MARK, 78, 98);
    // The camera on its tripod, and the softbox on its stand.
    place(grid, CAMERA, 124, 40);
    vline(grid, 138, 56, 52, 2);
    line(grid, 138, 64, 124, 108, 2);
    line(grid, 138, 64, 154, 108, 2);
    box(grid, 174, 14, 22, 30, 2);
    rect(grid, 176, 16, 18, 26, HALF);
    box(grid, 178, 18, 14, 22, 1, ACCENT);
    vline(grid, 184, 44, 64, 2);
    hline(grid, 176, 106, 18, 2);
  },
};

export const SCENES: Record<SceneId, Scene> = {
  vault,
  chamber,
  launchpad,
  stage,
  observatory,
  chalkboard,
  bench,
  kitchen,
  newsstand,
  dock,
  studio,
};

/** The scene a topic is pictured in. */
export const SCENE_BY_TOPIC: Record<NewsTopic, SceneId> = {
  security: 'vault',
  policy: 'chamber',
  compute: 'launchpad',
  media: 'stage',
  models: 'observatory',
  research: 'chalkboard',
  tooling: 'bench',
  howto: 'kitchen',
  general: 'newsstand',
};

/** A release is always at the dock and a video always in the studio; the rest by topic. */
export function sceneFor(item: Pick<NewsItem, 'kind' | 'topic'>): SceneId {
  if (item.kind === 'release') return 'dock';
  if (item.kind === 'video') return 'studio';
  return SCENE_BY_TOPIC[item.topic as NewsTopic] ?? 'newsstand';
}

export function buildScene(id: SceneId): Grid {
  const grid = emptyGrid();
  SCENES[id].build(grid);
  return grid;
}

/** Whether the whole duck, hat included, fits in the frame from a stand. */
export function standFits(stand: { x: number; y: number }): boolean {
  return (
    stand.x >= 0 &&
    stand.x + DUCK_CELLS.w <= FRAME.w &&
    stand.y <= FRAME.h &&
    stand.y - DUCK_CELLS.h - DUCK_CELLS.headroom >= 0
  );
}
