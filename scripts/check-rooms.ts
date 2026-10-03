// Validates chapter maps: equal row widths, exits paired between rooms, legend coverage.
import { ROOMS } from '../src/rooms';

let ok = true;
const fail = (m: string) => { ok = false; console.error('✗ ' + m); };
const exits = new Map<string, { room: string; side: string; cells: number[] }[]>();

for (const r of ROOMS) {
  const w = r.map[0].length;
  const h = r.map.length;
  r.map.forEach((row, y) => { if (row.length !== w) fail(`${r.id} row ${y} has width ${row.length}, expected ${w}`); });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = r.map[y][x];
    if (/[a-z]/.test(c) && !r.legend[c]) fail(`${r.id} (${x},${y}) '${c}' missing from legend`);
    if (/[A-Z0-9]/.test(c)) {
      const side = x === 0 ? 'W' : x === w - 1 ? 'E' : y === 0 ? 'N' : y === h - 1 ? 'S' : '?';
      if (side === '?') fail(`${r.id} exit ${c} at (${x},${y}) is not on the border`);
      const list = exits.get(c) ?? [];
      let e = list.find((q) => q.room === r.id);
      if (!e) { e = { room: r.id, side, cells: [] }; list.push(e); }
      e.cells.push(side === 'W' || side === 'E' ? y : x);
      exits.set(c, list);
    }
  }
  console.log(`  ${r.id.padEnd(10)} ${w}×${h}`);
}
const opposite: Record<string, string> = { N: 'S', S: 'N', E: 'W', W: 'E' };
for (const [letter, list] of exits) {
  if (list.length !== 2) { fail(`exit ${letter} appears in ${list.length} room(s)`); continue; }
  const [a, b] = list;
  if (opposite[a.side] !== b.side) fail(`exit ${letter}: ${a.room}:${a.side} ↔ ${b.room}:${b.side} are not opposite`);
  if (a.cells.length !== b.cells.length) fail(`exit ${letter}: widths differ (${a.cells.length} vs ${b.cells.length})`);
}
// ——— reachability: can every pickup and exit be reached with run, jump and dash?
// A jump rises about 3.9 tiles, so a ledge 3 rows up is reachable and 4 rows up is not.
const JUMP_ROWS = 3;
/** With the upward dash (y), a jump climbs about 7 tiles; ⌊x⌋'s six steps and a jump climb 9. */
const DASH_ROWS = 6;
const STAIRS_ROWS = 9;
/** Pixels a body can rise: a jump alone, or a jump with an upward dash at any moment (conservative). */
const JUMP_RISE = 120;
const DASH_RISE = 210;
/** How many columns a jump can carry you, by rows climbed (from a running start). */
const JUMP_SPAN = [6, 5, 5, 4];
for (const r of ROOMS) {
  const climb = r.stairs ? STAIRS_ROWS : r.dash ? DASH_ROWS : JUMP_ROWS;
  const w = r.map[0].length;
  const h = r.map.length;
  // graphs to stand on count as platforms, at their resting height
  const grid = r.map.map((row) => [...row]);
  for (const c of r.curves ?? []) {
    for (let x = Math.ceil(c.x0); x < Math.floor(c.x1); x++) {
      const u = x + 0.5;
      // a living wave can be ridden up to its crest
      const yy = c.k === 'line' ? c.y0 + ((c.y1 - c.y0) * (u - c.x0)) / (c.x1 - c.x0) : c.k === 'sin' ? c.y - c.amp : c.vy - c.a * (u - c.vx) ** 2;
      const row = Math.floor(yy - 0.01);
      if (row >= 0 && row < h && grid[row][x] === '.') grid[row][x] = '-';
    }
  }
  // ground that is a graph: count it at the axis, where its ends are pinned and where it comes to rest
  if (r.floor && r.axes) for (let x = r.floor.x0; x < r.floor.x1; x++) if (grid[r.axes.oy][x] === '.') grid[r.axes.oy][x] = '-';
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : grid[y][x]);
  const solid = (x: number, y: number) => at(x, y) === '#';
  const floor = (x: number, y: number) => at(x, y) === '#' || at(x, y) === '-';
  const stand = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && !solid(x, y) && floor(x, y + 1);
  const fall = (x: number, y: number): [number, number] | null => {
    for (let yy = y; yy < h; yy++) {
      if (solid(x, yy)) return null;
      if (stand(x, yy)) return [x, yy];
    }
    return null;
  };
  const seen = new Set<string>();
  const queue: [number, number][] = [];
  const push = (c: [number, number] | null) => {
    if (!c) return;
    const k = c.join(',');
    if (seen.has(k)) return;
    seen.add(k);
    queue.push(c);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (c === '@' || c === '&' || ((x === 0 || x === w - 1) && /[A-Z0-9]/.test(c))) push(stand(x, y) ? [x, y] : fall(x, y));
      if (y === 0 && /[A-Z0-9]/.test(c)) push(fall(x, 1));
      if (y === h - 1 && /[A-Z0-9]/.test(c)) for (let up = 1; up <= 5; up++) if (stand(x, h - 1 - up)) push([x, h - 1 - up]);
    }
  }
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const dx of [-1, 1]) if (!solid(x + dx, y)) push(fall(x + dx, y));
    if (at(x, y + 1) === '-') push(fall(x, y + 2));
    for (let dy = 1; dy <= climb; dy++) {
      if (solid(x, y - dy)) break;
      const span = JUMP_SPAN[Math.min(dy, JUMP_SPAN.length - 1)];
      for (let dx = -span; dx <= span; dx++) {
        const tx = x + dx;
        const ty = y - dy;
        let clear = true;
        for (let xx = Math.min(x, tx); xx <= Math.max(x, tx); xx++) if (solid(xx, ty) || solid(xx, ty - 1)) clear = false;
        if (clear && stand(tx, ty)) push([tx, ty]);
        if (clear) push(fall(tx, ty));
      }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = at(x, y);
      const spec = r.legend[c];
      if (spec?.k === 'shrine' && !seen.has(`${x},${y}`)) fail(`${r.id}: shrine '${spec.give}' at (${x},${y}) cannot be reached`);
      // every lamp, and every platform, should be somewhere x can actually stand
      if (c === '&' && !seen.has(`${x},${y}`)) fail(`${r.id}: lamp at (${x},${y}) cannot be reached`);
      if (c === '-' && (x === 0 || at(x - 1, y) !== '-')) {
        let run = x;
        let ok = false;
        while (at(run, y) === '-') {
          if (seen.has(`${run},${y - 1}`)) ok = true;
          run++;
        }
        if (!ok) fail(`${r.id}: platform at (${x}..${run - 1},${y}) cannot be reached`);
      }
      if (/[A-Z0-9]/.test(c)) {
        const reach =
          y === h - 1 ? seen.has(`${x},${y - 1}`) || fall(x, y - 1) === null
          : y === 0 ? [...seen].some((k) => {
              // a ceiling exit is taken when the head (30px above the feet) passes y = 0
              const [sx, sy] = k.split(',').map(Number);
              return (sy + 1) * 32 - 30 <= (r.dash ? DASH_RISE : JUMP_RISE) && Math.abs(sx - x) <= 2;
            })
          : seen.has(`${x},${y}`) || [...seen].some((k) => k === `${x},${y + 1}` || k === `${x},${y + 2}`);
        if (!reach && (x === 0 || x === w - 1 ? floor(x, y + 1) : true)) fail(`${r.id}: exit ${c} at (${x},${y}) cannot be reached`);
      }
    }
  }
}

console.log(ok ? '✓ rooms valid' : 'rooms invalid');
process.exit(ok ? 0 : 1);
