// node tools/beatgrid.mjs --bpm 120 --bars 8 [--beats-per-bar 4] [--offset 0] [--out <dir>]
// Writes <dir>/beats.json (every beat, downbeats, duration) and <dir>/state_list.md (one row per beat to fill
// with a UI state). Same beats.json shape as step 09's measured grid, so the film code reads either.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const BPM = +opt('bpm', 0), BARS = +opt('bars', 0), PER = +opt('beats-per-bar', 4), OFF = +opt('offset', 0), OUT = opt('out', '.');
if (!(BPM > 0) || !(BARS > 0) || !Number.isInteger(BARS)) {
  console.error('usage: node tools/beatgrid.mjs --bpm 120 --bars 8 [--beats-per-bar 4] [--offset 0] [--out dir]');
  process.exit(1);
}
const beat = 60 / BPM, n = BARS * PER;
const beats = Array.from({ length: n }, (_, i) => +(OFF + i * beat).toFixed(3));
const downbeats = beats.filter((_, i) => i % PER === 0);
const duration = +(OFF + n * beat).toFixed(3);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'beats.json'), JSON.stringify({ bpm: BPM, source: 'grid', beatsPerBar: PER, beats, downbeats, hits: [], duration }, null, 1) + '\n');

const sl = join(OUT, 'state_list.md');
if (existsSync(sl)) { console.log(`beats.json written; ${sl} exists, not overwritten`); process.exit(0); }
const rows = beats.map((t, i) => {
  const bar = Math.floor(i / PER) + 1, b = (i % PER) + 1, next = i + 1 < n ? beats[i + 1] : duration;
  return `| ${bar}.${b}${b === 1 ? ' ↓' : ''} | ${t.toFixed(3)} | ${(next - t).toFixed(3)} | ${i === 0 ? '[state 1, same as the last row]' : ''} | | |`;
});
writeFileSync(sl, `# State list

${BPM} BPM, ${BARS} bars of ${PER}, ${n} beats, ${duration} s. ↓ = downbeat (put big changes here).
One state per beat. Every state must exist in the real product (brand/assets). The last row returns to state 1 so it loops.
Approved by: [name, DD-MM-YYYY]

| Beat | Time (s) | Length | State (what the one shape becomes) | Real data shown | Cursor action |
|---|---|---|---|---|---|
${rows.join('\n')}
| end | ${duration.toFixed(3)} | | state 1 again (loop) | | |
`);
console.log(`${n} beats, ${duration}s -> ${join(OUT, 'beats.json')}, ${sl}`);
