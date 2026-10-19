// The engine guard: our engine by default, HyperFrames only when the video's brief says so, Remotion never, and nothing
// policed outside the studio workspace.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const GUARD = join(import.meta.dirname, '..', 'plugins', 'because-video-studio', 'scripts', 'engine-guard.mjs');
const root = mkdtempSync(join(tmpdir(), 'bvs guard '));   // a space on purpose, like "Because Studio"
const ws = join(root, 'Because Studio');
const seek = join(ws, 'clients', 'demo', 'videos', 'teaser');
const hf = join(ws, 'clients', 'demo', 'videos', 'hf-reel');
mkdirSync(seek, { recursive: true }); mkdirSync(hf, { recursive: true });
writeFileSync(join(seek, 'brief.md'), '# Brief\nengine: seek-t\n');
writeFileSync(join(hf, 'brief.md'), '# Brief\n- engine: hyperframes\n');
const config = join(root, 'config.json');
writeFileSync(config, JSON.stringify({ workspace: ws }));

const guard = (command, cwd) => spawnSync(process.execPath, [GUARD], {
  input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd }), env: { ...process.env, BVS_CONFIG: config }, encoding: 'utf8',
}).status;

test('studio engine commands pass', () => assert.equal(guard('node tools/ship.mjs clients/demo/videos/teaser/index.html', ws), 0));
test('remotion is blocked inside the studio', () => assert.equal(guard('npx remotion render Main out.mp4', seek), 2));
test('hyperframes is blocked on a seek-t video', () => assert.equal(guard('npx hyperframes render', seek), 2));
test('hyperframes is blocked when the path points at a seek-t video', () => assert.equal(guard(`npx hyperframes render "${seek}"`, ws), 2));
test('hyperframes passes when the brief asks for it', () => assert.equal(guard('npx hyperframes render', hf), 0));
test('installing hyperframes skills passes', () => assert.equal(guard('npx --yes hyperframes@0.8.174 skills update', ws), 0));
test('nothing is policed outside the studio', () => assert.equal(guard('npx remotion render Main out.mp4', tmpdir()), 0));
