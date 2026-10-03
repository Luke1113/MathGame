import { Sound } from './audio';
import { Zero, type BossHost } from './boss';
import { AIR, clamp, damp, INK, overlaps, rectCircle, serif, TILE, VIEW_H, VIEW_W } from './constants';
import { Enemy, makeEnemy, type Shot, type World } from './enemies';
import { Dust, Fx } from './fx';
import { Input, type Ev, type Op } from './input';
import { Player } from './player';
import { Room, SOLID, EMPTY, type Side } from './room';
import { GLYPHS, ROOMS, ROOM_BY_ID } from './rooms';
import { freshSave, loadSave, writeSave, type SaveData } from './save';

type Mode = 'title' | 'chapter' | 'play' | 'pickup' | 'pause' | 'dead' | 'end';

interface Shrine {
  key: string;
  give: string;
  x: number;
  y: number;
  t: number;
}

interface Inscription {
  x: number;
  y: number;
  s: string;
  a: number;
}

interface Lamp {
  x: number;
  y: number;
  near: boolean;
}

interface Mote {
  x: number;
  y: number;
  t: number;
  dead: boolean;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const OPS = ['+', '−', '×', '÷', '='];
const FLOOR_ZERO = 14 * TILE;

/** Draw text with manual letter spacing, centred on x. */
function spaced(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, gap: number): void {
  const widths = [...s].map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (s.length - 1);
  let cx = x - total / 2;
  const align = ctx.textAlign;
  ctx.textAlign = 'left';
  [...s].forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + gap;
  });
  ctx.textAlign = align;
}

export class Game {
  private ctx: CanvasRenderingContext2D;
  readonly sfx = new Sound();
  private mode: Mode = 'title';
  private save: SaveData = freshSave();
  private hasSave = false;
  private menu = 0;

  room!: Room;
  readonly player = new Player();
  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private shrines: Shrine[] = [];
  private texts: Inscription[] = [];
  private lamps: Lamp[] = [];
  private motes: Mote[] = [];
  private boss: Zero | null = null;
  readonly fx = new Fx();
  private dust = new Dust();

  private cam = { x: 0, y: 0 };
  private shakeA = 0;
  private shakeX = 0;
  private shakeY = 0;
  private flashA = 0;
  private fadeA = 0;
  private freeze = 0;
  private timeScale = 1;
  private meter = 1;
  private compose: { op: Op; t: number } | null = null;
  private lastExpr: { s: string; t: number } | null = null;
  private equateSeq: { targets: Enemy[]; boss: boolean; t: number; i: number } | null = null;
  private equateCd = 0;
  private roomTitle = { s: '', t: 99 };
  private bossTitleT = 99;
  private time = 0;
  private modeT = 0;
  private pickup = '';

  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private vignette: HTMLCanvasElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private input: Input,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.light.width = VIEW_W / 2;
    this.light.height = VIEW_H / 2;
    this.lctx = this.light.getContext('2d')!;
    this.vignette = document.createElement('canvas');
    this.vignette.width = VIEW_W;
    this.vignette.height = VIEW_H;
    const v = this.vignette.getContext('2d')!;
    const g = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.75)');
    v.fillStyle = g;
    v.fillRect(0, 0, VIEW_W, VIEW_H);
    this.hasSave = loadSave() !== null;
    this.menu = this.hasSave ? 1 : 0;
    this.loadRoom('void');
  }

  private has(g: string): boolean {
    return this.save.has.includes(g);
  }

  private learn(g: string): void {
    if (!this.has(g)) this.save.has.push(g);
  }

  // ————————————————————————————————————————— rooms

  private loadRoom(id: string): void {
    const def = ROOM_BY_ID[id];
    this.room = new Room(def);
    this.enemies = [];
    this.shots = [];
    this.shrines = [];
    this.texts = [];
    this.motes = [];
    this.boss = null;
    this.compose = null;
    this.equateSeq = null;
    this.fx.clear();
    for (const pl of this.room.placed) {
      const s = pl.spec;
      const fx = pl.tx * TILE + TILE / 2;
      const fy = (pl.ty + 1) * TILE;
      switch (s.k) {
        case 'walker':
        case 'drifter':
        case 'emitter':
        case 'bound': {
          const e = makeEnemy(s.k, s.n, pl.key, pl.tx, pl.ty);
          e.appear = 1;
          this.enemies.push(e);
          break;
        }
        case 'gate':
        case 'door': {
          if (this.save.opened.includes(pl.key)) break;
          const e = new Enemy(s.k, s.n, pl.key);
          const w = s.k === 'gate' ? s.w : 1;
          e.x = pl.tx * TILE;
          e.y = pl.ty * TILE;
          e.w = w * TILE;
          e.h = s.h * TILE;
          e.appear = 1;
          for (let y = 0; y < s.h; y++) for (let x = 0; x < w; x++) e.tiles.push([pl.tx + x, pl.ty + y]);
          for (const [x, y] of e.tiles) this.room.setTile(x, y, SOLID, true);
          this.enemies.push(e);
          break;
        }
        case 'shrine':
          if (!this.save.taken.includes(pl.key)) this.shrines.push({ key: pl.key, give: s.give, x: fx, y: fy, t: Math.random() * 6 });
          break;
        case 'text':
          this.texts.push({ x: fx, y: pl.ty * TILE + TILE / 2, s: s.s, a: 0 });
          break;
        case 'boss':
          if (!this.save.bossDone) this.boss = new Zero(this.bossHost(), fx, pl.ty * TILE + TILE / 2);
          break;
      }
    }
    this.lamps = this.room.lamps.map((l) => ({ ...l, near: true }));
    this.roomTitle = { s: def.name, t: 0 };
    this.sfx.setDrone(this.boss ? 'none' : 'room');
    this.fadeA = 1;
  }

  private snapCamera(): void {
    const t = this.cameraTarget();
    this.cam.x = t.x;
    this.cam.y = t.y;
  }

  private cameraTarget(): { x: number; y: number } {
    const p = this.player;
    const r = this.room;
    const tx = p.cx - VIEW_W / 2 + p.facing * 36;
    const ty = p.cy - VIEW_H / 2 - 16;
    return {
      x: r.pw <= VIEW_W ? (r.pw - VIEW_W) / 2 : clamp(tx, 0, r.pw - VIEW_W),
      y: r.ph <= VIEW_H ? (r.ph - VIEW_H) / 2 : clamp(ty, 0, r.ph - VIEW_H),
    };
  }

  private transition(side: Side): void {
    const p = this.player;
    const r = this.room;
    const along = side === 'W' || side === 'E' ? Math.floor((p.y + p.h - 1) / TILE) : Math.floor(p.cx / TILE);
    const letter = r.exitNear(side, along);
    const target = letter ? ROOMS.find((d) => d.id !== r.def.id && d.map.some((row) => row.includes(letter))) : undefined;
    if (!letter || !target) {
      p.x = clamp(p.x, 0, r.pw - p.w);
      p.y = clamp(p.y, 0, r.ph - p.h);
      return;
    }
    const from = r.exitCells(letter)!;
    this.loadRoom(target.id);
    const to = this.room.exitCells(letter)!;
    const first = to.cells[0];
    const last = to.cells[to.cells.length - 1];
    if (side === 'E' || side === 'W') {
      const rel = p.y + p.h - from.cells[0] * TILE;
      const feet = clamp(first * TILE + rel, first * TILE + p.h, (last + 1) * TILE);
      p.y = feet - p.h;
      p.x = side === 'E' ? 2 : this.room.pw - p.w - 2;
    } else {
      const rel = p.x - from.cells[0] * TILE;
      p.x = clamp(first * TILE + rel, first * TILE + 1, (last + 1) * TILE - p.w - 1);
      if (side === 'N') {
        p.y = this.room.ph - p.h - 2;
        p.vy = Math.min(p.vy, -780);
      } else p.y = 2;
    }
    this.fadeA = 0.85;
    this.snapCamera();
  }

  // ————————————————————————————————————————— lifecycle

  private newGame(): void {
    this.save = freshSave();
    writeSave(this.save);
    this.hasSave = true;
    this.loadRoom('void');
    const sp = this.room.spawn!;
    this.resetPlayer();
    this.player.place(sp.x, sp.y);
    this.player.facing = 1;
    this.snapCamera();
    this.setMode('chapter');
  }

  private continueGame(): void {
    this.save = loadSave() ?? freshSave();
    this.respawn();
    this.setMode('play');
  }

  private resetPlayer(): void {
    const p = this.player;
    p.hp = p.maxHp;
    p.invuln = 0;
    p.vx = p.vy = 0;
    p.strikeT = -1;
    p.value = this.has('1') ? 1 : null;
  }

  private respawn(): void {
    const lamp = this.save.lamp;
    if (lamp) {
      this.loadRoom(lamp.room);
      this.resetPlayer();
      this.player.place(lamp.x, lamp.y);
    } else {
      this.loadRoom('void');
      this.resetPlayer();
      const sp = this.room.spawn!;
      this.player.place(sp.x, sp.y);
    }
    this.snapCamera();
    this.fadeA = 1;
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.modeT = 0;
  }

  // ————————————————————————————————————————— effects

  private shake(a: number): void {
    this.shakeA = Math.max(this.shakeA, a);
  }
  private flash(a: number): void {
    this.flashA = Math.max(this.flashA, a);
  }
  private hitstop(t: number): void {
    this.freeze = Math.max(this.freeze, t);
  }

  private bossHost(): BossHost {
    const g = this;
    return {
      get player() {
        return g.player;
      },
      fx: g.fx,
      sfx: g.sfx,
      floorY: FLOOR_ZERO,
      get arenaW() {
        return g.room.pw;
      },
      shoot: (x, y, vx, vy) => g.shots.push({ x, y, vx, vy, r: 4, life: 5, dead: false }),
      shake: (a) => g.shake(a),
      flash: (a) => g.flash(a),
      hitstop: (t) => g.hitstop(t),
      hurtPlayer: (fromX) => g.hurtPlayer(fromX),
      nullifyPlayer: () => {
        if (g.player.value === 0) return;
        g.player.value = 0;
        g.player.valuePop = 1;
        g.compose = null;
        g.sfx.nullify();
        g.fx.text(g.player.cx, g.player.y - 22, '× 0', { size: 18 });
      },
      onCrack: (x, y) => {
        g.motes.push({ x: x - 30, y, t: 0, dead: false }, { x: x + 30, y, t: 0, dead: false });
      },
      onIntro: () => {
        g.sealExit(true);
        g.sfx.setDrone('boss');
        g.bossTitleT = 0;
      },
      onResolved: () => {
        g.save.bossDone = true;
        g.learn('0');
        writeSave(g.save);
        g.sealExit(false);
        g.sfx.setDrone('none');
        g.setMode('end');
      },
    };
  }

  private sealExit(on: boolean): void {
    const ex = this.room.exitCells('I');
    if (!ex) return;
    for (const y of ex.cells) this.room.setTile(0, y, on ? SOLID : EMPTY);
  }

  private hurtPlayer(fromX: number): void {
    const p = this.player;
    if (p.invuln > 0 || this.mode !== 'play') return;
    p.hp -= 1;
    p.invuln = 1.1;
    p.vx = Math.sign(p.cx - fromX || 1) * 260;
    p.vy = -320;
    p.strikeT = -1;
    this.sfx.hurt();
    this.shake(8);
    this.hitstop(0.12);
    this.fx.burst(p.cx, p.cy, 18, { speed: 260, life: 0.5, line: true });
    if (p.hp <= 0) {
      this.fx.dissolve(p.cx, p.cy, 16, 30, 50);
      this.sfx.setDrone('none');
      this.setMode('dead');
    }
  }

  // ————————————————————————————————————————— numbers

  private float(s: string, x = this.player.cx, y = this.player.y - 22, size = 16): void {
    this.fx.text(x, y, s, { size, life: 1.3 });
  }

  private setValue(v: number, expr?: string): void {
    this.player.value = v;
    this.player.valuePop = 1;
    this.sfx.composed(v);
    this.lastExpr = expr ? { s: expr, t: 0 } : null;
  }

  private onDigit(d: number): void {
    const ds = String(d);
    const p = this.player;
    if (!this.has(ds) || p.value === null) {
      this.sfx.refuse();
      this.float('?');
      this.compose = null;
      return;
    }
    const c = this.compose;
    this.compose = null;
    if (!c) {
      this.setValue(d);
      return;
    }
    const v = p.value;
    let r: number | null = null;
    let why = '';
    switch (c.op) {
      case '+':
        r = v + d;
        break;
      case '−':
        r = v - d;
        if (r < 1 && !this.has('0')) {
          why = `${v} − ${d} < 1`;
          r = null;
        } else if (r < 0) {
          why = `${v} − ${d} < 0`;
          r = null;
        }
        break;
      case '×':
        r = v * d;
        break;
      case '÷':
        if (d === 0) why = `${v} ÷ 0 is undefined`;
        else if (v % d !== 0) why = `${d} ∤ ${v}`;
        else r = v / d;
        break;
    }
    if (r !== null && r > 999) {
      why = 'too large to hold';
      r = null;
    }
    if (r === null) {
      this.sfx.refuse();
      this.float(why);
      return;
    }
    this.setValue(r, `${v} ${c.op} ${d}`);
  }

  private onOp(op: Op): void {
    if (!this.has(op) || this.player.value === null) {
      this.sfx.refuse();
      this.float('?');
      return;
    }
    this.compose = { op, t: 0 };
    this.sfx.compose();
  }

  private onEquate(): void {
    if (!this.has('=') || this.player.value === null) {
      this.sfx.refuse();
      return;
    }
    if (this.boss?.tryResolve()) return;
    if (this.equateCd > 0 || this.equateSeq) return;
    const p = this.player;
    const v = p.value!;
    for (const e of this.enemies) {
      if (e.kind !== 'door' || e.dead) continue;
      if (Math.abs(e.cx - p.cx) < 120 && Math.abs(e.cy - p.cy) < 120) {
        if (e.n === v) this.openDoor(e);
        else {
          this.sfx.refuse();
          this.float(`${v} ≠ ${e.n}`, e.cx, e.y - 40, 20);
        }
        return;
      }
    }
    const view = { x: this.cam.x, y: this.cam.y, w: VIEW_W, h: VIEW_H };
    const targets = this.enemies.filter((e) => !e.dead && e.kind !== 'door' && e.n === v && e.appear >= 1 && overlaps(view, e.hitbox()));
    const bossHit = !!this.boss && this.boss.vulnerable && this.boss.n === v;
    if (!targets.length && !bossHit) {
      this.sfx.refuse();
      this.float('≠', p.cx, p.y - 24, 22);
      return;
    }
    this.equateSeq = { targets, boss: bossHit, t: 0, i: 0 };
    this.equateCd = 1.2;
    this.compose = null;
  }

  private updateEquate(dt: number): void {
    const s = this.equateSeq!;
    s.t += dt;
    const total = s.targets.length + (s.boss ? 1 : 0);
    while (s.i < total && s.t > 0.3 + s.i * 0.16) {
      if (s.i < s.targets.length) {
        const e = s.targets[s.i];
        this.sfx.equate(s.i);
        if (e.kind === 'gate') this.openGate(e);
        else this.kill(e, true);
      } else if (this.boss) {
        this.boss.struck(this.player.value ?? 0);
      }
      this.shake(4);
      s.i++;
    }
    if (s.t > 0.5 + total * 0.16) {
      this.equateSeq = null;
      this.meter = Math.min(1, this.meter + 0.3);
    }
  }

  private kill(e: Enemy, quiet = false): void {
    e.dead = true;
    this.fx.dissolve(e.cx, e.cy, e.w, e.h, 20 + e.w);
    this.fx.burst(e.cx, e.cy, 10, { speed: 220, life: 0.4, line: true });
    if (!quiet) this.sfx.kill(this.player.value ?? 1);
    this.hitstop(0.08);
    this.shake(3);
    if (this.player.hp < this.player.maxHp && Math.random() < 0.3) this.motes.push({ x: e.cx, y: e.cy, t: 0, dead: false });
  }

  private openGate(e: Enemy): void {
    e.dead = true;
    for (const [x, y] of e.tiles) this.room.setTile(x, y, EMPTY);
    if (!this.save.opened.includes(e.key)) this.save.opened.push(e.key);
    writeSave(this.save);
    this.fx.burst(e.cx, e.cy, 40, { speed: 300, life: 0.9, line: true });
    this.fx.dissolve(e.cx, e.cy, e.w, e.h, 60);
    this.sfx.door();
    this.shake(8);
    this.flash(0.3);
  }

  private openDoor(e: Enemy): void {
    this.openGate(e);
    this.hitstop(0.25);
    this.float(`${e.n} = ${e.n}`, e.cx, e.y - 40, 24);
  }

  /** Division: the bound break into equal shares. */
  private split(e: Enemy, v: number): void {
    const each = e.n / v;
    this.float(`${e.n} ÷ ${v} = ${each}`, e.cx, e.y - 18, 18);
    if (e.kind === 'gate') this.openGate(e);
    else {
      e.dead = true;
      this.fx.dissolve(e.cx, e.cy, e.w, e.h, 30);
    }
    const bottom = e.y + e.h;
    for (let i = 0; i < v; i++) {
      const c = new Enemy('walker', each, `${e.key}/${i}`);
      const off = i - (v - 1) / 2;
      c.x = e.cx - c.w / 2 + off * 6;
      c.y = bottom - c.h - 2;
      c.vx = off * 70 + (Math.random() - 0.5) * 30;
      c.vy = -280 - Math.random() * 160;
      c.stunT = 0.6;
      c.appear = 0.3;
      this.enemies.push(c);
    }
    this.sfx.kill(v);
    this.hitstop(0.14);
    this.shake(6);
    this.flash(0.2);
  }

  private strike(e: Enemy): void {
    const p = this.player;
    const v = p.value ?? 0;
    const blocked = (msg: string) => {
      this.sfx.blocked();
      this.float(msg, e.cx, e.y - 12, 16);
      p.recoil(e.cx, 190);
      e.knock(p.cx, 90);
      e.hurtT = 0.05;
      this.hitstop(0.04);
    };
    if (e.kind === 'door') return blocked(`x = ${e.n}`);
    if (e.armored) {
      if (!this.has('÷')) return blocked('· · ·');
      if (v > 1 && v <= e.n && e.n % v === 0) return this.split(e, v);
      return blocked(v <= 1 ? `${e.n} ÷ ${v} = ${e.n}` : v > e.n ? `${v} > ${e.n}` : `${v} ∤ ${e.n}`);
    }
    if (v === 0) return blocked('− 0');
    if (v > e.n) return blocked(`${v} > ${e.n}`);
    e.n -= v;
    e.hurtT = 0.12;
    e.popT = 1;
    this.meter = Math.min(1, this.meter + 0.07);
    if (e.n === 0) {
      this.fx.text(e.cx, e.y - 10, `${v} − ${v} = 0`, { size: 14, alpha: 0.6, life: 1.4 });
      this.kill(e);
    } else {
      this.fx.text(e.cx, e.y - 10, `− ${v}`, { size: 14, alpha: 0.5 });
      this.sfx.hit(v);
      this.hitstop(0.05);
      this.shake(2);
      e.knock(p.cx, 210);
      e.resize();
    }
  }

  // ————————————————————————————————————————— update

  frame(dt: number): void {
    this.time += dt;
    this.modeT += dt;
    const events = this.input.drain();
    switch (this.mode) {
      case 'title':
        this.updateTitle(events);
        break;
      case 'chapter':
        if (this.modeT > 1.2 && events.length) this.modeT = Math.max(this.modeT, 5.4);
        if (this.modeT > 6.2) {
          this.setMode('play');
          this.fadeA = 1;
        }
        break;
      case 'play':
        this.updatePlay(dt, events);
        break;
      case 'pickup':
        if (this.modeT > 1.6 && events.length) {
          this.setMode('play');
          this.input.drain();
        }
        this.fx.update(dt);
        break;
      case 'pause':
        if (events.some((e) => e.k === 'pause' || e.k === 'jump' || e.k === 'equate')) this.setMode('play');
        break;
      case 'dead':
        this.fx.update(dt);
        if (this.modeT > 3.4) {
          this.respawn();
          this.setMode('play');
        }
        break;
      case 'end':
        if (this.modeT > 10 && events.length) {
          this.hasSave = true;
          this.menu = 1;
          this.setMode('title');
        }
        break;
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.fadeA = Math.max(0, this.fadeA - dt * 2.2);
  }

  private updateTitle(events: Ev[]): void {
    const items = this.hasSave ? 2 : 1;
    for (const e of events) {
      if (e.k === 'up' || e.k === 'down') this.menu = (this.menu + 1) % items;
      if (e.k === 'jump' || e.k === 'equate' || e.k === 'strike') {
        if (this.menu === 1 && this.hasSave) this.continueGame();
        else this.newGame();
        return;
      }
    }
  }

  private updatePlay(realDt: number, events: Ev[]): void {
    const p = this.player;
    for (const e of events) {
      switch (e.k) {
        case 'pause':
          this.setMode('pause');
          return;
        case 'jump':
          p.queueJump();
          break;
        case 'dash':
          p.wantDash = true;
          break;
        case 'strike':
          p.wantStrike = true;
          break;
        case 'op':
          this.onOp(e.op);
          break;
        case 'digit':
          this.onDigit(e.d);
          break;
        case 'equate':
          this.onEquate();
          break;
        default:
          break;
      }
    }

    // time: composing a number slows the world
    if (this.compose) {
      this.compose.t += realDt;
      if (this.compose.t > 1.9) this.compose = null;
    }
    const wantSlow = !!this.compose || this.input.down('focus');
    const slow = wantSlow && this.meter > 0;
    if (slow) this.meter = Math.max(0, this.meter - realDt * 0.42);
    else this.meter = Math.min(1, this.meter + realDt * 0.09);
    this.timeScale += ((slow ? 0.28 : 1) - this.timeScale) * damp(14, realDt);
    if (this.lastExpr) {
      this.lastExpr.t += realDt;
      if (this.lastExpr.t > 1.6) this.lastExpr = null;
    }
    this.equateCd = Math.max(0, this.equateCd - realDt);
    this.roomTitle.t += realDt;
    this.bossTitleT += realDt;

    this.shakeA *= Math.exp(-realDt * 9);
    this.shakeX = (Math.random() - 0.5) * this.shakeA * 2;
    this.shakeY = (Math.random() - 0.5) * this.shakeA * 2;

    if (this.equateSeq) {
      this.updateEquate(realDt);
      this.fx.update(realDt * 0.5);
      return;
    }
    if (this.freeze > 0) {
      this.freeze -= realDt;
      return;
    }

    const dt = realDt * this.timeScale;
    p.update(dt, this.input, this.room, this.sfx);

    // leaving the room
    if (p.cx < 0) return this.transition('W');
    if (p.cx > this.room.pw) return this.transition('E');
    if (p.cy < 0) return this.transition('N');
    if (p.cy > this.room.ph) return this.transition('S');

    const world: World = {
      room: this.room,
      px: p.cx,
      py: p.cy,
      shoot: (x, y, vx, vy) => {
        this.shots.push({ x, y, vx, vy, r: 4, life: 4, dead: false });
        this.sfx.fire();
      },
    };
    for (const e of this.enemies) e.update(dt, world);
    this.boss?.update(dt);

    for (const s of this.shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || this.room.solidAtPx(s.x, s.y)) {
        s.dead = true;
        this.fx.burst(s.x, s.y, 4, { speed: 80, life: 0.3 });
      }
    }

    // the strike
    const box = p.strikeBox();
    if (box) {
      let struck = false;
      for (const e of this.enemies) {
        if (e.dead || p.struck.has(e) || e.appear < 1) continue;
        if (!overlaps(box, e.hitbox())) continue;
        p.struck.add(e);
        this.strike(e);
        struck = true;
      }
      for (const s of this.shots) {
        if (s.dead || !rectCircle(box, s.x, s.y, s.r + 5)) continue;
        s.dead = true;
        struck = true;
        this.fx.burst(s.x, s.y, 8, { speed: 160, life: 0.35, line: true });
        this.sfx.hit(1);
        this.meter = Math.min(1, this.meter + 0.04);
      }
      const boss = this.boss;
      if (boss && !p.struck.has(boss) && boss.touches(box)) {
        p.struck.add(boss);
        const msg = boss.struck(p.value ?? 0);
        if (msg) {
          this.float(msg, boss.x, boss.y - boss.r - 18, 18);
          p.recoil(boss.x, 220);
        }
        struck = true;
      }
      if (struck && p.strikeDir === 'down') p.bounce();
    }

    // being struck
    if (p.invuln <= 0 && !p.dashing) {
      const body = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 2 };
      for (const e of this.enemies) {
        if (!e.dead && e.harmful && overlaps(body, e.hitbox())) {
          this.hurtPlayer(e.cx);
          break;
        }
      }
      for (const s of this.shots) {
        if (!s.dead && rectCircle(body, s.x, s.y, s.r)) {
          s.dead = true;
          this.hurtPlayer(s.x);
          break;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.shots = this.shots.filter((s) => !s.dead);

    // motes of light heal
    for (const m of this.motes) {
      m.t += dt;
      const dx = p.cx - m.x;
      const dy = p.cy - m.y;
      const d = Math.hypot(dx, dy);
      if (d < 80) {
        m.x += (dx / d) * 220 * dt;
        m.y += (dy / d) * 220 * dt;
      } else m.y -= Math.sin(m.t * 2) * 6 * dt;
      if (d < 14) {
        m.dead = true;
        if (p.hp < p.maxHp) p.hp++;
        this.sfx.tone(880, 0.6, { vol: 0.06, wet: 0.6 });
      }
      if (m.t > 12) m.dead = true;
    }
    this.motes = this.motes.filter((m) => !m.dead);

    // shrines
    for (const s of this.shrines) {
      s.t += dt;
      if (Math.abs(p.cx - s.x) < 22 && p.y < s.y && p.y + p.h > s.y - 70) {
        this.take(s);
        break;
      }
    }

    // lamps
    for (const l of this.lamps) {
      const near = Math.abs(p.cx - l.x) < 26 && Math.abs(p.y + p.h - l.y) < 40;
      if (near && !l.near) {
        p.hp = p.maxHp;
        this.save.lamp = { room: this.room.def.id, x: l.x, y: l.y };
        writeSave(this.save);
        this.sfx.lamp();
        this.fx.converge(l.x, l.y - 34, 24, 70, 0.8);
      }
      l.near = near;
    }

    // inscriptions surface when near
    for (const t of this.texts) {
      const near = Math.abs(p.cx - t.x) < 230 && Math.abs(p.cy - t.y) < 200;
      t.a = clamp(t.a + (near ? 0.7 : -0.5) * dt, 0, 1);
    }

    this.fx.update(dt);

    const target = this.cameraTarget();
    this.cam.x += (target.x - this.cam.x) * damp(6, realDt);
    this.cam.y += (target.y - this.cam.y) * damp(6, realDt);
  }

  private take(s: Shrine): void {
    this.shrines = this.shrines.filter((x) => x !== s);
    this.learn(s.give);
    if (!this.save.taken.includes(s.key)) this.save.taken.push(s.key);
    writeSave(this.save);
    if (s.give === '1') this.player.value = 1;
    this.player.hp = this.player.maxHp;
    this.compose = null;
    this.pickup = s.give;
    this.sfx.pickup();
    this.flash(1);
    this.fx.converge(this.player.cx, this.player.cy, 30, 120, 0.7);
    this.setMode('pickup');
  }

  // ————————————————————————————————————————— render

  render(): void {
    const { ctx, canvas } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    const ox = (canvas.width - VIEW_W * scale) / 2;
    const oy = (canvas.height - VIEW_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW_W, VIEW_H);
    ctx.clip();

    if (this.mode === 'title') this.drawTitle();
    else if (this.mode === 'chapter') this.drawChapter();
    else if (this.mode === 'end') this.drawEnd();
    else {
      this.drawWorld();
      this.drawHud();
      if (this.mode === 'pickup') this.drawPickup();
      if (this.mode === 'pause') this.drawPause();
      if (this.mode === 'dead') this.drawDead();
    }

    if (this.flashA > 0) {
      ctx.globalAlpha = this.flashA * 0.85;
      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.fadeA > 0) {
      ctx.globalAlpha = this.fadeA;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawWorld(): void {
    const ctx = this.ctx;
    const r = this.room;
    const camX = this.cam.x - this.shakeX;
    const camY = this.cam.y - this.shakeY;
    ctx.save();
    ctx.translate(-camX, -camY);

    ctx.fillStyle = AIR;
    ctx.fillRect(0, 0, r.pw, r.ph);

    // graph paper
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.07;
    const gx0 = Math.max(0, Math.floor(camX / TILE));
    const gy0 = Math.max(0, Math.floor(camY / TILE));
    for (let gx = gx0; gx <= gx0 + VIEW_W / TILE + 1; gx++) {
      for (let gy = gy0; gy <= gy0 + VIEW_H / TILE + 1; gy++) ctx.fillRect(gx * TILE - 0.75, gy * TILE - 0.75, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#000';
    r.forEachSolid((x, y) => {
      const px = x * TILE;
      const py = y * TILE;
      if (px > camX + VIEW_W || px + TILE < camX || py > camY + VIEW_H || py + TILE < camY) return;
      ctx.fillRect(px - 0.5, py - 0.5, TILE + 1, TILE + 1);
    });
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.stroke(r.edges());
    ctx.globalAlpha = 0.65;
    ctx.stroke(r.platforms());
    ctx.globalAlpha = 1;

    // inscriptions
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = serif(19);
    ctx.fillStyle = INK;
    for (const t of this.texts) {
      if (t.a <= 0) continue;
      ctx.globalAlpha = t.a * 0.72;
      ctx.fillText(t.s, t.x, t.y + (1 - t.a) * 6);
    }
    ctx.globalAlpha = 1;

    // lamps
    for (const l of this.lamps) {
      const lit = this.save.lamp?.room === r.def.id && this.save.lamp.x === l.x;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y - 30);
      ctx.moveTo(l.x - 5, l.y);
      ctx.lineTo(l.x + 5, l.y);
      ctx.stroke();
      ctx.globalAlpha = lit ? 1 : 0.45;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(l.x, l.y - 34, lit ? 3.5 + Math.sin(this.time * 2) * 0.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // shrines: a glyph waiting above a thin stand
    for (const s of this.shrines) {
      const small = /[2-9]/.test(s.give);
      const gy = s.y - (small ? 42 : 56) + Math.sin(s.t * 1.6) * 3;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y - (small ? 16 : 24));
      ctx.moveTo(s.x - 8, s.y - (small ? 16 : 24));
      ctx.lineTo(s.x + 8, s.y - (small ? 16 : 24));
      ctx.stroke();
      ctx.globalAlpha = 0.2 + 0.1 * Math.sin(s.t * 1.6);
      ctx.beginPath();
      ctx.arc(s.x, gy, small ? 16 : 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = INK;
      ctx.font = serif(small ? 24 : 34, { weight: 500 });
      ctx.fillText(s.give, s.x, gy + 1);
    }

    for (const m of this.motes) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(m.t * 6);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const e of this.enemies) e.draw(this.ctx);
    this.boss?.draw(ctx);

    ctx.fillStyle = INK;
    for (const s of this.shots) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(s.x - s.vx * 0.03, s.y - s.vy * 0.03, s.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (this.mode !== 'dead') this.player.draw(ctx, this.time);

    // slowed time: a ring of attention
    if (this.timeScale < 0.95 && this.mode === 'play') {
      const k = (1 - this.timeScale) / 0.72;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.22 * k;
      ctx.beginPath();
      ctx.arc(this.player.cx, this.player.cy, 40 + (1 - k) * 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // equate: lines of sameness
    if (this.equateSeq) {
      const s = this.equateSeq;
      const p = this.player;
      ctx.strokeStyle = INK;
      ctx.fillStyle = INK;
      ctx.lineWidth = 1;
      const k = clamp(s.t / 0.25, 0, 1);
      const draw = (x: number, y: number) => {
        ctx.globalAlpha = 0.6 * k;
        ctx.beginPath();
        ctx.moveTo(p.cx, p.cy);
        ctx.lineTo(p.cx + (x - p.cx) * k, p.cy + (y - p.cy) * k);
        ctx.stroke();
        ctx.globalAlpha = k;
        ctx.font = serif(18);
        ctx.fillText('=', (p.cx + x) / 2, (p.cy + y) / 2 - 10);
      };
      s.targets.forEach((e, i) => {
        if (i >= s.i) draw(e.cx, e.cy);
      });
      if (s.boss && this.boss && s.i <= s.targets.length) draw(this.boss.x, this.boss.y);
      ctx.globalAlpha = 1;
    }

    this.fx.draw(ctx);
    ctx.restore();

    this.dust.draw(ctx, camX, camY, VIEW_W, VIEW_H, this.time);
    this.drawLight(camX, camY);
    ctx.drawImage(this.vignette, 0, 0);
  }

  private drawLight(camX: number, camY: number): void {
    const l = this.lctx;
    const dark = this.room.def.dark ?? 0.84;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.light.width, this.light.height);
    l.fillStyle = `rgba(0,0,0,${dark})`;
    l.fillRect(0, 0, this.light.width, this.light.height);
    l.globalCompositeOperation = 'destination-out';
    l.setTransform(0.5, 0, 0, 0.5, -camX * 0.5, -camY * 0.5);
    const add = (x: number, y: number, r: number, a: number) => {
      if (x + r < camX || x - r > camX + VIEW_W || y + r < camY || y - r > camY + VIEW_H) return;
      const g = l.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.5, `rgba(0,0,0,${a * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const p = this.player;
    if (this.mode !== 'dead') add(p.cx, p.cy, 340, 1);
    for (const lamp of this.lamps) add(lamp.x, lamp.y - 34, 230, 0.85);
    for (const s of this.shrines) add(s.x, s.y - 50, 200, 0.95);
    for (const e of this.enemies) add(e.cx, e.cy, e.solid ? 120 : 80, 0.55);
    for (const s of this.shots) add(s.x, s.y, 50, 0.6);
    for (const m of this.motes) add(m.x, m.y, 50, 0.6);
    for (const t of this.texts) if (t.a > 0) add(t.x, t.y, 200, t.a * 0.6);
    this.boss?.lights(add);
    this.ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
  }

  private drawHud(): void {
    const ctx = this.ctx;
    const p = this.player;
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;

    // what remains of x
    for (let i = 0; i < p.maxHp; i++) {
      const x = 40 + i * 17;
      ctx.globalAlpha = i < p.hp ? 0.9 : 0.25;
      ctx.beginPath();
      ctx.arc(x, 36, 4.5, 0, Math.PI * 2);
      if (i < p.hp) ctx.fill();
      else ctx.stroke();
    }

    // x = …
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = VIEW_W / 2;
    const by = VIEW_H - 46;
    let s: string;
    if (p.value === null) s = 'x';
    else if (this.compose) s = `x = ${p.value} ${this.compose.op} ${Math.floor(this.time * 3) % 2 ? '_' : ' '}`;
    else s = `x = ${p.value}`;
    ctx.globalAlpha = 0.9;
    ctx.font = serif(30 + p.valuePop * 6);
    ctx.fillText(s, cx, by);
    if (this.lastExpr) {
      ctx.globalAlpha = 0.45 * (1 - this.lastExpr.t / 1.6);
      ctx.font = serif(18);
      ctx.fillText(this.lastExpr.s, cx, by - 30 - this.lastExpr.t * 8);
    }
    // Δt: how long time can be held
    if (this.meter < 0.999 || this.timeScale < 0.95) {
      ctx.globalAlpha = 0.18;
      ctx.fillRect(cx - 60, by + 22, 120, 1);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(cx - 60 * this.meter, by + 22, 120 * this.meter, 1.5);
    }

    // what has been learned
    ctx.font = serif(15, { italic: false, weight: 500 });
    const known = DIGITS.filter((d) => d !== '0' || this.has('0'));
    known.forEach((d, i) => {
      ctx.globalAlpha = this.has(d) ? 0.55 : 0.12;
      ctx.fillText(this.has(d) ? d : '·', VIEW_W - 40 - (known.length - 1 - i) * 15, VIEW_H - 50);
    });
    OPS.forEach((o, i) => {
      ctx.globalAlpha = this.has(o) ? 0.55 : 0.12;
      ctx.fillText(this.has(o) ? o : '·', VIEW_W - 40 - (OPS.length - 1 - i) * 18, VIEW_H - 28);
    });

    // where we are
    const rt = this.roomTitle;
    if (rt.s && rt.t < 4) {
      ctx.globalAlpha = 0.5 * Math.min(1, rt.t / 0.8) * Math.min(1, (4 - rt.t) / 1);
      ctx.font = serif(14, { italic: false, weight: 500 });
      spaced(ctx, rt.s.toUpperCase(), cx, 38, 6);
    }
    if (this.bossTitleT < 5) {
      const t = this.bossTitleT;
      ctx.globalAlpha = Math.min(1, Math.max(0, (t - 1.2) / 0.8)) * Math.min(1, (5 - t) / 1);
      ctx.font = serif(22, { italic: false, weight: 500 });
      spaced(ctx, 'ZERO', cx, 70, 18);
      ctx.globalAlpha *= 0.6;
      ctx.font = serif(16);
      ctx.fillText('the number that cannot be lessened', cx, 102);
    }
    ctx.globalAlpha = 1;
  }

  private drawPickup(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    const info = GLYPHS[this.pickup];
    const k = clamp(t / 0.8, 0, 1);
    ctx.globalAlpha = 0.88 * k;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const small = /[2-9]/.test(this.pickup);
    ctx.globalAlpha = clamp((t - 0.2) / 1, 0, 1);
    ctx.font = serif((small ? 120 : 160) + (1 - k) * 30, { weight: 500 });
    ctx.fillText(this.pickup, VIEW_W / 2, 200);
    if (!info) return;
    ctx.globalAlpha = clamp((t - 0.8) / 0.8, 0, 1) * 0.6;
    ctx.font = serif(14, { italic: false, weight: 500 });
    spaced(ctx, info.name.toUpperCase(), VIEW_W / 2, 318, 8);
    ctx.globalAlpha = clamp((t - 1.1) / 0.8, 0, 1) * 0.9;
    ctx.font = serif(26);
    ctx.fillText(info.line, VIEW_W / 2, 360);
    if (info.hint) {
      ctx.globalAlpha = clamp((t - 1.6) / 0.8, 0, 1) * 0.55;
      ctx.font = serif(16, { italic: false, weight: 500 });
      info.hint.split('\n').forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 418 + i * 26));
    }
    if (t > 1.6) {
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(this.time * 3);
      ctx.font = serif(16);
      ctx.fillText('—', VIEW_W / 2, 494);
    }
    ctx.globalAlpha = 1;
  }

  private drawPause(): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6;
    ctx.font = serif(14, { italic: false, weight: 500 });
    spaced(ctx, 'STILL', VIEW_W / 2, 86, 10);
    const rows: [string, string][] = [
      ['move', 'A  D'],
      ['aim', 'W  S   (S + Space falls through)'],
      ['jump', 'Space'],
      ['dash', 'Shift'],
      ['strike', 'J   ·   Num 0'],
      ['hold a digit', '1 – 9'],
      ['+   −   ×   ÷', 'then a digit      U I O P   ·   numpad'],
      ['equate', 'Enter'],
      ['slow time', 'Tab   ·   L   ·   Num .'],
      ['return', 'Esc'],
    ];
    rows.forEach(([a, b], i) => {
      const y = 140 + i * 30;
      ctx.globalAlpha = 0.45;
      ctx.font = serif(18);
      ctx.textAlign = 'right';
      ctx.fillText(a, VIEW_W / 2 - 24, y);
      ctx.globalAlpha = 0.85;
      ctx.font = serif(17, { italic: false, weight: 500 });
      ctx.textAlign = 'left';
      ctx.fillText(b, VIEW_W / 2 + 24, y);
    });
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.4;
    ctx.font = serif(16);
    ctx.fillText('You cannot take more than there is.   The bound can only be shared.', VIEW_W / 2, 470);
    ctx.globalAlpha = 1;
  }

  private drawDead(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    ctx.globalAlpha = clamp((t - 0.6) / 1.2, 0, 1) * 0.95;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = clamp((t - 1) / 0.8, 0, 1) * clamp((3.3 - t) / 0.6, 0, 1) * 0.8;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = serif(30);
    ctx.fillText('x is undefined.', VIEW_W / 2, VIEW_H / 2);
    ctx.globalAlpha = 1;
  }

  private drawNumberLine(y: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    const off = (this.time * 8) % 60;
    for (let x = -60 + off; x < VIEW_W + 60; x += 60) {
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawTitle(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.dust.draw(ctx, 0, 0, VIEW_W, VIEW_H, this.time);
    this.drawNumberLine(300, 0.12);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fade = clamp(this.modeT / 2, 0, 1);
    ctx.globalAlpha = fade * (0.85 + 0.15 * Math.sin(this.time * 1.3));
    ctx.font = serif(170, { weight: 400 });
    ctx.fillText('x', VIEW_W / 2, 200);
    ctx.globalAlpha = fade * 0.45;
    ctx.font = serif(20);
    ctx.fillText('solve for x', VIEW_W / 2, 330);

    const items = this.hasSave ? ['begin anew', 'continue'] : ['begin'];
    items.forEach((it, i) => {
      const sel = i === this.menu;
      ctx.globalAlpha = fade * (sel ? 0.95 : 0.3);
      ctx.font = serif(22);
      ctx.fillText(sel ? `—  ${it}  —` : it, VIEW_W / 2, 395 + i * 36);
    });
    ctx.globalAlpha = fade * 0.25;
    ctx.font = serif(13, { italic: false, weight: 500 });
    spaced(ctx, 'CHAPTER I  ·  ARITHMETIC  ·  PROTOTYPE', VIEW_W / 2, 500, 3);
    if (!document.hasFocus()) {
      ctx.globalAlpha = 0.5;
      ctx.font = serif(16);
      ctx.fillText('click to focus', VIEW_W / 2, 470);
    } else {
      ctx.globalAlpha = fade * 0.3;
      ctx.font = serif(15);
      ctx.fillText('W / S to choose  ·  Space to begin', VIEW_W / 2, 470);
    }
    ctx.globalAlpha = 1;
  }

  private drawChapter(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const out = clamp((6 - t) / 0.8, 0, 1);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = clamp(t / 1.2, 0, 1) * out;
    ctx.font = serif(96, { italic: false, weight: 400 });
    ctx.fillText('I', VIEW_W / 2, 220);
    ctx.globalAlpha = clamp((t - 1.2) / 1, 0, 1) * out * 0.8;
    ctx.font = serif(18, { italic: false, weight: 500 });
    spaced(ctx, 'ARITHMETIC', VIEW_W / 2, 310, 12);
    ctx.globalAlpha = clamp((t - 2.2) / 1, 0, 1) * out * 0.4;
    ctx.font = serif(17);
    ctx.fillText('the first count', VIEW_W / 2, 345);
    ctx.globalAlpha = 1;
  }

  private drawEnd(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.dust.draw(ctx, 0, 0, VIEW_W, VIEW_H, this.time);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const a = (start: number, dur = 1.2) => clamp((t - start) / dur, 0, 1);
    ctx.globalAlpha = a(0.8, 2) * 0.95;
    ctx.font = serif(120, { weight: 400 });
    ctx.fillText('0', VIEW_W / 2, 150);
    ctx.globalAlpha = a(2.6) * 0.8;
    ctx.font = serif(24);
    ctx.fillText('Nothing. Hold it close.', VIEW_W / 2, 250);
    ctx.globalAlpha = a(4.4) * 0.55;
    ctx.font = serif(19);
    ctx.fillText('Past nothing, the line goes on — into numbers less than nothing.', VIEW_W / 2, 290);
    this.drawNumberLine(340, a(5.4) * 0.25);
    ctx.fillStyle = INK;
    ctx.globalAlpha = a(6.4) * 0.7;
    ctx.font = serif(14, { italic: false, weight: 500 });
    spaced(ctx, 'I  —  ARITHMETIC', VIEW_W / 2, 395, 6);
    ctx.globalAlpha = a(7.4) * 0.4;
    spaced(ctx, 'II  —  THE OTHER SIDE', VIEW_W / 2, 425, 6);
    ctx.font = serif(15);
    ctx.globalAlpha = a(8.4) * 0.35;
    ctx.fillText('to be continued', VIEW_W / 2, 458);
    if (t > 10) {
      ctx.globalAlpha = 0.2 + 0.15 * Math.sin(this.time * 3);
      ctx.fillText('—', VIEW_W / 2, 500);
    }
    ctx.globalAlpha = 1;
  }
}
