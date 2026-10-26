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
// Live text: every fillText call is recorded (text, font, colour, opacity, where the canvas transform puts it) and can be
// left out of the picture (NO_TEXT), so a scene renders twice: its art without text for After Effects, plus live text
// layers rebuilt from the record, and the whole scene with text as the twin Premiere uses (and AE when EDITABLE is off).
await p.evaluate(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.TEXTLOG = [];
  P.fillText = function (text, x, y, maxW) {
    if (window.TEXTREC) {
      const m = this.getTransform();
      window.TEXTLOG.push({ text: String(text), x: +x, y: +y, font: this.font, fill: typeof this.fillStyle === 'string' ? this.fillStyle : '#ffffff',
        alpha: this.globalAlpha, align: this.textAlign, base: this.textBaseline, m: [m.a, m.b, m.c, m.d, m.e, m.f] });
    }
    if (window.NO_TEXT) return;
    return maxW === undefined ? orig.call(this, text, x, y) : orig.call(this, text, x, y, maxW);
  };
  // Live images: every image file drawn whole onto the film's canvas (logos, icons, product photos, uploads) is recorded
  // the same way and can be left out (NO_IMG), so it becomes its own After Effects layer. Frame sequences, cropped draws,
  // blend modes, filters and shadows stay in the scene art, where they look exactly as in the film.
  const main = document.querySelector('canvas'), oimg = P.drawImage;
  window.IMGLOG = []; window.IMGEL = {};
  P.drawImage = function (im, ...a) {
    const nw = im?.naturalWidth, nh = im?.naturalHeight;
    const whole = a.length === 2 || a.length === 4 || (a.length === 8 && a[0] === 0 && a[1] === 0 && a[2] === nw && a[3] === nh);
    if (window.IMGREC && this.canvas === main && im instanceof HTMLImageElement && nw > 0 && nh > 0 && whole
      && !/\/\d{3,}\.(jpe?g|png|webp)$/i.test(im.src) && this.globalCompositeOperation === 'source-over'
      && (!this.filter || this.filter === 'none') && !(this.shadowBlur > 0) && this.globalAlpha > 0.01) {
      const d = a.length === 8 ? a.slice(4) : a.length === 4 ? a : [a[0], a[1], nw, nh], m = this.getTransform();
      window.IMGEL[im.src] = im;
      window.IMGLOG.push({ src: im.src, nw, nh, d: d.map(Number), alpha: this.globalAlpha, m: [m.a, m.b, m.c, m.d, m.e, m.f] });
      if (window.NO_IMG) return;
    }
    return oimg.call(this, im, ...a);
  };
});
async function renderScene(s, file, { noText, noImg = false }) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const canvas = await p.$('canvas'), N = Math.max(1, Math.round((s.to - s.from) * FPS)), frames = [], imgFrames = [];
  for (let k = 0; k < N; k++) {
    const log = await p.evaluate(async ([i, t, nt, ni]) => { window.SOLO = i; window.NO_TEXT = nt; window.TEXTREC = nt; window.TEXTLOG = [];
      window.NO_IMG = ni; window.IMGREC = ni; window.IMGLOG = []; await window.seek(t); return [window.TEXTLOG, window.IMGLOG]; }, [s.i, s.from + k / FPS, noText, noImg]);
    frames.push(log[0].slice(0, 200)); imgFrames.push(log[1].slice(0, 100));
    const png = await canvas.screenshot({ omitBackground: true, type: 'png' });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  await p.evaluate(() => { window.NO_TEXT = false; window.TEXTREC = false; window.NO_IMG = false; window.IMGREC = false; });
  return { N, frames, imgFrames };
}
// Each image drawn in a scene, followed across frames like text: the k-th draw of the same file in a frame is the same layer.
// AE's image anchor is its centre, so position is where the drawn centre lands, and scale is relative to the raster file.
function imageTracks(s, imgFrames) {
  const tracks = new Map(), out = [];
  imgFrames.forEach((log, k) => {
    const seen = {};
    for (const r of log) {
      const key = `${r.src}#${seen[r.src] = (seen[r.src] ?? 0) + 1}`;
      let tr = tracks.get(key);
      if (tr && k - tr.last > 2) { out.push(tr); tr = null; }
      if (!tr) { tr = { src: r.src, key, nw: r.nw, nh: r.nh, order: k * 1000 + log.indexOf(r), keys: [] }; tracks.set(key, tr); }
      tr.keys.push([k, r]); tr.last = k;
    }
  });
  out.push(...tracks.values());
  // bottom to top in the order they are first drawn, which is the order After Effects stacks them
  return out.sort((a, z) => a.order - z.order).slice(0, 100).map((tr) => {
    tr.vals = tr.keys.map(([k, r]) => { const [a, b, c, d, e, f] = r.m, [dx, dy, dw, dh] = r.d, x = dx + dw / 2, y = dy + dh / 2;
      return [s.from + k / FPS, { pos: [+(a * x + c * y + e).toFixed(1), +(b * x + d * y + f).toFixed(1)], sx: Math.hypot(a, b) * dw / tr.nw,
        sy: Math.hypot(c, d) * dh / tr.nh, rot: +(Math.atan2(b, a) * 180 / Math.PI).toFixed(2), op: +(r.alpha * 100).toFixed(1) }]; });
    tr.in = +(tr.keys[0][0] / FPS + s.from).toFixed(3); tr.out = +((tr.keys.at(-1)[0] + 1) / FPS + s.from).toFixed(3);
    return tr;
  });
}
// One PNG per image file, rendered by the browser at the largest size the film shows it (SVG logos included), capped to
// the frame. The film canvas is hidden meanwhile so only the image is captured.
const rasters = new Map();
async function rasterFor(src, nw, nh, maxScale) {
  const R = Math.min(Math.max(maxScale, 1), W / nw, H / nh), w = Math.max(1, Math.round(nw * R)), h = Math.max(1, Math.round(nh * R));
  const have = rasters.get(src);
  if (have && have.w >= w) return have;
  const file = join(work, 'images', `${String(rasters.size + 1).padStart(2, '0')}_${basename(decodeURIComponent(new URL(src).pathname)).replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 40)}.png`);
  mkdirSync(join(work, 'images'), { recursive: true });
  await p.evaluate(([src, w, h]) => {
    const c = document.createElement('canvas'); c.id = 'raster'; c.width = w; c.height = h;
    for (const [k, v] of [['position', 'fixed'], ['left', '0'], ['top', '0'], ['width', w + 'px'], ['height', h + 'px'], ['background', 'transparent']]) c.style.setProperty(k, v, 'important');
    document.querySelector('canvas').style.visibility = 'hidden'; document.body.append(c);
    c.getContext('2d').drawImage(window.IMGEL[src], 0, 0, w, h);
  }, [src, w, h]);
  writeFileSync(file, await (await p.$('#raster')).screenshot({ omitBackground: true, type: 'png' }));
  await p.evaluate(() => { document.getElementById('raster').remove(); document.querySelector('canvas').style.visibility = ''; });
  const r = { file, w, h, R: w / nw }; rasters.set(src, r); return r;
}
// Stack the scene art and the image rasters exactly as After Effects will, at three moments, and compare with the scene
// drawn normally. A miss (something drawn over an image, a mirrored image) means lifting it out would change the picture.
async function imagesMatch(s, tracks) {
  const shot = async (t, ni) => { const log = await p.evaluate(async ([i, t, ni]) => { window.SOLO = i; window.NO_TEXT = true; window.TEXTREC = false;
    window.NO_IMG = ni; window.IMGREC = ni; window.IMGLOG = []; await window.seek(t); return window.IMGLOG; }, [s.i, t, ni]);
    return [(await (await p.$('canvas')).screenshot({ omitBackground: true, type: 'png' })).toString('base64'), log]; };
  let worst = 0;
  for (const f of [0.25, 0.5, 0.8]) {
    const t = s.from + Math.floor((s.to - s.from) * f * FPS) / FPS;
    const [want] = await shot(t, false), [art, log] = await shot(t, true);
    if (!log.length) continue;
    // stack each draw at its layer's place, not its draw order in this frame
    const seen = {}, at = (r) => { const key = `${r.src}#${seen[r.src] = (seen[r.src] ?? 0) + 1}`; const i = tracks.findIndex((tr) => tr.key === key && tr.in <= t + 1e-6 && t < tr.out); return i < 0 ? 1e9 : i; };
    // each draw as After Effects will place it: centre, width and height, rotation, opacity (what imageLayers writes)
    const place = (r) => { const [a, b, c, d, e, f] = r.m, [dx, dy, dw, dh] = r.d, x = dx + dw / 2, y = dy + dh / 2;
      return { cx: a * x + c * y + e, cy: b * x + d * y + f, w: Math.hypot(a, b) * dw, h: Math.hypot(c, d) * dh, rot: Math.atan2(b, a) }; };
    const draws = log.map((r) => ({ ...place(r), alpha: r.alpha, layer: at(r), raster: rasters.get(r.src) && readFileSync(rasters.get(r.src).file).toString('base64') })).sort((a, z) => a.layer - z.layer);
    const share = await p.evaluate(async ([want, art, draws, W, H]) => {
      const load = (b) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = 'data:image/png;base64,' + b; });
      const px = async (draw) => { const c = new OffscreenCanvas(W, H), g = c.getContext('2d'); await draw(g); return g.getImageData(0, 0, W, H).data; };
      const A = await px(async (g) => g.drawImage(await load(want), 0, 0));
      const B = await px(async (g) => { g.drawImage(await load(art), 0, 0);
        for (const r of draws) { if (!r.raster) continue; g.save(); g.translate(r.cx, r.cy); g.rotate(r.rot); g.globalAlpha = r.alpha; g.drawImage(await load(r.raster), -r.w / 2, -r.h / 2, r.w, r.h); g.restore(); } });
      let bad = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) + Math.abs(A[i + 3] - B[i + 3]) > 120) bad++;
      return bad / (W * H);
    }, [want, art, draws, W, H]);
    worst = Math.max(worst, share);
  }
  await p.evaluate(() => { window.NO_TEXT = false; window.NO_IMG = false; window.IMGREC = false; });
  return worst < 0.002;
}
function imageLayers(n, tracks) {
  return tracks.map((tr, j) => {
    const r = rasters.get(tr.src), sc = (v) => [+(v.sx / r.R * 100).toFixed(2), +(v.sy / r.R * 100).toFixed(2)];
    const keep = (get, tol) => { const ks = [tr.vals[0]]; for (let i = 1; i < tr.vals.length; i++) { const dv = [get(tr.vals[i][1])].flat().map((v, q) => Math.abs(v - [get(ks.at(-1)[1])].flat()[q])); if (Math.max(...dv) > tol || i === tr.vals.length - 1) ks.push(tr.vals[i]); } return ks; };
    const kf = {}, first = tr.vals[0][1];
    for (const [prop, get, tol] of [['position', (v) => v.pos, 0.75], ['opacity', (v) => v.op, 0.75], ['rotation', (v) => v.rot, 0.2], ['scale', sc, 0.25]]) {
      const ks = keep(get, tol); if (ks.length > 2 || (ks.length === 2 && JSON.stringify(get(ks[0][1])) !== JSON.stringify(get(ks[1][1])))) kf[prop] = ks.map(([t, v]) => [+t.toFixed(3), get(v)]);
    }
    const name = basename(decodeURIComponent(new URL(tr.src).pathname)).slice(0, 32);
    return { id: `s${n}i${String(j + 1).padStart(3, '0')}`, name, type: 'image', role: 'live', targets: ['ae'], from: r.file, src: `images/${basename(r.file)}`,
      width: r.w, height: r.h, in: tr.in, out: tr.out, transform: { position: first.pos, scale: sc(first), rotation: first.rot, opacity: first.op }, keyframes: kf };
  });
}
const WEIGHTS = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
// After Effects wants a PostScript font name. A generic CSS family becomes the font every Mac and Windows machine has.
const GENERIC = { 'sans-serif': ['Arial', 'ArialMT', 'Arial-BoldMT'], 'system-ui': ['Arial', 'ArialMT', 'Arial-BoldMT'],
  serif: ['Times New Roman', 'TimesNewRomanPSMT', 'TimesNewRomanPS-BoldMT'], monospace: ['Courier New', 'CourierNewPSMT', 'CourierNewPS-BoldMT'] };
function fontFor(family, weight) {
  const g = GENERIC[family.toLowerCase()];
  if (g) return { fontFamily: g[0], font: weight >= 600 ? g[2] : g[1] };
  return { fontFamily: family, font: `${family.replace(/\s+/g, '')}-${WEIGHTS[weight] ?? 'Regular'}` };
}
function textLayers(s, n, frames) {
  // follow each piece of text across frames: the k-th draw of the same string in a frame is the same layer
  const tracks = new Map(), out = [];
  frames.forEach((log, k) => {
    const seen = {};
    for (const r of log) {
      if (!r.text.trim() || r.alpha <= 0.01) continue;
      const key = `${r.text}#${seen[r.text] = (seen[r.text] ?? 0) + 1}`;
      let tr = tracks.get(key);
      if (tr && k - tr.last > 2) { out.push(tr); tr = null; }   // gone for more than 2 frames: a new layer
      if (!tr) { tr = { text: r.text, keys: [] }; tracks.set(key, tr); }
      tr.keys.push([k, r]); tr.last = k;
    }
  });
  out.push(...tracks.values());
  return out.slice(0, 400).map((tr, j) => {
    const r0 = tr.keys[0][1], fm = String(r0.font).match(/(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/i) ?? [];
    const weight = fm[1] === 'bold' ? 700 : +(fm[1] ?? 400) || 400, size = +(fm[2] ?? 48), family = String(fm[3] ?? 'sans-serif').split(',')[0].replace(/["']/g, '').trim();
    const dy = (b) => (b === 'middle' ? size * 0.35 : b === 'top' || b === 'hanging' ? size * 0.8 : 0);
    const sample = (r) => { const [a, b, c, d, e, f] = r.m, y = r.y + dy(r.base);
      return { pos: [+(a * r.x + c * y + e).toFixed(1), +(b * r.x + d * y + f).toFixed(1)], sc: +(Math.hypot(a, b) * 100).toFixed(2), rot: +(Math.atan2(b, a) * 180 / Math.PI).toFixed(2), op: +(r.alpha * 100).toFixed(1) }; };
    const vals = tr.keys.map(([k, r]) => [s.from + k / FPS, sample(r)]);
    const keep = (get, tol) => { const ks = [vals[0]]; for (let i = 1; i < vals.length; i++) { const dv = [get(vals[i][1])].flat().map((v, q) => Math.abs(v - [get(ks.at(-1)[1])].flat()[q])); if (Math.max(...dv) > tol || i === vals.length - 1) ks.push(vals[i]); } return ks; };
    const kf = {}, first = vals[0][1];
    for (const [prop, get, tol] of [['position', (v) => v.pos, 0.75], ['opacity', (v) => v.op, 0.75], ['rotation', (v) => v.rot, 0.2]]) {
      const ks = keep(get, tol); if (ks.length > 2 || (ks.length === 2 && JSON.stringify(get(ks[0][1])) !== JSON.stringify(get(ks[1][1])))) kf[prop] = ks.map(([t, v]) => [+t.toFixed(3), get(v)]);
    }
    const ksc = keep((v) => v.sc, 0.25); if (ksc.length > 1 && ksc.some(([, v]) => v.sc !== first.sc)) kf.scale = ksc.map(([t, v]) => [+t.toFixed(3), [v.sc, v.sc]]);
    const fill = /^#[0-9a-f]{6}$/i.test(r0.fill) ? r0.fill : /^rgba?\(/.test(r0.fill) ? r0.fill : '#ffffff';
    return { id: `s${n}t${String(j + 1).padStart(3, '0')}`, name: tr.text.slice(0, 32), type: 'text', role: 'live', targets: ['ae'],
      text: tr.text.slice(0, 500), ...fontFor(family, weight), fontSize: size, color: fill,
      justify: r0.align === 'center' ? 'center' : r0.align === 'right' || r0.align === 'end' ? 'right' : 'left', anchorMode: 'baseline',
      in: +(tr.keys[0][0] / FPS + s.from).toFixed(3), out: +((tr.keys.at(-1)[0] + 1) / FPS + s.from).toFixed(3),
      transform: { position: first.pos, scale: [first.sc, first.sc], rotation: first.rot, opacity: first.op }, keyframes: kf };
  });
}
let liveText = 0, liveImages = 0;
if (scenes.length) {
  for (const s of scenes) {
    const n = String(s.i + 1).padStart(2, '0'), stem = `${n}_${s.name.replace(/[^\w-]+/g, '-')}`;
    const full = join(work, 'video', `${stem}_alpha_${W}x${H}.mov`), art = join(work, 'video', `${stem}_art_alpha_${W}x${H}.mov`);
    if (dirname(full) !== join(work, 'video')) throw new Error('bad scene name');
    let a = await renderScene(s, art, { noText: true, noImg: true });
    const texts = textLayers(s, n, a.frames);
    let tracks = imageTracks(s, a.imgFrames), note = '';
    for (const tr of tracks) await rasterFor(tr.src, tr.nw, tr.nh, Math.max(...tr.vals.map(([, v]) => Math.max(v.sx, v.sy))));
    if (tracks.length && !(await imagesMatch(s, tracks))) {
      // the layers would not match the film here (something drawn over an image, or a mirrored image): keep this scene's
      // images inside its art, as before
      a = await renderScene(s, art, { noText: true }); tracks = []; note = ', images kept in the scene art (as separate layers they would not match the film)';
    }
    const images = imageLayers(n, tracks);
    await renderScene(s, full, { noText: false });
    const fullLayer = { id: `scene${n}`, name: s.name, type: 'footage', from: full, src: `video/${basename(full)}`, in: s.from, out: s.to, width: W, height: H, alpha: true };
    if (texts.length || images.length) {
      layers.push({ ...fullLayer, name: `${s.name} (with text)`, role: 'baked' },
        { id: `scene${n}art`, name: `${s.name} (art)`, type: 'footage', role: 'live', targets: ['ae'], from: art, src: `video/${basename(art)}`, in: s.from, out: s.to, width: W, height: H, alpha: true },
        ...images, ...texts);
      liveText += texts.length; liveImages += images.length;
    } else { rmSync(art, { force: true }); layers.push(fullLayer); }
    console.log(`layer ${n} ${s.name}: ${s.from}-${s.to} s, ${a.N} frames, ${texts.length} live text layer(s), ${images.length} image layer(s)${note}`);
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
  caveats: [scenes.length ? 'Each scene is a ProRes 4444 layer with transparency. In After Effects the words are live text layers and every image file (logo, icon, photo) is its own layer with its motion as keyframes, over the scene art (fonts and positions follow the film; check line breaks on the first frame); Premiere uses the scene with its text and images baked in.'
    : 'This film predates the per-scene export: it is one layer.', 'Shapes, Lottie animations and canvas effects are inside the scene layers, and so are images in a scene where separate layers would not match the film (something drawn over them, mirrored), or that are cropped, blended, filtered or shadowed.'] };
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
        if L['type'] == 'footage' and L.get('role') != 'live' and L.get('in', 0) <= t < L.get('out', 1e9):
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
