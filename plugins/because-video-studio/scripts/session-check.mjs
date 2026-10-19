#!/usr/bin/env node
// SessionStart hook. Whatever it prints goes to Claude as context; it prints nothing when all is well.
// 1. Setup never ran, or the plugin was updated since: tell Claude to run setup before any video.
// 2. The ElevenLabs key from the plugin settings (stored securely by Claude Code) is written to the workspace .env,
//    because the studio tools read keys from there. The file is readable by this user only.
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(homedir(), '.because-video-studio', 'config.json');
let version = '?';
try { version = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}

if (!existsSync(CONFIG)) {
  console.log('[because-video-studio] Setup has not run on this computer. If the person asks for a video, say in one plain sentence that a one-time setup (about 10 minutes) comes first, then run /because-video-studio:setup. Do not start a video before setup is done.');
  process.exit(0);
}
let cfg;
try { cfg = JSON.parse(readFileSync(CONFIG, 'utf8')); } catch {
  console.log('[because-video-studio] The setup record is unreadable. Offer to run /because-video-studio:setup again.');
  process.exit(0);
}
if (cfg.setup_version !== version || !cfg.done) {
  console.log(`[because-video-studio] The plugin is ${version} but setup last ran for ${cfg.setup_version ?? 'nothing'}${cfg.done ? '' : ' and did not finish'}. Before the next video, run /because-video-studio:setup quietly (it only installs what changed) and tell the person in one line.`);
}

const key = process.env.CLAUDE_PLUGIN_OPTION_ELEVENLABS_API_KEY;
if (key && cfg.workspace && existsSync(cfg.workspace)) {
  const envFile = join(cfg.workspace, '.env');
  const lines = existsSync(envFile) ? readFileSync(envFile, 'utf8').split('\n').filter((l) => l && !l.startsWith('ELEVEN_LABS_API_KEY=')) : [];
  const next = [...lines, `ELEVEN_LABS_API_KEY=${key}`].join('\n') + '\n';
  if (!existsSync(envFile) || readFileSync(envFile, 'utf8') !== next) {
    writeFileSync(envFile, next);
    try { chmodSync(envFile, 0o600); } catch {}
  }
}
