import { TILE } from './constants';
import { ONEWAY, Room, SOLID } from './room';

export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export interface MoveResult {
  wall: boolean;
  ceiling: boolean;
  landed: boolean;
}

function solidInRect(room: Room, x0: number, y0: number, x1: number, y1: number): boolean {
  const tx0 = Math.floor(x0 / TILE);
  const tx1 = Math.floor((x1 - 0.001) / TILE);
  const ty0 = Math.floor(y0 / TILE);
  const ty1 = Math.floor((y1 - 0.001) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (room.tile(tx, ty) === SOLID) return true;
  return false;
}

/** Move an axis-aligned body through the tile grid, resolving collisions one axis at a time. */
export function moveBody(b: Body, room: Room, dt: number, dropThrough = false): MoveResult {
  const res: MoveResult = { wall: false, ceiling: false, landed: false };
  const wasGround = b.onGround;
  b.onGround = false;
  const dx = b.vx * dt;
  const dy = b.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
  const sx = dx / steps;
  const sy = dy / steps;

  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      b.x += sx;
      if (solidInRect(room, b.x, b.y, b.x + b.w, b.y + b.h)) {
        if (sx > 0) b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w - 0.001;
        else b.x = Math.floor(b.x / TILE + 1) * TILE + 0.001;
        b.vx = 0;
        res.wall = true;
      }
    }
    if (sy !== 0) {
      const prevBottom = b.y + b.h;
      b.y += sy;
      if (sy > 0) {
        const bottom = b.y + b.h;
        const ty = Math.floor((bottom - 0.001) / TILE);
        const tx0 = Math.floor(b.x / TILE);
        const tx1 = Math.floor((b.x + b.w - 0.001) / TILE);
        let hit = false;
        for (let tx = tx0; tx <= tx1; tx++) {
          const t = room.tile(tx, ty);
          if (t === SOLID) hit = true;
          else if (t === ONEWAY && !dropThrough && prevBottom <= ty * TILE + 0.01) hit = true;
        }
        if (hit) {
          b.y = ty * TILE - b.h;
          b.vy = 0;
          b.onGround = true;
          res.landed = !wasGround;
        }
      } else if (solidInRect(room, b.x, b.y, b.x + b.w, b.y + b.h)) {
        b.y = Math.floor(b.y / TILE + 1) * TILE + 0.001;
        b.vy = 0;
        res.ceiling = true;
      }
    }
  }
  return res;
}

/** Is there ground (solid or platform) directly beneath this point? */
export function groundAt(room: Room, px: number, py: number): boolean {
  const t = room.tile(Math.floor(px / TILE), Math.floor(py / TILE));
  return t === SOLID || t === ONEWAY;
}
