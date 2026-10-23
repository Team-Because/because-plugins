#!/usr/bin/env node
// One-time setup for because-video-studio, on Mac and Windows. Safe to re-run: it only installs what is missing.
//   node setup.mjs [--check] [--workspace <dir>] [--skip-test] [--music | --no-music] [--connectors higgsfield,elevenlabs | none]
// Builds a studio workspace (default Documents/Because Studio) with the tree the tools expect:
//   tools/ templates/ library/ prompts/ recipes/ studio/ (copied from the plugin) + node_modules/ + .venv/ + clients/
// Prints OK / WARN / FAIL lines; the setup skill explains them to the person in plain words.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

if (process.env.CLAUDE_CODE_REMOTE === 'true') {
  console.log('  FAIL this session runs in the Cloud, not on this computer\n       -> Start a new session in Code with Local selected (not Cloud), choose the Documents folder, then run setup again.');
  process.exit(1);
}
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
const STUDIO_PARTS = ['tools', 'templates', 'library', 'prompts', 'recipes', 'studio', 'voice', 'vox', 'package.json'];
const VOX = args.includes('--vox');
// The person's choices, asked once by the setup skill and remembered for every re-run and plugin update:
//   music       the free real-instrument music engine on this computer (about 220 MB); without it music comes from the
//               built-in synth score (tools/score.py), so every video still has music
//   connectors  which Claude connectors they use (higgsfield, elevenlabs); both optional, Claude checks them at video time
const MUSIC = VOX || (args.includes('--music') || (config.music === true && !args.includes('--no-music')));
const CONNECTORS = (opt('connectors') ?? (config.connectors ?? []).join(',')).split(',').map((x) => x.trim().toLowerCase()).filter((x) => x && x !== 'none');
const VOICE = args.includes('--voice') || VOX;   // vox uses the voice tools and their torch for the cut-out
const VPY = WIN ? join(WS, '.venv', 'Scripts', 'python.exe') : join(WS, '.venv', 'bin', 'python');

const fails = [], warns = [];
const say = (t) => console.log(`\n== ${t}`);
const ok = (t) => console.log(`  OK   ${t}`);
const bad = (t, fix = '') => { fails.push(t); console.log(`  FAIL ${t}${fix ? `\n       -> ${fix}` : ''}`); };
const warn = (t) => { warns.push(t); console.log(`  WARN ${t}`); };
// On Windows, npm and npx are .cmd files that only start through the shell, and the shell does not quote: every argument
// is quoted here so a folder like "Because Studio" stays one argument. Everything else starts directly, with no shell.
const SHIMS = new Set(['npm', 'npx']);
const q = (x) => (/[\s"&|<>^]/.test(x) ? `"${String(x).replace(/"/g, '\\"')}"` : String(x));
const run = (cmd, a, o = {}) => (WIN && SHIMS.has(cmd)
  ? spawnSync(q(cmd), a.map(q), { encoding: 'utf8', shell: true, ...o })
  : spawnSync(cmd, a, { encoding: 'utf8', ...o }));
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

if (VOICE) {
  // Voice tools install on first use: their own venv (torch 2.8 and older numpy pins than the main tools) + Sidon weights, about 2 GB
  say('voice  Voice tools (Sidon speech restoration, about 2 GB once)');
  const VVPY = WIN ? join(WS, '.venv-voice', 'Scripts', 'python.exe') : join(WS, '.venv-voice', 'bin', 'python');
  if (!CHECK && has('uv')) {
    if (!existsSync(VVPY)) run('uv', ['venv', '-q', '-p', '3.11', join(WS, '.venv-voice')], { stdio: 'inherit' });
    if (existsSync(VVPY)) {
      run('uv', ['pip', 'install', '-q', '--python', VVPY, '-r', join(PLUGIN, 'requirements', 'voice.txt')], { stdio: 'inherit' });
      run(VVPY, ['-c', [
        'from huggingface_hub import hf_hub_download; import transformers',
        'for f in ("feature_extractor_cpu.pt", "decoder_cpu.pt"): hf_hub_download("sarulab-speech/sidon-v0.1", filename=f)',
        'transformers.SeamlessM4TFeatureExtractor.from_pretrained("facebook/w2v-bert-2.0")'].join('\n')], { stdio: 'inherit' });
    }
  }
  const vi = existsSync(VVPY) ? run(VVPY, ['-c', 'import torch, transformers, pedalboard, pyloudnorm, demucs']) : { status: 1 };
  vi.status === 0 ? ok('voice tools') : bad('voice tools are not installed', 'Run setup with the voice step again; it needs about 2 GB and a good connection.');
}

if (MUSIC) {
  // Music for every film, free and local: real sampled instruments (pretty_midi + FluidSynth + the MuseScore soundfont)
  say('music  Music engine (real instruments: soundfont and FluidSynth, about 220 MB once)');
  if (!CHECK && existsSync(VPY)) run('uv', ['pip', 'install', '-q', '--python', VPY, '-r', join(PLUGIN, 'requirements', 'vox.txt')], { stdio: 'inherit' });
  const vimp = existsSync(VPY) ? run(VPY, ['-c', 'import pretty_midi, pedalboard, faster_whisper']) : { status: 1 };
  vimp.status === 0 ? ok('score and caption packages') : bad('the music packages did not install', 'Run setup again.');

  // MuseScore General soundfont (MIT): resumable download with a size check, because a stalled download plays wrong
  const SF2 = join(WS, 'soundfont', 'MuseScore_General.sf2'), SF2_BYTES = 215614036;
  const SF2_URL = 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf2';
  const size = () => (existsSync(SF2) ? statSync(SF2).size : 0);
  if (!CHECK && size() !== SF2_BYTES) {
    mkdirSync(dirname(SF2), { recursive: true });
    console.log(`  downloading the instrument soundfont (216 MB, once)...`);
    for (let tries = 0; tries < 4 && size() !== SF2_BYTES; tries++) {
      const have = size();
      const res = await fetch(SF2_URL, { headers: have ? { Range: `bytes=${have}-` } : {} });
      if (!res.ok && res.status !== 206) break;
      if (have && res.status !== 206) rmSync(SF2, { force: true });   // server ignored the range: start over
      const out = createWriteStream(SF2, { flags: have && res.status === 206 ? 'a' : 'w' });
      await pipeline(Readable.fromWeb(res.body), out);
    }
  }
  size() === SF2_BYTES ? ok('soundfont') : bad(`soundfont is ${size()} of ${SF2_BYTES} bytes`, 'Run setup again; it resumes the download.');

  // FluidSynth renders the score: Homebrew on Mac, the official Windows build unpacked into <studio>/bin/fluidsynth
  if (!CHECK && !has('fluidsynth')) {
    if (MAC) pkgInstall('fluid-synth', '', 'FluidSynth');
    if (WIN) {
      const zip = join(WS, 'bin', 'fluidsynth.zip'), dir = join(WS, 'bin', 'fluidsynth');
      mkdirSync(dir, { recursive: true });
      const res = await fetch('https://github.com/FluidSynth/fluidsynth/releases/download/v2.6.1/fluidsynth-v2.6.1-win10-x64-cpp11.zip');
      if (res.ok) { await pipeline(Readable.fromWeb(res.body), createWriteStream(zip)); run('tar', ['-xf', zip, '-C', dir]); rmSync(zip, { force: true }); }
    }
  }
  const fsWin = WIN && existsSync(join(WS, 'bin', 'fluidsynth'));
  has('fluidsynth') || fsWin ? ok('FluidSynth') : bad('FluidSynth is missing', hint('FluidSynth'));

} else {
  say('music  Music engine');
  console.log('  skipped: music comes from the built-in score. Add real-instrument music any time with setup --music.');
}

if (VOX) {
  say('vox  Vox reel extras (speaker cut-out)');
  // Speaker cut-out: Apple Vision on a Mac (built from source with swiftc), BiRefNet everywhere (MIT, in .venv-voice)
  if (MAC) {
    const bin = join(WS, 'bin', 'personmask');
    if (!CHECK && !existsSync(bin) && has('swiftc')) { mkdirSync(dirname(bin), { recursive: true }); run('swiftc', ['-O', join(WS, 'vox', 'personmask.swift'), '-o', bin], { stdio: 'inherit' }); }
    existsSync(bin) ? ok('Apple Vision cut-out') : warn('Apple Vision cut-out not built (needs Xcode command line tools: xcode-select --install). BiRefNet is used instead.');
  }
  const VVPY2 = WIN ? join(WS, '.venv-voice', 'Scripts', 'python.exe') : join(WS, '.venv-voice', 'bin', 'python');
  if (!CHECK && existsSync(VVPY2)) {
    run('uv', ['pip', 'install', '-q', '--python', VVPY2, '-r', join(PLUGIN, 'requirements', 'matte.txt')], { stdio: 'inherit' });
    run(VVPY2, ['-c', 'from transformers import AutoModelForImageSegmentation as M; M.from_pretrained("ZhengPeng7/BiRefNet", revision="e2bf8e4460fc8fa32bba5ea4d94b3233d367b0e4", trust_remote_code=True)'], { stdio: 'inherit' });
  }
  const mimp = existsSync(VVPY2) ? run(VVPY2, ['-c', 'import torchvision, timm, kornia, einops']) : { status: 1 };
  mimp.status === 0 ? ok('BiRefNet cut-out') : bad('the cut-out model did not install', 'Run setup with the vox step again.');
}

say('5/6  Connectors');
console.log(`  chosen: ${CONNECTORS.length ? CONNECTORS.join(', ') : 'none'} (Claude connectors, optional: the setup skill checks they are connected)`);

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
  writeFileSync(CONFIG, JSON.stringify({ ...config, workspace: WS, music: MUSIC, connectors: CONNECTORS, setup_version: VERSION, plugin_root: PLUGIN, os: platform(), done: !fails.length }, null, 2));
}
console.log(`\n${fails.length ? `NOT READY: ${fails.length} problem(s)` : 'READY'}${warns.length ? `, ${warns.length} note(s)` : ''}. Workspace: ${WS}`);
process.exit(fails.length ? 1 : 0);
