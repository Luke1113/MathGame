import { Sound } from './audio';
import { Zero, type Boss, type BossHost } from './boss';
import { clamp, damp, overlaps, pal, rectCircle, serif, setPalette, TILE, VIEW_H, VIEW_W } from './constants';
import { drawQ, drawRich, qWidth } from './draw';
import { Enemy, makeEnemy, type Shot, type World } from './enemies';
import { Dust, Fx } from './fx';
import { Input, type Ev, type Op } from './input';
import { Q } from './num';
import { Pi } from './pi';
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

interface Point {
  a: number;
  b: number;
  x: number;
  y: number;
  lit: boolean;
  t: number;
}

interface Seal {
  until: string;
  tiles: [number, number][];
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
const OPS_ONE = ['+', '−', '×', '÷', '='];
const OPS_TWO = ['±', '/', '^', '√2'];
const CHAPTER_ONE_GLYPHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '+', '−', '×', '÷', '='];
const FLOOR_Y = 14 * TILE;

const CHAPTERS: Record<number, { numeral: string; name: string; sub: string }> = {
  1: { numeral: 'I', name: 'ARITHMETIC', sub: 'the first count' },
  2: { numeral: 'II', name: 'THE OTHER SIDE', sub: 'numbers less than nothing' },
};

const ENDINGS: Record<number, { glyph: string; line: string; more: string; done: string; next: string; foot: string }> = {
  1: {
    glyph: '0',
    line: 'Nothing. Hold it close.',
    more: 'Past nothing, the line goes on — into numbers less than nothing.',
    done: 'I  —  ARITHMETIC',
    next: 'II  —  THE OTHER SIDE',
    foot: 'the floor beneath zero has opened',
  },
  2: {
    glyph: 'π',
    line: 'It never ends. It never repeats.',
    more: 'Every fraction falls short of it. Only π is equal to π.',
    done: 'II  —  THE OTHER SIDE',
    next: 'III  —  FUNCTIONS',
    foot: 'to be continued',
  },
};

const BOSS_TITLES: Record<string, [string, string]> = {
  zero: ['ZERO', 'the number that cannot be lessened'],
  pi: ['PI', 'the number that never ends'],
};

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
  private points: Point[] = [];
  private seals: Seal[] = [];
  private boss: Boss | null = null;
  private bossId = '';
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
  private chapterNo = 1;
  private endChapter = 1;

  private light: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private vignettes: { dark: HTMLCanvasElement; light: HTMLCanvasElement };

  constructor(
    private canvas: HTMLCanvasElement,
    private input: Input,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.light.width = VIEW_W / 2;
    this.light.height = VIEW_H / 2;
    this.lctx = this.light.getContext('2d')!;
    const vignette = (rgb: string) => {
      const c = document.createElement('canvas');
      c.width = VIEW_W;
      c.height = VIEW_H;
      const v = c.getContext('2d')!;
      const g = v.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.35, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.62);
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},0.75)`);
      v.fillStyle = g;
      v.fillRect(0, 0, VIEW_W, VIEW_H);
      return c;
    };
    this.vignettes = { dark: vignette('0,0,0'), light: vignette('243,241,235') };
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

  private get chapter(): number {
    return this.room.def.chapter ?? 1;
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
    this.points = [];
    this.seals = [];
    this.boss = null;
    this.bossId = '';
    this.compose = null;
    this.equateSeq = null;
    this.fx.clear();
    const axes = def.axes;
    for (const pl of this.room.placed) {
      const s = pl.spec;
      const fx = pl.tx * TILE + TILE / 2;
      const fy = (pl.ty + 1) * TILE;
      switch (s.k) {
        case 'walker':
        case 'drifter':
        case 'emitter':
        case 'orbiter':
        case 'bound': {
          const label = s.k === 'walker' || s.k === 'drifter' ? (s.label ?? null) : null;
          const e = makeEnemy(s.k, Q.from(s.n), pl.key, pl.tx, pl.ty, label);
          e.appear = 1;
          this.enemies.push(e);
          break;
        }
        case 'gate':
        case 'door':
        case 'pointdoor': {
          if (this.save.opened.includes(pl.key)) break;
          const kind = s.k === 'gate' ? 'gate' : 'door';
          const n = s.k === 'pointdoor' ? Q.ZERO : Q.from(s.n);
          const e = new Enemy(kind, n, pl.key);
          const w = s.k === 'gate' ? s.w : 1;
          if (s.k === 'door' && s.sign) e.sign = s.sign;
          if (s.k === 'pointdoor') {
            e.sign = s.sign;
            e.needsPoints = true;
          }
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
        case 'point':
          if (axes) this.points.push({ a: s.a, b: s.b, x: (axes.ox + s.a) * TILE, y: (axes.oy - s.b) * TILE, lit: false, t: 0 });
          break;
        case 'seal': {
          if (this.save.bosses.includes(s.until)) break;
          const tiles: [number, number][] = [];
          for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) tiles.push([pl.tx + x, pl.ty + y]);
          for (const [x, y] of tiles) this.room.setTile(x, y, SOLID);
          this.seals.push({ until: s.until, tiles });
          break;
        }
        case 'shrine':
          if (!this.save.taken.includes(pl.key)) this.shrines.push({ key: pl.key, give: s.give, x: fx, y: fy, t: Math.random() * 6 });
          break;
        case 'text':
          this.texts.push({ x: fx, y: pl.ty * TILE + TILE / 2, s: s.s, a: 0 });
          break;
        case 'boss':
          if (this.save.bosses.includes(s.which)) break;
          this.bossId = s.which;
          this.boss = s.which === 'zero' ? new Zero(this.bossHost(), fx, pl.ty * TILE + TILE / 2) : new Pi(this.bossHost(), fx, pl.ty * TILE + TILE / 2);
          break;
      }
    }
    this.lamps = this.room.lamps.map((l) => ({ ...l, near: true }));
    this.roomTitle = { s: def.name, t: 0 };
    this.sfx.setDrone(this.boss ? 'none' : this.chapter === 2 ? 'room2' : 'room');
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
        p.endDash();
        p.y = this.room.ph - p.h - 2;
        p.vy = -780;
      } else p.y = 2;
    }
    this.fadeA = 0.85;
    this.snapCamera();
    const ch = this.chapter;
    if (!this.save.chapters.includes(ch)) {
      // a new chapter announces itself the first time x crosses into it
      this.save.chapters.push(ch);
      writeSave(this.save);
      this.chapterNo = ch;
      this.setMode('chapter');
    }
  }

  // ————————————————————————————————————————— lifecycle

  private newGame(): void {
    this.save = freshSave();
    this.save.chapters = [1];
    writeSave(this.save);
    this.hasSave = true;
    this.loadRoom('void');
    const sp = this.room.spawn!;
    this.resetPlayer();
    this.player.place(sp.x, sp.y);
    this.player.facing = 1;
    this.snapCamera();
    this.chapterNo = 1;
    this.setMode('chapter');
  }

  /** Start at the top of Chapter II, with everything Chapter I teaches. */
  private chapterTwo(): void {
    this.save = freshSave();
    this.save.has = [...CHAPTER_ONE_GLYPHS];
    this.save.bosses = ['zero'];
    this.save.chapters = [1, 2];
    for (const def of ROOMS) {
      if ((def.chapter ?? 1) !== 1) continue;
      const room = new Room(def);
      for (const pl of room.placed) {
        if (pl.spec.k === 'shrine') this.save.taken.push(pl.key);
        if (pl.spec.k === 'gate' || pl.spec.k === 'door') this.save.opened.push(pl.key);
      }
    }
    this.loadRoom('below');
    const lamp = this.room.lamps[0];
    this.save.lamp = { room: 'below', x: lamp.x, y: lamp.y };
    writeSave(this.save);
    this.hasSave = true;
    this.resetPlayer();
    const hole = this.room.exitCells('J')!;
    this.player.place((hole.cells[0] + 1) * TILE, TILE * 2);
    this.snapCamera();
    this.chapterNo = 2;
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
    p.value = this.has('1') ? Q.ONE : null;
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this;
    return {
      get player() {
        return g.player;
      },
      fx: g.fx,
      sfx: g.sfx,
      floorY: FLOOR_Y,
      get arenaW() {
        return g.room.pw;
      },
      get piOffered() {
        return g.shrines.some((s) => s.give === 'π');
      },
      shoot: (x, y, vx, vy) => g.shots.push({ x, y, vx, vy, r: 4, life: 5, dead: false }),
      shake: (a) => g.shake(a),
      flash: (a) => g.flash(a),
      hitstop: (t) => g.hitstop(t),
      hurtPlayer: (fromX) => g.hurtPlayer(fromX),
      nullifyPlayer: () => {
        if (g.player.value?.isZero) return;
        g.player.value = Q.ZERO;
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
        g.sfx.setDrone(g.chapter === 2 ? 'boss2' : 'boss');
        g.bossTitleT = 0;
      },
      onResolved: () => {
        const id = g.bossId;
        if (!g.save.bosses.includes(id)) g.save.bosses.push(id);
        if (id === 'zero') g.learn('0');
        writeSave(g.save);
        g.sealExit(false);
        g.openSeals(id);
        g.sfx.setDrone('none');
        g.endChapter = g.chapter;
        g.setMode('end');
      },
      offerPi: (x, y) => {
        if (!g.shrines.some((s) => s.give === 'π')) g.shrines.push({ key: 'π', give: 'π', x, y, t: 0 });
      },
    };
  }

  /** Close (or reopen) the way x came in, while a boss is fought. */
  private sealExit(on: boolean): void {
    const map = this.room.def.map;
    for (let y = 0; y < map.length; y++) if (/[A-Z]/.test(map[y][0])) this.room.setTile(0, y, on ? SOLID : EMPTY);
  }

  private openSeals(until: string): void {
    for (const s of this.seals) {
      if (s.until !== until) continue;
      for (const [x, y] of s.tiles) {
        this.room.setTile(x, y, EMPTY);
        this.fx.burst(x * TILE + TILE / 2, y * TILE + TILE / 2, 8, { speed: 160, life: 0.8, line: true });
      }
    }
    this.seals = this.seals.filter((s) => s.until !== until);
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

  private setValue(v: Q, expr?: string): void {
    this.player.value = v;
    this.player.valuePop = 1;
    this.sfx.composed(v.approx);
    this.lastExpr = expr ? { s: expr, t: 0 } : null;
  }

  /** Below which x may not fall: 1 at first, 0 once zero is known, no floor past zero. */
  private get floor(): number | null {
    if (this.has('±')) return null;
    return this.has('0') ? 0 : 1;
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
    const q = Q.int(d);
    if (!c) {
      this.setValue(q);
      return;
    }
    const v = p.value;
    let r: Q | null = null;
    let why = '';
    switch (c.op) {
      case '+':
        r = v.add(q);
        if (!r) why = 'π will not mix';
        break;
      case '−': {
        r = v.sub(q);
        const floor = this.floor;
        if (!r) why = 'π will not mix';
        else if (floor !== null && r.approx < floor) {
          why = `${v} − ${d} < ${floor}`;
          r = null;
        }
        break;
      }
      case '×':
        r = v.mul(q);
        break;
      case '÷':
        if (d === 0) why = `${v} ÷ 0 is undefined`;
        else if (!this.has('/') && !(v.isInt && v.n % d === 0)) why = `${d} ∤ ${v}`;
        else r = v.div(q);
        break;
      case '^':
        r = v.pow(d);
        break;
    }
    if (r && r.unwieldy) {
      why = 'too large to hold';
      r = null;
    }
    if (!r) {
      this.sfx.refuse();
      this.float(why);
      return;
    }
    this.setValue(r, `${v} ${c.op} ${d}`);
  }

  private onOp(op: Op): void {
    const p = this.player;
    if (!this.has(op) || p.value === null) {
      this.sfx.refuse();
      this.float('?');
      return;
    }
    if (op === '−' && this.compose?.op === '−' && this.has('±')) {
      // − twice: the opposite
      const v = p.value;
      this.compose = null;
      this.setValue(v.neg(), `−(${v})`);
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
        if (e.needsPoints) {
          this.sfx.refuse();
          this.float('stand where it says', e.cx, e.y - 44, 18);
        } else if (v.eq(e.n)) this.openDoor(e);
        else {
          this.sfx.refuse();
          this.float(e.sign ? '≠' : `${v} ≠ ${e.n}`, e.cx, e.y - 44, 20);
        }
        return;
      }
    }
    const view = { x: this.cam.x, y: this.cam.y, w: VIEW_W, h: VIEW_H };
    const targets = this.enemies.filter((e) => !e.dead && e.kind !== 'door' && e.n.eq(v) && e.appear >= 1 && overlaps(view, e.hitbox()));
    const bossHit = !!this.boss && this.boss.matches(v);
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
      } else if (this.boss && this.player.value) {
        this.boss.struck(this.player.value);
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
    if (!quiet) this.sfx.kill(Math.abs(this.player.value?.approx ?? 1));
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
    const said = e.needsPoints ? 'there' : e.sign ? `x = ${e.n}` : `${e.n} = ${e.n}`;
    this.float(said, e.cx, e.y - 44, 24);
  }

  /** Division: the bound break into equal shares. */
  private split(e: Enemy, v: number): void {
    const each = e.n.div(Q.int(v))!;
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
    const v = p.value ?? Q.ZERO;
    const blocked = (msg: string) => {
      this.sfx.blocked();
      this.float(msg, e.cx, e.y - 12, 16);
      p.recoil(e.cx, 190);
      e.knock(p.cx, 90);
      e.hurtT = 0.05;
      this.hitstop(0.04);
    };
    if (e.kind === 'door') {
      // A door yields to its own number: strike it, or equate beside it.
      if (e.needsPoints) return blocked('stand where it says');
      if (v.eq(e.n)) return this.openDoor(e);
      return blocked(e.sign ? '≠' : `${v} ≠ ${e.n}`);
    }
    if (e.armored) {
      if (!this.has('÷')) return blocked('· · ·');
      const k = v.isInt ? v.n : 0;
      if (k > 1 && e.n.divisibleBy(k) && k <= e.n.n) return this.split(e, k);
      return blocked(k === 1 ? `${e.n} ÷ 1 = ${e.n}` : v.gt(e.n) ? `${v} > ${e.n}` : `${v} ∤ ${e.n}`);
    }
    if (v.isZero) return blocked('− 0');
    if (this.floor !== null && v.gt(e.n)) return blocked(`${v} > ${e.n}`);
    const left = e.n.sub(v);
    if (!left) return blocked('π will not mix');
    const turned = !left.isZero && left.sign !== e.n.sign;
    e.n = left;
    e.label = null;
    e.hurtT = 0.12;
    e.popT = 1;
    this.meter = Math.min(1, this.meter + 0.07);
    if (e.n.isZero) {
      this.fx.text(e.cx, e.y - 10, `${v} − ${v} = 0`, { size: 14, alpha: 0.6, life: 1.4 });
      this.kill(e);
      return;
    }
    this.fx.text(e.cx, e.y - 10, v.sign < 0 ? `− (${v})` : `− ${v}`, { size: 14, alpha: 0.5 });
    this.sfx.hit(Math.abs(v.approx));
    this.hitstop(0.05);
    this.shake(2);
    if (turned) {
      // taken past nothing, it turns into its own negative
      e.turnT = 1;
      this.sfx.turn();
      this.hitstop(0.1);
    }
    e.knock(p.cx, 210);
    e.resize();
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
          this.sfx.setDrone(this.chapter === 2 ? 'room2' : 'room');
          this.fadeA = 1;
          this.setMode('play');
        }
        break;
    }
    this.flashA = Math.max(0, this.flashA - dt * 2.2);
    this.fadeA = Math.max(0, this.fadeA - dt * 2.2);
  }

  private menuItems(): string[] {
    return this.hasSave ? ['begin anew', 'continue', 'begin at chapter II'] : ['begin', 'begin at chapter II'];
  }

  private updateTitle(events: Ev[]): void {
    const items = this.menuItems();
    for (const e of events) {
      if (e.k === 'up') this.menu = (this.menu + items.length - 1) % items.length;
      if (e.k === 'down') this.menu = (this.menu + 1) % items.length;
      if (e.k === 'jump' || e.k === 'equate' || e.k === 'strike') {
        const it = items[this.menu];
        if (it === 'continue') this.continueGame();
        else if (it === 'begin at chapter II') this.chapterTwo();
        else this.newGame();
        return;
      }
    }
  }

  private updatePlay(realDt: number, events: Ev[]): void {
    const p = this.player;
    p.canDiag = this.has('√2');
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
    if (p.y < 0) return this.transition('N');
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
      if (boss && p.value && !p.struck.has(boss) && boss.touches(box)) {
        p.struck.add(boss);
        const msg = boss.struck(p.value);
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

    // points of the plane: stand exactly there
    for (const pt of this.points) {
      pt.t += dt;
      if (pt.lit || !p.onGround) continue;
      if (Math.abs(p.cx - pt.x) < 12 && Math.abs(p.y + p.h - pt.y) < 3) {
        pt.lit = true;
        pt.t = 0;
        this.sfx.point();
        this.flash(0.15);
        this.fx.converge(pt.x, pt.y, 18, 60, 0.6);
        if (this.points.every((q) => q.lit)) {
          for (const e of this.enemies) if (e.needsPoints && !e.dead) this.openDoor(e);
        }
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
    if (s.give !== 'π' && !this.save.taken.includes(s.key)) this.save.taken.push(s.key);
    writeSave(this.save);
    if (s.give === '1') this.player.value = Q.ONE;
    if (s.give === 'π') {
      this.player.value = Q.PI;
      this.player.valuePop = 1;
    }
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
    if (this.mode === 'title') setPalette(false);
    else if (this.mode === 'chapter') setPalette(this.chapterNo === 2);
    else if (this.mode === 'end') setPalette(this.endChapter === 2);
    else setPalette(this.chapter === 2);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pal.void;
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
      ctx.fillStyle = pal.ink;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (this.fadeA > 0) {
      ctx.globalAlpha = this.fadeA;
      ctx.fillStyle = pal.void;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private drawAxes(ox: number, oy: number): void {
    const ctx = this.ctx;
    const r = this.room;
    const X = ox * TILE;
    const Y = oy * TILE;
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(TILE, Y);
    ctx.lineTo(r.pw - TILE, Y);
    ctx.moveTo(X, TILE);
    ctx.lineTo(X, r.ph - TILE);
    // arrowheads at the positive ends
    ctx.moveTo(r.pw - TILE - 8, Y - 5);
    ctx.lineTo(r.pw - TILE, Y);
    ctx.lineTo(r.pw - TILE - 8, Y + 5);
    ctx.moveTo(X - 5, TILE + 8);
    ctx.lineTo(X, TILE);
    ctx.lineTo(X + 5, TILE + 8);
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    for (let a = -ox + 1; a < r.w - ox - 1; a++) {
      ctx.moveTo(X + a * TILE, Y - (a % 5 === 0 ? 6 : 3));
      ctx.lineTo(X + a * TILE, Y + (a % 5 === 0 ? 6 : 3));
    }
    for (let b = -(r.h - oy) + 2; b < oy; b++) {
      ctx.moveTo(X - (b % 5 === 0 ? 6 : 3), Y - b * TILE);
      ctx.lineTo(X + (b % 5 === 0 ? 6 : 3), Y - b * TILE);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let a = -ox + 1; a < r.w - ox - 1; a++) {
      if (a !== 0 && a % 5 === 0) drawQ(ctx, Q.int(a), X + a * TILE, Y + 16, 13);
    }
    for (let b = -(r.h - oy) + 2; b < oy; b++) {
      if (b !== 0 && b % 5 === 0) drawQ(ctx, Q.int(b), X - 16, Y - b * TILE, 13);
    }
    ctx.font = serif(18);
    ctx.fillText('x', r.pw - TILE - 4, Y - 16);
    ctx.fillText('y', X + 14, TILE + 4);
    ctx.globalAlpha = 1;
  }

  private drawWorld(): void {
    const ctx = this.ctx;
    const r = this.room;
    const camX = this.cam.x - this.shakeX;
    const camY = this.cam.y - this.shakeY;
    ctx.save();
    ctx.translate(-camX, -camY);

    ctx.fillStyle = pal.air;
    ctx.fillRect(0, 0, r.pw, r.ph);

    // graph paper
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.07;
    const gx0 = Math.max(0, Math.floor(camX / TILE));
    const gy0 = Math.max(0, Math.floor(camY / TILE));
    for (let gx = gx0; gx <= gx0 + VIEW_W / TILE + 1; gx++) {
      for (let gy = gy0; gy <= gy0 + VIEW_H / TILE + 1; gy++) ctx.fillRect(gx * TILE - 0.75, gy * TILE - 0.75, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
    if (r.def.axes) this.drawAxes(r.def.axes.ox, r.def.axes.oy);

    ctx.fillStyle = pal.void;
    r.forEachSolid((x, y) => {
      const px = x * TILE;
      const py = y * TILE;
      if (px > camX + VIEW_W || px + TILE < camX || py > camY + VIEW_H || py + TILE < camY) return;
      ctx.fillRect(px - 0.5, py - 0.5, TILE + 1, TILE + 1);
    });
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.stroke(r.edges());
    ctx.globalAlpha = 0.65;
    ctx.stroke(r.platforms());
    ctx.globalAlpha = 1;

    // inscriptions
    ctx.fillStyle = pal.ink;
    for (const t of this.texts) {
      if (t.a <= 0) continue;
      ctx.globalAlpha = t.a * 0.72;
      drawRich(ctx, t.s, t.x, t.y + (1 - t.a) * 6, 19);
    }
    ctx.globalAlpha = 1;

    // points of the plane, once found
    for (const pt of this.points) {
      if (!pt.lit) continue;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 + Math.max(0, 1 - pt.t) * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(1, pt.t * 2) * 0.7;
      ctx.font = serif(16);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`(${String(pt.a).replace('-', '−')}, ${String(pt.b).replace('-', '−')})`, pt.x, pt.y - 48);
    }
    ctx.globalAlpha = 1;

    // lamps
    for (const l of this.lamps) {
      const lit = this.save.lamp?.room === r.def.id && this.save.lamp.x === l.x;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y);
      ctx.lineTo(l.x, l.y - 30);
      ctx.moveTo(l.x - 5, l.y);
      ctx.lineTo(l.x + 5, l.y);
      ctx.stroke();
      ctx.globalAlpha = lit ? 1 : 0.45;
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(l.x, l.y - 34, lit ? 3.5 + Math.sin(this.time * 2) * 0.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // shrines: a glyph waiting above a thin stand
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of this.shrines) {
      const small = /^[2-9]$/.test(s.give);
      const gy = s.y - (small ? 42 : 56) + Math.sin(s.t * 1.6) * 3;
      ctx.strokeStyle = pal.ink;
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
      ctx.fillStyle = pal.ink;
      ctx.font = serif(small ? 24 : s.give.length > 1 ? 26 : 34, { weight: 500 });
      ctx.fillText(s.give, s.x, gy + 1);
    }

    for (const m of this.motes) {
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(m.t * 6);
      ctx.fillStyle = pal.ink;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const e of this.enemies) e.draw(this.ctx);
    this.boss?.draw(ctx);

    ctx.fillStyle = pal.ink;
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
      ctx.strokeStyle = pal.ink;
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
      ctx.strokeStyle = pal.ink;
      ctx.fillStyle = pal.ink;
      ctx.lineWidth = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
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
    ctx.drawImage(pal.inverted ? this.vignettes.light : this.vignettes.dark, 0, 0);
  }

  private drawLight(camX: number, camY: number): void {
    const l = this.lctx;
    const dark = this.room.def.dark ?? (pal.inverted ? 0.8 : 0.84);
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.light.width, this.light.height);
    l.fillStyle = `rgba(${pal.fog},${dark})`;
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
    for (const e of this.enemies) add(e.cx, e.cy, e.solid ? 130 : 80, 0.55);
    for (const s of this.shots) add(s.x, s.y, 50, 0.6);
    for (const m of this.motes) add(m.x, m.y, 50, 0.6);
    for (const pt of this.points) if (pt.lit) add(pt.x, pt.y, 120, 0.7);
    for (const t of this.texts) if (t.a > 0) add(t.x, t.y, 200, t.a * 0.6);
    this.boss?.lights(add);
    this.ctx.drawImage(this.light, 0, 0, VIEW_W, VIEW_H);
  }

  private drawHud(): void {
    const ctx = this.ctx;
    const p = this.player;
    ctx.fillStyle = pal.ink;
    ctx.strokeStyle = pal.ink;
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
    const size = 30 + p.valuePop * 6;
    ctx.globalAlpha = 0.9;
    ctx.font = serif(size);
    if (p.value === null) ctx.fillText('x', cx, by);
    else {
      const pre = 'x = ';
      const suf = this.compose ? ` ${this.compose.op} ${Math.floor(this.time * 3) % 2 ? '_' : ' '}` : '';
      const preW = ctx.measureText(pre).width;
      const sufW = ctx.measureText(suf).width;
      const qW = qWidth(ctx, p.value, size);
      const left = cx - (preW + qW + sufW) / 2;
      ctx.textAlign = 'left';
      ctx.font = serif(size);
      ctx.fillText(pre, left, by);
      drawQ(ctx, p.value, left + preW + qW / 2, by, size);
      ctx.font = serif(size);
      ctx.fillText(suf, left + preW + qW, by);
      ctx.textAlign = 'center';
    }
    if (this.lastExpr) {
      ctx.globalAlpha = 0.45 * (1 - this.lastExpr.t / 1.6);
      ctx.font = serif(18);
      ctx.fillText(this.lastExpr.s, cx, by - 34 - this.lastExpr.t * 8);
    }
    // Δt: how long time can be held
    if (this.meter < 0.999 || this.timeScale < 0.95) {
      ctx.globalAlpha = 0.18;
      ctx.fillRect(cx - 60, by + 24, 120, 1);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(cx - 60 * this.meter, by + 24, 120 * this.meter, 1.5);
    }

    // what has been learned
    ctx.font = serif(15, { italic: false, weight: 500 });
    const known = DIGITS.filter((d) => d !== '0' || this.has('0'));
    known.forEach((d, i) => {
      ctx.globalAlpha = this.has(d) ? 0.55 : 0.12;
      ctx.fillText(this.has(d) ? d : '·', VIEW_W - 40 - (known.length - 1 - i) * 15, VIEW_H - 50);
    });
    const ops = this.has('0') ? [...OPS_ONE, ...OPS_TWO] : OPS_ONE;
    let right = VIEW_W - 34;
    for (let i = ops.length - 1; i >= 0; i--) {
      const o = ops[i];
      const s = this.has(o) ? o : '·';
      const w = Math.max(14, ctx.measureText(s).width + 6);
      ctx.globalAlpha = this.has(o) ? 0.55 : 0.12;
      ctx.fillText(s, right - w / 2, VIEW_H - 28);
      right -= w;
    }

    // where we are
    const rt = this.roomTitle;
    if (rt.s && rt.t < 4) {
      ctx.globalAlpha = 0.5 * Math.min(1, rt.t / 0.8) * Math.min(1, (4 - rt.t) / 1);
      ctx.font = serif(14, { italic: false, weight: 500 });
      spaced(ctx, rt.s.toUpperCase(), cx, 38, 6);
    }
    const title = BOSS_TITLES[this.bossId];
    if (title && this.bossTitleT < 5) {
      const t = this.bossTitleT;
      ctx.globalAlpha = Math.min(1, Math.max(0, (t - 1.2) / 0.8)) * Math.min(1, (5 - t) / 1);
      ctx.font = serif(22, { italic: false, weight: 500 });
      spaced(ctx, title[0], cx, 70, 18);
      ctx.globalAlpha *= 0.6;
      ctx.font = serif(16);
      ctx.fillText(title[1], cx, 102);
    }
    ctx.globalAlpha = 1;
  }

  private drawPickup(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    const info = GLYPHS[this.pickup];
    const k = clamp(t / 0.8, 0, 1);
    ctx.globalAlpha = 0.88 * k;
    ctx.fillStyle = pal.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const small = /^[2-9]$/.test(this.pickup);
    ctx.globalAlpha = clamp((t - 0.2) / 1, 0, 1);
    ctx.font = serif((small ? 120 : this.pickup.length > 1 ? 130 : 160) + (1 - k) * 30, { weight: 500 });
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
    ctx.fillStyle = pal.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.6;
    ctx.font = serif(14, { italic: false, weight: 500 });
    spaced(ctx, 'STILL', VIEW_W / 2, 66, 10);
    const rows: [string, string][] = [
      ['move', 'A  D'],
      ['aim', 'W  S   (S + Space falls through)'],
      ['jump', 'Space'],
      ['dash', this.has('√2') ? 'Tab   (with a direction: up, diagonal)' : 'Tab'],
      ['strike', 'J   ·   Num 0'],
      ['hold a digit', '1 – 9'],
      ['+   −   ×   ÷', 'then a digit      type them, or U I O P'],
      ...(this.has('^') ? ([['^', 'then a digit      type it, or K']] as [string, string][]) : []),
      ...(this.has('±') ? ([['the opposite', '−  then  −']] as [string, string][]) : []),
      ['equate', 'Enter   ·   ='],
      ['slow time', 'L   ·   Num .'],
      ['return', 'Esc'],
    ];
    rows.forEach(([a, b], i) => {
      const y = 112 + i * 28;
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
    const rule =
      this.chapter === 2
        ? 'Past zero, numbers turn negative. Hold the opposite to undo them.'
        : 'You cannot take more than there is.   The bound can only be shared.';
    ctx.fillText(rule, VIEW_W / 2, 490);
    ctx.globalAlpha = 1;
  }

  private drawDead(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    ctx.globalAlpha = clamp((t - 0.6) / 1.2, 0, 1) * 0.95;
    ctx.fillStyle = pal.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.globalAlpha = clamp((t - 1) / 0.8, 0, 1) * clamp((3.3 - t) / 0.6, 0, 1) * 0.8;
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = serif(30);
    ctx.fillText('x is undefined.', VIEW_W / 2, VIEW_H / 2);
    ctx.globalAlpha = 1;
  }

  private drawNumberLine(y: number, alpha: number, negative = false): void {
    const ctx = this.ctx;
    ctx.strokeStyle = pal.ink;
    ctx.fillStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(VIEW_W, y);
    const off = (this.time * 8 * (negative ? -1 : 1)) % 60;
    for (let x = -60 + off; x < VIEW_W + 60; x += 60) {
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x, y + 4);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawTitle(): void {
    const ctx = this.ctx;
    ctx.fillStyle = pal.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.dust.draw(ctx, 0, 0, VIEW_W, VIEW_H, this.time);
    this.drawNumberLine(300, 0.12);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fade = clamp(this.modeT / 2, 0, 1);
    ctx.globalAlpha = fade * (0.85 + 0.15 * Math.sin(this.time * 1.3));
    ctx.font = serif(170, { weight: 400 });
    ctx.fillText('x', VIEW_W / 2, 190);
    ctx.globalAlpha = fade * 0.45;
    ctx.font = serif(20);
    ctx.fillText('solve for x', VIEW_W / 2, 330);

    this.menuItems().forEach((it, i) => {
      const sel = i === this.menu;
      ctx.globalAlpha = fade * (sel ? 0.95 : 0.3);
      ctx.font = serif(21);
      ctx.fillText(sel ? `—  ${it}  —` : it, VIEW_W / 2, 378 + i * 32);
    });
    ctx.globalAlpha = fade * 0.25;
    ctx.font = serif(13, { italic: false, weight: 500 });
    spaced(ctx, 'CHAPTERS I – II  ·  PROTOTYPE', VIEW_W / 2, 512, 3);
    if (!document.hasFocus()) {
      ctx.globalAlpha = 0.5;
      ctx.font = serif(16);
      ctx.fillText('click to focus', VIEW_W / 2, 482);
    } else {
      ctx.globalAlpha = fade * 0.3;
      ctx.font = serif(15);
      ctx.fillText('W / S to choose  ·  Space to begin', VIEW_W / 2, 482);
    }
    ctx.globalAlpha = 1;
  }

  private drawChapter(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    const c = CHAPTERS[this.chapterNo] ?? CHAPTERS[1];
    ctx.fillStyle = pal.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const out = clamp((6 - t) / 0.8, 0, 1);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = clamp(t / 1.2, 0, 1) * out;
    ctx.font = serif(96, { italic: false, weight: 400 });
    ctx.fillText(c.numeral, VIEW_W / 2, 220);
    ctx.globalAlpha = clamp((t - 1.2) / 1, 0, 1) * out * 0.8;
    ctx.font = serif(18, { italic: false, weight: 500 });
    spaced(ctx, c.name, VIEW_W / 2, 310, 12);
    ctx.globalAlpha = clamp((t - 2.2) / 1, 0, 1) * out * 0.4;
    ctx.font = serif(17);
    ctx.fillText(c.sub, VIEW_W / 2, 345);
    if (this.chapterNo === 2) this.drawNumberLine(400, clamp((t - 2.6) / 1, 0, 1) * out * 0.2, true);
    ctx.globalAlpha = 1;
  }

  private drawEnd(): void {
    const ctx = this.ctx;
    const t = this.modeT;
    const e = ENDINGS[this.endChapter] ?? ENDINGS[1];
    ctx.fillStyle = pal.void;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.dust.draw(ctx, 0, 0, VIEW_W, VIEW_H, this.time);
    ctx.fillStyle = pal.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const a = (start: number, dur = 1.2) => clamp((t - start) / dur, 0, 1);
    ctx.globalAlpha = a(0.8, 2) * 0.95;
    ctx.font = serif(120, { weight: 400 });
    ctx.fillText(e.glyph, VIEW_W / 2, 150);
    ctx.globalAlpha = a(2.6) * 0.8;
    ctx.font = serif(24);
    ctx.fillText(e.line, VIEW_W / 2, 250);
    ctx.globalAlpha = a(4.4) * 0.55;
    ctx.font = serif(19);
    ctx.fillText(e.more, VIEW_W / 2, 290);
    this.drawNumberLine(340, a(5.4) * 0.25, this.endChapter === 2);
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = a(6.4) * 0.7;
    ctx.font = serif(14, { italic: false, weight: 500 });
    spaced(ctx, e.done, VIEW_W / 2, 395, 6);
    ctx.globalAlpha = a(7.4) * 0.4;
    spaced(ctx, e.next, VIEW_W / 2, 425, 6);
    ctx.font = serif(15);
    ctx.globalAlpha = a(8.4) * 0.35;
    ctx.fillText(e.foot, VIEW_W / 2, 458);
    if (t > 10) {
      ctx.globalAlpha = 0.2 + 0.15 * Math.sin(this.time * 3);
      ctx.fillText('—', VIEW_W / 2, 500);
    }
    ctx.globalAlpha = 1;
  }
}
