import { pal, serif, TILE } from './constants';
import type { CurveSpec } from './rooms';

/**
 * A graph that can be stood on: y = f(x) over an interval, in pixels.
 * Some move (a sine whose phase turns), some are built and fade (⌊x⌋'s ledges),
 * and some are ground itself (a function floor: nothing passes beneath it).
 */
export class Curve {
  /** Seconds left before a built curve is gone (Infinity for the room's own). */
  life = Infinity;
  private born = 0;
  /** Everything beneath the graph is ground: x is never below it, and is carried as it moves. */
  solid = false;
  /** ⌊x⌋'s ledges: flat pieces, each a whole step above the last, with nothing between. */
  flat = false;
  /** The ledges, with a closed dot where each begins and an open one where it ends. */
  segs: { x0: number; x1: number; y: number; a: number; b: number }[] = [];

  private constructor(
    readonly x0: number,
    readonly x1: number,
    private readonly f: (x: number, t: number) => number | null,
    readonly label: string | null,
  ) {}

  static fromSpec(c: CurveSpec): Curve {
    const T = TILE;
    switch (c.k) {
      case 'line': {
        const slope = (c.y1 - c.y0) / (c.x1 - c.x0);
        return new Curve(c.x0 * T, c.x1 * T, (x) => (c.y0 + slope * (x / T - c.x0)) * T, c.label ?? null);
      }
      case 'sin':
        return new Curve(
          c.x0 * T,
          c.x1 * T,
          (x, t) => (c.y - c.amp * Math.sin(((x / T - c.x0) / c.period) * Math.PI * 2 + t * c.speed)) * T,
          c.label ?? null,
        );
      case 'para':
        return new Curve(c.x0 * T, c.x1 * T, (x) => (c.vy - c.a * (x / T - c.vx) ** 2) * T, c.label ?? null);
    }
  }

  /**
   * y = ⌊x⌋ drawn from x's feet: for each whole k from 1 to n, a flat ledge k
   * tiles up, from x = k to just short of x = k + 1. No risers: each step is jumped.
   */
  static ledges(feetX: number, feetY: number, dir: number, n: number, now: number): Curve {
    const T = TILE;
    const at = (u: number) => feetX + dir * u * T;
    const f = (x: number) => {
      const u = ((x - feetX) * dir) / T;
      if (u < 1 || u >= n + 1) return null;
      return feetY - Math.floor(u) * T;
    };
    const c = new Curve(Math.min(at(1), at(n + 1)), Math.max(at(1), at(n + 1)), f, null);
    c.flat = true;
    for (let k = 1; k <= n; k++) {
      const a = at(k);
      const b = at(k + 1);
      c.segs.push({ x0: Math.min(a, b), x1: Math.max(a, b), y: feetY - k * T, a, b });
    }
    c.life = 8;
    c.born = now;
    return c;
  }

  /** A graph that is rewritten as it is stood on. */
  static dynamic(x0: number, x1: number, f: (x: number) => number | null, solid: boolean): Curve {
    const c = new Curve(x0, x1, (x) => f(x), null);
    c.solid = solid;
    return c;
  }

  /** The surface height at x, or null where there is none. */
  yAt(x: number, t: number): number | null {
    if (x < this.x0 || x > this.x1) return null;
    return this.f(x, t);
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const fade = this.life === Infinity ? 1 : Math.min(1, this.life / 1.5, (t - this.born) * 4);
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    if (this.flat) {
      // ⌊x⌋: pieces of ground, a closed dot where each begins, an open one where it ends
      for (const s of this.segs) {
        ctx.globalAlpha = 0.85 * fade;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y);
        ctx.lineTo(s.x1, s.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s.a, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.air;
        ctx.beginPath();
        ctx.arc(s.b, s.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.ink;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }
    if (this.solid) {
      // ground: dark beneath the graph
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.void;
      ctx.beginPath();
      ctx.moveTo(this.x0, 4000);
      for (let x = this.x0; x <= this.x1 + 0.01; x += 4) ctx.lineTo(x, this.f(Math.min(x, this.x1), t) ?? 4000);
      ctx.lineTo(this.x1, 4000);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.ink;
    }
    ctx.globalAlpha = 0.85 * fade;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let pen = false;
    for (let x = this.x0; x <= this.x1 + 0.01; x += this.solid ? 4 : 6) {
      const y = this.f(Math.min(x, this.x1), t);
      if (y === null) {
        pen = false;
        continue;
      }
      if (!pen) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      pen = true;
    }
    ctx.stroke();
    if (this.label) {
      const mx = (this.x0 + this.x1) / 2;
      ctx.globalAlpha = 0.45 * fade;
      ctx.font = serif(15);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.label, mx, (this.f(mx, t) ?? 0) - 22);
    }
    ctx.globalAlpha = 1;
  }
}
