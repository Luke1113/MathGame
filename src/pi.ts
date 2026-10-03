import type { Boss, BossHost } from './boss';
import { clamp, damp, pal, Rect, rectCircle, serif } from './constants';
import { drawQ } from './draw';
import { Q } from './num';

const DIGITS = '3141592653589793238462643383279502884197169399375105820974944592307816406286';
const SHOWN = '3.' + DIGITS.slice(1);

/**
 * π's three faces. Around it circle the pieces of an old measurement of the
 * circle; break them all and it cracks.
 */
const PHASES: { parts: Q[]; sum: Q; who: string }[] = [
  { parts: [Q.int(3), Q.of(1, 8)], sum: Q.of(25, 8), who: 'as Babylon measured it' },
  { parts: [Q.int(3), Q.of(1, 7)], sum: Q.of(22, 7), who: 'as Archimedes measured it' },
  { parts: [Q.int(3), Q.of(1, 10), Q.of(1, 25)], sum: Q.of(157, 50), who: 'as the schoolbook writes it: 3.14' },
];

const R = 62;
const WHEEL_R = 44;
const FRAG_R = 17;

type State = 'dormant' | 'intro' | 'fight' | 'cracked' | 'finale' | 'await' | 'resolve' | 'gone';

interface Fragment {
  n: Q;
  a: number;
  alive: boolean;
  hurtT: number;
}

/** π: the number that never ends, and never stops. */
export class Pi implements Boss {
  x: number;
  y: number;
  r = 0;
  private state: State = 'dormant';
  private st = 0;
  private fresh = true;
  private t = 0;
  cracks = 0;
  private frags: Fragment[] = [];
  private digit = 0;
  private fireT = 1.2;
  private pathA = 0;
  private perim = 0;
  private rollAngle = 0;
  private stagger = 0;
  /** As a wheel, it speaks only from the ceiling: rain from above, never from the side. */
  private onCeiling = false;
  private ringR = 0;
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
  }

  get vulnerable(): boolean {
    return this.state === 'fight';
  }
  private get alive(): boolean {
    return this.state !== 'dormant' && this.state !== 'gone';
  }
  private get phase(): number {
    return Math.min(this.cracks, 2);
  }
  private get holdsPi(): boolean {
    return !!this.host.player.value?.eq(Q.PI);
  }
  private get rolling(): boolean {
    return this.state === 'fight' && this.phase === 1;
  }
  private get ringCx(): number {
    return this.host.arenaW / 2;
  }
  private get ringCy(): number {
    return 250;
  }

  private go(s: State): void {
    this.state = s;
    this.st = 0;
    this.fresh = true;
  }

  private peekDigit(): number {
    return Number(DIGITS[this.digit % DIGITS.length]);
  }

  private fragPos(f: Fragment): { x: number; y: number } {
    const rr = this.r + 46;
    return { x: this.x + Math.cos(f.a) * rr, y: this.y + Math.sin(f.a) * rr };
  }

  update(dt: number): void {
    const h = this.host;
    const p = h.player;
    this.t += dt;
    this.st += dt;
    const first = this.fresh;
    this.fresh = false;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    for (const f of this.frags) f.hurtT = Math.max(0, f.hurtT - dt);
    const W = h.arenaW;
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
      case 'intro':
        this.r = R;
        if (this.st > 3.6) this.go('fight');
        return;
      case 'fight':
        if (first) {
          const parts = PHASES[this.phase].parts;
          this.frags = parts.map((n, i) => ({ n, a: (i / parts.length) * Math.PI * 2, alive: true, hurtT: 0 }));
          if (this.phase === 2) this.ringR = 560;
          this.fireT = 2.4;
        }
        this.fight(dt, W, moveTo);
        break;
      case 'cracked':
        moveTo(W / 2, 200, 2);
        this.r += (R - this.r) * damp(3, dt);
        this.ringR += (700 - this.ringR) * damp(1, dt);
        if (this.st > 2.6) this.go(this.cracks >= 3 ? 'finale' : 'fight');
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
      const harmful = this.state === 'fight' || this.state === 'cracked';
      if (harmful && rectCircle(box, this.x, this.y, this.r * 0.85)) h.hurtPlayer(this.x);
      else if (this.state === 'fight' && this.phase === 2 && Math.hypot(p.cx - this.ringCx, p.cy - this.ringCy) > this.ringR) {
        // outside the circle there is nothing; the blow throws x back in
        h.hurtPlayer(p.cx + Math.sign(p.cx - this.ringCx) * 10);
      }
    }
  }

  private fight(dt: number, W: number, moveTo: (x: number, y: number, rate: number) => void): void {
    const h = this.host;
    const p = h.player;
    const slow = this.stagger > 0 ? 0.15 : 1;

    if (this.phase === 0) {
      // a figure of eight over the room
      this.r += (R - this.r) * damp(3, dt);
      this.pathA += dt * 0.42 * slow;
      moveTo(W / 2 + Math.cos(this.pathA) * 300, 190 + Math.sin(this.pathA * 2) * 70, 5);
    } else if (this.phase === 1) {
      // a wheel, rolling round the whole room: floor, wall, ceiling, wall
      this.r += (WHEEL_R - this.r) * damp(4, dt);
      const v = 210 * slow;
      this.perim += v * dt;
      this.rollAngle += (v * dt) / WHEEL_R;
      const left = 32 + WHEEL_R;
      const right = W - 32 - WHEEL_R;
      const top = 32 + WHEEL_R;
      const bottom = h.floorY - WHEEL_R;
      const lx = right - left;
      const ly = bottom - top;
      const s = this.perim % (2 * (lx + ly));
      let tx: number;
      let ty: number;
      this.onCeiling = s >= lx + ly && s < 2 * lx + ly;
      if (s < lx) [tx, ty] = [left + s, bottom];
      else if (s < lx + ly) [tx, ty] = [right, bottom - (s - lx)];
      else if (s < 2 * lx + ly) [tx, ty] = [right - (s - lx - ly), top];
      else [tx, ty] = [left, top + (s - 2 * lx - ly)];
      moveTo(tx, ty, this.st < 1 ? 4 : 30);
    } else {
      // inside a closing circle, on a faster orbit
      this.r += (R - this.r) * damp(3, dt);
      this.pathA += dt * 0.55 * slow;
      moveTo(this.ringCx + Math.cos(this.pathA) * 200, 215 + Math.sin(this.pathA) * 90, 5);
      const target = 385 + Math.sin(this.t * 0.7) * 22;
      this.ringR += (target - this.ringR) * damp(0.35, dt);
    }

    // the old measurement, in pieces, going round
    for (const f of this.frags) f.a += dt * 0.75 * slow;

    // it speaks its digits, and each digit flies: a 9 heavy and slow, a 1 a needle
    if (this.phase === 1 && !this.onCeiling) return;
    this.fireT -= dt * slow;
    if (this.fireT <= 0) {
      const d = this.peekDigit();
      this.digit++;
      this.fireT = [1.75, 0.85, 1.5][this.phase];
      if (d === 0) {
        this.fireT += 0.5; // a zero: a breath of silence
      } else if (d === 9) {
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + this.t;
          h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * 135, Math.sin(a) * 135, 9);
        }
        h.sfx.wave();
      } else {
        const speed = 330 - d * 20;
        const a = Math.atan2(p.cy - this.y, p.cx - this.x);
        h.shoot(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, Math.cos(a) * speed, Math.sin(a) * speed, d);
        h.sfx.fire();
      }
    }
  }

  private breakFrag(f: Fragment): void {
    const h = this.host;
    const pos = this.fragPos(f);
    f.alive = false;
    h.fx.burst(pos.x, pos.y, 18, { speed: 240, life: 0.6, line: true });
    h.sfx.kill(Math.abs(f.n.approx) || 1);
    h.reward(0.25);
    h.heal(pos.x, pos.y);
    h.hitstop(0.08);
    h.shake(4);
    if (this.frags.every((g) => !g.alive)) this.crack();
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
    if (!this.alive || this.state === 'resolve') return undefined;
    if (this.state === 'fight') {
      for (const f of this.frags) {
        if (!f.alive) continue;
        const pos = this.fragPos(f);
        if (!rectCircle(box, pos.x, pos.y, FRAG_R + 10)) continue;
        const left = f.n.sub(v);
        if (!left) {
          h.sfx.blocked();
          return 'π will not mix';
        }
        f.n = left;
        f.hurtT = 0.15;
        if (f.n.isZero) this.breakFrag(f);
        else {
          h.sfx.hit(Math.abs(v.approx));
          h.hitstop(0.04);
        }
        return null;
      }
    }
    if (this.r < 10 || !rectCircle(box, this.x, this.y, this.r)) return undefined;
    if (this.state === 'await' && v.eq(Q.PI)) {
      this.tryResolve();
      return 'π − π = 0';
    }
    h.sfx.blocked();
    this.stagger = Math.max(this.stagger, 0.25);
    return `π − ${v} = ${(Math.PI - v.approx).toFixed(5)}…`;
  }

  matches(v: Q): boolean {
    return this.state === 'fight' && this.frags.some((f) => f.alive && f.n.eq(v));
  }

  equate(v: Q): void {
    const f = this.frags.find((g) => g.alive && g.n.eq(v));
    if (f) this.breakFrag(f);
  }

  /** A digit struck back: it shatters any piece it meets, and staggers π itself. */
  catchShot(x: number, y: number, r: number): boolean {
    if (this.state !== 'fight') return false;
    for (const f of this.frags) {
      if (!f.alive) continue;
      const pos = this.fragPos(f);
      if (Math.hypot(pos.x - x, pos.y - y) < FRAG_R + r + 4) {
        this.breakFrag(f);
        return true;
      }
    }
    if (Math.hypot(this.x - x, this.y - y) < this.r + r) {
      this.stagger = 1.8;
      this.hurtT = 0.2;
      this.host.sfx.hit(3);
      this.host.reward(0.1);
      this.host.shake(5);
      return true;
    }
    return false;
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

    // the closing circle of the last phase: outside it, nothing
    if (this.state === 'fight' && this.phase === 2) {
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.rect(0, 0, h.arenaW, 600);
      ctx.arc(this.ringCx, this.ringCy, this.ringR, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.ringCx, this.ringCy, this.ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const finaleK = this.unroll;
    if (r > 0.5 && this.state !== 'resolve') {
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
      if (this.state !== 'finale') {
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (this.rolling) {
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = this.rollAngle + (i * Math.PI * 2) / 3;
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x + Math.cos(a) * r, this.y + Math.sin(a) * r);
        }
        ctx.stroke();
      }

      // its digits, going round and never repeating
      if (this.state !== 'finale' && this.state !== 'await') {
        const k = this.state === 'intro' ? clamp((this.st - 1.2) / 1.5, 0, 1) : 1;
        const rr = r + 16;
        ctx.font = serif(12, { italic: false, weight: 500 });
        const step = 9.5 / rr;
        const spin = this.t * 0.35 + (this.rolling ? this.rollAngle : 0);
        const count = Math.min(SHOWN.length, Math.floor((Math.PI * 2) / step) - 3);
        for (let i = 0; i < count; i++) {
          const a = -Math.PI / 2 + spin + i * step;
          ctx.globalAlpha = k * 0.7 * (1 - i / count);
          ctx.save();
          ctx.translate(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillText(SHOWN[i], 0, 0);
          ctx.restore();
        }
      }

      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      if (finaleK === 0) {
        for (const c of this.crackLines) {
          const sx = this.x + Math.cos(c.a) * r;
          const sy = this.y + Math.sin(c.a) * r;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - Math.cos(c.a) * r * c.len * 0.5 + Math.sin(c.a) * 6, sy - Math.sin(c.a) * r * c.len * 0.5);
          ctx.lineTo(sx - Math.cos(c.a) * r * c.len, sy - Math.sin(c.a) * r * c.len + 4);
          ctx.stroke();
        }
      }
    }

    // the glyph
    {
      const k = this.state === 'intro' ? clamp((this.st - 1.6) / 1.2, 0, 1) : this.state === 'resolve' ? 1 - clamp(this.st / 3, 0, 1) : 1;
      const size = this.state === 'await' || this.state === 'resolve' ? 70 : r * 1.35;
      ctx.globalAlpha = k;
      ctx.save();
      ctx.translate(this.x, this.y + 4);
      if (this.rolling) ctx.rotate(this.rollAngle);
      ctx.font = serif(size, { weight: 500 });
      ctx.fillText('π', 0, 0);
      ctx.restore();
    }

    // the pieces of the old measurement
    if (this.state === 'fight') {
      for (const f of this.frags) {
        if (!f.alive) continue;
        const pos = this.fragPos(f);
        ctx.globalAlpha = 1;
        ctx.fillStyle = pal.void;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, FRAG_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pal.ink;
        ctx.lineWidth = f.hurtT > 0 ? 3 : 1.5;
        ctx.stroke();
        drawQ(ctx, f.n, pos.x, pos.y, f.n.d === 1 ? 19 : 17, 600);
      }
      const ph = PHASES[this.phase];
      ctx.globalAlpha = 0.5;
      ctx.font = serif(15);
      ctx.fillText(`${ph.parts.map((q) => q.toString()).join(' + ')} = ${ph.sum}   ·   ${ph.who}`, h.arenaW / 2, 70);
      // the next digit, spoken before it flies
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(this.t * 6);
      ctx.font = serif(44, { weight: 400 });
      ctx.fillText(String(this.peekDigit()), this.x, this.y - r - 62);
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
    add(this.x, this.y, 190 + this.r, 0.8);
    if (this.state !== 'fight') return;
    for (const f of this.frags) {
      if (!f.alive) continue;
      const pos = this.fragPos(f);
      add(pos.x, pos.y, 70, 0.6);
    }
  }
}
