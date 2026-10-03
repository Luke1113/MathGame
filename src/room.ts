import { TILE } from './constants';
import type { EntitySpec, RoomDef } from './rooms';

export const EMPTY = 0;
export const SOLID = 1;
export const ONEWAY = 2;

export type Side = 'N' | 'S' | 'E' | 'W';

export interface Placed {
  key: string;
  tx: number;
  ty: number;
  spec: EntitySpec;
}

export class Room {
  readonly def: RoomDef;
  readonly w: number;
  readonly h: number;
  readonly pw: number;
  readonly ph: number;
  private tiles: Uint8Array;
  /** Solid tiles drawn by an entity (gates, doors) rather than as terrain. */
  private hidden: Uint8Array;
  private exitAt: (string | null)[];
  readonly placed: Placed[] = [];
  readonly lamps: { x: number; y: number }[] = [];
  spawn: { x: number; y: number } | null = null;
  private edgeCache: Path2D | null = null;
  private platCache: Path2D | null = null;

  constructor(def: RoomDef) {
    this.def = def;
    this.h = def.map.length;
    this.w = def.map[0].length;
    this.pw = this.w * TILE;
    this.ph = this.h * TILE;
    this.tiles = new Uint8Array(this.w * this.h);
    this.hidden = new Uint8Array(this.w * this.h);
    this.exitAt = new Array(this.w * this.h).fill(null);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = def.map[y][x];
        const i = y * this.w + x;
        if (c === '#') this.tiles[i] = SOLID;
        else if (c === '-') this.tiles[i] = ONEWAY;
        else if (c === '@') this.spawn = { x: x * TILE + TILE / 2, y: (y + 1) * TILE };
        else if (c === '&') this.lamps.push({ x: x * TILE + TILE / 2, y: (y + 1) * TILE });
        else if (/[A-Z0-9]/.test(c)) this.exitAt[i] = c;
        else if (/[a-z]/.test(c)) this.placed.push({ key: `${def.id}:${c}${x},${y}`, tx: x, ty: y, spec: def.legend[c] });
      }
    }
  }

  tile(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return EMPTY;
    return this.tiles[ty * this.w + tx];
  }

  /** For drawing: the world beyond the border reads as solid. */
  private solidForEdges(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return true;
    const i = ty * this.w + tx;
    return this.tiles[i] === SOLID && !this.hidden[i];
  }

  setTile(tx: number, ty: number, v: number, hidden = false): void {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.tiles[ty * this.w + tx] = v;
    this.hidden[ty * this.w + tx] = hidden ? 1 : 0;
    this.edgeCache = null;
    this.platCache = null;
  }

  solidAtPx(px: number, py: number): boolean {
    return this.tile(Math.floor(px / TILE), Math.floor(py / TILE)) === SOLID;
  }

  /** Cells of the exit with this letter, along the border of this room. */
  exitCells(letter: string): { side: Side; cells: number[] } | null {
    const cells: number[] = [];
    let side: Side | null = null;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.exitAt[y * this.w + x] !== letter) continue;
        side = x === 0 ? 'W' : x === this.w - 1 ? 'E' : y === 0 ? 'N' : 'S';
        cells.push(side === 'W' || side === 'E' ? y : x);
      }
    }
    return side ? { side, cells } : null;
  }

  /** The exit letter nearest to a border position. */
  exitNear(side: Side, along: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    const n = side === 'W' || side === 'E' ? this.h : this.w;
    for (let i = 0; i < n; i++) {
      const x = side === 'W' ? 0 : side === 'E' ? this.w - 1 : i;
      const y = side === 'N' ? 0 : side === 'S' ? this.h - 1 : i;
      const l = this.exitAt[y * this.w + x];
      if (!l) continue;
      const d = Math.abs(i - along);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  /** Outline of all solid regions, merged into long strokes. */
  edges(): Path2D {
    if (this.edgeCache) return this.edgeCache;
    const p = new Path2D();
    const S = (x: number, y: number) => this.solidForEdges(x, y);
    for (let y = 0; y <= this.h; y++) {
      // horizontal edges between row y-1 and row y
      let run = -1;
      for (let x = 0; x <= this.w; x++) {
        const edge = x < this.w && S(x, y - 1) !== S(x, y);
        if (edge && run < 0) run = x;
        if (!edge && run >= 0) {
          p.moveTo(run * TILE, y * TILE);
          p.lineTo(x * TILE, y * TILE);
          run = -1;
        }
      }
    }
    for (let x = 0; x <= this.w; x++) {
      let run = -1;
      for (let y = 0; y <= this.h; y++) {
        const edge = y < this.h && S(x - 1, y) !== S(x, y);
        if (edge && run < 0) run = y;
        if (!edge && run >= 0) {
          p.moveTo(x * TILE, run * TILE);
          p.lineTo(x * TILE, y * TILE);
          run = -1;
        }
      }
    }
    this.edgeCache = p;
    return p;
  }

  platforms(): Path2D {
    if (this.platCache) return this.platCache;
    const p = new Path2D();
    for (let y = 0; y < this.h; y++) {
      let run = -1;
      for (let x = 0; x <= this.w; x++) {
        const on = x < this.w && this.tile(x, y) === ONEWAY;
        if (on && run < 0) run = x;
        if (!on && run >= 0) {
          const x0 = run * TILE;
          const x1 = x * TILE;
          const yy = y * TILE + 0.5;
          p.moveTo(x0, yy);
          p.lineTo(x1, yy);
          p.moveTo(x0, yy);
          p.lineTo(x0, yy + 6);
          p.moveTo(x1, yy);
          p.lineTo(x1, yy + 6);
          run = -1;
        }
      }
    }
    this.platCache = p;
    return p;
  }

  forEachSolid(fn: (x: number, y: number) => void): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.tiles[i] === SOLID && !this.hidden[i]) fn(x, y);
      }
    }
  }
}
