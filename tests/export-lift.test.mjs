// The fully layered export (tools/export-lift.mjs): keyframes, stacking order, shape layers, and the After Effects script
// that builds them. Pure logic, no browser; the full run on a real film is in the release check (ci.yml, install job).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PLUGIN = join(import.meta.dirname, '..', 'plugins', 'because-video-studio');
const L = await import(join(PLUGIN, 'tools', 'export-lift.mjs'));
const circle = (r) => [{ v: [[r, 0], [0, r], [-r, 0], [0, -r]], i: [[0, -0.55 * r], [0.55 * r, 0], [0, 0.55 * r], [-0.55 * r, 0]], o: [[0, 0.55 * r], [-0.55 * r, 0], [0, -0.55 * r], [0.55 * r, 0]], closed: true }];
const at = (M, paths) => paths.map((s) => ({ ...s, v: s.v.map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]),
  i: s.i.map(([x, y]) => [M[0] * x + M[2] * y, M[1] * x + M[3] * y]), o: s.o.map(([x, y]) => [M[0] * x + M[2] * y, M[1] * x + M[3] * y]) }));
const shape = (k, M, paths, extra = {}) => ({ kind: 'shape', key: 'shape:fill:#ff0000#1', mode: 'fill', color: '#ff0000', alpha: 1, m: M, paths: at(M, paths), width: 1, cap: 'butt', join: 'miter', ...extra });

test('keyframes keep the frame where a hold turns into a move (no smearing)', () => {
  const vals = [...Array(30)].map((_, k) => [k / 30, { y: k < 15 ? 100 : 100 + (k - 15) * 10 }]);
  const ks = L.keepKeys(vals, (v) => v.y, 0.5);
  assert.ok(ks.some(([t]) => Math.abs(t - 15 / 30) < 1e-9), "the last held frame is a keyframe");
  for (const [t, v] of vals) {   // every frame is within tolerance of the straight lines between kept keys
    const j = ks.findIndex(([tt]) => tt >= t - 1e-9), [t1, b] = ks[j], [t0, a] = ks[Math.max(0, j - 1)];
    const y = t1 === t0 ? b.y : a.y + (b.y - a.y) * (t - t0) / (t1 - t0);
    assert.ok(Math.abs(y - v.y) <= 0.5 + 1e-9, `frame at ${t.toFixed(3)} off by ${Math.abs(y - v.y)}`);
  }
});

test('one stacking order for the scene, or a clear failure when the order flips', () => {
  const a = { kind: 'shape', key: 'A', paths: circle(5) }, b = { kind: 'image', key: 'B' }, px = { kind: 'px', key: 'px:A~source-over#1', tags: ['effect'], ops: ['source-over'] };
  const ok = L.liftScene([[a, px, b], [a, b]]);
  assert.deepEqual(ok.order, ['A', 'px:A~source-over#1', 'B']);
  assert.match(L.liftScene([[a, b], [b, a]]).fail, /drawing order changes/);
  assert.match(L.liftScene([[a]], { maxTracks: 0 }).fail, /live items/);
});

test('a circle that moves, squashes and flips keeps its path, with the motion as transform keyframes', () => {
  const frames = [[1, 1, 100, 100], [1.2, 0.8, 120, 100], [-1, 1, 140, 100]].map(([sx, sy, x, y]) => [shape(0, [sx, 0, 0, sy, x, y], circle(50))]);
  const tr = L.liftScene(frames).tracks[0], layer = L.shapeLayer(tr, 's01h001', 0, 30);
  assert.equal(layer.mode, 'moves');
  assert.deepEqual(layer.paths[0].v, circle(50)[0].v);
  assert.ok(layer.keyframes.position && layer.keyframes.scale, 'position and scale are keyframed');
  const last = layer.keyframes.scale.at(-1)[1];
  assert.ok(last[0] < 0 || last[1] < 0, 'the flip is a negative scale');
  const mid = L.shapeAt(layer, 1 / 30);
  assert.deepEqual(mid.pos.map(Math.round), [120, 100]);
});

test('a shape that changes form gets path keyframes in frame space', () => {
  const frames = [50, 60, 70].map((r) => [shape(0, [1, 0, 0, 1, 0, 0], circle(r))]);
  const layer = L.shapeLayer(L.liftScene(frames).tracks[0], 's01h001', 0, 30);
  assert.equal(layer.mode, 'reshapes');
  assert.equal(layer.pathKeys.length, 3);
  assert.equal(layer.pathKeys[2][1][0].v[0][0], 70);
});

test('a pixel layer keeps a blend mode After Effects has', () => {
  assert.equal(L.groupBlend({ ops: new Set(['screen']) }), 'screen');
  assert.equal(L.groupBlend({ ops: new Set(['lighter']) }), 'add');
  assert.equal(L.groupBlend({ ops: new Set(['source-over']) }), 'normal');
  assert.equal(L.groupBlend({ ops: new Set(['xor']) }), null);
});

test('the After Effects script builds path shapes and parses', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lift-'));
  const tr = L.liftScene([[shape(0, [1, 0, 0, 1, 10, 10], circle(20))], [shape(0, [1, 0, 0, 1, 30, 10], circle(20))]]).tracks[0];
  const m = { name: 'lift test', width: 1080, height: 1920, fps: 30, duration: 2, layers: [L.shapeLayer(tr, 's01h001', 0, 30)] };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m));
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const r = spawnSync(py, [join(PLUGIN, 'tools', 'export', 'make_ae_jsx.py'), join(dir, 'manifest.json'), '-o', join(dir, 'ae.jsx')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const jsx = readFileSync(join(dir, 'ae.jsx'), 'utf8');
  assert.match(jsx, /"shape": "path"/);
  assert.match(jsx, /function mkShape/);
  copyFileSync(join(dir, 'ae.jsx'), join(dir, 'ae.js'));
  const c = spawnSync(process.execPath, ['--check', join(dir, 'ae.js')], { encoding: 'utf8' });
  assert.equal(c.status, 0, c.stderr);
});
