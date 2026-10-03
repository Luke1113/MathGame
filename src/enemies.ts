import { clamp, pal, Rect, TILE } from './constants';
import { drawQ, drawRich, qWidth } from './draw';
import { Q } from './num';
import { groundAt, moveBody, type Body } from './physics';
import type { Room } from './room';

export type EnemyKind = 'walker' | 'drifter' | 'emitter' | 'orbiter' | 'bound' | 'gate' | 'door' | 'whole' | 'piece' | 'wedge' | 'plotter' | 'doubler';

export interface World {
  room: Room;
  px: number;
  py: number;
  shoot(x: number, y: number, vx: number, vy: number): void;
  /** Fire along a graph toward (tx, ty), after showing it. */
  plot(x: number, y: number, path: 'sin' | 'para', tx: number, ty: number): void;
}

export class Enemy implements Body {
  x = 0;
  y = 0;
  w = 20;
  h = 26;
  vx = 0;
  vy = 0;
  onGround = false;
  n: Q;
  /** The number it began as. */
  readonly start: Q;
  /** Pieces broken from the same whole share a group, and drift back together. */
  group = 0;
  /** The whole a piece was broken from. */
  whole: Q | null = null;
  age = 0;
  /** Where a piece is drawn to, while it seeks the rest of its whole. */
  mergeTo: { x: number; y: number } | null = null;
  /** e^pow: no number can lessen it until ln counts it back to pow. */
  ePow: number | null = null;
  /** Other numbers a door also opens to (both roots of x² = 16). */
  alts: Q[] = [];
  /** A plotter's graph: the curve it draws before firing along it. */
  curve: 'sin' | 'para' = 'sin';
  private plotT = 2 + Math.random();
  private growT = 3;
  /** Wedges of a slice: attached to the circle until they break away. */
  attached = true;
  detachT = 0;
  wedgeCount = 1;
  /** How the number first shows itself, e.g. "2^5". Lost at the first wound. */
  label: string | null = null;
  /** For doors: what is written on them, e.g. "2x + 5 = 1". */
  sign: string | null = null;
  /** For doors in the plane: opened by standing at points, not by a number. */
  needsPoints = false;
  dead = false;
  t = Math.random() * 10;
  dir: 1 | -1 = -1;
  hurtT = 0;
  popT = 0;
  stunT = 0;
  turnT = 0;
  private hopT = 1 + Math.random();
  private fireT = 1.5 + Math.random();
  chargeT = 0;
  homeX = 0;
  homeY = 0;
  orbitA = Math.random() * Math.PI * 2;
  /** Tiles occupied by a gate or door. */
  tiles: [number, number][] = [];
  appear = 0;

  constructor(
    readonly kind: EnemyKind,
    n: Q,
    readonly key: string,
  ) {
    this.n = n;
    this.start = n;
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
  /** Does this door open to x = v? */
  opensTo(v: Q): boolean {
    return this.ePow === null && (this.n.eq(v) || this.alts.some((a) => a.eq(v)));
  }

  get negative(): boolean {
    return this.n.sign < 0;
  }
  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }

  private get shown(): string {
    return this.label ?? this.n.toString();
  }

  resize(): void {
    const len = Math.min(6, this.shown.replace(/[\^/]/g, '').length);
    const frac = !this.label && this.n.d !== 1;
    const d = frac ? Math.max(1, len - 1) * 0.6 : len;
    const cx = this.x + this.w / 2;
    const bottom = this.y + this.h;
    if (this.kind === 'walker') {
      this.w = 12 + 10 * d;
      this.h = frac ? 34 : 26;
    } else if (this.kind === 'drifter' || this.kind === 'orbiter' || this.kind === 'piece') {
      this.w = this.h = 24 + 8 * d;
    } else if (this.kind === 'whole') {
      this.w = this.h = 46 + 8 * d;
    } else if (this.kind === 'wedge') {
      this.w = this.h = 34;
    } else if (this.kind === 'emitter' || this.kind === 'plotter') {
      this.w = this.h = 30 + 6 * d;
    } else if (this.kind === 'doubler') {
      this.w = this.h = 26 + 8 * d;
    } else if (this.kind === 'bound') {
      this.w = 26 + 10 * d;
      this.h = 32;
    } else return;
    this.x = cx - this.w / 2;
    if (this.kind === 'walker' || this.kind === 'bound') this.y = bottom - this.h;
  }

  private get floats(): boolean {
    return ['drifter', 'emitter', 'orbiter', 'whole', 'piece', 'wedge', 'plotter', 'doubler'].includes(this.kind);
  }

  hitbox(): Rect {
    const inset = this.floats ? 4 : 2;
    return { x: this.x + inset, y: this.y + inset, w: this.w - inset * 2, h: this.h - inset * 2 };
  }

  /** Knocked back by a blow; negative numbers are pulled toward it instead. */
  knock(fromX: number, power: number): void {
    if (this.solid || this.kind === 'emitter' || this.kind === 'plotter' || this.kind === 'orbiter' || (this.kind === 'wedge' && this.attached)) return;
    const s = (Math.sign(this.cx - fromX) || 1) * (this.negative ? -0.6 : 1);
    if (this.floats) {
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
    this.age += dt;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.popT = Math.max(0, this.popT - dt * 4);
    this.turnT = Math.max(0, this.turnT - dt * 2);
    this.stunT = Math.max(0, this.stunT - dt);
    this.appear = Math.min(1, this.appear + dt * 2.5);
    const dx = w.px - this.cx;
    const dy = w.py - this.cy;
    const haste = this.negative ? 1.2 : 1;

    switch (this.kind) {
      case 'walker':
      case 'bound': {
        const near = Math.abs(dx) < 280 && Math.abs(dy) < 110;
        const speed = (this.kind === 'bound' ? 26 : near ? 78 : 38) * haste;
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
      case 'wedge':
        if (this.attached) {
          // one slice of a turning circle, until its moment comes
          this.orbitA += dt * 0.9;
          const R = 46;
          this.x = this.homeX + Math.cos(this.orbitA) * R * 0.62 - this.w / 2;
          this.y = this.homeY + Math.sin(this.orbitA) * R * 0.62 - this.h / 2;
          if (Math.hypot(dx, dy) < 460) this.detachT -= dt;
          if (this.detachT <= 0) {
            this.attached = false;
            const d = Math.hypot(dx, dy) || 1;
            this.vx = (dx / d) * 300;
            this.vy = (dy / d) * 300;
            this.stunT = 0.5;
          }
          break;
        }
        this.drift(dt, w, dx, dy, haste);
        break;
      case 'drifter':
      case 'whole':
      case 'piece':
        this.drift(dt, w, dx, dy, haste);
        break;
      case 'doubler':
        // growth that grows: twice itself, again and again
        this.drift(dt, w, dx, dy, haste);
        this.growT -= dt;
        if (this.growT <= 0) {
          this.growT = 3;
          const next = this.n.mul(Q.int(2));
          if (Math.abs(next.approx) > 128) {
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              w.shoot(this.cx, this.cy, Math.cos(a) * 200, Math.sin(a) * 200);
            }
            this.n = this.start;
          } else this.n = next;
          this.popT = 1;
          this.resize();
        }
        break;
      case 'plotter': {
        this.y = this.homeY - this.h / 2 + Math.sin(this.t * 1.1) * 5;
        this.plotT -= dt;
        if (this.plotT <= 0 && Math.hypot(dx, dy) < 620) {
          w.plot(this.cx, this.cy, this.curve, w.px, w.py);
          this.plotT = 3.4 + Math.random() * 0.8;
          this.chargeT = 0.9;
        }
        this.chargeT = Math.max(0, this.chargeT - dt);
        break;
      }
      case 'orbiter': {
        // goes around its centre forever, at radius 2 tiles
        this.orbitA += dt * 1.1 * (this.negative ? -1 : 1);
        this.x = this.homeX + Math.cos(this.orbitA) * TILE * 2 - this.w / 2;
        this.y = this.homeY + Math.sin(this.orbitA) * TILE * 2 - this.h / 2;
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

  /** Floating movement: toward x when near, home otherwise, or toward the rest of its whole. */
  private drift(dt: number, w: World, dx: number, dy: number, haste: number): void {
    const near = Math.hypot(dx, dy) < 300;
    let ax = 0;
    let ay = 0;
    if (this.mergeTo) {
      // a piece seeks the rest of its whole
      const mx = this.mergeTo.x - this.cx;
      const my = this.mergeTo.y - this.cy;
      const d = Math.hypot(mx, my) || 1;
      ax = (mx / d) * 260;
      ay = (my / d) * 260;
    } else if (near) {
      const d = Math.hypot(dx, dy) || 1;
      ax = (dx / d) * 140 * haste;
      ay = (dy / d) * 140 * haste;
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
    const max = this.stunT > 0 ? 400 : (this.kind === 'whole' ? 45 : this.mergeTo ? 120 : 90) * haste;
    if (sp > max) {
      this.vx *= max / sp;
      this.vy *= max / sp;
    }
    this.x = clamp(this.x + this.vx * dt, 0, w.room.pw - this.w);
    this.y = clamp(this.y + this.vy * dt, 0, w.room.ph - this.h);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const a = this.appear;
    const flash = this.hurtT > 0;
    ctx.globalAlpha = a;
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.lineWidth = 1.5;
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
      ctx.fillStyle = pal.void;
      ctx.fillRect(cx - 24, cy - 20, 48, 40);
      ctx.fillStyle = pal.ink;
      drawQ(ctx, this.n, cx, cy, 40 + this.popT * 14, 600);
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
      if (this.sign) drawRich(ctx, this.sign, cx, this.y - 16, 21);
      else drawQ(ctx, this.n, cx, this.y - 16, 22);
      ctx.globalAlpha = 1;
      return;
    }

    let size = this.kind === 'emitter' || this.kind === 'wedge' || this.kind === 'plotter' ? 22 : this.kind === 'whole' ? 36 : this.kind === 'drifter' || this.kind === 'orbiter' || this.kind === 'piece' ? 28 : 32;
    size += this.popT * 12;
    const by = this.kind === 'walker' || this.kind === 'bound' ? this.y + this.h - (this.n.d !== 1 && !this.label ? 17 : 13) : cy;
    const glyph = (x: number, y: number) => {
      if (this.label) drawRich(ctx, this.label, x, y, size, { weight: 600 });
      else drawQ(ctx, this.n, x, y, size, 600);
    };

    if (this.kind === 'plotter') {
      // it draws graphs: a frame, and the f that names it
      const r = this.w / 2;
      ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);
      ctx.globalAlpha = a * (this.chargeT > 0 ? 0.9 : 0.4);
      ctx.font = 'italic 500 13px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('f', cx - r + 7, cy - r + 8);
      ctx.globalAlpha = a;
    }
    if (this.kind === 'doubler') {
      const r = this.w / 2;
      ctx.globalAlpha = a * 0.35;
      ctx.beginPath();
      ctx.arc(cx, cy, r * (1 + (3 - this.growT) / 6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a;
    }
    if (this.kind === 'whole') {
      // a whole circle, waiting to be broken
      const r = this.w / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a;
    }
    if (this.kind === 'piece') {
      // a piece is an arc: how much of the whole it is
      const part = this.whole ? clamp(Math.abs(this.n.approx / this.whole.approx), 0.04, 1) : 0.5;
      const r = this.w / 2;
      const turn = this.t * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, turn, turn + Math.PI * 2 * part);
      ctx.stroke();
      ctx.lineWidth = 1.5;
    }
    if (this.kind === 'wedge') {
      const n = this.wedgeCount;
      const half = Math.PI / n;
      ctx.beginPath();
      if (this.attached) {
        ctx.moveTo(this.homeX, this.homeY);
        ctx.arc(this.homeX, this.homeY, 46, this.orbitA - half, this.orbitA + half);
      } else {
        const dir = Math.atan2(this.vy, this.vx) + Math.PI;
        const tipX = cx + Math.cos(dir) * 16;
        const tipY = cy + Math.sin(dir) * 16;
        ctx.moveTo(tipX, tipY);
        ctx.arc(tipX, tipY, 34, dir + Math.PI - half, dir + Math.PI + half);
      }
      ctx.closePath();
      ctx.stroke();
    }
    if (this.kind === 'orbiter') {
      ctx.globalAlpha = a * 0.12;
      ctx.beginPath();
      ctx.arc(this.homeX, this.homeY, TILE * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a;
    }
    if (this.kind === 'drifter' || this.kind === 'orbiter' || this.kind === 'piece') {
      ctx.globalAlpha = a * 0.15;
      glyph(cx - this.vx * 0.12, cy - this.vy * 0.12);
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

    if (this.negative) {
      // a negative number is drawn as a photographic negative of itself
      const w = (this.label ? 20 : qWidth(ctx, this.n, size, 600)) + 16;
      const h = size * (this.n.d !== 1 ? 1.5 : 1.05);
      ctx.beginPath();
      ctx.ellipse(cx, by, w / 2 + 2, h / 2 + 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.void;
    }
    if (flash) {
      ctx.globalAlpha = a * 0.55;
      glyph(cx + 1.5, by);
      glyph(cx - 1.5, by);
      ctx.globalAlpha = a;
    }
    glyph(cx, by);
    ctx.fillStyle = pal.ink;
    if (this.turnT > 0) {
      // the moment of crossing zero
      ctx.globalAlpha = this.turnT;
      ctx.beginPath();
      ctx.arc(cx, by, 20 + (1 - this.turnT) * 40, 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((this.kind === 'walker' || this.kind === 'bound') && this.onGround) {
      ctx.globalAlpha = a * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - this.w * 0.35, this.y + this.h + 0.5);
      ctx.lineTo(cx + this.w * 0.35, this.y + this.h + 0.5);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
  /** A digit π has spoken; x can strike it back. */
  digit?: number;
  /** Struck back by x: it no longer harms x. */
  friendly?: boolean;
}

export function makeEnemy(kind: EnemyKind, n: Q, key: string, tx: number, ty: number, label: string | null = null): Enemy {
  const e = new Enemy(kind, n, key);
  e.label = label;
  e.resize();
  const footX = tx * TILE + TILE / 2;
  const footY = (ty + 1) * TILE;
  if (kind !== 'walker' && kind !== 'bound') {
    e.x = footX - e.w / 2;
    e.y = ty * TILE + TILE / 2 - e.h / 2;
  } else {
    e.x = footX - e.w / 2;
    e.y = footY - e.h;
  }
  e.homeX = kind === 'orbiter' ? footX : e.cx;
  e.homeY = kind === 'orbiter' ? ty * TILE + TILE / 2 : e.cy;
  e.dir = Math.random() < 0.5 ? 1 : -1;
  return e;
}
