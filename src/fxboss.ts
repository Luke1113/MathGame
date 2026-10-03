import type { Boss, BossHost } from './boss';
import { clamp, damp, pal, Rect, rectCircle, serif, TILE } from './constants';
import { FORMS, rootText, scaled, sined, ZERO_FORM, type Form, type FunctionFloor } from './floor';
import type { Q } from './num';

type State = 'dormant' | 'intro' | 'fight' | 'cracked' | 'finale' | 'await' | 'resolve' | 'gone';

interface Phase {
  family: keyof typeof FORMS;
  /** Roots to break before it cracks. */
  need: number;
  /** The graph it fires along, and how often. */
  fire: 'line' | 'sin' | 'para';
  every: number;
  /** What it calls into the fight. */
  summon?: 'spinner' | 'doubler';
}

const PHASES: Phase[] = [
  { family: 'linear', need: 3, fire: 'line', every: 2.4 },
  { family: 'quadratic', need: 3, fire: 'para', every: 2.7 },
  { family: 'trig', need: 4, fire: 'sin', every: 2.8, summon: 'spinner' },
  { family: 'exp', need: 2, fire: 'line', every: 2.5, summon: 'doubler' },
];

/** How long a form may stand before it rewrites itself. */
const MORPH_EVERY = 8;

/** "e^{x/3}" as plain text can show it: "e^(x/3)". */
function plain(label: string): string {
  return label.replace(/\^\{([^}]*)\}/g, '^($1)');
}

/**
 * f(x): the rule itself. Its graph is the ground of the room. It rewrites
 * itself, fires along graphs, and is broken only where it meets nothing —
 * at its roots. x's functions compose with it: ln counts its growth back,
 * a times it stretches it, sine bends it.
 */
export class FxBoss implements Boss {
  x: number;
  y: number;
  r = 0;
  private state: State = 'dormant';
  private st = 0;
  private fresh = true;
  private t = 0;
  private phase = 0;
  /** Roots still to break in this phase. */
  private left = 0;
  private formI = 0;
  private fireT = 2.5;
  private morphT = MORPH_EVERY;
  private summonT = 4;
  private hurtT = 0;
  private popT = 0;
  private beat = 0;
  private crackLines: { a: number; len: number }[] = [];

  constructor(
    private host: BossHost,
    private floor: FunctionFloor,
    x: number,
    y: number,
  ) {
    this.x = x;
    this.y = y;
  }

  get vulnerable(): boolean {
    return this.state === 'fight';
  }
  get rootsOpen(): boolean {
    return this.state === 'fight';
  }
  private get alive(): boolean {
    return this.state !== 'dormant' && this.state !== 'gone';
  }
  private get holdsZero(): boolean {
    return !!this.host.player.value?.isZero;
  }

  private go(s: State): void {
    this.state = s;
    this.st = 0;
    this.fresh = true;
  }

  /** The next shape in this phase's family, in order. */
  private nextForm(): Form {
    const list = FORMS[PHASES[this.phase].family];
    this.formI = (this.formI + 1) % list.length;
    return list[this.formI];
  }

  private beginPhase(): void {
    const ph = PHASES[this.phase];
    this.left = ph.need;
    this.formI = 0;
    this.floor.morph(FORMS[ph.family][0], 1.1, 1.1);
    this.fireT = 2.4;
    this.morphT = MORPH_EVERY;
    this.summonT = 3;
    this.go('fight');
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

    switch (this.state) {
      case 'dormant':
        if (p.cx > 200) {
          this.go('intro');
          h.onIntro();
        }
        return;
      case 'intro':
        // it writes itself out of the axis
        this.r = 40 * clamp((this.st - 0.4) / 1.6, 0, 1);
        moveTo(W / 2, 80, 2);
        if (this.st > 3.2) this.beginPhase();
        return;
      case 'fight': {
        const ph = PHASES[this.phase];
        this.r += (40 - this.r) * damp(4, dt);
        // it sweeps the room from above, never quite where x is
        const tx = W / 2 + Math.sin(this.t * 0.42) * (W / 2 - 130);
        this.x += clamp(tx - this.x, -170 * dt, 170 * dt);
        this.y += (78 + Math.sin(this.t * 1.3) * 10 - this.y) * damp(3, dt);

        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = ph.every;
          h.plot(this.x, this.y + this.r * 0.6, ph.fire, p.cx, p.cy);
          this.popT = 0.6;
        }
        // left alone, a form rewrites itself
        this.morphT -= dt;
        if (this.morphT <= 0 && this.floor.settled) {
          this.morphT = MORPH_EVERY;
          this.floor.morph(this.nextForm(), 1.4, 1.1);
        }
        if (ph.summon) {
          this.summonT -= dt;
          if (this.summonT <= 0) {
            this.summonT = ph.summon === 'spinner' ? 6.5 : 8;
            if (h.count(ph.summon) < 2) h.summon(ph.summon, this.x, this.y + this.r + 20);
          }
        }
        break;
      }
      case 'cracked':
        moveTo(W / 2, 110, 1.5);
        if (this.st > 2.6) {
          this.phase++;
          if (this.phase >= PHASES.length) this.go('finale');
          else this.beginPhase();
        }
        break;
      case 'finale':
        // it is rewritten one last time: into nothing at all
        if (first) {
          this.floor.morph(ZERO_FORM, 1.2, 1.6);
          h.clearShots();
        }
        moveTo(W / 2, 150, 1.2);
        this.r += (28 - this.r) * damp(2, dt);
        if (this.st > 3.4) this.go('await');
        break;
      case 'await':
        moveTo(W / 2, 160 + Math.sin(this.t) * 6, 1.2);
        this.beat -= dt;
        if (this.beat <= 0) {
          h.sfx.heartbeat();
          this.beat = 1.6;
        }
        break;
      case 'resolve':
        moveTo(p.cx, p.cy - 30, 0.8);
        this.r = 28 * (1 - clamp(this.st / 2.5, 0, 1));
        if (this.st > 4.5) {
          this.go('gone');
          h.onResolved();
        }
        break;
      default:
        break;
    }

    // contact
    if (p.invuln <= 0 && !p.dashing && (this.state === 'fight' || this.state === 'cracked')) {
      const box: Rect = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (rectCircle(box, this.x, this.y, this.r * 0.8)) h.hurtPlayer(this.x);
    }
  }

  rootBroken(px: number): string {
    const h = this.host;
    const said = `f(${rootText((px - this.floor.ox) / TILE)}) = 0`;
    this.left--;
    this.hurtT = 0.3;
    this.popT = 1;
    h.reward(0.2);
    h.sfx.crack();
    h.shake(8);
    h.hitstop(0.12);
    h.fx.burst(px, this.floor.oy, 24, { speed: 260, life: 0.7, line: true });
    if (this.left <= 0) this.crack();
    else {
      // broken where it met nothing, it rewrites itself at once
      this.floor.morph(this.nextForm(), 0.6, 0.9);
      this.morphT = MORPH_EVERY;
    }
    return said;
  }

  private crack(): void {
    const h = this.host;
    this.crackLines.push({ a: Math.random() * Math.PI * 2, len: 0.5 + Math.random() * 0.4 });
    this.crackLines.push({ a: Math.random() * Math.PI * 2, len: 0.3 + Math.random() * 0.3 });
    h.sfx.crack();
    h.hitstop(0.35);
    h.shake(14);
    h.flash(0.7);
    h.clearShots();
    h.fx.burst(this.x, this.y, 40, { speed: 380, life: 1.1, line: true });
    h.onCrack(this.x, this.y);
    this.go('cracked');
  }

  fnHit(fn: string, a: number, x: number, y: number, r: number): string | null | undefined {
    if (!this.alive || this.r < 6 || Math.hypot(x - this.x, y - this.y) > this.r + r) return undefined;
    const h = this.host;
    if (this.state !== 'fight') return null;
    const form = this.floor.form;
    const k = String(a).replace('-', '−');
    const rewrite = (to: Form, said: string) => {
      this.floor.become(to, 0.6);
      this.morphT = MORPH_EVERY;
      this.hurtT = 0.2;
      this.popT = 1;
      h.sfx.nullify();
      h.flash(0.2);
      h.shake(5);
      return said;
    };
    switch (fn) {
      case 'ln':
        // growth counted back: ln e^{x/3} = x/3
        if (form.ln) {
          const to = a === 1 ? form.ln : scaled(form.ln, a);
          return rewrite(to, `${a === 1 ? '' : k + ' '}ln ${plain(form.label)} = ${to.label}`);
        }
        h.sfx.blocked();
        return `ln(${plain(form.label)}) never ends`;
      case 'ax':
        if (a === 1) {
          h.sfx.blocked();
          return '1 · f(x) = f(x)';
        }
        return rewrite(scaled(form, a), `f(x) → ${plain(scaled(form, a).label)}`);
      case 'sin': {
        const to = sined(form, a);
        return rewrite(to, `f(x) → ${plain(to.label)}`);
      }
      default:
        h.sfx.blocked();
        return `(${plain(form.label)})² only touches nothing`;
    }
  }

  hit(box: Rect, v: Q): string | null | undefined {
    if (!this.alive || this.r < 6 || !rectCircle(box, this.x, this.y, this.r)) return undefined;
    if (this.state === 'await' && v.isZero) {
      this.tryResolve();
      return '0 = 0';
    }
    this.host.sfx.blocked();
    return this.state === 'fight' ? 'f is a rule, not a number' : null;
  }

  tryResolve(): boolean {
    if (this.state !== 'await' || !this.holdsZero) return false;
    this.go('resolve');
    this.host.sfx.resolve();
    this.host.flash(0.5);
    this.host.fx.text(this.x, this.y - 60, '0 = 0', { size: 30, life: 3, alpha: 0.9 });
    return true;
  }

  matches(): boolean {
    return false;
  }

  equate(): void {
    /* a rule is not equal to a number */
  }

  catchShot(): boolean {
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) return;
    const h = this.host;
    const r = this.r * (1 + this.popT * 0.06);
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // a frame like the plotters', drawn as a circle: it draws graphs
    ctx.globalAlpha = 1;
    ctx.lineWidth = this.hurtT > 0 ? 4 : 2.2;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.stroke();
    // a little graph of itself, turning inside
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x - r * 0.75, this.y);
    ctx.lineTo(this.x + r * 0.75, this.y);
    ctx.moveTo(this.x, this.y - r * 0.75);
    ctx.lineTo(this.x, this.y + r * 0.75);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const u = (i / 24) * 2 - 1;
      const xx = this.x + u * r * 0.7;
      const v = this.state === 'await' || this.state === 'resolve' ? 0 : clamp(this.floor.value(u * 8) / 5, -1, 1);
      const yy = this.y - v * r * 0.6;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();

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

    ctx.globalAlpha = this.state === 'intro' ? clamp((this.st - 1) / 1.5, 0, 1) : 1;
    ctx.font = serif(clamp(r * 1.1, 20, 46), { weight: 500 });
    ctx.fillText('f', this.x - 2, this.y + 1);

    // the roots it still has to give
    if (this.state === 'fight' || this.state === 'cracked') {
      const n = this.left;
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.32;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(a) * (r + 10), this.y + Math.sin(a) * (r + 10), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // what it is, written beneath it
    if (this.state !== 'resolve') {
      const alpha = this.state === 'intro' ? clamp((this.st - 1.5) / 1, 0, 1) : 0.85;
      this.floor.drawLabel(ctx, this.x, this.y + r + 28, 20, alpha);
    }

    // the waiting sign between them
    if (this.state === 'await' && this.holdsZero) {
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
    add(this.x, this.y, 200 + this.r * 1.5, 0.85);
  }
}
