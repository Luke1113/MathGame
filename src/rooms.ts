/**
 * The world's maps, chapter by chapter. Chapter I — Arithmetic — is here;
 * Chapter II — The Other Side — is in rooms2.ts.
 *
 * Map legend
 *   #  solid            .  empty            -  one-way platform
 *   @  new-game spawn   &  lamp (save point)
 *   A–Z  exits: the same letter in two rooms joins them
 *   a–z  entities, defined per room in `legend`
 */

import { CHAPTER_TWO } from './rooms2';
import { CHAPTER_THREE } from './rooms3';

/** A number as written in a map: a whole number, or [numerator, denominator]. */
export type NumSpec = number | [number, number];

export type EntitySpec =
  /** `label` shows a number in another form until first struck, e.g. "2^5" for 32. */
  /** `pow` makes it e^pow: no number can lessen it until ln counts it back. */
  | { k: 'walker'; n: NumSpec; label?: string; pow?: number }
  | { k: 'drifter'; n: NumSpec; label?: string; pow?: number }
  /** Draws a graph toward x, then fires along it. */
  | { k: 'plotter'; n: NumSpec; curve: 'sin' | 'para' }
  /** Doubles itself every few seconds. */
  | { k: 'doubler'; n: number }
  | { k: 'emitter'; n: NumSpec }
  | { k: 'orbiter'; n: NumSpec }
  /** A whole: cannot be lessened, only broken — a whole number k breaks it into k equal pieces. */
  | { k: 'whole'; n: number }
  /** A circle of `parts` wedges, 1/parts each, that break away one by one. */
  | { k: 'slice'; parts: number }
  | { k: 'bound'; n: number }
  | { k: 'gate'; n: number; w: number; h: number }
  /** A door opens to its number. `sign` is what is written on it, if not the number itself. */
  | { k: 'door'; n: NumSpec; h: number; sign?: string; alts?: NumSpec[] }
  /** A gate of e^pow: ln turns it into the plain number pow, which then opens it. */
  | { k: 'egate'; pow: number; h: number }
  /** A door in the plane that opens when x has stood at every point in the room. */
  | { k: 'pointdoor'; h: number; sign: string }
  /** A point of the plane, at coordinates (a, b) of the room's axes. */
  | { k: 'point'; a: number; b: number }
  /** Solid floor that opens once the named boss is resolved. */
  | { k: 'seal'; w: number; h: number; until: string }
  | { k: 'shrine'; give: string }
  | { k: 'text'; s: string }
  | { k: 'boss'; which: 'zero' | 'pi' | 'e' };

/** A graph that can be stood on. Units are tiles; y is the surface, measured down. */
export type CurveSpec =
  | { k: 'line'; x0: number; x1: number; y0: number; y1: number; label?: string }
  | { k: 'sin'; x0: number; x1: number; y: number; amp: number; period: number; speed: number; label?: string }
  | { k: 'para'; x0: number; x1: number; vx: number; vy: number; a: number; label?: string };

export interface RoomDef {
  id: string;
  name: string;
  map: string[];
  legend: Record<string, EntitySpec>;
  dark?: number;
  /** 1 by default. Chapter II is drawn in negative. */
  chapter?: number;
  /** Tile corner where a room's coordinate axes cross. */
  axes?: { ox: number; oy: number };
  /** Some places here are reached only with the upward dash (y). */
  dash?: boolean;
  /** Some places here are reached only by ⌊x⌋'s stairs. */
  stairs?: boolean;
  /** Graphs to stand on. */
  curves?: CurveSpec[];
}

const CHAPTER_ONE: RoomDef[] = [
  {
    id: 'void',
    name: 'nothing',
    legend: {
      t: { k: 'text', s: 'In the beginning, there was nothing.' },
      u: { k: 'text', s: 'And in the nothing, something unknown.' },
    },
    map: [
      '####################################',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#.........t...............u........#',
      '#..................................#',
      '#..................................A',
      '#..................................A',
      '#...@..............................A',
      '####################################',
      '####################################',
      '####################################',
    ],
  },
  {
    id: 'one',
    name: 'one',
    legend: {
      a: { k: 'shrine', give: '1' },
      t: { k: 'text', s: 'Take what is given.' },
      b: { k: 'walker', n: 2 },
      c: { k: 'walker', n: 3 },
    },
    map: [
      '########################################',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#.............t........................#',
      '#......................................#',
      'A...........................----.......B',
      'A......................................B',
      'A...&.........a...........b......c.....B',
      '########################################',
      '########################################',
      '########################################',
    ],
  },
  {
    id: 'count',
    name: 'count',
    legend: {
      a: { k: 'shrine', give: '+' },
      d: { k: 'shrine', give: '2' },
      t: { k: 'text', s: 'Count.' },
      v: { k: 'text', s: 'You cannot take more than there is.' },
      w: { k: 'text', s: 'Some ways open only downward.' },
      b: { k: 'walker', n: 3 },
      c: { k: 'walker', n: 4 },
      e: { k: 'drifter', n: 5 },
    },
    map: [
      '#########################################CCC######',
      '#................................................#',
      '#................................................#',
      '#.......................................-----....#',
      '#................................................#',
      '#................................................#',
      '#..d..............................-----..........#',
      '######...............................e...........#',
      '#................................................#',
      '#.......----...........................------....#',
      '#................................................#',
      '#...t.........................v..................#',
      'B..........----.........w........-----...........E',
      'B................................................E',
      'B...a........b...&...........c...................E',
      '######################.....#######################',
      '######################-----#######################',
      '######################DDDDD#######################',
    ],
  },
  {
    id: 'times',
    name: 'again, and again',
    legend: {
      a: { k: 'shrine', give: '×' },
      d: { k: 'shrine', give: '3' },
      f: { k: 'shrine', give: '4' },
      t: { k: 'text', s: 'The same, over and over.' },
      u: { k: 'text', s: 'Each step is the step before it.' },
      b: { k: 'walker', n: 8 },
      e: { k: 'drifter', n: 3 },
      g: { k: 'drifter', n: 4 },
      h: { k: 'drifter', n: 6 },
    },
    map: [
      '##############################',
      '#............................#',
      '#...........t................#',
      '#...........a................#',
      '#.......---------............#',
      '#............................#',
      '#.....h......................#',
      '#.................-----......#',
      '#............................#',
      '#..d.........................#',
      '#######......-----...........#',
      '#............................#',
      '#............................#',
      '#.........-----..............#',
      '#............................#',
      '#.......g....................#',
      '#.................-----......#',
      '#............................#',
      '#..........................f.#',
      '#........................----#',
      '#............................#',
      '#....................b.......#',
      '#.................#######....#',
      '#............................#',
      '#....e.......................#',
      '#.........-----..............#',
      '#............u...............#',
      '#............................#',
      '#..------....................#',
      '#............................#',
      '#...........-----............#',
      '#############...##############',
      '#############...##############',
      '#############CCC##############',
    ],
  },
  {
    id: 'under',
    name: 'beneath',
    legend: {
      a: { k: 'shrine', give: '−' },
      g: { k: 'shrine', give: '7' },
      t: { k: 'text', s: 'Not everything grows.' },
      b: { k: 'walker', n: 6 },
      c: { k: 'walker', n: 9 },
      e: { k: 'emitter', n: 4 },
    },
    map: [
      '######DDDDD#################################',
      '#..........................................#',
      '#..........................................#',
      '#....-------...............................#',
      '#.......................................g..#',
      '#....................................#######',
      '#...........-----..........................#',
      '#...................e......................#',
      '#.............................-----........#',
      '#....------................................#',
      '#..............................t...........#',
      '#.......................-----..............F',
      '#...........-----..........................F',
      '#..................b...........a.......c...F',
      '############################################',
      '############################################',
      '############################################',
    ],
  },
  {
    id: 'deep',
    name: 'the bound',
    legend: {
      a: { k: 'shrine', give: '÷' },
      d: { k: 'shrine', give: '5' },
      g: { k: 'shrine', give: '9' },
      t: { k: 'text', s: 'Here, things are bound.' },
      u: { k: 'text', s: 'The bound cannot be lessened. Only shared.' },
      b: { k: 'bound', n: 6 },
      c: { k: 'bound', n: 8 },
    },
    map: [
      '####################################',
      '#..................................#',
      '#..................................#',
      '#..................................#',
      '#...............................g..#',
      '#.............................######',
      '#..................................#',
      '#..................................#',
      '#........................-----.....#',
      '#..........t.........u.............#',
      '#..................................#',
      'F.......................-----......#',
      'F..................................#',
      'F...&......a.........b.....c.....d.#',
      '####################################',
      '####################################',
      '####################################',
    ],
  },
  {
    id: 'hall',
    name: 'the long hall',
    legend: {
      d: { k: 'shrine', give: '6' },
      t: { k: 'text', s: 'Twelve. It will not be lessened.' },
      b: { k: 'walker', n: 12 },
      c: { k: 'walker', n: 15 },
      e: { k: 'drifter', n: 9 },
      f: { k: 'drifter', n: 7 },
      g: { k: 'emitter', n: 8 },
      h: { k: 'gate', n: 12, w: 2, h: 4 },
    },
    map: [
      '##################################################',
      '#.........................................########',
      '#.........................................########',
      '#.........................................########',
      '#.........................................########',
      '#.........g...............................########',
      '#...................................f.....########',
      '#...........................d.............########',
      '#...........e.............-----...........########',
      '#.......................................t.########',
      '#...........................................h....#',
      'E...................-----........................G',
      'E................................................G',
      'E..............b..............c..................G',
      '##################################################',
      '##################################################',
      '##################################################',
    ],
  },
  {
    id: 'equal',
    name: 'the same',
    legend: {
      a: { k: 'shrine', give: '=' },
      d: { k: 'shrine', give: '8' },
      t: { k: 'text', s: 'Look for what is the same.' },
      b: { k: 'walker', n: 6 },
      c: { k: 'drifter', n: 6 },
    },
    map: [
      '########################################',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#......................................#',
      '#..................................d...#',
      '#.....................c..........-----.#',
      '#.........t............................#',
      '#......................................#',
      'G..........................-----.......H',
      'G......................................H',
      'G...&.....a.........b...b...b..........H',
      '########################################',
      '########################################',
      '########################################',
    ],
  },
  {
    id: 'threshold',
    name: 'threshold',
    legend: {
      t: { k: 'text', s: 'Beyond lies the number that is not.' },
      d: { k: 'door', n: 24, h: 5 },
    },
    map: [
      '##############################',
      '#.....................########',
      '#.....................########',
      '#.....................########',
      '#.....................########',
      '#.....................########',
      '#.........t...........########',
      '#.....................########',
      '#.....................########',
      '#.......................d....#',
      '#............................#',
      'H............................I',
      'H............................I',
      'H.....&......................I',
      '##############################',
      '##############################',
      '##############################',
    ],
  },
  {
    id: 'zero',
    name: '',
    dark: 0.72,
    legend: {
      z: { k: 'boss', which: 'zero' },
      s: { k: 'seal', w: 2, h: 3, until: 'zero' },
    },
    map: [
      '##############################',
      '#............................#',
      '#............................#',
      '#............................#',
      '#............................#',
      '#............................#',
      '#..............z.............#',
      '#............................#',
      '#............................#',
      '#............................#',
      '#............................#',
      'I....-----..........-----....#',
      'I............................#',
      'I............................#',
      '##############s.##############',
      '##############..##############',
      '##############JJ##############',
    ],
  },
];

export const ROOMS: RoomDef[] = [...CHAPTER_ONE, ...CHAPTER_TWO, ...CHAPTER_THREE];

export const ROOM_BY_ID: Record<string, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export interface GlyphInfo {
  name: string;
  line: string;
  hint?: string;
}

export const GLYPHS: Record<string, GlyphInfo> = {
  '1': {
    name: 'one',
    line: 'Then, there was one.',
    hint: 'J  or  Num 0  —  strike with what you hold',
  },
  '+': {
    name: 'plus',
    line: 'One, and one more.',
    hint: 'a digit alone  —  hold that number      + (or U), then a digit  —  add it to x\nDigits that fall from the undone join x by the last sign you used.',
  },
  '×': {
    name: 'times',
    line: 'One, many times over.',
    hint: '× (* or X or O), then a digit  —  multiply x',
  },
  '−': {
    name: 'minus',
    line: 'To take away.',
    hint: '− (- or I), then a digit  —  subtract from x\nNothing falls below one.',
  },
  '÷': {
    name: 'divided by',
    line: 'To share, equally.',
    hint: '÷ (/ or P), then a digit  —  divide x\nStrike the bound with a number that divides them.',
  },
  '=': {
    name: 'equals',
    line: 'Two things, the same, are one thing.',
    hint: 'Enter or =  —  undo the nearest number equal to x, and its equals close beside it.\nIt spends the circle beside x; exact kills fill it.   A door opens to its own number.',
  },
  '0': { name: 'zero', line: 'Nothing. Hold it close.' },
  '±': {
    name: 'the opposite',
    line: 'Every number has its reflection.',
    hint: 'Strikes may now pass through zero: what is taken past nothing turns negative.\n− then − again  —  turn x into its opposite',
  },
  '/': {
    name: 'a part',
    line: 'Not everything is whole.',
    hint: '÷ no longer needs to come out even:  3 ÷ 4  makes  3/4',
  },
  '^': {
    name: 'power',
    line: 'Growth, upon growth.',
    hint: '^ (or K), then a digit  —  raise x to that power:  2 ^ 5  makes  32',
  },
  y: {
    name: 'the other axis',
    line: 'There was always another direction.',
    hint: 'Tab while holding a direction  —  dash that way: up along y, and on the diagonal',
  },
  '√': {
    name: 'root',
    line: 'What was grown can be undone.',
    hint: '√ (or R), then a digit  —  that root of x:   81, √, 2  makes 9      27, √, 3  makes 3\nSome roots never end. Those cannot be held.',
  },
  ax: {
    name: 'the line',
    line: 'Every rule draws a line.',
    hint: 'F  —  fire the function, carrying x      W / S  —  aim it up or down\nQ  —  choose among the functions you know',
  },
  sin: {
    name: 'sine',
    line: 'Some rules return to where they began.',
    hint: 'F  —  a wave that weaves as it flies.   Its height is x; a negative x turns it over.',
  },
  'x²': {
    name: 'the square',
    line: 'Everything thrown comes down along a parabola.',
    hint: 'F  —  lob x in an arc.   The arc is as high as x; a negative x throws it downward.',
  },
  '⌊x⌋': {
    name: 'the floor',
    line: 'Every number has a floor beneath it.',
    hint: 'F  —  build ⌊x⌋ steps in front of you.   ⌊5.7⌋ = 5: hold more, climb higher.',
  },
  ln: {
    name: 'the logarithm',
    line: 'What has grown can be counted back.',
    hint: 'F  —  a slow shot that counts growth back:   ln e^3 = 3.   It carries no x.',
  },
  e: {
    name: 'e',
    line: 'It grows by exactly as much as it is.',
  },
  'π': {
    name: 'pi',
    line: 'It never ends. It never repeats.',
    hint: 'x = π.   Nothing else can equal it.',
  },
  '2': { name: 'two', line: 'The first of the primes.' },
  '3': { name: 'three', line: 'Three, and the triangle.' },
  '4': { name: 'four', line: 'Four corners of a square.' },
  '5': { name: 'five', line: 'The fingers of one hand.' },
  '6': { name: 'six', line: 'One, and two, and three.' },
  '7': { name: 'seven', line: 'Nothing divides it.' },
  '8': { name: 'eight', line: 'Two, three times over.' },
  '9': { name: 'nine', line: 'Three threes.' },
};
