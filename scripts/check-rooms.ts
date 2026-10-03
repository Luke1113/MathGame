// Validates chapter maps: equal row widths, exits paired between rooms, legend coverage.
import { ROOMS } from '../src/rooms.ts';

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
    if (/[A-Z]/.test(c)) {
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
/** How many columns a jump can carry you, by rows climbed (from a running start). */
const JUMP_SPAN = [6, 5, 5, 4];
for (const r of ROOMS) {
  const w = r.map[0].length;
  const h = r.map.length;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : r.map[y][x]);
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
      if (c === '@' || c === '&' || ((x === 0 || x === w - 1) && /[A-Z]/.test(c))) push(stand(x, y) ? [x, y] : fall(x, y));
      if (y === 0 && /[A-Z]/.test(c)) push(fall(x, 1));
      if (y === h - 1 && /[A-Z]/.test(c)) for (let up = 1; up <= 5; up++) if (stand(x, h - 1 - up)) push([x, h - 1 - up]);
    }
  }
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const dx of [-1, 1]) if (!solid(x + dx, y)) push(fall(x + dx, y));
    if (at(x, y + 1) === '-') push(fall(x, y + 2));
    for (let dy = 1; dy <= JUMP_ROWS; dy++) {
      if (solid(x, y - dy)) break;
      for (let dx = -JUMP_SPAN[dy]; dx <= JUMP_SPAN[dy]; dx++) {
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
      if (/[A-Z]/.test(c)) {
        const reach =
          y === h - 1 ? seen.has(`${x},${y - 1}`) || fall(x, y - 1) === null
          : y === 0 ? [1, 2, 3, 4].some((d) => seen.has(`${x},${d}`))
          : seen.has(`${x},${y}`) || [...seen].some((k) => k === `${x},${y + 1}` || k === `${x},${y + 2}`);
        if (!reach && (x === 0 || x === w - 1 ? floor(x, y + 1) : true)) fail(`${r.id}: exit ${c} at (${x},${y}) cannot be reached`);
      }
    }
  }
}

console.log(ok ? '✓ rooms valid' : 'rooms invalid');
process.exit(ok ? 0 : 1);
