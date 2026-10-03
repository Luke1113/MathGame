import { serif } from './constants';
import type { Q } from './num';

/** Width of a number as drawQ would draw it. */
export function qWidth(ctx: CanvasRenderingContext2D, q: Q, size: number, weight = 500): number {
  const { sign, num, den } = q.parts();
  ctx.font = serif(size, { weight });
  const signW = sign ? ctx.measureText('−').width + size * 0.06 : 0;
  if (!den) return signW + ctx.measureText(num).width;
  ctx.font = serif(size * 0.62, { weight });
  return signW + Math.max(ctx.measureText(num).width, ctx.measureText(den).width) + size * 0.16;
}

/**
 * Draw a number centred on (x, y): whole numbers inline, fractions stacked
 * over a bar, the way they are written by hand.
 */
export function drawQ(ctx: CanvasRenderingContext2D, q: Q, x: number, y: number, size: number, weight = 500): void {
  const { sign, num, den } = q.parts();
  const total = qWidth(ctx, q, size, weight);
  let left = x - total / 2;
  const align = ctx.textAlign;
  const base = ctx.textBaseline;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = serif(size, { weight });
  if (sign) {
    ctx.fillText('−', left, y);
    left += ctx.measureText('−').width + size * 0.06;
  }
  if (!den) {
    ctx.fillText(num, left, y);
  } else {
    const small = size * 0.62;
    ctx.font = serif(small, { weight });
    const nw = ctx.measureText(num).width;
    const dw = ctx.measureText(den).width;
    const fw = Math.max(nw, dw) + size * 0.16;
    ctx.fillText(num, left + (fw - nw) / 2 + size * 0.04, y - size * 0.33);
    ctx.fillText(den, left + (fw - dw) / 2 - size * 0.02, y + size * 0.36);
    const lw = Math.max(1, size * 0.045);
    ctx.fillRect(left, y - lw / 2, fw, lw);
  }
  ctx.textAlign = align;
  ctx.textBaseline = base;
}

/** Split "2^x = 64" into runs, where ^run (or ^{run}) marks a raised exponent. */
function runs(s: string): { t: string; sup: boolean }[] {
  const out: { t: string; sup: boolean }[] = [];
  const re = /\^\{([^}]*)\}|\^([0-9a-zπ−-]+)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), sup: false });
    out.push({ t: m[1] ?? m[2], sup: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), sup: false });
  return out;
}

/** Draw text centred on (x, y), raising anything written as ^n. */
export function drawRich(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, opts: { italic?: boolean; weight?: number } = {}): void {
  const parts = runs(s);
  const big = serif(size, opts);
  const small = serif(size * 0.58, opts);
  const widths = parts.map((p) => {
    ctx.font = p.sup ? small : big;
    return ctx.measureText(p.t).width + (p.sup ? size * 0.04 : 0);
  });
  let left = x - widths.reduce((a, b) => a + b, 0) / 2;
  const align = ctx.textAlign;
  const base = ctx.textBaseline;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  parts.forEach((p, i) => {
    ctx.font = p.sup ? small : big;
    ctx.fillText(p.t, left + (p.sup ? size * 0.04 : 0), p.sup ? y - size * 0.36 : y);
    left += widths[i];
  });
  ctx.textAlign = align;
  ctx.textBaseline = base;
}
