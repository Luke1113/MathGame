import { pal, serif, TILE } from './constants';

/**
 * x's functions as shapes on the graph paper: the height (in tiles, up is
 * positive) a shot has risen after a run of u tiles from x's hand. The digit
 * held with F is a; holding S turns it negative.
 */
export const SHAPES: Record<string, (u: number, a: number) => number> = {
  ax: (u, a) => a * u,
  sin: (u, a) => a * Math.sin(u),
  'x²': (u, a) => (u * u) / a,
  ln: (u, a) => a * Math.log(u + 1),
};

/** The same shape in pixels: height above the start after a run of u px. */
export function shapePx(fn: string, a: number): (u: number) => number {
  const s = SHAPES[fn];
  return (u) => s(u / TILE, a) * TILE;
}

/** How a function is written with its a: y = 2x, y = −3 sin x, y = x²/3. */
export function fnLabel(fn: string, a: number): string {
  const s = a < 0 ? '−' : '';
  const m = Math.abs(a);
  const k = m === 1 ? '' : String(m);
  switch (fn) {
    case 'ax':
      return `y = ${s}${k}x`;
    case 'sin':
      return `y = ${s}${k ? k + ' ' : ''}sin x`;
    case 'x²':
      return `y = ${s}x²${k ? '/' + k : ''}`;
    case 'ln':
      return `y = ${s}${k ? k + ' ' : ''}ln(x + 1)`;
    case '⌊x⌋':
      return `y = ⌊x⌋,  x < ${m + 1}`;
    default:
      return fn;
  }
}

/**
 * Walk a path y0 − g(u) by arc length: the run u reached after travelling
 * `len` pixels along it from run `from`.
 */
export function runAfter(g: (u: number) => number, from: number, len: number): number {
  let u = from;
  let left = len;
  for (let i = 0; i < 600 && left > 0.01; i++) {
    const slope = g(u + 0.5) - g(u - 0.5);
    const k = Math.sqrt(1 + slope * slope);
    const du = Math.min(3, left / k);
    u += du;
    left -= du * k;
  }
  return u;
}

/** Stroke a path from run `from`, for `len` pixels of its length, stopping where `stop` says. */
export function strokePath(
  ctx: CanvasRenderingContext2D,
  g: (u: number) => number,
  x0: number,
  y0: number,
  dir: number,
  from: number,
  len: number,
  stop?: (x: number, y: number) => boolean,
): void {
  ctx.beginPath();
  let u = from;
  let gone = 0;
  ctx.moveTo(x0 + dir * u, y0 - g(u));
  for (let i = 0; i < 400 && gone < len; i++) {
    const nu = runAfter(g, u, 6);
    gone += 6;
    u = nu;
    const x = x0 + dir * u;
    const y = y0 - g(u);
    ctx.lineTo(x, y);
    if (stop?.(x, y)) break;
  }
  ctx.stroke();
}

/**
 * A shot that flies along a graph at a steady speed. x's are fired by
 * functions and change what they touch; plotters and the f(x) boss fire them
 * at x, after drawing the curve they will follow.
 */
export class CurveShot {
  /** Run along x so far (px). */
  u = 0;
  dead = false;
  /** Seconds the curve is shown before the shot sets out. */
  tele: number;
  life: number;
  /** Where it has been, for its trail. */
  private trail: { x: number; y: number }[] = [];
  /** A hole that has taken the shot in: it passes through rock until the hole ends. */
  hole: object | null = null;

  constructor(
    /** Height above the start (px) after a run of u px. */
    public g: (u: number) => number,
    public x0: number,
    public y0: number,
    /** ±1: which way along x. */
    readonly dir: number,
    readonly speed: number,
    readonly friendly: boolean,
    /** x's function that fired it, and its a; null for shots fired at x. */
    readonly fn: string | null,
    readonly a: number,
    tele = 0,
    life = 2,
  ) {
    this.tele = tele;
    this.life = life;
  }

  pos(u: number): { x: number; y: number } {
    return { x: this.x0 + this.dir * u, y: this.y0 - this.g(u) };
  }

  get head(): { x: number; y: number } {
    return this.pos(this.u);
  }

  /** Begin again from a new point, at the start of its own shape. */
  restartAt(x: number, y: number): void {
    this.x0 = x;
    this.y0 = y;
    this.u = 0;
  }

  update(dt: number): void {
    if (this.tele > 0) {
      this.tele -= dt;
      return;
    }
    this.u = runAfter(this.g, this.u, this.speed * dt);
    this.trail.push(this.head);
    if (this.trail.length > 22) this.trail.shift();
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    if (!this.friendly) {
      // the curve ahead, drawn before the shot follows it
      ctx.globalAlpha = this.tele > 0 ? 0.35 : 0.12;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      strokePath(ctx, this.g, this.x0, this.y0, this.dir, this.u, this.speed * (this.life + Math.max(0, this.tele)));
      ctx.setLineDash([]);
      if (this.tele > 0) {
        ctx.globalAlpha = 1;
        return;
      }
    }
    if (this.trail.length > 1) {
      ctx.lineWidth = this.friendly ? 2 : 1.5;
      for (let i = 1; i < this.trail.length; i++) {
        ctx.globalAlpha = (i / this.trail.length) * 0.6;
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
      }
    }
    const h = this.head;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(h.x, h.y, this.friendly ? 3.5 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (this.friendly && this.fn) {
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.6;
      ctx.font = serif(13);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.fn === 'ax' ? fnLabel('ax', this.a).slice(4) : this.fn, h.x, h.y - 16);
    }
    ctx.globalAlpha = 1;
  }
}
