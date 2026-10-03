import type { Boss, BossHost } from './boss';
import { clamp, damp, pal, Rect, rectCircle, serif } from './constants';
import { drawQ } from './draw';
import { Q } from './num';

const DIGITS = '3141592653589793238462643383279502884197169399375105820974944';
const SHOWN = '3.' + DIGITS.slice(1);

/** π's weak moments: the old measurements of the circle, each a little wrong. */
const APPROX: { q: Q; who: string }[] = [
  { q: Q.of(25, 8), who: 'as Babylon measured it' },
  { q: Q.of(256, 81), who: 'as Egypt measured it' },
  { q: Q.of(22, 7), who: 'as Archimedes measured it' },
];

const R = 70;
const ROLL_R = 42;

type State =
  | 'dormant'
  | 'intro'
  | 'hover'
  | 'recite'
  | 'roll'
  | 'spokes'
  | 'measure'
  | 'cracked'
  | 'release'
  | 'finale'
  | 'await'
  | 'resolve'
  | 'gone';

/** π: the number that never ends. */
export class Pi implements Boss {
  x: number;
  y: number;
  r = 0;
  private state: State = 'dormant';
  private st = 0;
  private fresh = true;
  private t = 0;
  cracks = 0;
  n = Q.ZERO;
  private digit = 0;
  private attacks = 0;
  private last = '';
  private targetX: number;
  private targetY = 170;
  private volleys = 0;
  private preview = -1;
  private rollDir = 1;
  private rollAngle = 0;
  private rollFrom = 0;
  private spokeA = 0;
  private spokeSpin = 1;
  private hurtT = 0;
  private crackLines: { a: number; len: number }[] = [];
  private unroll = 0;
  private beat = 0;
  private offerT = 0;

  constructor(
    private host: BossHost,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
    this.targetX = x;
  }

  get vulnerable(): boolean {
    return this.state === 'measure';
  }
  private get alive(): boolean {
    return this.state !== 'dormant' && this.state !== 'gone';
  }
  private get speedUp(): number {
    return 1 + this.cracks * 0.2;
  }
  private get spokeCount(): number {
    return this.cracks >= 2 ? 3 : 2;
  }
  private get holdsPi(): boolean {
    return !!this.host.player.value?.eq(Q.PI);
  }

  private go(s: State): void {
    this.state = s;
    this.st = 0;
    this.fresh = true;
  }

  private nextDigit(): number {
    const d = Number(DIGITS[this.digit % DIGITS.length]);
    this.digit++;
    return d;
  }

  update(dt: number): void {
    const h = this.host;
    const p = h.player;
    this.t += dt;
    this.st += dt;
    const first = this.fresh;
    this.fresh = false;
    this.hurtT = Math.max(0, this.hurtT - dt);
    const W = h.arenaW;
    const moveTo = (tx: number, ty: number, rate: number) => {
      this.x += (tx - this.x) * damp(rate, dt);
      this.y += (ty - this.y) * damp(rate, dt);
    };
    const growTo = (r: number, rate = 4) => {
      this.r += (r - this.r) * damp(rate, dt);
    };

    switch (this.state) {
      case 'dormant':
        if (p.cx > 230) {
          this.go('intro');
          h.onIntro();
        }
        return;
      case 'intro':
        this.r = R;
        if (this.st > 3.8) this.go('hover');
        return;
      case 'hover': {
        if (first) {
          const options = [190, W / 2, W - 190].filter((x) => Math.abs(x - this.x) > 60);
          this.targetX = options[Math.floor(Math.random() * options.length)] ?? W / 2;
          this.targetY = 150 + Math.random() * 40;
        }
        moveTo(this.targetX, this.targetY, 2);
        growTo(R);
        if (this.st > 1.1 / this.speedUp) {
          if (this.attacks >= 2) {
            this.attacks = 0;
            this.go('measure');
            h.sfx.nullify();
          } else {
            const pick = ['recite', 'roll', 'spokes'].filter((a) => a !== this.last);
            const a = pick[Math.floor(Math.random() * pick.length)] as State;
            this.last = a;
            this.attacks++;
            this.go(a);
          }
        }
        break;
      }
      case 'recite': {
        // it speaks its digits, and each digit is a volley of that many
        if (first) {
          this.volleys = 0;
          this.preview = Number(DIGITS[this.digit % DIGITS.length]);
        }
        moveTo(this.x, 160, 2);
        const at = 0.8 + this.volleys * 1.15;
        if (this.volleys < 2 && this.st > at) {
          const k = this.nextDigit();
          const speed = 270 + this.cracks * 30;
          const base = Math.atan2(p.cy - this.y, p.cx - this.x);
          for (let i = 0; i < k; i++) {
            const a = base + (i - (k - 1) / 2) * 0.17;
            h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * speed, Math.sin(a) * speed);
          }
          if (k > 0) h.sfx.fire();
          h.fx.text(this.x, this.y - this.r - 30, String(k), { size: 34, life: 0.9, alpha: 0.6 });
          this.volleys++;
          this.preview = this.volleys < 2 ? Number(DIGITS[this.digit % DIGITS.length]) : -1;
        }
        if (this.volleys >= 2 && this.st > at + 0.4) {
          this.preview = -1;
          this.go('hover');
        }
        break;
      }
      case 'roll': {
        // it becomes a wheel; one turn covers π diameters of floor
        const floorCy = h.floorY - ROLL_R;
        if (first) {
          this.rollDir = p.cx < W / 2 ? -1 : 1;
          this.rollFrom = this.rollDir > 0 ? 100 : W - 100;
        }
        if (this.st < 0.9) {
          moveTo(this.rollFrom, floorCy, 6);
          growTo(ROLL_R, 6);
        } else if (this.st < 0.9 + 0.01 || (this.rollDir > 0 ? this.x < W - 100 : this.x > 100)) {
          if (this.st - dt < 0.9) h.sfx.wave();
          this.y = floorCy;
          this.r = ROLL_R;
          const v = 380 * this.speedUp;
          this.x += this.rollDir * v * dt;
          this.rollAngle += (v * dt) / ROLL_R;
        } else {
          moveTo(this.x, 170, 3);
          growTo(R, 3);
          if (this.y < 220) this.go('hover');
        }
        break;
      }
      case 'spokes': {
        // radii sweep the room; only a dash passes through a line
        if (first) {
          this.spokeA = Math.random() * Math.PI * 2;
          this.spokeSpin = Math.random() < 0.5 ? 1 : -1;
        }
        moveTo(W / 2, 190, 3);
        if (this.st > 0.9) this.spokeA += this.spokeSpin * 0.78 * this.speedUp * dt;
        if (this.st > 4.4) this.go('hover');
        break;
      }
      case 'measure': {
        if (first) this.n = APPROX[this.cracks].q;
        const floorCy = h.floorY - R - 8;
        const tx = clamp(p.cx, R + 30, W - R - 30);
        this.x += clamp(tx - this.x, -26 * dt, 26 * dt);
        this.y += (floorCy - this.y) * damp(3, dt);
        growTo(R);
        if (this.st > 13) this.go('release');
        break;
      }
      case 'release': {
        const k = Math.max(3, this.nextDigit());
        for (let i = 0; i < k * 2; i++) {
          const a = (i / (k * 2)) * Math.PI * 2 - Math.PI / 2;
          h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * 240, Math.sin(a) * 240);
        }
        h.sfx.wave();
        h.shake(5);
        this.n = Q.ZERO;
        this.go('hover');
        break;
      }
      case 'cracked':
        moveTo(this.x, 200, 1.5);
        if (this.st > 1.8) this.go(this.cracks >= 3 ? 'finale' : 'hover');
        break;
      case 'finale': {
        // the circle opens and lies down as a line: its own length, π
        moveTo(W / 2, 200, 1.4);
        if (first) h.fx.text(W / 2, 110, 'Every fraction falls short.', { size: 24, life: 3.2, alpha: 0.8 });
        if (this.st > 1.6) this.unroll = clamp((this.st - 1.6) / 2.4, 0, 1);
        if (this.st > 4.4) {
          h.offerPi(W / 2, h.floorY);
          h.sfx.pickup();
          this.go('await');
        }
        break;
      }
      case 'await': {
        moveTo(W / 2, 210 + Math.sin(this.t) * 6, 1.2);
        this.beat -= dt;
        if (this.beat <= 0) {
          h.sfx.heartbeat();
          this.beat = 1.6;
        }
        if (!this.holdsPi && !h.piOffered) {
          this.offerT += dt;
          if (this.offerT > 2.5) {
            this.offerT = 0;
            h.offerPi(W / 2, h.floorY);
          }
        }
        break;
      }
      case 'resolve':
        moveTo(p.cx, p.cy - 30, 0.8);
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
      const harmful = ['hover', 'recite', 'roll', 'spokes', 'cracked'].includes(this.state);
      if (harmful && rectCircle(box, this.x, this.y, this.r * 0.85)) h.hurtPlayer(this.x);
      else if (this.state === 'spokes' && this.st > 0.9) {
        for (const [x0, y0, x1, y1] of this.spokes()) {
          if (segmentHits(box, x0, y0, x1, y1)) {
            h.hurtPlayer(this.x);
            break;
          }
        }
      }
    }
    if (this.state === 'measure' && rectCircle({ x: p.x, y: p.y, w: p.w, h: p.h }, this.x, this.y, this.r * 0.8)) {
      p.vx = Math.sign(p.cx - this.x || 1) * 160;
    }
  }

  private spokes(): [number, number, number, number][] {
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < this.spokeCount; i++) {
      const a = this.spokeA + (i / this.spokeCount) * Math.PI * 2;
      out.push([this.x + Math.cos(a) * (this.r + 6), this.y + Math.sin(a) * (this.r + 6), this.x + Math.cos(a) * 620, this.y + Math.sin(a) * 620]);
    }
    return out;
  }

  touches(box: Rect): boolean {
    return this.alive && this.r > 10 && this.state !== 'resolve' && rectCircle(box, this.x, this.y, this.r);
  }

  matches(v: Q): boolean {
    return this.state === 'measure' && this.n.eq(v);
  }

  struck(v: Q): string | null {
    const h = this.host;
    if (this.state === 'await' && v.eq(Q.PI)) {
      this.tryResolve();
      return 'π − π = 0';
    }
    if (this.state !== 'measure') {
      h.sfx.blocked();
      const rest = Math.PI - v.approx;
      return `π − ${v} = ${rest.toFixed(5)}…`;
    }
    const left = this.n.sub(v);
    if (!left) {
      h.sfx.blocked();
      return 'π will not mix';
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
      h.flash(0.7);
      h.fx.burst(this.x, this.y, 40, { speed: 380, life: 1.1, line: true });
      h.onCrack(this.x, this.y);
      this.go('cracked');
    }
    return null;
  }

  tryResolve(): boolean {
    if (this.state !== 'await' || !this.holdsPi) return false;
    this.go('resolve');
    this.host.sfx.resolve();
    this.host.flash(0.5);
    return true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;
    const h = this.host;
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const r = this.r;

    // spokes: telegraph, then lines
    if (this.state === 'spokes') {
      const armed = this.st > 0.9;
      ctx.lineWidth = armed ? 2 : 1;
      ctx.globalAlpha = armed ? 0.85 : 0.2 + 0.15 * Math.sin(this.t * 25);
      if (!armed) ctx.setLineDash([6, 8]);
      ctx.beginPath();
      for (const [x0, y0, x1, y1] of this.spokes()) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // the floor a wheel has measured
    if (this.state === 'roll' && this.st > 0.9) {
      const from = this.rollFrom;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(from, h.floorY - 1);
      ctx.lineTo(this.x, h.floorY - 1);
      const turn = Math.PI * 2 * ROLL_R;
      for (let d = 0; d <= Math.abs(this.x - from); d += turn) {
        const x = from + this.rollDir * d;
        ctx.moveTo(x, h.floorY - 7);
        ctx.lineTo(x, h.floorY + 3);
      }
      ctx.stroke();
    }

    const finaleK = this.unroll;
    if (r > 0.5 && this.state !== 'resolve') {
      // the circle, drawn as far as it has unrolled
      ctx.globalAlpha = 1;
      ctx.lineWidth = this.hurtT > 0 ? 4.5 : 2.5;
      ctx.beginPath();
      const sweep = this.state === 'intro' ? clamp(this.st / 1.8, 0, 1) : 1 - finaleK;
      if (sweep > 0) {
        ctx.arc(this.x, this.y, r, Math.PI / 2, Math.PI / 2 + Math.PI * 2 * sweep);
        ctx.stroke();
      }
      if (finaleK > 0 && this.state === 'finale') {
        // the unrolled circumference, a line π diameters long
        const len = Math.PI * 2 * r * finaleK;
        ctx.beginPath();
        ctx.moveTo(this.x - len / 2, this.y + r + 10 + finaleK * 40);
        ctx.lineTo(this.x + len / 2, this.y + r + 10 + finaleK * 40);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = 1;
      if (this.state !== 'finale') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      }

      // a wheel shows its turning
      if (this.state === 'roll') {
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = this.rollAngle * this.rollDir + (i * Math.PI * 2) / 3;
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
        }
        ctx.stroke();
      }

      // its digits, going round and never repeating
      if (this.state !== 'finale' && this.state !== 'await') {
        const k = this.state === 'intro' ? clamp((this.st - 1.2) / 1.5, 0, 1) : 1;
        const rr = r + 17;
        ctx.font = serif(13, { italic: false, weight: 500 });
        const step = 10 / rr;
        const spin = this.t * 0.35 + (this.state === 'roll' ? this.rollAngle * this.rollDir : 0);
        const count = Math.min(SHOWN.length, Math.floor((Math.PI * 2) / step) - 3);
        for (let i = 0; i < count; i++) {
          const a = -Math.PI / 2 + spin + i * step;
          ctx.globalAlpha = k * 0.75 * (1 - i / count);
          ctx.save();
          ctx.translate(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillText(SHOWN[i], 0, 0);
          ctx.restore();
        }
      }

      // cracks
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      for (const c of this.crackLines) {
        if (finaleK > 0) break;
        const sx = this.x + Math.cos(c.a) * r;
        const sy = this.y + Math.sin(c.a) * r;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - Math.cos(c.a) * r * c.len * 0.5 + Math.sin(c.a) * 6, sy - Math.sin(c.a) * r * c.len * 0.5);
        ctx.lineTo(sx - Math.cos(c.a) * r * c.len, sy - Math.sin(c.a) * r * c.len + 4);
        ctx.stroke();
      }
    }

    // the heart of it: π, or the fraction it is pretending to be
    if (this.state === 'measure') {
      ctx.globalAlpha = 1;
      drawQ(ctx, this.n, this.x, this.y, 34 + (this.hurtT > 0 ? 6 : 0), 600);
      ctx.globalAlpha = 0.55;
      ctx.font = serif(15);
      ctx.fillText(APPROX[Math.min(this.cracks, 2)].who, this.x, this.y + r + 24);
      const left = 1 - this.st / 13;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.x, this.y, r * 1.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
      ctx.stroke();
    } else {
      const k = this.state === 'intro' ? clamp((this.st - 1.6) / 1.2, 0, 1) : this.state === 'resolve' ? 1 - clamp(this.st / 3, 0, 1) : 1;
      const size = this.state === 'await' || this.state === 'resolve' ? 70 : r * 1.35;
      ctx.globalAlpha = k;
      ctx.save();
      ctx.translate(this.x, this.y + 4);
      if (this.state === 'roll') ctx.rotate(this.rollAngle * this.rollDir);
      ctx.font = serif(size, { weight: 500 });
      ctx.fillText('π', 0, 0);
      ctx.restore();
    }

    // the next digit, spoken before it is fired
    if (this.preview >= 0 && this.state === 'recite') {
      ctx.globalAlpha = 0.25 + 0.1 * Math.sin(this.t * 6);
      ctx.font = serif(64, { weight: 400 });
      ctx.fillText(String(this.preview), this.x, this.y - r - 52);
    }

    // the waiting sign between them
    if (this.state === 'await' && this.holdsPi) {
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
    add(this.x, this.y, 170 + this.r, this.state === 'measure' ? 0.9 : 0.65);
    if (this.state === 'spokes') for (const [, , x1, y1] of this.spokes()) add((this.x + x1) / 2, (this.y + y1) / 2, 160, 0.5);
  }
}

/** Does a line segment pass through a rectangle? (sampled finely enough for thin bodies) */
function segmentHits(r: Rect, x0: number, y0: number, x1: number, y1: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len / 5);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

