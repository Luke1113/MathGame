import { INK, serif } from './constants';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  drag: number;
  grav: number;
  line: boolean;
}

interface Floater {
  x: number;
  y: number;
  s: string;
  t: number;
  life: number;
  size: number;
  alpha: number;
}

export class Fx {
  private ps: Particle[] = [];
  private fl: Floater[] = [];

  clear(): void {
    this.ps = [];
    this.fl = [];
  }

  burst(x: number, y: number, n: number, o: { speed?: number; life?: number; size?: number; grav?: number; up?: number; line?: boolean } = {}): void {
    const speed = o.speed ?? 160;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const life = (o.life ?? 0.7) * (0.5 + Math.random() * 0.8);
      this.ps.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (o.up ?? 0),
        life,
        max: life,
        size: (o.size ?? 1.6) * (0.6 + Math.random() * 0.8),
        drag: 2.5,
        grav: o.grav ?? 0,
        line: o.line ?? false,
      });
    }
  }

  /** A glyph dissolving upward into motes. */
  dissolve(x: number, y: number, w: number, h: number, n = 26): void {
    for (let i = 0; i < n; i++) {
      const life = 1.2 + Math.random() * 1.4;
      this.ps.push({
        x: x + (Math.random() - 0.5) * w,
        y: y + (Math.random() - 0.5) * h,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 60,
        life,
        max: life,
        size: 1 + Math.random() * 1.6,
        drag: 0.6,
        grav: -10,
        line: false,
      });
    }
  }

  converge(tx: number, ty: number, n: number, radius: number, life = 0.9): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * (0.6 + Math.random() * 0.6);
      const x = tx + Math.cos(a) * r;
      const y = ty + Math.sin(a) * r;
      const l = life * (0.7 + Math.random() * 0.5);
      this.ps.push({ x, y, vx: (tx - x) / l, vy: (ty - y) / l, life: l, max: l, size: 1.4, drag: 0, grav: 0, line: false });
    }
  }

  text(x: number, y: number, s: string, o: { size?: number; life?: number; alpha?: number } = {}): void {
    this.fl.push({ x, y, s, t: 0, life: o.life ?? 1.1, size: o.size ?? 16, alpha: o.alpha ?? 0.8 });
  }

  update(dt: number): void {
    for (const p of this.ps) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.ps = this.ps.filter((p) => p.life > 0);
    for (const f of this.fl) f.t += dt;
    this.fl = this.fl.filter((f) => f.t < f.life);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    for (const p of this.ps) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      if (p.line) {
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.stroke();
      } else {
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.fl) {
      const k = f.t / f.life;
      ctx.globalAlpha = f.alpha * (k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4));
      ctx.font = serif(f.size);
      ctx.fillText(f.s, f.x, f.y - 26 * k);
    }
    ctx.globalAlpha = 1;
  }
}

/** Slow motes of dust that drift in front of the camera. */
export class Dust {
  private motes: { x: number; y: number; z: number; ph: number }[] = [];

  constructor(n = 46) {
    for (let i = 0; i < n; i++) this.motes.push({ x: Math.random(), y: Math.random(), z: 0.3 + Math.random() * 0.9, ph: Math.random() * 10 });
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, t: number): void {
    ctx.fillStyle = INK;
    for (const m of this.motes) {
      const px = ((((m.x * vw * 1.4 - camX * m.z * 0.6 + t * 6 * m.z) % (vw * 1.4)) + vw * 1.4) % (vw * 1.4)) - vw * 0.2;
      const py = ((((m.y * vh * 1.4 - camY * m.z * 0.6 - t * 3 * m.z + Math.sin(t * 0.3 + m.ph) * 8) % (vh * 1.4)) + vh * 1.4) % (vh * 1.4)) - vh * 0.2;
      ctx.globalAlpha = 0.08 + 0.12 * m.z * (0.5 + 0.5 * Math.sin(t * 0.8 + m.ph));
      const s = 0.8 + m.z * 1.2;
      ctx.fillRect(px, py, s, s);
    }
    ctx.globalAlpha = 1;
  }
}
