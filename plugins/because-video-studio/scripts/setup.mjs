#!/usr/bin/env node
// One-time setup for because-video-studio, on Mac and Windows. Safe to re-run: it only installs what is missing.
//   node setup.mjs [--check] [--workspace <dir>] [--skip-test]
// Builds a studio workspace (default Documents/Because Studio) with the tree the tools expect:
//   tools/ templates/ library/ prompts/ recipes/ studio/ (copied from the plugin) + node_modules/ + .venv/ + clients/
// Prints OK / WARN / FAIL lines; the setup skill explains them to the person in plain words.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = platform() === 'win32', MAC = platform() === 'darwin';
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const CONFIG_DIR = join(homedir(), '.because-video-studio');
const CONFIG = join(CONFIG_DIR, 'config.json');
const config = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')) : {};
const WS = resolve(opt('workspace') ?? config.workspace ?? join(homedir(), 'Documents', 'Because Studio'));
const VERSION = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const STUDIO_PARTS = ['tools', 'templates', 'library', 'prompts', 'recipes', 'studio', 'package.json'];
const VPY = WIN ? join(WS, '.venv', 'Scripts', 'python.exe') : join(WS, '.venv', 'bin', 'python');

const fails = [], warns = [];
const say = (t) => console.log(`\n== ${t}`);
const ok = (t) => console.log(`  OK   ${t}`);
const bad = (t, fix = '') => { fails.push(t); console.log(`  FAIL ${t}${fix ? `\n       -> ${fix}` : ''}`); };
const warn = (t) => { warns.push(t); console.log(`  WARN ${t}`); };
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: 'utf8', shell: WIN, ...o });
const has = (cmd) => run(WIN ? 'where' : 'which', [cmd]).status === 0;

function refreshPath() {
  const extra = WIN
    ? ['C:\\Program Files\\nodejs', join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Links'), join(homedir(), '.local', 'bin')]
    : ['/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local', 'bin')];
  for (const p of extra) if (existsSync(p) && !process.env.PATH.split(WIN ? ';' : ':').includes(p)) process.env.PATH += (WIN ? ';' : ':') + p;
}
function pkgInstall(mac, win, label) {
  if (MAC && has('brew')) { console.log(`  installing ${label} with Homebrew (a few minutes)...`); return run('brew', ['install', mac], { stdio: 'inherit' }).status === 0; }
  if (WIN && has('winget')) {
    console.log(`  installing ${label} with winget (a few minutes; accept any prompt)...`);
    return run('winget', ['install', '-e', '--id', win, '--accept-package-agreements', '--accept-source-agreements'], { stdio: 'inherit' }).status === 0;
  }
  return false;
}
const hint = (label) => MAC ? `Install Homebrew from https://brew.sh, then run setup again (it installs ${label}).`
  : WIN ? `Update "App Installer" from the Microsoft Store so winget works, then run setup again (it installs ${label}).`
  : `Install ${label} with your package manager, then run setup again.`;

console.log(`because-video-studio setup ${VERSION} (${platform()}), workspace: ${WS}`);

say('1/6  System tools (Node.js 22+, ffmpeg, uv)');
refreshPath();
const nodeMajor = Number(process.versions.node.split('.')[0]);
nodeMajor >= 22 ? ok(`Node.js ${process.versions.node}`) : bad(`Node.js ${process.versions.node} is too old`, hint('Node.js 22+'));
if (!CHECK && !(has('ffmpeg') && has('ffprobe'))) { pkgInstall('ffmpeg', 'Gyan.FFmpeg', 'ffmpeg'); refreshPath(); }
has('ffmpeg') && has('ffprobe') ? ok('ffmpeg + ffprobe') : bad('ffmpeg is missing', hint('ffmpeg'));
if (!CHECK && !has('uv')) { pkgInstall('uv', 'astral-sh.uv', 'uv (Python manager)'); refreshPath(); }
has('uv') ? ok('uv') : bad('uv is missing', hint('uv'));

say('2/6  Studio files');
if (!CHECK) {
  mkdirSync(join(WS, 'clients'), { recursive: true });
  for (const p of STUDIO_PARTS) {
    const src = join(PLUGIN, p), dst = join(WS, p);
    if (!existsSync(src)) continue;
    if (p !== 'package.json') rmSync(dst, { recursive: true, force: true });   // studio files only; clients/ is never touched
    cpSync(src, dst, { recursive: true });
  }
  writeFileSync(join(WS, '.studio-version'), VERSION);
}
existsSync(join(WS, 'tools', 'ship.mjs')) ? ok(`studio files ${existsSync(join(WS, '.studio-version')) ? readFileSync(join(WS, '.studio-version'), 'utf8') : '?'}`) : bad('studio files are missing');

say('3/6  Render engine (Playwright + Chromium)');
if (!CHECK && !existsSync(join(WS, 'node_modules', 'playwright'))) run('npm', ['install', '--no-audit', '--no-fund'], { cwd: WS, stdio: 'inherit' });
if (!CHECK) run('npx', ['playwright', 'install', 'chromium'], { cwd: WS, stdio: 'inherit' });
existsSync(join(WS, 'node_modules', 'playwright')) ? ok('playwright') : bad('playwright did not install', 'Check the internet connection, then run setup again.');

say('4/6  Python tools');
if (!CHECK && has('uv')) {
  if (!existsSync(VPY)) run('uv', ['venv', '-q', '-p', '3.12', join(WS, '.venv')], { stdio: 'inherit' });
  if (existsSync(VPY)) run('uv', ['pip', 'install', '-q', '--python', VPY, '-r', join(PLUGIN, 'requirements', 'requirements.txt')], { stdio: 'inherit' });
}
const imp = existsSync(VPY) ? run(VPY, ['-c', 'import numpy, scipy, librosa, soundfile, PIL, cv2, yaml, qrcode, beat_this, faster_whisper']) : { status: 1 };
imp.status === 0 ? ok('Python 3.12 environment') : bad('Python tools are not installed', 'Run setup again; if it repeats, share this line with the plugin owner.');

say('5/6  Keys and connectors');
const env = existsSync(join(WS, '.env')) ? readFileSync(join(WS, '.env'), 'utf8') : '';
/ELEVEN_LABS_API_KEY=\S+/.test(env) ? ok('ElevenLabs key') : warn('ElevenLabs key not set yet: add it in the plugin settings (/plugin, because-video-studio, Configure). Voiceover and AI music wait until then.');
console.log('  (Higgsfield is a Claude connector: the setup skill checks it.)');

say('6/6  Test render (3 s)');
if (!CHECK && !args.includes('--skip-test') && !fails.length) {
  const t = join(WS, '.setup-test');
  rmSync(t, { recursive: true, force: true }); mkdirSync(t, { recursive: true });
  for (const f of ['index.html', 'motion.js', 'blocks.js']) cpSync(join(WS, 'templates', 'engine', f), join(t, f));
  const r = run('node', [join(WS, 'tools', 'render.mjs'), join(t, 'index.html'), '--fps', '30', '--dur', '3', '--w', '540', '--h', '960', '--out', join(t, 'test.mp4')], { stdio: 'inherit' });
  r.status === 0 && existsSync(join(t, 'test.mp4')) ? ok(`rendered ${join(t, 'test.mp4')}`) : bad('the test render failed', 'Run setup again; if it repeats, share the lines above with the plugin owner.');
}

if (!CHECK) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG, JSON.stringify({ ...config, workspace: WS, setup_version: VERSION, plugin_root: PLUGIN, os: platform(), done: !fails.length }, null, 2));
}
console.log(`\n${fails.length ? `NOT READY: ${fails.length} problem(s)` : 'READY'}${warns.length ? `, ${warns.length} note(s)` : ''}. Workspace: ${WS}`);
process.exit(fails.length ? 1 : 0);
