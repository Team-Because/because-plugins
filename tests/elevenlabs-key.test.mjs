// The ElevenLabs key from the plugin's options reaches the studio's .env, where the transcript and voice tools read it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PLUGIN = join(import.meta.dirname, '..', 'plugins', 'because-video-studio');
const version = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;

function studio(envText) {
  const dir = mkdtempSync(join(tmpdir(), 'key-')), home = join(dir, 'home'), ws = join(dir, 'ws');
  mkdirSync(join(home, '.because-video-studio'), { recursive: true }); mkdirSync(ws);
  writeFileSync(join(home, '.because-video-studio', 'config.json'), JSON.stringify({ workspace: ws, setup_version: version, done: true, music: false }));
  if (envText !== undefined) writeFileSync(join(ws, '.env'), envText);
  return { home, envFile: join(ws, '.env') };
}
const run = (home, key) => spawnSync(process.execPath, [join(PLUGIN, 'scripts', 'session-check.mjs')],
  { env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY: key ?? '' }, encoding: 'utf8' });

test('a key set in the plugin options replaces the old one and keeps the other lines', () => {
  const { home, envFile } = studio('OTHER=1\nELEVEN_LABS_API_KEY=old\n');
  assert.equal(run(home, 'sk_new').status, 0);
  assert.equal(readFileSync(envFile, 'utf8'), 'OTHER=1\nELEVEN_LABS_API_KEY=sk_new\n');
});

test('no key in the options leaves the studio .env alone', () => {
  const { home, envFile } = studio('OTHER=1\n');
  assert.equal(run(home, '').status, 0);
  assert.equal(readFileSync(envFile, 'utf8'), 'OTHER=1\n');
});
