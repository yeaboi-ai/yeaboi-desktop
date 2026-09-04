// The props a scene cannot draw from rectangles and rings: the small shaped
// things, as ASCII grids in the scene alphabet (i ink, h halftone, a accent,
// p paper, . clear), one cell per character, the persona grids' way.

/** A rocket's nose cone, 16 wide, stamped above the body. */
export const ROCKET_NOSE: readonly string[] = [
  '.......ii.......',
  '......iiii......',
  '.....iihhii.....',
  '....iihhhhii....',
  '...iihhhhhhii...',
  '..iihhhhhhhhii..',
  '.iihhhhhhhhhhii.',
  'iihhhhhhhhhhhhii',
];

/** A fin, 8 wide, for the rocket's left side; mirror the rows for the right. */
export const ROCKET_FIN: readonly string[] = [
  '.......i',
  '......ii',
  '.....iii',
  '....iihi',
  '...iihhi',
  '..iihhhi',
  '.iihhhhi',
  'iiiiiiii',
];

/** A microphone head on its clip, 8 wide. */
export const MIC_HEAD: readonly string[] = [
  '..iiii..',
  '.ihhhhi.',
  'ihhhhhhi',
  'ihhhhhhi',
  'ihhhhhhi',
  '.ihhhhi.',
  '..iiii..',
  '...ii...',
];

/** A wall lamp: the bracket, the shade, and the lit bulb under it. */
export const WALL_LAMP: readonly string[] = [
  'iiii................',
  'iiiiiiiiiiiii.......',
  '...........ii.......',
  '...........ii.......',
  '.......iiiiiiiiii...',
  '......ihhhhhhhhhhi..',
  '.....ihhhhhhhhhhhhi.',
  '....iiiiiiiiiiiiiiii',
  '........aaaa........',
  '.......aaaaaa.......',
  '.......aaaaaa.......',
  '........aaaa........',
];

/** A lectern's slanted top, 32 wide. */
export const LECTERN_TOP: readonly string[] = [
  '..............iiii..............',
  '..........iiiihhhhiiii..........',
  '......iiiihhhhhhhhhhhhiiii......',
  '..iiiihhhhhhhhhhhhhhhhhhhhiiii..',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
];

/** A stage spotlight, 12 wide, lens down. */
export const SPOTLIGHT: readonly string[] = [
  '.....ii.....',
  '.....ii.....',
  '..iiiiiiii..',
  '.ihhhhhhhhi.',
  '.ihhhhhhhhi.',
  '.iiiiiiiiii.',
  '..aaaaaaaa..',
];

/** A pot lid with its knob, 32 wide. */
export const POT_LID: readonly string[] = [
  '..............iiii..............',
  '.............iihhii.............',
  '..iiiiiiiiiiiiiiiiiiiiiiiiiiii..',
  'iihhhhhhhhhhhhhhhhhhhhhhhhhhhhii',
  'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
];

/** A hand truck seen side-on: the frame, the toe plate and the wheel. */
export const HAND_TRUCK: readonly string[] = [
  'iiiiii......',
  'i....i......',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....ii.....',
  '.....iiiiiii',
  '...iiii.....',
  '..ihhhi.....',
  '..ihhhi.....',
  '...iii......',
];

/** A film camera, 32 wide: body, viewfinder, lens hood, the record light. */
export const CAMERA: readonly string[] = [
  '...iiiiiii......................',
  '...ihhhhhi......................',
  '...iiiiiii......................',
  '.iiiiiiiiiiiiiiiiiiiiii.........',
  '.i.....................iii......',
  '.i.aaa.................ihhii....',
  '.i.aaa.................ihhhhi...',
  '.i.aaa.................ihhhhhi..',
  '.i.....................ihhhhhi..',
  '.i.....................ihhhhhi..',
  '.i.....................ihhhhi...',
  '.i.....................ihhii....',
  '.i.....................iii......',
  '.iiiiiiiiiiiiiiiiiiiiii.........',
  '.........iiii...................',
  '.........iiii...................',
];

/** A tape cross on the floor, 12 wide. */
export const TAPE_MARK: readonly string[] = [
  'ii........ii',
  '.ii......ii.',
  '..ii....ii..',
  '...ii..ii...',
  '....iiii....',
  '....iiii....',
  '...ii..ii...',
  '..ii....ii..',
  '.ii......ii.',
  'ii........ii',
];

/** A telescope on its tripod, 44 wide, the tube raised to the sky. */
export const TELESCOPE: readonly string[] = [
  '........................................iiii',
  '.......................................iihhi',
  '......................................iihhii',
  '.....................................iihhii.',
  '....................................iihhii..',
  '...................................iihhii...',
  '..................................iihhii....',
  '.................................iihhii.....',
  '................................iihhii......',
  '...............................iihhii.......',
  '..............................iihhii........',
  '.............................iihhii.........',
  '............................iihhii..........',
  '...........................iihhii...........',
  '..........................iihhii............',
  '.........................iihhii.............',
  '........................iihhii..............',
  '.......................iihhii...............',
  '......................iihhii................',
  '.....................iihhii.................',
  '....................iihhii..................',
  '...................iiiiii...................',
  '..................iihhi.....................',
  '.................iiiii......................',
  '.................i.iii......................',
  '................ii.i.ii.....................',
  '................i..i..i.....................',
  '...............ii..i..ii....................',
  '...............i...i...i....................',
  '..............ii...i...ii...................',
  '..............i....i....i...................',
  '.............ii....i....ii..................',
  '.............i.....i.....i..................',
  '............ii.....i.....ii.................',
  '............i......i......i.................',
  '...........ii......i......ii................',
];
