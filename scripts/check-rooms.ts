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
console.log(ok ? '✓ rooms valid' : 'rooms invalid');
process.exit(ok ? 0 : 1);
