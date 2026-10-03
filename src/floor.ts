import { clamp, easeInOut, lerp, pal, serif, TILE } from './constants';
import { Curve } from './curves';
import { drawRich } from './draw';

/** One shape a function floor can take. x and f(x) are in tiles; t is time, for forms that move. */
export interface Form {
  /** The right-hand side as written, e.g. "x/2 − 2", "e^{x/3}". */
  label: string;
  f: (x: number, t: number) => number;
  /** Growth: what ln counts it back to (ln e^{x/3} = x/3). */
  ln?: Form;
}

const line = (label: string, m: number, b: number): Form => ({ label, f: (x) => m * x + b });

/** The shapes, family by family. Every root of the fixed forms is a whole number. */
export const FORMS: Record<'linear' | 'quadratic' | 'trig' | 'exp', Form[]> = {
  linear: [
    line('x/2 − 2', 1 / 2, -2),
    line('−x/3 + 1', -1 / 3, 1),
    line('2x + 6', 2, 6),
    line('−x − 4', -1, -4),
    line('x/4 + 2', 1 / 4, 2),
    line('−2x + 10', -2, 10),
  ],
  quadratic: [
    { label: '(x² − 16)/6', f: (x) => (x * x - 16) / 6 },
    { label: '(25 − x²)/8', f: (x) => (25 - x * x) / 8 },
    { label: '(x − 2)(x − 8)/6', f: (x) => ((x - 2) * (x - 8)) / 6 },
    { label: 'x²/10 + 1', f: (x) => (x * x) / 10 + 1 },
    { label: '−(x + 3)(x + 9)/5', f: (x) => (-(x + 3) * (x + 9)) / 5 },
    { label: '(x + 1)(x − 5)/4', f: (x) => ((x + 1) * (x - 5)) / 4 },
  ],
  trig: [
    { label: '2 sin(x/2 + t/2)', f: (x, t) => 2 * Math.sin(x / 2 + t / 2) },
    { label: '3 sin(x/3 − t/3)', f: (x, t) => 3 * Math.sin(x / 3 - t / 3) },
    { label: '4 sin(x/4) cos(t/2)', f: (x, t) => 4 * Math.sin(x / 4) * Math.cos(t / 2) },
    { label: '2 sin(x − t/2)', f: (x, t) => 2 * Math.sin(x - t / 2) },
  ],
  exp: [
    { label: 'e^{x/3}', f: (x) => Math.exp(x / 3), ln: line('x/3', 1 / 3, 0) },
    { label: 'e^{−x/3}', f: (x) => Math.exp(-x / 3), ln: line('−x/3', -1 / 3, 0) },
    { label: 'e^{x/2}', f: (x) => Math.exp(x / 2), ln: line('x/2', 1 / 2, 0) },
    { label: 'e^{−x/4}', f: (x) => Math.exp(-x / 4), ln: line('−x/4', -1 / 4, 0) },
  ],
};

export const ZERO_FORM: Form = { label: '0', f: () => 0 };

/** Seconds a still graph takes to show its roots. */
const ROOT_FORMS = 0.45;

/** a times a form: a·f(x). */
export function scaled(form: Form, a: number): Form {
  const k = a === -1 ? '−' : String(a).replace('-', '−');
  return {
    label: `${k}(${form.label})`,
    f: (x, t) => a * form.f(x, t),
  };
}

/** a sin of a form: a·sin(f(x)). */
export function sined(form: Form, a: number): Form {
  const k = a === 1 ? '' : a === -1 ? '−' : String(a).replace('-', '−') + ' ';
  return { label: `${k}sin(${form.label})`, f: (x, t) => a * Math.sin(form.f(x, t)) };
}

/** A number as a root is written: whole when it is whole. */
export function rootText(x: number): string {
  const r = Math.round(x);
  const s = Math.abs(x - r) < 0.03 ? String(Math.abs(r)) : Math.abs(x).toFixed(1);
  return (x < -0.015 ? '−' : '') + s;
}

/**
 * Ground that is a graph: y = f(x) over the room's axes, with everything
 * beneath it solid. It can be told to become another form: the new graph is
 * shown first, then the ground moves to it, carrying x with it.
 */
export class FunctionFloor {
  form: Form;
  private from: Form | null = null;
  /** The form it will become, shown before the ground moves. */
  next: Form | null = null;
  private teleT = 0;
  private nextDur = 1;
  private blend = 1;
  private rate = 1;
  /** How long the ground has been still: its roots take a moment to form. */
  private stillT = 1;
  t = 0;
  readonly curve: Curve;

  constructor(
    /** Where the axes cross, in pixels. */
    readonly ox: number,
    readonly oy: number,
    readonly x0: number,
    readonly x1: number,
    form: Form,
    /** How far the ground may rise and sink (tiles), and how far from each end it is pinned to the axis. */
    readonly lo: number,
    readonly hi: number,
    readonly pin = 0,
  ) {
    this.form = form;
    this.curve = Curve.dynamic(x0, x1, (x) => this.yAt(x), true);
  }

  /** Still: neither changing nor about to. */
  get settled(): boolean {
    return this.blend >= 1 && !this.next;
  }

  value(x: number): number {
    const v = this.form.f(x, this.t);
    if (this.from && this.blend < 1) return lerp(this.from.f(x, this.t), v, easeInOut(this.blend));
    return v;
  }

  yAt(px: number): number | null {
    if (px < this.x0 || px > this.x1) return null;
    let v = clamp(this.value((px - this.ox) / TILE), this.lo, this.hi);
    if (this.pin > 0) {
      const d = Math.min(px - this.x0, this.x1 - px) / TILE / this.pin;
      if (d < 1) v *= d * d * (3 - 2 * d);
    }
    return this.oy - v * TILE;
  }

  /** Show the next form, then move to it. */
  morph(to: Form, tele = 1.3, dur = 1): void {
    this.next = to;
    this.teleT = tele;
    this.nextDur = dur;
  }

  /** Become another form now, moving to it over dur seconds. */
  become(to: Form, dur = 0.5): void {
    if (this.from && this.blend < 1) {
      // caught mid-change: begin from wherever the ground is
      const a = this.from;
      const b = this.form;
      const k = easeInOut(this.blend);
      this.from = { label: b.label, f: (x, t) => lerp(a.f(x, t), b.f(x, t), k) };
    } else this.from = this.form;
    this.form = to;
    this.next = null;
    this.blend = 0;
    this.rate = 1 / dur;
  }

  update(dt: number): void {
    this.t += dt;
    this.stillT = this.settled ? this.stillT + dt : 0;
    if (this.next) {
      this.teleT -= dt;
      if (this.teleT <= 0) this.become(this.next, this.nextDur);
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt * this.rate);
      if (this.blend >= 1) this.from = null;
    }
  }

  /** Where the graph crosses the axis, in pixels: its roots. None while the ground is changing, or about to. */
  roots(): number[] {
    if (!this.settled || this.stillT < ROOT_FORMS) return [];
    const out: number[] = [];
    const a = (this.x0 - this.ox) / TILE + this.pin + 0.4;
    const b = (this.x1 - this.ox) / TILE - this.pin - 0.4;
    let px = a;
    let pv = this.value(a);
    for (let x = a + 0.05; x <= b; x += 0.05) {
      const v = this.value(x);
      if (pv === 0 || (v !== 0 && Math.sign(v) !== Math.sign(pv))) {
        const r = pv === 0 ? px : px + ((x - px) * pv) / (pv - v);
        out.push(this.ox + r * TILE);
      }
      px = x;
      pv = v;
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, time: number, showRoots: boolean): void {
    // the form to come, shown before the ground moves to it
    if (this.next) {
      const n = this.next;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time * 14);
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      for (let x = this.x0; x <= this.x1; x += 6) {
        let v = clamp(n.f((x - this.ox) / TILE, this.t), this.lo, this.hi);
        if (this.pin > 0) {
          const d = Math.min(x - this.x0, this.x1 - x) / TILE / this.pin;
          if (d < 1) v *= d * d * (3 - 2 * d);
        }
        const y = this.oy - v * TILE;
        if (x === this.x0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    this.curve.draw(ctx, time);
    if (!showRoots) {
      ctx.globalAlpha = 1;
      return;
    }
    // its roots: where it meets nothing
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    for (const rx of this.roots()) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 5 + rx);
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(rx, this.oy, 6 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.2 * pulse;
      ctx.beginPath();
      ctx.arc(rx, this.oy, 13 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(rx, this.oy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** "f(x) = …", written where it can be read. */
  drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number): void {
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = alpha;
    drawRich(ctx, `f(x) = ${this.form.label}`, x, y, size);
    if (this.next) {
      ctx.globalAlpha = alpha * 0.55;
      ctx.font = serif(size * 0.8);
      drawRich(ctx, `→  ${this.next.label}`, x, y + size * 1.2, size * 0.8);
    }
    ctx.globalAlpha = 1;
  }
}
