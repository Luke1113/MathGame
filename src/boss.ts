import { clamp, damp, easeInOut, easeOut, pal, Rect, rectCircle, serif } from './constants';
import { drawQ } from './draw';
import { Q } from './num';
import type { Fx } from './fx';
import type { Player } from './player';
import type { Sound } from './audio';

export interface BossHost {
  player: Player;
  fx: Fx;
  sfx: Sound;
  floorY: number;
  arenaW: number;
  /** Fire a shot; a digit shot carries its digit, and x can strike it back. */
  shoot(x: number, y: number, vx: number, vy: number, digit?: number): void;
  /** Fill x's equate meter. */
  reward(amount: number): void;
  shake(a: number): void;
  flash(a: number): void;
  hitstop(t: number): void;
  hurtPlayer(fromX: number): void;
  nullifyPlayer(): void;
  onCrack(x: number, y: number): void;
  /** Leave a mote of light that heals x. */
  heal(x: number, y: number): void;
  onIntro(): void;
  onResolved(): void;
  /** Place π on the floor for x to take (Chapter II). */
  offerPi(x: number, y: number): void;
  readonly piOffered: boolean;
}

/** What the game needs from any boss. */
export interface Boss {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly vulnerable: boolean;
  update(dt: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
  lights(add: (x: number, y: number, r: number, a: number) => void): void;
  /**
   * A strike box with x = v. Returns undefined when nothing was touched,
   * null when it bit, or text to float when it was refused.
   */
  hit(box: Rect, v: Q): string | null | undefined;
  /** Equate pressed: true if this ends the fight. */
  tryResolve(): boolean;
  /** Would equating with x = v strike this boss? */
  matches(v: Q): boolean;
  /** Equate lands with x = v (the meter is already paid). */
  equate(v: Q): void;
  /** A shot x struck back; true if the boss caught it. */
  catchShot(x: number, y: number, r: number): boolean;
}

type State =
  | 'dormant'
  | 'intro'
  | 'hover'
  | 'wave'
  | 'shards'
  | 'slam'
  | 'inhale'
  | 'full'
  | 'cracked'
  | 'release'
  | 'finale'
  | 'await'
  | 'resolve'
  | 'gone';

interface GroundWave {
  x: number;
  dir: number;
}

const FILLS = [12, 24, 36];
const RX = 0.78;

/** Zero: the number that cannot be lessened. */
export class Zero implements Boss {
  x: number;
  y: number;
  r = 0;
  private state: State = 'dormant';
  private st = 0;
  cracks = 0;
  n = Q.ZERO;
  private attacks = 0;
  private nextAttack = 0;
  private targetX: number;
  private targetY = 170;
  private waves: GroundWave[] = [];
  private orbit: { a: number; fired: boolean }[] = [];
  private fireIdx = 0;
  private slamVy = 0;
  private landedAt = -1;
  private hurtT = 0;
  private pulseR = -1;
  private pulseHit = false;
  private t = 0;
  private crackLines: { a: number; len: number }[] = [];
  private beat = 0;
  private resolveK = 0;
  private fresh = true;

  constructor(
    private host: BossHost,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    this.targetX = x;
  }

  get active(): boolean {
    return this.state !== 'dormant' && this.state !== 'gone';
  }
  get fighting(): boolean {
    return this.active && this.state !== 'resolve';
  }
  get awaiting(): boolean {
    return this.state === 'await';
  }
  get vulnerable(): boolean {
    return this.state === 'full';
  }
  get finale(): boolean {
    return this.state === 'finale' || this.state === 'await' || this.state === 'resolve';
  }
  get resolveProgress(): number {
    return this.resolveK;
  }

  private go(s: State): void {
    this.state = s;
    this.st = 0;
    this.fresh = true;
  }

  private get speedUp(): number {
    return 1 + this.cracks * 0.22;
  }

  update(dt: number): void {
    const h = this.host;
    const p = h.player;
    this.t += dt;
    this.st += dt;
    const first = this.fresh;
    this.fresh = false;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const ry = this.r;
    const floorCy = h.floorY - ry - 2;
    const minX = this.r + 40;
    const maxX = h.arenaW - this.r - 40;

    const moveTo = (tx: number, ty: number, rate: number) => {
      this.x += (tx - this.x) * damp(rate, dt);
      this.y += (ty - this.y) * damp(rate, dt);
    };

    switch (this.state) {
      case 'dormant':
        if (p.cx > 230) {
          this.go('intro');
          h.onIntro();
        }
        return;
      case 'intro': {
        const k = clamp(this.st / 2.6, 0, 1);
        this.r = 56 * easeOut(k);
        if (this.st > 3.4) this.go('hover');
        return;
      }
      case 'hover': {
        if (first) {
          const options = [180, h.arenaW / 2, h.arenaW - 180].filter((x) => Math.abs(x - this.x) > 60);
          this.targetX = options[Math.floor(Math.random() * options.length)] ?? h.arenaW / 2;
          this.targetY = 150 + Math.random() * 40;
        }
        moveTo(this.targetX, this.targetY, 2.2);
        if (this.st > 1.1 / this.speedUp) {
          if (this.attacks >= 2) {
            this.attacks = 0;
            this.go('inhale');
            h.sfx.nullify();
          } else {
            const pick = (['wave', 'shards', 'slam'] as const).filter((_, i) => i !== this.nextAttack);
            const a = pick[Math.floor(Math.random() * pick.length)];
            this.nextAttack = ['wave', 'shards', 'slam'].indexOf(a);
            this.attacks++;
            this.go(a);
          }
        }
        break;
      }
      case 'wave': {
        if (this.st < 0.6) moveTo(clamp(p.cx, minX, maxX), floorCy, 6);
        else if (this.st - dt < 0.6) {
          this.y = floorCy;
          this.waves.push({ x: this.x, dir: -1 }, { x: this.x, dir: 1 });
          h.shake(7);
          h.sfx.wave();
          h.fx.burst(this.x, h.floorY, 14, { speed: 200, life: 0.6, line: true });
        }
        if (this.st > 1.8) moveTo(this.x, 160, 3);
        if (this.st > 2.5) this.go('hover');
        break;
      }
      case 'shards': {
        moveTo(this.x, 160, 3);
        if (first) {
          const count = 8 + this.cracks * 2;
          this.orbit = Array.from({ length: count }, (_, i) => ({ a: (i / count) * Math.PI * 2, fired: false }));
          this.fireIdx = 0;
        }
        const spin = this.t * 2.4;
        if (this.st > 0.9) {
          const interval = 0.14 / this.speedUp;
          const due = Math.floor((this.st - 0.9) / interval);
          while (this.fireIdx < this.orbit.length && this.fireIdx <= due) {
            const o = this.orbit[this.fireIdx];
            o.fired = true;
            const ox = this.x + Math.cos(o.a + spin) * (this.r + 22);
            const oy = this.y + Math.sin(o.a + spin) * (this.r + 22);
            const dx = p.cx - ox;
            const dy = p.cy - oy;
            const d = Math.hypot(dx, dy) || 1;
            h.shoot(ox, oy, (dx / d) * 340, (dy / d) * 340);
            h.sfx.fire();
            this.fireIdx++;
          }
        }
        if (this.fireIdx >= this.orbit.length && this.st > 1.2) {
          this.orbit = [];
          this.go('hover');
        }
        break;
      }
      case 'slam': {
        const track = 0.9 / this.speedUp;
        if (first) {
          this.slamVy = 0;
          this.landedAt = -1;
        }
        if (this.landedAt < 0) {
          if (this.st < track) moveTo(clamp(p.cx, minX, maxX), 130, 5);
          else if (this.st > track + 0.22) {
            this.slamVy += 3800 * dt;
            this.y = Math.min(floorCy, this.y + this.slamVy * dt);
            if (this.y >= floorCy) {
              this.landedAt = this.st;
              h.shake(10);
              h.sfx.slam();
              h.fx.burst(this.x - this.r * RX, h.floorY, 10, { speed: 220, life: 0.5, line: true });
              h.fx.burst(this.x + this.r * RX, h.floorY, 10, { speed: 220, life: 0.5, line: true });
            }
          }
        } else if (this.st > this.landedAt + 0.6) {
          moveTo(this.x, 160, 3);
          if (this.st > this.landedAt + 1.3) this.go('hover');
        }
        break;
      }
      case 'inhale': {
        moveTo(clamp(this.x, minX, maxX), floorCy - 6, 2.5);
        if (Math.random() < dt * 40) h.fx.converge(this.x, this.y, 2, 260, 0.8);
        if (this.st > 1.4) {
          this.n = Q.int(FILLS[this.cracks]);
          this.go('full');
          h.sfx.composed(FILLS[this.cracks]);
        }
        break;
      }
      case 'full': {
        const tx = clamp(p.cx, minX, maxX);
        this.x += clamp(tx - this.x, -28 * dt, 28 * dt);
        this.y += (floorCy - 6 - this.y) * damp(3, dt);
        if (this.st > 9) this.go('release');
        break;
      }
      case 'release': {
        const count = Math.min(20, Math.round(Math.abs(this.n.approx)));
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 - Math.PI / 2;
          h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * 250, Math.sin(a) * 250);
        }
        h.sfx.wave();
        h.shake(5);
        this.n = Q.ZERO;
        this.go('hover');
        break;
      }
      case 'cracked': {
        moveTo(this.x, 200, 1.5);
        if (this.st > 1.8) {
          if (this.cracks >= 3) {
            this.go('finale');
          } else this.go('hover');
        }
        break;
      }
      case 'finale': {
        moveTo(h.arenaW / 2, 210, 1.2);
        if (this.st > 2.2 && this.pulseR < 0) {
          this.pulseR = 0;
          this.pulseHit = false;
          h.sfx.nullify();
        }
        if (this.pulseR >= 0) {
          this.pulseR += 420 * dt;
          if (!this.pulseHit && Math.hypot(p.cx - this.x, p.cy - this.y) < this.pulseR) {
            this.pulseHit = true;
            h.nullifyPlayer();
          }
          if (this.pulseR > 1300) {
            this.pulseR = -1;
            this.go('await');
          }
        }
        break;
      }
      case 'await': {
        moveTo(h.arenaW / 2, 210 + Math.sin(this.t) * 6, 1.2);
        this.beat -= dt;
        if (this.beat <= 0) {
          h.sfx.heartbeat();
          this.beat = 1.6;
        }
        if (!p.value?.isZero && this.st > 3.5) this.go('finale');
        break;
      }
      case 'resolve': {
        this.resolveK = clamp(this.st / 4.5, 0, 1);
        this.r = 56 * (1 - easeInOut(clamp(this.st / 2.2, 0, 1)));
        moveTo(p.cx, p.cy - 30, 0.8);
        if (this.st > 4.5) {
          this.go('gone');
          h.onResolved();
        }
        break;
      }
      default:
        break;
    }

    // waves travel along the floor
    for (const w of this.waves) w.x += w.dir * 340 * this.speedUp * dt;
    this.waves = this.waves.filter((w) => w.x > -40 && w.x < h.arenaW + 40);

    // contact
    if (p.invuln <= 0 && !p.dashing) {
      const box: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
      const harmful = ['hover', 'wave', 'shards', 'slam', 'inhale', 'cracked'].includes(this.state);
      if (harmful && rectCircle(box, this.x, this.y, this.r * 0.84)) h.hurtPlayer(this.x);
      for (const w of this.waves) {
        if (box.x < w.x + 8 && box.x + box.w > w.x - 8 && box.y + box.h > h.floorY - 34) {
          h.hurtPlayer(w.x - w.dir * 10);
          h.nullifyPlayer();
          break;
        }
      }
    }
    if (this.state === 'full' && rectCircle({ x: p.x, y: p.y, w: p.w, h: p.h }, this.x, this.y, this.r * 0.8)) {
      p.vx = Math.sign(p.cx - this.x || 1) * 160;
    }
  }

  hit(box: Rect, v: Q): string | null | undefined {
    return this.touches(box) ? this.struck(v) : undefined;
  }

  equate(v: Q): void {
    this.struck(v);
  }

  catchShot(): boolean {
    return false;
  }

  /** Can a strike box touch the ring? */
  touches(box: Rect): boolean {
    return this.active && this.r > 10 && rectCircle(box, this.x, this.y, this.r);
  }

  /**
   * A strike lands. Returns the text to float, or null when it simply bites.
   * Zero can only be lessened while it holds something.
   */
  matches(v: Q): boolean {
    return this.state === 'full' && this.n.eq(v);
  }

  struck(v: Q): string | null {
    const h = this.host;
    if (this.state !== 'full') {
      h.sfx.blocked();
      return v.isZero ? '0 − 0' : `${v} > 0`;
    }
    if (v.isZero) {
      h.sfx.blocked();
      return '− 0';
    }
    const left = this.n.sub(v);
    if (v.gt(this.n) || !left) {
      h.sfx.blocked();
      return `${v} > ${this.n}`;
    }
    this.n = left;
    this.hurtT = 0.15;
    h.sfx.hit(Math.abs(v.approx));
    h.hitstop(0.06);
    h.shake(3);
    if (this.n.isZero) {
      this.cracks++;
      this.crackLines.push({ a: Math.random() * Math.PI * 2, len: 0.5 + Math.random() * 0.4 });
      this.crackLines.push({ a: Math.random() * Math.PI * 2, len: 0.3 + Math.random() * 0.3 });
      h.sfx.crack();
      h.hitstop(0.35);
      h.shake(14);
      h.flash(0.8);
      h.fx.burst(this.x, this.y, 40, { speed: 380, life: 1.1, line: true });
      h.onCrack(this.x, this.y);
      this.go('cracked');
    }
    return null;
  }

  tryResolve(): boolean {
    if (this.state !== 'await' || !this.host.player.value?.isZero) return false;
    this.go('resolve');
    this.host.sfx.resolve();
    this.host.flash(0.4);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.active) return;
    const h = this.host;
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;

    // telegraph for slam
    if (this.state === 'slam' && this.landedAt < 0) {
      ctx.globalAlpha = 0.12 + 0.1 * Math.sin(this.t * 30);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + this.r);
      ctx.lineTo(this.x, h.floorY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // the ring: an ellipse, like the numeral
    const r = this.r;
    if (r > 0.5) {
      const breathe = 1 + Math.sin(this.t * 1.7) * 0.015;
      ctx.globalAlpha = 1;
      ctx.lineWidth = this.hurtT > 0 ? 5 : 3;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, r * RX * breathe, r * breathe, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, r * RX * 1.22, r * 1.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, r * RX * 0.72, r * 0.74, 0, 0, Math.PI * 2);
      ctx.stroke();

      // cracks
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      for (const c of this.crackLines) {
        const sx = this.x + Math.cos(c.a) * r * RX;
        const sy = this.y + Math.sin(c.a) * r;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - Math.cos(c.a) * r * c.len * 0.5 + Math.sin(c.a) * 6, sy - Math.sin(c.a) * r * c.len * 0.5);
        ctx.lineTo(sx - Math.cos(c.a) * r * c.len, sy - Math.sin(c.a) * r * c.len + 4);
        ctx.stroke();
      }

      // what it holds
      if (this.state === 'full' || this.state === 'inhale') {
        const k = this.state === 'inhale' ? clamp(this.st / 1.4, 0, 1) : 1;
        ctx.globalAlpha = k;
        if (this.state === 'full') drawQ(ctx, this.n, this.x, this.y + 2, 34 + (this.hurtT > 0 ? 6 : 0), 600);
        if (this.state === 'full') {
          // remaining time, drawn as a closing arc
          const left = 1 - this.st / 9;
          ctx.globalAlpha = 0.35;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(this.x, this.y, r * RX * 1.35, r * 1.3, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
          ctx.stroke();
        }
      }
    }

    // orbiting shards
    const spin = this.t * 2.4;
    ctx.globalAlpha = 1;
    for (const o of this.orbit) {
      if (o.fired) continue;
      const k = clamp(this.st / 0.8, 0, 1);
      const ox = this.x + Math.cos(o.a + spin) * (r + 22) * k;
      const oy = this.y + Math.sin(o.a + spin) * (r + 22) * k;
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ground waves: thin rising arcs
    ctx.lineWidth = 2;
    for (const w of this.waves) {
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(w.x - 10 * w.dir, h.floorY);
      ctx.quadraticCurveTo(w.x + 2 * w.dir, h.floorY - 40, w.x + 8 * w.dir, h.floorY);
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(w.x - 28 * w.dir, h.floorY);
      ctx.quadraticCurveTo(w.x - 16 * w.dir, h.floorY - 22, w.x - 8 * w.dir, h.floorY);
      ctx.stroke();
    }

    // nullifying pulse
    if (this.pulseR >= 0) {
      ctx.globalAlpha = clamp(1 - this.pulseR / 1300, 0, 1) * 0.8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, this.pulseR * RX, this.pulseR, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // the waiting sign between them
    if (this.state === 'await' && h.player.value?.isZero) {
      const mx = (this.x + h.player.cx) / 2;
      const my = (this.y + h.player.cy) / 2 - 20;
      ctx.globalAlpha = clamp(this.st / 2, 0, 1) * (0.35 + 0.25 * Math.sin(this.t * 2));
      ctx.font = serif(46);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('=', mx, my);
    }
    ctx.globalAlpha = 1;
  }

  lights(add: (x: number, y: number, r: number, a: number) => void): void {
    if (!this.active) return;
    add(this.x, this.y, 150 + this.r, this.state === 'full' ? 0.9 : 0.6);
    for (const w of this.waves) add(w.x, this.host.floorY - 10, 90, 0.7);
  }
}
