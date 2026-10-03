export const TILE = 32;
export const VIEW_W = 960;
export const VIEW_H = 540;

export const INK = '#ecebe6';
export const VOID = '#000000';
export const AIR = '#070707';

const SERIF = '"Cormorant Garamond", "EB Garamond", Georgia, "Times New Roman", serif';

export function serif(size: number, opts: { italic?: boolean; weight?: number } = {}): string {
  const italic = opts.italic ?? true;
  const weight = opts.weight ?? 500;
  return `${italic ? 'italic ' : ''}${weight} ${size}px ${SERIF}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Frame-rate independent smoothing factor. */
export function damp(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function digitsOf(v: number): number {
  return String(Math.abs(Math.trunc(v))).length;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectCircle(r: Rect, cx: number, cy: number, radius: number): boolean {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < radius * radius;
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
