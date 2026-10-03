import { clamp, digitsOf, INK, Rect, serif } from './constants';
import type { Input } from './input';
import { moveBody, type Body } from './physics';
import type { Room } from './room';
import type { Sound } from './audio';

const RUN = 235;
const ACCEL_GROUND = 2600;
const ACCEL_AIR = 1700;
const FRICTION = 2900;
const GRAVITY = 1900;
const JUMP_V = 690;
const MAX_FALL = 820;
const DASH_V = 640;
const DASH_T = 0.16;
const DASH_CD = 0.42;

export const STRIKE_T = 0.24;
const STRIKE_ON = 0.02;
const STRIKE_OFF = 0.13;
const STRIKE_CD = 0.3;

export type StrikeDir = 'f' | 'up' | 'down';

export class Player implements Body {
  x = 0;
  y = 0;
  w = 14;
  h = 30;
  vx = 0;
  vy = 0;
  onGround = false;
  facing: 1 | -1 = 1;

  private coyote = 0;
  private jumpBuf = 0;
  private jumpHeld = false;
  private dropT = 0;
  dashT = 0;
  private dashCd = 0;
  private airDash = true;
  wantStrike = false;
  wantDash = false;

  strikeT = -1;
  strikeDir: StrikeDir = 'f';
  private strikeCd = 0;
  /** Things already struck by the current swing. */
  struck = new Set<object>();

  hp = 5;
  maxHp = 5;
  invuln = 0;
  /** x itself: the number held. null until the first glyph is found. */
  value: number | null = null;
  valuePop = 0;

  private runPhase = 0;
  private trail: { x: number; y: number; f: number; a: number }[] = [];
  private trailT = 0;
  stillT = 0;

  get cx(): number {
    return this.x + this.w / 2;
  }
  get cy(): number {
    return this.y + this.h / 2;
  }

  place(feetX: number, feetY: number): void {
    this.x = feetX - this.w / 2;
    this.y = feetY - this.h;
    this.vx = 0;
    this.vy = 0;
  }

  queueJump(): void {
    this.jumpBuf = 0.13;
  }

  get dashing(): boolean {
    return this.dashT > 0;
  }

  reach(): number {
    return 34 + 9 * digitsOf(this.value ?? 0);
  }

  update(dt: number, input: Input, room: Room, sfx: Sound): void {
    const left = input.down('left');
    const right = input.down('right');
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0 && this.strikeT < 0) this.facing = dir as 1 | -1;

    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.strikeCd = Math.max(0, this.strikeCd - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.dropT = Math.max(0, this.dropT - dt);
    this.valuePop = Math.max(0, this.valuePop - dt * 3);
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
    if (this.onGround) this.airDash = true;

    // dash
    if (this.wantDash && this.dashCd <= 0 && (this.onGround || this.airDash)) {
      if (!this.onGround) this.airDash = false;
      this.dashT = DASH_T;
      this.dashCd = DASH_CD;
      this.vx = DASH_V * this.facing;
      this.vy = 0;
      sfx.dash();
    }
    this.wantDash = false;

    if (this.dashT > 0) {
      this.dashT -= dt;
      this.vx = DASH_V * this.facing;
      this.vy = 0;
      if (this.dashT <= 0) this.vx = RUN * this.facing;
    } else {
      // run
      const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
      if (dir !== 0) {
        this.vx += dir * accel * dt;
        if (Math.abs(this.vx) > RUN) this.vx = Math.sign(this.vx) * Math.max(RUN, Math.abs(this.vx) - FRICTION * dt);
      } else {
        const f = (this.onGround ? FRICTION : FRICTION * 0.35) * dt;
        this.vx = Math.abs(this.vx) <= f ? 0 : this.vx - Math.sign(this.vx) * f;
      }

      // jump
      if (this.jumpBuf > 0) {
        if (input.down('down') && this.onGround) {
          this.dropT = 0.22;
          this.jumpBuf = 0;
        } else if (this.coyote > 0) {
          this.vy = -JUMP_V;
          this.jumpBuf = 0;
          this.coyote = 0;
          this.jumpHeld = true;
          sfx.jump();
        }
      }
      if (this.jumpHeld && !input.down('jump') && this.vy < 0) {
        this.vy *= 0.45;
        this.jumpHeld = false;
      }
      if (this.vy >= 0) this.jumpHeld = false;

      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * dt);
    }

    // strike
    if (this.wantStrike && this.strikeCd <= 0 && this.value !== null) {
      this.strikeT = 0;
      this.strikeCd = STRIKE_CD;
      this.struck.clear();
      this.strikeDir = input.down('up') ? 'up' : input.down('down') && !this.onGround ? 'down' : 'f';
      sfx.swing();
    }
    this.wantStrike = false;
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      if (this.strikeT > STRIKE_T) this.strikeT = -1;
    }

    const res = moveBody(this, room, dt, this.dropT > 0);
    if (res.landed) sfx.land();

    if (this.onGround && Math.abs(this.vx) > 20) this.runPhase += dt * Math.abs(this.vx) * 0.055;
    else this.runPhase = 0;
    this.stillT = Math.abs(this.vx) < 5 && this.onGround ? this.stillT + dt : 0;

    // afterimages
    this.trailT -= dt;
    if (this.dashT > 0 && this.trailT <= 0) {
      this.trail.push({ x: this.x, y: this.y, f: this.facing, a: 0.5 });
      this.trailT = 0.025;
    }
    for (const t of this.trail) t.a -= dt * 2.2;
    this.trail = this.trail.filter((t) => t.a > 0);
  }

  /** Pogo off whatever was struck below. */
  bounce(): void {
    this.vy = -560;
    this.airDash = true;
    this.jumpHeld = false;
  }

  recoil(fromX: number, power = 170): void {
    this.vx = Math.sign(this.cx - fromX || -this.facing) * power;
  }

  strikeBox(): Rect | null {
    if (this.strikeT < STRIKE_ON || this.strikeT > STRIKE_OFF) return null;
    const r = this.reach();
    const cx = this.cx;
    if (this.strikeDir === 'up') return { x: cx - 20, y: this.y - r + 8, w: 40, h: r };
    if (this.strikeDir === 'down') return { x: cx - 18, y: this.y + this.h - 8, w: 36, h: r };
    return this.facing > 0 ? { x: cx, y: this.y - 6, w: r, h: this.h + 8 } : { x: cx - r, y: this.y - 6, w: r, h: this.h + 8 };
  }

  draw(ctx: CanvasRenderingContext2D, t: number): void {
    for (const tr of this.trail) {
      ctx.globalAlpha = tr.a * 0.5;
      this.drawFigure(ctx, tr.x, tr.y, tr.f, t, true);
    }
    ctx.globalAlpha = 1;
    if (this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0) ctx.globalAlpha = 0.25;
    this.drawFigure(ctx, this.x, this.y, this.facing, t, false);
    ctx.globalAlpha = 1;
  }

  private drawFigure(ctx: CanvasRenderingContext2D, x: number, y: number, facing: number, t: number, ghost: boolean): void {
    const cx = x + this.w / 2;
    const dashing = this.dashT > 0;
    const lean = dashing ? facing * 7 : clamp(this.vx / RUN, -1, 1) * 2.5;
    const breathe = this.stillT > 0 ? Math.sin(t * 2.2) * 0.6 : 0;
    const headX = cx + lean;
    const headY = y + 6 + breathe * 0.5;
    const shX = cx + lean * 0.75;
    const shY = y + 13 + breathe * 0.3;
    const hipX = cx + lean * 0.2;
    const hipY = y + 20;
    const feetY = y + this.h;

    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(headX, headY, 5, 0, Math.PI * 2);
    ctx.moveTo(headX - lean * 0.05, headY + 5);
    ctx.lineTo(hipX, hipY);

    // legs
    let la: number;
    let lb: number;
    if (!this.onGround && !dashing) {
      la = facing * 0.45;
      lb = -facing * 0.15;
    } else if (dashing) {
      la = -facing * 0.6;
      lb = -facing * 0.95;
    } else if (this.runPhase > 0) {
      la = Math.sin(this.runPhase) * 0.75;
      lb = -la;
    } else {
      la = 0.2;
      lb = -0.2;
    }
    const legLen = feetY - hipY;
    const knee = (a: number) => {
      const kx = hipX + Math.sin(a) * legLen * 0.5;
      const ky = hipY + Math.cos(a) * legLen * 0.5;
      const bend = this.onGround ? Math.max(0, -Math.cos(a + 1.2)) * 2 : 3;
      return { kx: kx + facing * bend, ky };
    };
    for (const a of [la, lb]) {
      const k = knee(a);
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(k.kx, k.ky);
      ctx.lineTo(hipX + Math.sin(a) * legLen * 0.85, hipY + Math.cos(a) * legLen * 0.98);
    }

    // arms
    const swing = this.runPhase > 0 ? Math.sin(this.runPhase) * 0.6 : 0;
    const backA = Math.PI / 2 - facing * (0.35 + swing);
    ctx.moveTo(shX, shY);
    ctx.lineTo(shX + Math.cos(backA) * 10, shY + Math.sin(backA) * 10);

    // weapon arm
    let armA: number;
    let p = -1;
    if (this.strikeT >= 0 && !ghost) {
      p = Math.min(1, this.strikeT / (STRIKE_T * 0.6));
      const e = 1 - Math.pow(1 - p, 3);
      if (this.strikeDir === 'up') armA = facing > 0 ? -0.2 - e * 2.6 : Math.PI + 0.2 + e * 2.6;
      else if (this.strikeDir === 'down') armA = facing > 0 ? -0.9 + e * 2.6 : Math.PI + 0.9 - e * 2.6;
      else armA = facing > 0 ? -1.6 + e * 2.3 : Math.PI + 1.6 - e * 2.3;
    } else {
      armA = facing > 0 ? 0.9 - swing * 0.4 : Math.PI - 0.9 + swing * 0.4;
    }
    const handX = shX + Math.cos(armA) * 10;
    const handY = shY + Math.sin(armA) * 10;
    ctx.moveTo(shX, shY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    if (ghost || this.value === null) return;

    // the slash: an arc traced by the held number
    const r = this.reach();
    if (p >= 0 && p < 1) {
      let a0: number;
      let a1: number;
      if (this.strikeDir === 'up') {
        a0 = facing > 0 ? -0.2 : Math.PI + 0.2;
        a1 = armA;
      } else if (this.strikeDir === 'down') {
        a0 = facing > 0 ? -0.9 : Math.PI + 0.9;
        a1 = armA;
      } else {
        a0 = facing > 0 ? -1.6 : Math.PI + 1.6;
        a1 = armA;
      }
      const ccw = a1 < a0;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(shX, shY, r * 0.82, a0, a1, ccw);
      ctx.stroke();
      ctx.globalAlpha = (1 - p) * 0.35;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(shX, shY, r * 0.62, a0, a1, ccw);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // the held glyph
    const s = String(this.value);
    const size = 17 + Math.min(6, digitsOf(this.value) * 2) + this.valuePop * 10;
    let gx: number;
    let gy: number;
    if (p >= 0 && p < 1) {
      gx = shX + Math.cos(armA) * r * 0.62;
      gy = shY + Math.sin(armA) * r * 0.62;
    } else {
      gx = handX + facing * (6 + s.length * 3);
      gy = handY - 5 + Math.sin(t * 2.5) * 1.2;
    }
    ctx.fillStyle = INK;
    ctx.font = serif(size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, gx, gy);
  }
}
