import { pal } from './constants';
import { drawQ } from './draw';
import type { Q } from './num';

export type ShotPath = 'line' | 'sin' | 'para' | 'ln';

/**
 * A shot that flies along a graph. x's functions carry x along them; plotters
 * (and e) fire them at x, after drawing the curve they will follow.
 */
export class CurveShot {
  u = 0;
  dead = false;
  /** Seconds the curve is shown before the shot sets out. */
  tele: number;
  life: number;

  constructor(
    readonly path: ShotPath,
    readonly x0: number,
    readonly y0: number,
    /** ±1: which way along x. */
    readonly dir: number,
    /** Rise per unit run of the base line (screen y, so negative is up). */
    readonly slope: number,
    /** Wave height for sine, arc height for the parabola (px, signed). */
    readonly amp: number,
    /** Span of the parabola's arc (px). */
    readonly span: number,
    readonly speed: number,
    /** What it carries: x for x's functions; null for ln and for hostile shots. */
    readonly value: Q | null,
    readonly friendly: boolean,
    tele = 0,
    life = 2,
  ) {
    this.tele = tele;
    this.life = life;
  }

  pos(u: number): { x: number; y: number } {
    const x = this.x0 + this.dir * u;
    let y = this.y0 + this.slope * u;
    if (this.path === 'sin') y -= this.amp * Math.sin((u / 110) * Math.PI * 2);
    if (this.path === 'para') y -= (4 * this.amp * u * (this.span - u)) / (this.span * this.span);
    return { x, y };
  }

  get head(): { x: number; y: number } {
    return this.pos(this.u);
  }

  update(dt: number): void {
    if (this.tele > 0) {
      this.tele -= dt;
      return;
    }
    this.u += this.speed * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    // the curve ahead, drawn before the shot follows it
    if (!this.friendly) {
      const reach = this.speed * (this.life + Math.max(0, this.tele));
      ctx.globalAlpha = this.tele > 0 ? 0.35 : 0.12;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      for (let u = this.u; u <= reach; u += 8) {
        const p = this.pos(u);
        if (u === this.u) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (this.tele > 0) {
        ctx.globalAlpha = 1;
        return;
      }
    }
    // the trail behind it
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = this.friendly ? 2 : 1.5;
    ctx.beginPath();
    const from = Math.max(0, this.u - 120);
    for (let u = from; u <= this.u; u += 6) {
      const p = this.pos(u);
      if (u === from) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    const h = this.head;
    ctx.globalAlpha = 1;
    if (this.path === 'ln') {
      ctx.font = 'italic 600 18px "Cormorant Garamond", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('ln', h.x, h.y);
    } else if (this.value) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.8;
      drawQ(ctx, this.value, h.x, h.y - 14, 14);
    } else {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
