import { pal, serif, TILE } from './constants';
import type { CurveSpec } from './rooms';

/**
 * A graph that can be stood on: y = f(x) over an interval, in pixels.
 * Some move (a sine whose phase turns), some are built and fade (⌊x⌋'s stairs).
 */
export class Curve {
  /** Seconds left before a built curve is gone (Infinity for the room's own). */
  life = Infinity;
  private born = 0;

  private constructor(
    readonly x0: number,
    readonly x1: number,
    private readonly f: (x: number, t: number) => number,
    readonly label: string | null,
    readonly steps: boolean,
  ) {}

  static fromSpec(c: CurveSpec): Curve {
    const T = TILE;
    switch (c.k) {
      case 'line': {
        const slope = (c.y1 - c.y0) / (c.x1 - c.x0);
        return new Curve(c.x0 * T, c.x1 * T, (x) => (c.y0 + slope * (x / T - c.x0)) * T, c.label ?? null, false);
      }
      case 'sin':
        return new Curve(
          c.x0 * T,
          c.x1 * T,
          (x, t) => (c.y - c.amp * Math.sin(((x / T - c.x0) / c.period) * Math.PI * 2 + t * c.speed)) * T,
          c.label ?? null,
          false,
        );
      case 'para':
        return new Curve(c.x0 * T, c.x1 * T, (x) => (c.vy - c.a * (x / T - c.vx) ** 2) * T, c.label ?? null, false);
    }
  }

  /** ⌊x⌋'s stairs: n steps of one tile, rising from the feet in the direction faced. */
  static stairs(feetX: number, feetY: number, dir: number, n: number, now: number): Curve {
    const w = TILE;
    const start = feetX + dir * 6;
    const end = start + dir * w * (n + 1);
    const f = (x: number) => {
      const u = (x - start) * dir;
      return feetY - Math.min(n, Math.floor(u / w) + 1) * w;
    };
    const c = new Curve(Math.min(start, end), Math.max(start, end), f, null, true);
    c.life = 9;
    c.born = now;
    return c;
  }

  /** The surface height at x, or null outside the interval. */
  yAt(x: number, t: number): number | null {
    if (x < this.x0 || x > this.x1) return null;
    return this.f(x, t);
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    const fade = this.life === Infinity ? 1 : Math.min(1, this.life / 1.5, (t - this.born) * 4);
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.85 * fade;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const step = this.steps ? 1 : 6;
    for (let x = this.x0; x <= this.x1 + 0.01; x += step) {
      const y = this.f(Math.min(x, this.x1), t);
      if (x === this.x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (this.steps) {
      // the floor's risers, faint
      ctx.globalAlpha = 0.25 * fade;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (this.label) {
      const mx = (this.x0 + this.x1) / 2;
      ctx.globalAlpha = 0.45 * fade;
      ctx.font = serif(15);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.label, mx, this.f(mx, t) - 22);
    }
    ctx.globalAlpha = 1;
  }
}
