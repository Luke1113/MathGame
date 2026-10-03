import { clamp, digitsOf, INK, Rect, serif, TILE } from './constants';
import { groundAt, moveBody, type Body } from './physics';
import type { Room } from './room';

export type EnemyKind = 'walker' | 'drifter' | 'emitter' | 'bound' | 'gate' | 'door';

export interface World {
  room: Room;
  px: number;
  py: number;
  shoot(x: number, y: number, vx: number, vy: number): void;
}

export class Enemy implements Body {
  x = 0;
  y = 0;
  w = 20;
  h = 26;
  vx = 0;
  vy = 0;
  onGround = false;
  n: number;
  dead = false;
  t = Math.random() * 10;
  dir: 1 | -1 = -1;
  hurtT = 0;
  popT = 0;
  stunT = 0;
  private hopT = 1 + Math.random();
  private fireT = 1.5 + Math.random();
  chargeT = 0;
  homeX = 0;
  homeY = 0;
  /** Tiles occupied by a gate or door. */
  tiles: [number, number][] = [];
  appear = 0;

  constructor(
    readonly kind: EnemyKind,
    n: number,
    readonly key: string,
  ) {
    this.n = n;
    this.resize();
  }

  get armored(): boolean {
    return this.kind === 'bound' || this.kind === 'gate';
  }
  get solid(): boolean {
    return this.kind === 'gate' || this.kind === 'door';
  }
  get harmful(): boolean {
    return !this.solid && this.appear >= 1;
  }
  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }

  resize(): void {
    const d = digitsOf(this.n);
    const cx = this.x + this.w / 2;
    const bottom = this.y + this.h;
    if (this.kind === 'walker') {
      this.w = 12 + 10 * d;
      this.h = 26;
    } else if (this.kind === 'drifter') {
      this.w = this.h = 22 + 8 * d;
    } else if (this.kind === 'emitter') {
      this.w = this.h = 30 + 6 * d;
    } else if (this.kind === 'bound') {
      this.w = 26 + 10 * d;
      this.h = 32;
    } else return;
    this.x = cx - this.w / 2;
    this.y = this.kind === 'drifter' || this.kind === 'emitter' ? this.y : bottom - this.h;
  }

  hitbox(): Rect {
    const inset = this.kind === 'drifter' || this.kind === 'emitter' ? 4 : 2;
    return { x: this.x + inset, y: this.y + inset, w: this.w - inset * 2, h: this.h - inset * 2 };
  }

  knock(fromX: number, power: number): void {
    if (this.solid || this.kind === 'emitter') return;
    const s = Math.sign(this.cx - fromX) || 1;
    if (this.kind === 'drifter') {
      this.vx = s * power * 1.3;
      this.vy = -power * 0.3;
    } else {
      this.vx = s * power;
      this.vy = -power * 0.6;
      this.stunT = 0.28;
    }
  }

  update(dt: number, w: World): void {
    this.t += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.popT = Math.max(0, this.popT - dt * 4);
    this.stunT = Math.max(0, this.stunT - dt);
    this.appear = Math.min(1, this.appear + dt * 2.5);
    const dx = w.px - this.cx;
    const dy = w.py - this.cy;

    switch (this.kind) {
      case 'walker':
      case 'bound': {
        const near = Math.abs(dx) < 280 && Math.abs(dy) < 110;
        const speed = this.kind === 'bound' ? 26 : near ? 78 : 38;
        if (this.stunT <= 0) {
          if (near) this.dir = dx > 0 ? 1 : -1;
          const aheadX = this.dir > 0 ? this.x + this.w + 2 : this.x - 2;
          const ledge = this.onGround && !groundAt(w.room, aheadX, this.y + this.h + 4);
          const wall = w.room.solidAtPx(aheadX, this.y + this.h - 6);
          if ((ledge || wall) && !near) this.dir = -this.dir as 1 | -1;
          const target = ledge || wall ? 0 : this.dir * speed;
          this.vx += (target - this.vx) * Math.min(1, dt * 8);
          if (this.kind === 'walker' && near && this.onGround) {
            this.hopT -= dt;
            if (this.hopT <= 0) {
              this.vy = -360;
              this.vx = this.dir * 120;
              this.hopT = 1.4 + Math.random() * 1.2;
            }
          }
        }
        this.vy = Math.min(800, this.vy + 1900 * dt);
        moveBody(this, w.room, dt);
        break;
      }
      case 'drifter': {
        const near = Math.hypot(dx, dy) < 300;
        let ax = 0;
        let ay = 0;
        if (near) {
          const d = Math.hypot(dx, dy) || 1;
          ax = (dx / d) * 140;
          ay = (dy / d) * 140;
        } else {
          ax = (this.homeX - this.cx) * 1.2;
          ay = (this.homeY - this.cy) * 1.2;
        }
        ay += Math.sin(this.t * 2.1) * 60;
        this.vx += ax * dt;
        this.vy += ay * dt;
        const drag = Math.exp(-1.6 * dt);
        this.vx *= drag;
        this.vy *= drag;
        const sp = Math.hypot(this.vx, this.vy);
        const max = this.stunT > 0 ? 400 : 90;
        if (sp > max) {
          this.vx *= max / sp;
          this.vy *= max / sp;
        }
        this.x = clamp(this.x + this.vx * dt, 0, w.room.pw - this.w);
        this.y = clamp(this.y + this.vy * dt, 0, w.room.ph - this.h);
        break;
      }
      case 'emitter': {
        this.y = this.homeY - this.h / 2 + Math.sin(this.t * 1.3) * 6;
        const dist = Math.hypot(dx, dy);
        if (this.chargeT > 0) {
          this.chargeT -= dt;
          if (this.chargeT <= 0) {
            const d = dist || 1;
            w.shoot(this.cx, this.cy, (dx / d) * 230, (dy / d) * 230);
            this.fireT = 2.2 + Math.random() * 0.6;
          }
        } else if (dist < 440) {
          this.fireT -= dt;
          if (this.fireT <= 0) this.chargeT = 0.65;
        }
        break;
      }
      default:
        break;
    }
    if (this.y > w.room.ph + 40 || this.x < -60 || this.x > w.room.pw + 60) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const a = this.appear;
    const flash = this.hurtT > 0;
    ctx.globalAlpha = a;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1.5;
    const s = String(this.n);
    const cx = this.cx;
    const cy = this.cy;

    if (this.kind === 'gate') {
      ctx.strokeRect(this.x + 3, this.y + 3, this.w - 6, this.h - 6);
      ctx.globalAlpha = a * 0.35;
      ctx.strokeRect(this.x + 8, this.y + 8, this.w - 16, this.h - 16);
      for (let i = 1; i < 4; i++) {
        const yy = this.y + (this.h * i) / 4;
        ctx.beginPath();
        ctx.moveTo(this.x + 3, yy);
        ctx.lineTo(this.x + this.w - 3, yy);
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = '#000';
      ctx.fillRect(cx - 24, cy - 20, 48, 40);
      ctx.fillStyle = INK;
      this.glyph(ctx, s, cx, cy, 40 + this.popT * 14, flash);
      ctx.globalAlpha = 1;
      return;
    }
    if (this.kind === 'door') {
      const gap = 7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - gap, this.y);
      ctx.lineTo(cx - gap, this.y + this.h);
      ctx.moveTo(cx + gap, this.y);
      ctx.lineTo(cx + gap, this.y + this.h);
      ctx.stroke();
      ctx.globalAlpha = a * (0.55 + 0.25 * Math.sin(this.t * 1.5));
      ctx.font = serif(22);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s, cx, this.y - 14);
      ctx.globalAlpha = 1;
      return;
    }

    const squash = this.kind === 'walker' ? 1 + Math.max(0, Math.min(0.15, -this.vy / 2400)) : 1;
    let size = this.kind === 'emitter' ? 26 : this.kind === 'drifter' ? 30 : 32;
    size += this.popT * 12;

    if (this.kind === 'drifter') {
      ctx.globalAlpha = a * 0.18;
      this.glyph(ctx, s, cx - this.vx * 0.12, cy - this.vy * 0.12, size, false);
      ctx.globalAlpha = a * 0.08;
      this.glyph(ctx, s, cx - this.vx * 0.24, cy - this.vy * 0.24, size, false);
      ctx.globalAlpha = a;
    }
    if (this.kind === 'emitter') {
      const r = this.w / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      const ticks = 8;
      const rot = this.t * 0.6 + (this.chargeT > 0 ? (0.65 - this.chargeT) * 10 : 0);
      ctx.beginPath();
      for (let i = 0; i < ticks; i++) {
        const an = rot + (i / ticks) * Math.PI * 2;
        const r0 = r + 3;
        const r1 = r + (this.chargeT > 0 ? 9 : 5);
        ctx.moveTo(cx + Math.cos(an) * r0, cy + Math.sin(an) * r0);
        ctx.lineTo(cx + Math.cos(an) * r1, cy + Math.sin(an) * r1);
      }
      ctx.stroke();
    }
    if (this.kind === 'bound') {
      // corner brackets that hold the number shut
      const pad = 3;
      const x0 = this.x + pad;
      const y0 = this.y + pad;
      const x1 = this.x + this.w - pad;
      const y1 = this.y + this.h - pad;
      const k = 7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + k);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + k, y0);
      ctx.moveTo(x1 - k, y0);
      ctx.lineTo(x1, y0);
      ctx.lineTo(x1, y0 + k);
      ctx.moveTo(x1, y1 - k);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 - k, y1);
      ctx.moveTo(x0 + k, y1);
      ctx.lineTo(x0, y1);
      ctx.lineTo(x0, y1 - k);
      ctx.stroke();
      ctx.lineWidth = 1.5;
    }
    const by = this.kind === 'walker' || this.kind === 'bound' ? this.y + this.h - 13 : cy;
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(1 / squash, squash);
    this.glyph(ctx, s, 0, 0, size, flash);
    ctx.restore();
    if ((this.kind === 'walker' || this.kind === 'bound') && this.onGround) {
      ctx.globalAlpha = a * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - this.w * 0.35, this.y + this.h + 0.5);
      ctx.lineTo(cx + this.w * 0.35, this.y + this.h + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private glyph(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, flash: boolean): void {
    ctx.font = serif(size, { weight: 600 });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (flash) {
      ctx.save();
      ctx.globalAlpha *= 0.5;
      ctx.lineWidth = 6;
      ctx.strokeText(s, x, y);
      ctx.restore();
    }
    ctx.fillText(s, x, y);
  }
}

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  dead: boolean;
}

export function makeEnemy(kind: EnemyKind, n: number, key: string, tx: number, ty: number): Enemy {
  const e = new Enemy(kind, n, key);
  const footX = tx * TILE + TILE / 2;
  const footY = (ty + 1) * TILE;
  if (kind === 'drifter' || kind === 'emitter') {
    e.x = footX - e.w / 2;
    e.y = ty * TILE + TILE / 2 - e.h / 2;
  } else {
    e.x = footX - e.w / 2;
    e.y = footY - e.h;
  }
  e.homeX = e.cx;
  e.homeY = e.cy;
  e.dir = Math.random() < 0.5 ? 1 : -1;
  return e;
}
