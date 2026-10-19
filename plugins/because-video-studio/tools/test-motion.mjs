// node tools/test-motion.mjs [path/to/motion.js]   (default templates/engine/motion.js)
// Checks the spring helpers against the course figure and the seek(t) rules: exits 1 on any failure.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const file = process.argv[2] || fileURLToPath(new URL('../templates/engine/motion.js', import.meta.url));
const M = {}; vm.createContext(M);
vm.runInContext(readFileSync(file, 'utf8') + '\nObject.assign(globalThis, { clamp, lerp, SPRINGS, spring, track, indicator, swapAlpha, loopT, rng });', M);
const { SPRINGS, spring, track, indicator, swapAlpha, loopT, rng } = M;

let fails = 0;
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got !== undefined ? '  (' + got + ')' : ''}`); if (!ok) fails++; };
const peak = (k) => { let p = 0, at = 0; for (let t = 0; t <= 2; t += 0.001) { const v = spring(t, k); if (v > p) { p = v; at = t; } } return [p, at]; };
const settle = (k) => { let last = 0; for (let t = 0; t <= 3; t += 0.001) if (Math.abs(spring(t, k) - 1) > 0.01) last = t; return last; };

// 1. The curves match the course figure (spring step response, 0 to 1.2 s)
const [pp, pt] = peak('playful');
check('playful overshoots about 18%, peaking near 0.24 s', pp > 1.15 && pp < 1.22 && pt > 0.2 && pt < 0.28, `${pp.toFixed(3)} at ${pt.toFixed(3)}s`);
check('snappy overshoot is tiny (under 2%)', peak('snappy')[0] < 1.02, peak('snappy')[0].toFixed(4));
check('default never overshoots', peak('default')[0] <= 1 + 1e-9, peak('default')[0].toFixed(4));
check('heavy never overshoots', peak('heavy')[0] <= 1 + 1e-9, peak('heavy')[0].toFixed(4));
const s = Object.fromEntries(Object.keys(SPRINGS).map((k) => [k, settle(k)]));
check('settle order: snappy < default < heavy, all within 1.2 s', s.snappy < s.default && s.default < s.heavy && s.heavy < 1.2, JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(2)]))));
check('spring is 0 before start and at start', spring(-1) === 0 && spring(0) === 0);
check('overdamped branch is continuous with critical', Math.abs(spring(0.3, 100, 20.0001) - spring(0.3, 100, 20)) < 1e-4);

// 2. track(): many targets, no restart, no jumps
const keys = [[0, 0], [1, 100], [1.1, 40], [2, 300]];   // retarget at 1.1 s while still far from 100
const dt = 1 / 240; let maxJump = 0, maxKick = 0;
for (let t = dt; t < 4; t += dt) {
  const v0 = track(t - dt, keys), v1 = track(t, keys), v2 = track(t + dt, keys);
  maxJump = Math.max(maxJump, Math.abs(v1 - v0)); maxKick = Math.max(maxKick, Math.abs(v2 - 2 * v1 + v0));
}
check('track has no jumps at 240 fps (retarget mid-flight included)', maxJump < 10, maxJump.toFixed(2) + ' px/subframe');
check('track keeps its speed through a retarget (no restart from rest)', maxKick < 1, maxKick.toFixed(3) + ' px/subframe^2');
check('track lands on the last target', Math.abs(track(10, keys) - 300) < 1e-6);
check('track is a pure function of t (frame 812 without 0..811)', track(812 / 60, keys) === track(812 / 60, keys));

// 3. indicator, swapAlpha, loopT, rng
const st = [[0, 0], [1, 400]], mid = indicator(1.08, st);
check('indicator stretches while moving', mid.right - mid.left > 120, (mid.right - mid.left).toFixed(1) + ' px wide');
const end = indicator(5, st); check('indicator returns to its width at rest', Math.abs(end.right - end.left - 120) < 1e-3);
check('swapAlpha: hidden during the morph, shown between, gone before the next', swapAlpha(1.05, 1, 3) === 0 && swapAlpha(2, 1, 3) === 1 && swapAlpha(2.95, 1, 3) === 0);
check('loopT wraps negatives and the end', loopT(-1, 10) === 9 && loopT(10, 10) === 0);
const a = rng(7), b = rng(7); check('rng is seeded: same seed, same sequence', [1, 2, 3].every(() => a() === b()));

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed');
process.exit(fails ? 1 : 0);
