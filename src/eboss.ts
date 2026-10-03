import type { Boss, BossHost } from './boss';
import { clamp, damp, pal, Rect, rectCircle, serif } from './constants';
import { drawQ, drawRich } from './draw';
import { Q } from './num';

/** Superscript digits, for text that floats: e³. */
export function sup(n: number): string {
  const map: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  return [...String(n)].map((c) => map[c] ?? c).join('');
}

type State = 'dormant' | 'intro' | 'grow' | 'counted' | 'cracked' | 'finale' | 'await' | 'resolve' | 'gone';

const MAX_POW = 7;

/** e: the number that grows by exactly as much as it is. */
export class EBoss implements Boss {
  x: number;
  y: number;
  r = 0;
  private state: State = 'dormant';
  private st = 0;
  private fresh = true;
  private t = 0;
  /** e^k: how far it has grown. */
  private k = 1;
  cracks = 0;
  /** Once ln has counted it back: the plain number it has become. */
  n = Q.ZERO;
  private growT = 0;
  private fireT = 2;
  private lobT = 4;
  private hurtT = 0;
  private popT = 0;
  private crackLines: { a: number; len: number }[] = [];
  private beat = 0;

  constructor(
    private host: BossHost,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
  }

  get vulnerable(): boolean {
    return this.state === 'counted';
  }
  private get alive(): boolean {
    return this.state !== 'dormant' && this.state !== 'gone';
  }
  private get holdsOne(): boolean {
    return !!this.host.player.value?.eq(Q.ONE);
  }
  private get growEvery(): number {
    return [2.8, 2.3, 1.9][Math.min(this.cracks, 2)];
  }

  private go(s: State): void {
    this.state = s;
    this.st = 0;
    this.fresh = true;
  }

  update(dt: number): void {
    const h = this.host;
    const p = h.player;
    this.t += dt;
    this.st += dt;
    const first = this.fresh;
    this.fresh = false;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.popT = Math.max(0, this.popT - dt * 2);
    const W = h.arenaW;
    const moveTo = (tx: number, ty: number, rate: number) => {
      this.x += (tx - this.x) * damp(rate, dt);
      this.y += (ty - this.y) * damp(rate, dt);
    };
    const growR = 24 + 9 * this.k;

    switch (this.state) {
      case 'dormant':
        if (p.cx > 230) {
          this.go('intro');
          h.onIntro();
        }
        return;
      case 'intro':
        // it begins as almost nothing: e⁰ = 1, then grows
        this.r = 30 * clamp(this.st / 2, 0, 1);
        if (this.st > 3.4) {
          this.k = 1;
          this.growT = this.growEvery;
          this.go('grow');
        }
        return;
      case 'grow': {
        if (first) {
          this.fireT = 2;
          this.lobT = 3.5;
        }
        this.r += (growR - this.r) * damp(5, dt);
        // small, it darts and is hard to catch; grown, it is slow, and a danger
        const wander = (7 - this.k) * 26;
        const tx = clamp(p.cx + Math.sin(this.t * 1.7) * wander, this.r + 40, W - this.r - 40);
        const speed = 190 - 22 * this.k;
        this.x += clamp(tx - this.x, -speed * dt, speed * dt);
        this.y += (185 + Math.sin(this.t * (2.6 - this.k * 0.25)) * (20 + wander * 0.4) - this.y) * damp(3, dt);

        this.growT -= dt;
        if (this.growT <= 0) {
          this.growT = this.growEvery;
          this.k++;
          this.popT = 1;
          h.sfx.tone(110 * Math.pow(1.19, this.k), 0.8, { vol: 0.12, type: 'triangle', wet: 0.5 });
          if (this.k > MAX_POW) {
            // too great to hold itself: it bursts, and begins again smaller
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * Math.PI * 2;
              h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * 150, Math.sin(a) * 150);
            }
            h.sfx.wave();
            h.shake(8);
            this.k = 3;
          }
        }

        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = Math.max(1.1, 2.4 - 0.18 * this.k);
          const n = Math.min(this.k, 5);
          const base = Math.atan2(p.cy - this.y, p.cx - this.x);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.24;
            h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * 180, Math.sin(a) * 180);
          }
          h.sfx.fire();
        }
        if (this.cracks >= 1) {
          this.lobT -= dt;
          if (this.lobT <= 0) {
            this.lobT = 4.2;
            h.plot(this.x, this.y, 'para', p.cx, p.cy);
          }
        }
        break;
      }
      case 'counted': {
        // counted back to a plain number, it sinks and waits to be undone
        this.r += (36 - this.r) * damp(6, dt);
        const tx = clamp(p.cx, 80, W - 80);
        this.x += clamp(tx - this.x, -25 * dt, 25 * dt);
        this.y += (h.floorY - 36 - 34 - this.y) * damp(3, dt);
        if (this.st > 7) {
          // time enough, and it grows again from what it is
          this.k = this.n.isInt && this.n.n > 0 ? Math.min(this.n.n, MAX_POW) : 1;
          this.growT = this.growEvery;
          this.go('grow');
        }
        break;
      }
      case 'cracked':
        moveTo(W / 2, 200, 1.5);
        this.r += (30 - this.r) * damp(3, dt);
        if (this.st > 2) {
          if (this.cracks >= 3) this.go('finale');
          else {
            // each time, it begins from a greater power
            this.k = this.cracks + 1;
            this.growT = this.growEvery;
            this.go('grow');
          }
        }
        break;
      case 'finale':
        // e³, e², e¹, e⁰: it counts itself down to where all growth begins
        if (first) this.k = 3;
        moveTo(W / 2, 200, 1.2);
        this.r += (24 + 9 * Math.max(this.k, 0) - this.r) * damp(4, dt);
        if (this.st > 0.9) {
          this.st = 0;
          this.k--;
          this.popT = 1;
          h.sfx.tone(110 * Math.pow(1.19, this.k + 2), 0.9, { vol: 0.12, type: 'triangle', wet: 0.6 });
          if (this.k === 0) {
            h.fx.text(this.x, this.y - 70, 'e⁰ = 1', { size: 30, life: 3, alpha: 0.9 });
            this.go('await');
          }
        }
        break;
      case 'await':
        moveTo(W / 2, 210 + Math.sin(this.t) * 6, 1.2);
        this.r += (30 - this.r) * damp(3, dt);
        this.beat -= dt;
        if (this.beat <= 0) {
          h.sfx.heartbeat();
          this.beat = 1.6;
        }
        break;
      case 'resolve':
        moveTo(p.cx, p.cy - 30, 0.8);
        this.r = 30 * (1 - clamp(this.st / 2.5, 0, 1));
        if (this.st > 4.5) {
          this.go('gone');
          h.onResolved();
        }
        break;
      default:
        break;
    }

    // contact
    if (p.invuln <= 0 && !p.dashing) {
      const box: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
      if ((this.state === 'grow' || this.state === 'cracked') && rectCircle(box, this.x, this.y, this.r * 0.85)) h.hurtPlayer(this.x);
    }
    if (this.state === 'counted' && rectCircle({ x: p.x, y: p.y, w: p.w, h: p.h }, this.x, this.y, this.r * 0.8)) {
      p.vx = Math.sign(p.cx - this.x || 1) * 160;
    }
  }

  private crack(): void {
    const h = this.host;
    this.cracks++;
    this.crackLines.push({ a: Math.random() * Math.PI * 2, len: 0.5 + Math.random() * 0.4 });
    this.crackLines.push({ a: Math.random() * Math.PI * 2, len: 0.3 + Math.random() * 0.3 });
    h.sfx.crack();
    h.hitstop(0.35);
    h.shake(14);
    h.flash(0.7);
    h.fx.burst(this.x, this.y, 40, { speed: 380, life: 1.1, line: true });
    h.onCrack(this.x, this.y);
    this.go('cracked');
  }

  hit(box: Rect, v: Q): string | null | undefined {
    const h = this.host;
    if (!this.alive || this.r < 6 || !rectCircle(box, this.x, this.y, this.r)) return undefined;
    if (this.state === 'counted') {
      const left = this.n.sub(v);
      if (!left) {
        h.sfx.blocked();
        return 'π will not mix';
      }
      this.n = left;
      this.hurtT = 0.15;
      if (this.n.isZero) this.crack();
      else {
        h.sfx.hit(Math.abs(v.approx));
        h.hitstop(0.05);
      }
      return null;
    }
    if (this.state === 'await' && v.eq(Q.ONE)) {
      this.tryResolve();
      return '1 − 1 = 0';
    }
    h.sfx.blocked();
    if (this.state === 'grow') return `e${sup(this.k)} − ${v} never ends`;
    return null;
  }

  ln(x: number, y: number, r: number): string | null | undefined {
    if (!this.alive || Math.hypot(x - this.x, y - this.y) > this.r + r) return undefined;
    const h = this.host;
    if (this.state === 'grow') {
      // counted back: ln eᵏ = k, a number x can hold
      this.n = Q.int(this.k);
      h.sfx.nullify();
      h.flash(0.25);
      h.shake(6);
      const said = `ln e${sup(this.k)} = ${this.k}`;
      this.go('counted');
      return said;
    }
    if (this.state === 'counted') {
      if (this.n.eq(Q.ONE)) {
        this.crack();
        return 'ln 1 = 0';
      }
      return `ln ${this.n} never ends`;
    }
    return null;
  }

  matches(v: Q): boolean {
    return this.state === 'counted' && this.n.eq(v);
  }

  equate(v: Q): void {
    if (this.matches(v)) this.crack();
  }

  catchShot(): boolean {
    return false;
  }

  tryResolve(): boolean {
    if (this.state !== 'await' || !this.holdsOne) return false;
    this.go('resolve');
    this.host.sfx.resolve();
    this.host.flash(0.5);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;
    const h = this.host;
    const r = this.r * (1 + this.popT * 0.08);
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // the body: a circle that keeps growing
    ctx.globalAlpha = 1;
    ctx.lineWidth = this.hurtT > 0 ? 4.5 : 2.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // its growth, as rings of what it was
    ctx.lineWidth = 1;
    if (this.state === 'grow' || this.state === 'finale') {
      for (let i = 1; i < this.k; i++) {
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 24 + 9 * i, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (this.state === 'grow') {
      // time until it grows again
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.growT / this.growEvery));
      ctx.stroke();
    }

    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    for (const c of this.crackLines) {
      if (this.state === 'resolve') break;
      const sx = this.x + Math.cos(c.a) * r;
      const sy = this.y + Math.sin(c.a) * r;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.cos(c.a) * r * c.len * 0.5 + Math.sin(c.a) * 6, sy - Math.sin(c.a) * r * c.len * 0.5);
      ctx.lineTo(sx - Math.cos(c.a) * r * c.len, sy - Math.sin(c.a) * r * c.len + 4);
      ctx.stroke();
    }

    // what it is
    ctx.globalAlpha = this.state === 'intro' ? clamp((this.st - 1) / 1.5, 0, 1) : 1;
    const size = clamp(r * 0.9, 26, 64);
    if (this.state === 'counted') drawQ(ctx, this.n, this.x, this.y, 34 + (this.hurtT > 0 ? 6 : 0), 600);
    else if (this.state === 'await' || this.state === 'resolve') {
      ctx.font = serif(40, { weight: 500 });
      ctx.fillText('1', this.x, this.y + 2);
    } else if (this.state === 'intro') drawRich(ctx, 'e^0', this.x, this.y + 4, 30, { weight: 500 });
    else drawRich(ctx, `e^${this.k}`, this.x - size * 0.08, this.y + 4, size, { weight: 500 });

    // the waiting sign between them
    if (this.state === 'await' && this.holdsOne) {
      const mx = (this.x + h.player.cx) / 2;
      const my = (this.y + h.player.cy) / 2 - 20;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t * 2);
      ctx.font = serif(46);
      ctx.fillText('=', mx, my);
    }
    ctx.globalAlpha = 1;
  }

  lights(add: (x: number, y: number, r: number, a: number) => void): void {
    if (!this.alive) return;
    add(this.x, this.y, 170 + this.r * 1.5, 0.8);
  }
}
