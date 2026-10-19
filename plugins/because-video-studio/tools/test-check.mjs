// node tools/test-check.mjs
// Calibration test for tools/check.mjs (L-032: a check you never saw fail proves nothing).
// Builds the engine starter plus one planted defect per gate in a temp folder and asserts each verdict.
// Run it after any change to check.mjs, blocks.js or the engine starter.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), engine = join(root, 'templates', 'engine');
const src = readFileSync(join(engine, 'index.html'), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'check-test-'));
const before = 'const SCENES = [\n', endCard = '  { from: T.end, to: DUR + 0.1, draw(t) {';

// [name, expected exit, expected text in output, edits [find, replace]]
const CASES = [
  ['clean', 0, 'Result: PASS', []],
  ['edge', 1, 'edges: text TITLE [right]', [["line('TITLE', W / 2, H * 0.32", "line('TITLE', W * 0.95, H * 0.32"]]],
  ['sound-off-motion', 1, 'no sound cue is within 1 frame', [["{ t: T.hop[0] + T.hop[1], type: 'thump'", "{ t: T.hop[0] + T.hop[1] + 0.13, type: 'thump'"]]],
  ['motion-retimed', 1, 'the film says', [['hop(t, ...T.hop, H * 0.18)', 'hop(t, T.hop[0], 0.55, H * 0.18)']]],
  ['under-plate', 1, 'under a caption plate', [[endCard, "  { from: 0, to: T.end, draw(t) { wordCaptions(t, [['hello', 0.1, 0.5], ['world', 0.5, 1]], [[0, 1]], { y: H * 0.32 }); }},\n" + endCard]]],
  ['tiny-text', 1, 'too small for a phone', [[endCard, "  { from: 0, to: T.end, draw(t) { line('fine print', W / 2, H * 0.9, t, 0, { size: 18, color: INK }); }},\n" + endCard]]],
  ['blank-frame0', 1, 'frame 0 is flat', [['g.fillStyle = ACCENT; g.beginPath(); g.arc', 'if (t < 0.5) { g.restore(); return; } g.fillStyle = ACCENT; g.beginPath(); g.arc']]],
  ['end-still-moving', 1, 'the last 1.5 s is still changing', [[before, before + "  { from: 0, to: DUR, draw(t) { line('TYPING ' + 'ABCDEFGHIJ'.slice(0, Math.floor(t * 2)), W / 2, H * 0.8, t, 0, { size: 60, color: INK }); }},\n"]]],
  ['dead-time', 0, 'dead: picture barely changes', [['const DUR = 6;', 'const DUR = 9;']]],
  ['camera-snaps', 0, 'jolt: _cam jolts', [[before, before + "  { from: 0, to: DUR, draw(t) { const x = t < 1 ? W / 2 * spring(t, 'snappy') : W / 2 + W / 4 * spring(t - 1, 'snappy'); rec('_cam', x, H / 2, 1, 1); }},\n"],
    ['  smooth: [],', "  smooth: [{ item: '_cam', from: 0.05, to: 2.5 }],"]]],
  ['camera-soft', 0, 'Result: PASS\n', [[before, before + "  { from: 0, to: DUR, draw(t) { const x = softTrack(t, [[0, 0], [0.01, W / 2], [1, W * 0.75]], 'default'); rec('_cam', x, H / 2, 1, 1); }},\n"],
    ['  smooth: [],', "  smooth: [{ item: '_cam', from: 0.05, to: 2.5 }],"]]],
];

let bad = 0;
for (const [name, code, text, edits] of CASES) {
  const dir = join(tmp, name); mkdirSync(dir);
  for (const f of ['motion.js', 'blocks.js']) copyFileSync(join(engine, f), join(dir, f));
  let s = src;
  for (const [a, b] of edits) { if (!s.includes(a)) { console.error(`${name}: starter no longer contains "${a.slice(0, 50)}", update this test`); process.exit(2); } s = s.replace(a, b); }
  writeFileSync(join(dir, 'index.html'), s);
  const r = spawnSync('node', [join(root, 'tools', 'check.mjs'), join(dir, 'index.html'), '--fmt', '9x16', '--no-sheets'], { encoding: 'utf8' });
  const ok = r.status === code && r.stdout.includes(text);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(18)} exit ${r.status} (want ${code}), ${ok ? 'caught as expected' : 'expected "' + text.trim() + '"\n' + r.stdout}`);
}
rmSync(tmp, { recursive: true });
process.exit(bad ? 1 : 0);
