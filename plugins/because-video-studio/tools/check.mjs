// node tools/check.mjs <video>/index.html [--step 0.1] [--fmt 9x16] [--no-sheets]
// Every gate a film must pass before Aman sees it, on every format in window.film.formats. Exits 1 on any FAIL.
// Writes <video>/docs/check.md and contact sheets <video>/out/check-<fmt>.png.
//   page     page errors, missing images (window.ready rejects)
//   frame0   the first frame is the thumbnail: it must not be flat
//   edges    every rec()'d item stays inside the frame, every 0.1 s (L-105), unless window.film.allow says so
//   plates   no 'text'/'logo' item under a caption plate
//   size     readable text at phone size: 'text' items at least 2.2% of the frame width tall (24 px on 1080)
//   sync     each window.film.sync item really lands on its time, and a sound cue sits on that landing (L-107)
//   jolt     per-frame acceleration of window.film.smooth items (camera probes, pans), spikes reported (L-106), WARN only
//   dead     no stretch longer than 3 s where the picture barely changes (rule: something new every 2-4 s), WARN
//   end      the last 1.5 s is complete and still: every line fully typed, nothing still arriving (Aman, 16-10-2026: the tagline was
//            cut off mid-word at the end of reel-contrast-v4 v1)
import { launch, openFilm } from './film-page.mjs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page) { console.error('usage: node tools/check.mjs <video>/index.html [--step 0.1] [--fmt 9x16] [--no-sheets]'); process.exit(1); }
const STEP = +opt('step', 0.1), TOL = 2, FRAME = 1 / 30;
const SIZES = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080], '4x5': [1080, 1350] };
const dir = dirname(resolve(page)), tools = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(dir, 'docs'), { recursive: true }); mkdirSync(join(dir, 'out'), { recursive: true });

const browser = await launch();
const report = [], fails = [], warns = [];
const fail = (fmt, gate, msg) => { fails.push(`${fmt} ${gate}: ${msg}`); };
const warn = (fmt, gate, msg) => { warns.push(`${fmt} ${gate}: ${msg}`); };
// group sorted times into ranges for readable output
const ranges = (ts) => { const r = []; let a = ts[0], p = ts[0]; for (const x of ts.slice(1)) { if (x - p > STEP * 1.5) { r.push([a, p]); a = x; } p = x; } r.push([a, p]);
  return r.map(([x, y]) => x === y ? `${x}s` : `${x}-${y}s`).join(', '); };

async function open(fmt) {
  const [w, h] = SIZES[fmt];
  const errors = [];
  const p = await openFilm(browser, page, { width: w, height: h }, '?fmt=' + fmt, (p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  });
  try { await p.evaluate(() => window.ready); } catch (e) { errors.push(String(e.message || e)); }
  return { p, errors };
}

// read the contract from the master format
const first = await open('9x16');
const film = await first.p.evaluate(() => window.film && JSON.parse(JSON.stringify(window.film)));
const hasAudit = await first.p.evaluate(() => typeof window.audit === 'function');
await first.p.close();
if (!film || !hasAudit) { console.error('the page has no window.film or window.audit: start from templates/engine/index.html (see blocks.js rec())'); await browser.close(); process.exit(1); }
const formats = opt('fmt') ? [opt('fmt')] : film.formats;
const DUR = film.dur;

for (const fmt of formats) {
  const { p, errors } = await open(fmt);
  if (errors.length) { fail(fmt, 'page', [...new Set(errors)].join(' | ')); await p.close(); continue; }

  // frame0: flat first frame = blank thumbnail (a 9:16 v1 shipped one)
  const f0 = await p.evaluate(async () => { await window.seek(0); const c = document.querySelector('canvas'), o = new OffscreenCanvas(64, 64), x = o.getContext('2d');
    x.drawImage(c, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; s += l; s2 += l * l; } return Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)); });
  if (f0 < 4) fail(fmt, 'frame0', `frame 0 is flat (luma spread ${f0.toFixed(1)}): the thumbnail shows nothing`);

  // edges, plates, size: sweep the whole film
  const cut = {}, under = {}, small = {}, picture = [];
  for (let k = 0; k * STEP < DUR; k++) {
    const t = +(k * STEP).toFixed(3);
    const a = await p.evaluate((t) => window.audit(t), t);
    const allowed = (it, edges) => (film.allow || []).some((r) => it.name.startsWith(r.name) && t >= (r.from ?? 0) && t <= (r.to ?? 1e9) && edges.every((e) => r.edges.includes(e)));
    const plates = a.items.filter((i) => i.name.startsWith('plate'));
    for (const it of a.items) {
      if (it.name.startsWith('_')) continue;
      const e = []; if (it.x0 < -TOL) e.push('left'); if (it.y0 < -TOL) e.push('top'); if (it.x1 > a.W + TOL) e.push('right'); if (it.y1 > a.H + TOL) e.push('bottom');
      if (e.length && !allowed(it, e)) (cut[`${it.name} [${e.join('+')}]`] ||= []).push(t);
      if (/^(text|logo)/.test(it.name)) {
        for (const pl of plates) { const ox = Math.min(it.x1, pl.x1) - Math.max(it.x0, pl.x0), oy = Math.min(it.y1, pl.y1) - Math.max(it.y0, pl.y0);
          if (ox > 4 && oy > 4) (under[it.name] ||= []).push(t); }
        if (it.name.startsWith('text') && it.y1 - it.y0 < a.W * 0.022) (small[`${it.name} (${Math.round(it.y1 - it.y0)} px)`] ||= []).push(t);
      }
    }
    // dead-time signal on the master only: tiny greyscale thumbnail every 0.5 s
    if (fmt === formats[0] && Math.abs(t / 0.5 - Math.round(t / 0.5)) < 1e-6)
      picture.push([t, await p.evaluate(() => { const c = document.querySelector('canvas'), o = new OffscreenCanvas(32, 32), x = o.getContext('2d');
        x.drawImage(c, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data, v = []; for (let i = 0; i < d.length; i += 4) v.push((d[i] + d[i + 1] + d[i + 2]) / 3); return v; })]);
  }
  for (const [k, ts] of Object.entries(cut)) fail(fmt, 'edges', `${k}: ${ranges(ts)}`);
  for (const [k, ts] of Object.entries(under)) fail(fmt, 'plates', `${k} under a caption plate: ${ranges(ts)}`);
  for (const [k, ts] of Object.entries(small)) fail(fmt, 'size', `${k} too small for a phone: ${ranges(ts)}`);

  if (picture.length > 2) {
    let still = 0, from = 0;
    for (let i = 1; i < picture.length; i++) {
      const [t, v] = picture[i], u = picture[i - 1][1]; let d = 0; for (let j = 0; j < v.length; j++) d += Math.abs(v[j] - u[j]); d /= v.length;
      if (d < 0.6) { if (!still) from = picture[i - 1][0]; still += t - picture[i - 1][0]; } else still = 0;
      if (still > 3) { warn(fmt, 'dead', `picture barely changes from ${from}s to ${t}s`); still = -1e9; }
    }
  }

  // end: compare the frame 1.5 s before the end with the last frame at 270 px wide; text still typing or arriving shows up
  if (fmt === formats[0] && DUR > 2) {
    const snap = (t) => p.evaluate(async (t) => { await window.seek(t); const c = document.querySelector('canvas'), w = 270, h = Math.round(w * c.height / c.width);
      const o = new OffscreenCanvas(w, h), x = o.getContext('2d'); x.drawImage(c, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, v = [];
      for (let i = 0; i < d.length; i += 4) v.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]); return v; }, t);
    const fps = film.fps || 30, a1 = await snap(+(DUR - 1.5).toFixed(3)), a2 = await snap(+(DUR - 1 / fps).toFixed(3));
    let changed = 0; for (let i = 0; i < a1.length; i++) if (Math.abs(a1[i] - a2[i]) > 40) changed++;
    const share = changed / a1.length;
    report.push(`${fmt} end: ${(share * 100).toFixed(2)}% of the picture changes in the last 1.5 s`);
    if (share > 0.0005) fail(fmt, 'end', `the last 1.5 s is still changing (${(share * 100).toFixed(2)}% of the picture): finish every line and hold the end card still for at least 1.5 s`);
  }

  // sync + jolt: measure where each sync item really lands
  for (const s of film.sync || []) {
    const box = async (t) => (await p.evaluate((t) => window.audit(t), +t.toFixed(4))).items.find((i) => i.name === s.item);
    // resting position: 1.2 s after the landing, or the last moment the item is still on screen (at least 0.3 s after)
    let restT = Math.min(DUR - 0.01, s.t + 1.2), rest = await box(restT);
    while (!rest && restT > s.t + 0.3) { restT -= 0.05; rest = await box(restT); }
    if (!rest) { fail(fmt, 'sync', `${s.item} not on screen 0.3 s after ${s.t}s, cannot measure its ${s.what || 'landing'}`); continue; }
    let peak = 1e9, peakT = null, land = null;
    for (let t = Math.max(0, s.t - 0.8); t < Math.min(DUR, s.t + 0.6); t += 1 / 240) {
      const b = await box(t); if (!b) continue;
      if (b.y1 < peak) { peak = b.y1; peakT = t; }
      if (peakT !== null && t > peakT && peak < rest.y1 - 4 && b.y1 >= rest.y1 - 1) { land = t; break; }
    }
    const cue = (film.cues || []).filter((c) => land !== null && Math.abs(c.t - land) <= FRAME).length;
    if (land === null) fail(fmt, 'sync', `${s.item}: no landing found near ${s.t}s`);
    else if (Math.abs(land - s.t) > FRAME) fail(fmt, 'sync', `${s.item} lands at ${land.toFixed(3)}s, the film says ${s.t}s (off ${((land - s.t) * 1000).toFixed(0)} ms)`);
    else if (!cue) fail(fmt, 'sync', `${s.item} lands at ${land.toFixed(3)}s but no sound cue is within 1 frame`);
    else report.push(`${fmt} sync: ${s.item} lands ${land.toFixed(3)}s, sound within 1 frame`);
  }

  // jolt: per-frame acceleration of things that should glide (camera probes, pans), never of a landing (L-106)
  if (fmt === formats[0]) for (const m of film.smooth || []) {
    const pts = [];
    for (let t = m.from; t < m.to; t += FRAME) { const b = (await p.evaluate((t) => window.audit(t), +t.toFixed(4))).items.find((i) => i.name === m.item); if (b) pts.push([t, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]); }
    const j = []; for (let i = 2; i < pts.length; i++) j.push([pts[i][0], Math.hypot(pts[i][1] - 2 * pts[i - 1][1] + pts[i - 2][1], pts[i][2] - 2 * pts[i - 1][2] + pts[i - 2][2])]);
    if (!j.length) { fail(fmt, 'jolt', `${m.item} not on screen between ${m.from}s and ${m.to}s`); continue; }
    const mean = j.reduce((a, x) => a + x[1], 0) / j.length, worst = [...j].sort((a, b) => b[1] - a[1])[0];
    report.push(`${fmt} jolt: ${m.item} ${m.from}-${m.to}s mean ${mean.toFixed(2)} px/f², worst ${worst[1].toFixed(1)} at ${worst[0].toFixed(2)}s`);
    if (worst[1] > Math.max(m.max ?? 20, mean * 5)) warn(fmt, 'jolt', `${m.item} jolts ${worst[1].toFixed(1)} px/f² at ${worst[0].toFixed(2)}s (mean ${mean.toFixed(2)}): look at a frame strip there`);
  }
  await p.close();
  report.push(`${fmt}: swept ${Math.ceil(DUR / STEP)} moments`);
}
await browser.close();

if (!args.includes('--no-sheets')) for (const fmt of formats) {
  const [w, h] = SIZES[fmt];
  const r = spawnSync('node', [join(tools, 'stills.mjs'), resolve(page), '--every', '0.5', '--dur', String(DUR), '--cols', fmt === '16x9' ? '5' : '8',
    '--w', String(w), '--h', String(h), '--q', '?fmt=' + fmt, '--out', join(dir, 'out', `check-${fmt}.png`)], { encoding: 'utf8' });
  if (r.status) fail(fmt, 'sheet', r.stderr.trim());
}

const today = new Date().toLocaleDateString('en-GB').replaceAll('/', '-'), time = new Date().toTimeString().slice(0, 5);
const md = `# check · ${today} ${time}\n\nResult: ${fails.length ? `FAIL (${fails.length})` : 'PASS'}${warns.length ? `, ${warns.length} warning(s)` : ''}\n\n` +
  (fails.length ? `## Fails\n${fails.map((x) => '- ' + x).join('\n')}\n\n` : '') +
  (warns.length ? `## Warnings (look, then decide)\n${warns.map((x) => '- ' + x).join('\n')}\n\n` : '') +
  `## Measured\n${report.map((x) => '- ' + x).join('\n')}\n\nContact sheets: ${formats.map((f) => `out/check-${f}.png`).join(', ')}. Look at them before scoring.\n`;
writeFileSync(join(dir, 'docs', 'check.md'), md);
console.log(md);
process.exit(fails.length ? 1 : 0);
