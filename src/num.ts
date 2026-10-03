function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

/**
 * An exact number: (n / d) · π^p, with n/d in lowest terms and d > 0.
 * Rationals cover every number x can hold; the power of π exists so that
 * x can, for one moment, hold π itself.
 */
export class Q {
  private constructor(
    readonly n: number,
    readonly d: number,
    readonly p: number,
  ) {}

  static of(n: number, d = 1, p = 0): Q {
    if (d === 0) throw new Error('zero denominator');
    if (d < 0) {
      n = -n;
      d = -d;
    }
    if (n === 0) return new Q(0, 1, 0);
    const g = gcd(n, d);
    return new Q(n / g, d / g, p);
  }

  static int(n: number): Q {
    return Q.of(n, 1, 0);
  }

  static from(v: number | [number, number]): Q {
    return typeof v === 'number' ? Q.int(v) : Q.of(v[0], v[1]);
  }

  static readonly ZERO = new Q(0, 1, 0);
  static readonly ONE = new Q(1, 1, 0);
  static readonly PI = new Q(1, 1, 1);

  get isZero(): boolean {
    return this.n === 0;
  }
  get sign(): number {
    return Math.sign(this.n);
  }
  get isInt(): boolean {
    return this.d === 1 && this.p === 0;
  }
  get approx(): number {
    return (this.n / this.d) * Math.pow(Math.PI, this.p);
  }
  /** Too large (or too finely divided) to be held. */
  get unwieldy(): boolean {
    return Math.abs(this.approx) > 9999 || this.d > 9999 || Math.abs(this.n) > 99999;
  }

  eq(b: Q): boolean {
    return this.n === b.n && this.d === b.d && this.p === b.p;
  }
  gt(b: Q): boolean {
    return this.approx > b.approx + 1e-12;
  }

  /** π and plain numbers do not mix under + and −. */
  add(b: Q): Q | null {
    if (this.isZero) return b;
    if (b.isZero) return this;
    if (this.p !== b.p) return null;
    return Q.of(this.n * b.d + b.n * this.d, this.d * b.d, this.p);
  }
  sub(b: Q): Q | null {
    return this.add(b.neg());
  }
  neg(): Q {
    return Q.of(-this.n, this.d, this.p);
  }
  mul(b: Q): Q {
    return Q.of(this.n * b.n, this.d * b.d, this.p + b.p);
  }
  div(b: Q): Q | null {
    if (b.isZero) return null;
    return Q.of(this.n * b.d, this.d * b.n, this.p - b.p);
  }
  pow(k: number): Q {
    let r = Q.ONE;
    for (let i = 0; i < k; i++) r = r.mul(this);
    return r;
  }
  /** The k-th root, when it is exact; null when it would never end (or is not real). */
  root(k: number): Q | null {
    if (k < 1 || this.p !== 0) return null;
    if (k === 1) return this;
    if (this.n < 0 && k % 2 === 0) return null;
    const exact = (x: number): number | null => {
      const g = Math.round(Math.pow(x, 1 / k));
      for (const c of [g - 1, g, g + 1]) if (c >= 0 && Math.pow(c, k) === x) return c;
      return null;
    };
    const a = exact(Math.abs(this.n));
    const b = exact(this.d);
    if (a === null || b === null) return null;
    return Q.of(Math.sign(this.n) * a, b);
  }

  /** Does an integer > 1 divide this whole number evenly? */
  divisibleBy(k: number): boolean {
    return this.isInt && k > 1 && this.n > 0 && this.n % k === 0;
  }

  /** Sign, numerator and denominator as strings, for stacked drawing. */
  parts(): { sign: string; num: string; den: string | null } {
    const sign = this.n < 0 ? '−' : '';
    const a = Math.abs(this.n);
    let num = String(a);
    let den: string | null = this.d === 1 ? null : String(this.d);
    if (this.p > 0) num = (a === 1 ? '' : num) + 'π'.repeat(this.p);
    if (this.p < 0) den = (this.d === 1 ? '' : String(this.d)) + 'π'.repeat(-this.p);
    return { sign, num, den };
  }

  toString(): string {
    const { sign, num, den } = this.parts();
    return den ? `${sign}${num}/${den}` : `${sign}${num}`;
  }
}
