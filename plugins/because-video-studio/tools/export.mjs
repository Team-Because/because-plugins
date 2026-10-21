// node tools/export.mjs <video>/index.html [--fmt 9x16] [--fps 30] [--zip]
// The editor's handoff for Premiere Pro and After Effects, from a film that ship.mjs has rendered.
//   1. each scene of the film rendered alone with transparency (ProRes 4444), using the engine's window.SOLO switch
//      (films without window.film.scenes come out as one layer: the final render)
//   2. the background colour as a solid; voice, music and sound effects as separate tracks; the final mix as reference
//   3. captions.srt from the voiceover's word times (vo.json), scene markers
//   4. tools/export/build_package.py writes the After Effects script, the Premiere timeline (FCP7 XML) and a README
//   5. a check: the layers stacked in order must match the final render at three moments
// Output: <video>/out/<client>-<video>-<fmt>_editable/ (and .zip with --zip). Opens films through film-page.mjs, so reel
// films stay sealed.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, basename, sep } from 'node:path';
import { STUDIO, PY } from './paths.mjs';
import { launch, openFilm, autoSandbox } from './film-page.mjs';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
autoSandbox(page);   // reel films always run sealed (film-page.mjs)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page) { console.error('usage: node tools/export.mjs <video>/index.html [--fmt 9x16] [--fps 30] [--zip]'); process.exit(1); }
const vd = dirname(resolve(page)), out = join(vd, 'out');
const video = basename(vd), client = basename(dirname(dirname(vd)));
const SIZES = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080], '4x5': [1080, 1350] };
const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a, { encoding: 'utf8', stdio: o.quiet ? 'pipe' : 'inherit', ...o }); if (r.status) { console.error((r.stderr || '').slice(-1500)); throw new Error(`${basename(cmd)} failed`); } return r; };

const finals = existsSync(out) ? readdirSync(out).filter((f) => /-v\d+\.mp4$/.test(f)) : [];
const b = await launch();
let p = await openFilm(b, page, { width: 1080, height: 1920 });
await p.evaluate(() => window.ready);
const film = await p.evaluate(() => JSON.parse(JSON.stringify(window.film)));
// the film's own values are untrusted (a reel film is written after reading a reference): check every one before use
const fmt = opt('fmt', film.formats?.[0] ?? '9x16');
if (!SIZES[fmt]) { console.error(`unknown format ${fmt}`); process.exit(1); }
const [W, H] = SIZES[fmt], FPS = Math.min(120, Math.max(1, Math.round(+opt('fps', film.fps ?? 30)) || 30));
const DUR = Number.isFinite(+film.dur) && +film.dur > 0 && +film.dur <= 600 ? +film.dur : null;
if (!DUR) { console.error('the film has no valid length (window.film.dur)'); process.exit(1); }
film.dur = DUR;
const BG = /^#[0-9a-fA-F]{6}$/.test(film.bg ?? '') ? film.bg : '#000000';
const final = finals.filter((f) => f.includes(`-${fmt}-`)).sort((a, z) => +a.match(/-v(\d+)/)[1] - +z.match(/-v(\d+)/)[1]).at(-1);
if (!final) { console.error(`no ${fmt} render in out/: run tools/ship.mjs first`); process.exit(1); }
const slug = `${client}-${video}-${fmt}`, work = join(out, 'export'), pkg = join(out, `${slug}_editable`);
rmSync(work, { recursive: true, force: true }); mkdirSync(join(work, 'video'), { recursive: true });

// ---------- 1. scene layers ----------
await p.close();
p = await openFilm(b, page, { width: W, height: H }, `?fmt=${fmt}`);
await p.addStyleTag({ content: `html,body{margin:0;background:transparent!important}canvas{width:${W}px!important;height:${H}px!important;margin:0!important}` });
await p.evaluate(() => window.ready);
// the background: a live solid for After Effects, and the same colour as a still for Premiere (XML cannot carry solids)
const bgPng = join(work, 'background.png'), bgHex = BG.replace('#', '0x');
run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${bgHex}:s=${W}x${H}`, '-frames:v', '1', bgPng]);
const layers = [{ id: 'bg', name: 'Background', type: 'solid', color: BG, in: 0, out: film.dur },
  { id: 'bg-still', name: 'Background (Premiere)', type: 'image', targets: ['premiere'], from: bgPng, src: 'images/background.png', in: 0, out: film.dur, width: W, height: H }];
const scenes = (Array.isArray(film.scenes) ? film.scenes : []).slice(0, 200).map((s, idx) => ({
  i: idx, name: String(s?.name ?? `scene ${idx + 1}`).slice(0, 40),
  from: Math.max(0, Math.min(DUR, +s?.from)), to: Math.max(0, Math.min(DUR, +s?.to)) }))
  .filter((s) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from);
if (scenes.length) {
  for (const s of scenes) {
    const n = String(s.i + 1).padStart(2, '0'), file = join(work, 'video', `${n}_${s.name.replace(/[^\w-]+/g, '-')}_alpha_${W}x${H}.mov`);
    if (dirname(file) !== join(work, 'video')) throw new Error('bad scene name');
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
      '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
    const canvas = await p.$('canvas'), N = Math.max(1, Math.round((s.to - s.from) * FPS));
    for (let k = 0; k < N; k++) {
      await p.evaluate(([i, t]) => { window.SOLO = i; return window.seek(t); }, [s.i, s.from + k / FPS]);
      const png = await canvas.screenshot({ omitBackground: true, type: 'png' });
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r));
    layers.push({ id: `scene${n}`, name: s.name, type: 'footage', from: file, src: `video/${basename(file)}`, in: s.from, out: s.to, width: W, height: H, alpha: true });
    console.log(`layer ${n} ${s.name}: ${s.from}-${s.to} s, ${N} frames`);
  }
} else {
  console.log('this film has no window.film.scenes (made before the export switch): one layer, the final render');
  layers.push({ id: 'film', name: 'Film (one layer)', type: 'footage', from: join(out, final), src: `video/${final}`, in: 0, out: film.dur, width: W, height: H });
}
await b.close();

// ---------- 2. audio tracks ----------
// the music file the film names must sit inside the video folder
const inVideo = (f) => { try { return realpathSync(f).startsWith(realpathSync(vd) + sep); } catch { return false; } };
const named = film.music ? resolve(vd, String(film.music)) : null;
if (named && !inVideo(named)) console.log(`music ${film.music} is outside the video folder: left out`);
const audio = [['voice', join(vd, 'vo.wav')], ['music', named && inVideo(named) ? named : join(vd, 'music.wav')], ['sound effects', join(out, 'sfx.wav')]];
for (const [name, f] of audio) if (existsSync(f)) layers.push({ id: name.replace(' ', '-'), name, type: 'audio', from: f, src: `audio/${name.replace(' ', '-')}.wav`, in: 0 });
const mixRef = join(work, 'mix-reference.wav');
if (run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', join(out, final)], { quiet: true }).stdout.trim()) {
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(out, final), '-vn', '-ar', '48000', mixRef]);
  layers.push({ id: 'mix', name: 'final mix (reference)', type: 'audio', role: 'reference', enabled: false, from: mixRef, src: 'audio/mix-reference.wav', in: 0 });
}

// ---------- 3. markers and captions ----------
const markers = scenes.map((s) => ({ t: s.from, name: s.name }));
let srt = null;
if (existsSync(join(vd, 'vo.json'))) {
  const vo = JSON.parse(readFileSync(join(vd, 'vo.json'), 'utf8')), words = (Array.isArray(vo) ? vo : vo.words ?? []).filter((w) => w.start != null);
  const lines = []; let cur = [];
  for (const w of words) { cur.push(w); if (cur.length >= 6 || /[.?!,]$/.test(w.word ?? w.text ?? '')) { lines.push(cur); cur = []; } }
  if (cur.length) lines.push(cur);
  const ts = (x) => { const ms = Math.round(x * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  srt = lines.map((l, i) => `${i + 1}\n${ts(l[0].start)} --> ${ts(l.at(-1).end ?? l.at(-1).start + 0.4)}\n${l.map((w) => (w.word ?? w.text ?? '').trim()).join(' ')}\n`).join('\n');
}

// ---------- 4. package ----------
const manifest = { version: 1, name: `${client} ${video} ${fmt}`, slug: slug.replace(/[^\w-]/g, '_'), width: W, height: H, fps: FPS, duration: film.dur,
  bgColor: BG, editableDefault: true, markers, layers,
  source: { engine: 'Because Video Studio seek(t) engine', final: final },
  caveats: [scenes.length ? 'Each scene is a ProRes 4444 layer with transparency: text and shapes inside a scene are pixels, not live text.'
    : 'This film predates the per-scene export: it is one layer.', 'Lottie animations and canvas effects are inside the scene layers.'] };
writeFileSync(join(work, 'manifest.json'), JSON.stringify(manifest, null, 1));
rmSync(pkg, { recursive: true, force: true });
run(PY, [join(STUDIO, 'tools', 'export', 'build_package.py'), join(work, 'manifest.json'), '--out', pkg, '--pad-audio', ...(args.includes('--zip') ? ['--zip'] : [])]);
if (srt) { mkdirSync(join(pkg, 'data'), { recursive: true }); writeFileSync(join(pkg, 'data', 'captions.srt'), srt); }

// ---------- 5. check: stacked layers vs the final render ----------
const at = [0.25, 0.5, 0.8].map((f) => +(film.dur * f).toFixed(2));
const check = spawnSync(PY, ['-c', `
import sys, json, subprocess, io
from PIL import Image, ImageChops, ImageStat
pkg, final, W, H, at = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), json.loads(sys.argv[5])
m = json.load(open(pkg + '/manifest.json'))
def frame(src, t):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(max(0, t)), '-i', src, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], capture_output=True).stdout
    return Image.open(io.BytesIO(out)).convert('RGBA').resize((W, H)) if out else None
worst = 0
for t in at:
    base = Image.new('RGBA', (W, H), m.get('bgColor', '#000000'))
    for L in m['layers']:
        if L['type'] == 'footage' and L.get('in', 0) <= t < L.get('out', 1e9):
            f = frame(pkg + '/' + L['src'], t - L.get('in', 0))
            if f: base = Image.alpha_composite(base, f)
    ref = frame(final, t)
    d = sum(ImageStat.Stat(ImageChops.difference(base.convert('RGB'), ref.convert('RGB'))).mean) / 3
    worst = max(worst, d); print(f'  at {t:5.2f} s: mean difference {d:.2f} of 255')
print('PASS' if worst < 6 else 'FAIL', f'(worst {worst:.2f}; under 6 is a match, video compression differs slightly)')
sys.exit(0 if worst < 6 else 1)`, pkg, join(out, final), String(W), String(H), JSON.stringify(at)], { encoding: 'utf8' });
console.log(`layers stacked vs the final render:\n${(check.stdout || check.stderr).trim()}`);
if (check.status) process.exitCode = 1;
console.log(`\nEditable package: ${pkg}${args.includes('--zip') ? ' (+ .zip)' : ''}`);
