#!/usr/bin/env node
// SessionStart hook. Whatever it prints goes to Claude as context; it prints nothing when all is well.
// 1. Setup never ran, or the plugin was updated since: tell Claude to run setup before any video.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(homedir(), '.because-video-studio', 'config.json');
let version = '?';
try { version = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch {}

// A Cloud session runs on a Linux machine Anthropic hosts, not on the person's computer: the render engine download is
// blocked there and nothing it makes reaches their Documents folder. Stop before setup starts.
// EVAL_CLOUD_SESSION lets claude plugin eval act out a Cloud session: it passes only EVAL_* variables to the plugin.
if (process.env.CLAUDE_CODE_REMOTE === 'true' || process.env.EVAL_CLOUD_SESSION === 'true') {
  console.log('[because-video-studio] This session runs in the Cloud, not on this person\'s computer, so the video studio cannot work here. If they ask for setup or a video, say in plain words: "This session is running in the cloud. Start a new session in Code, choose Local (not Cloud) and your Documents folder, then ask again." Do not run setup or any studio tool in this session.');
  process.exit(0);
}
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
  const ask = cfg.music === undefined
    ? ' This computer has not chosen its optional extras yet: ask only the extras question from the setup skill (real-instrument music, ElevenLabs voiceovers, Higgsfield shots), then run setup with those answers.'
    : ' Run it quietly with the remembered choices (it only installs what changed).';
  console.log(`[because-video-studio] The plugin is ${version} but setup last ran for ${cfg.setup_version ?? 'nothing'}${cfg.done ? '' : ' and did not finish'}. Before the next video, run /because-video-studio:setup and tell the person in one line.${ask}`);
}
