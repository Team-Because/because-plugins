// Fast checks that need no install: every script parses, the engine's spring maths holds, and nothing Mac-only or
// path-fragile slips back into the plugin. The full render test is scripts/setup.mjs (step 6) on a real machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const PLUGIN = join(import.meta.dirname, '..', 'plugins', 'because-video-studio');
function* walk(dir) {
  for (const f of readdirSync(dir)) {
    if (f === 'node_modules' || f === '__pycache__') continue;
    const p = join(dir, f);
    statSync(p).isDirectory() ? yield* walk(p) : yield p;
  }
}
const code = [...walk(PLUGIN)].filter((f) => ['.mjs', '.py'].includes(extname(f)));

test('every .mjs parses', () => {
  for (const f of code.filter((f) => f.endsWith('.mjs'))) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${relative(PLUGIN, f)}: ${r.stderr}`);
  }
});

test('every .py compiles', () => {
  const py = process.platform === 'win32' ? 'python' : 'python3';
  for (const f of code.filter((f) => f.endsWith('.py'))) {
    const r = spawnSync(py, ['-c', 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read())', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${relative(PLUGIN, f)}: ${r.stderr}`);
  }
});

test('engine springs pass their own test', () => {
  const r = spawnSync(process.execPath, [join(PLUGIN, 'tools', 'test-motion.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('no Mac-only or space-fragile patterns in tools', () => {
  // reel.mjs is phase 2 and still carries the studio's own paths; it is not used by v0.1 skills
  const bad = [
    [/\.venv['"]?,\s*['"]bin['"]/, 'hard-coded .venv/bin (use tools/paths)'],
    [/spawnSync\(['"](cp|rm|open)['"]/, 'POSIX cp/rm/open (use fs or paths.openFile)'],
    [/run\(['"](cp|rm)['"]/, 'POSIX cp/rm (use fs)'],
    [/new URL\(import\.meta\.url\)\.pathname/, '.pathname breaks on spaces and Windows (use fileURLToPath)'],
    [/\/opt\/homebrew|~\/Library|osascript/, 'Mac-only path or command'],
  ];
  const hits = [];
  // paths.mjs/.py and check_index.py hold the deliberate Mac/Windows switch for the venv path;
  // build_package.py lists the system font folders of both Mac and Windows
  const exempt = ['setup.mjs', 'paths.mjs', 'paths.py', 'check_index.py', 'build_package.py'];
  for (const f of code.filter((f) => !exempt.some((e) => f.endsWith(e)))) {
    readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      for (const [re, why] of bad) if (re.test(l)) hits.push(`${relative(PLUGIN, f)}:${i + 1} ${why}`);
    });
  }
  assert.deepEqual(hits, []);
});
