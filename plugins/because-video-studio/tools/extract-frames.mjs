// node tools/extract-frames.mjs <video-file | image-folder> [--every 0.5] [--scene 5]
// Video: frames every N seconds, contact sheet(s), and cuts.json (shot boundaries + shot lengths).
// Image folder ("library" reference): contact sheet(s) of every image.
// Output goes next to the input: <name>-ref/
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--') && !/^\d/.test(a));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? Number(args[i + 1]) : d; };
const EVERY = opt('every', 0.5), SCENE = opt('scene', 5), COLS = 6, PER_SHEET = 48;
if (!input || !existsSync(input)) {
  console.error('usage: node tools/extract-frames.mjs <video-file | image-folder> [--every 0.5] [--scene 5]');
  process.exit(1);
}
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(r.stderr.slice(-2000)); process.exit(1); }
  return r;
};
const isDir = statSync(input).isDirectory();
const out = join(dirname(input), basename(input, extname(input)) + '-ref');
const frames = join(out, 'frames');
rmSync(out, { recursive: true, force: true });
mkdirSync(isDir ? out : frames, { recursive: true });

// Contact sheets: PER_SHEET thumbnails each, COLS across, captioned with frame time or file name.
// Built as an HTML grid and screenshotted (this ffmpeg build has no drawtext).
async function sheets(list, label) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: COLS * 320, height: 200 } });
  let n = 0;
  for (let i = 0; i < list.length; i += PER_SHEET) {
    const cells = list.slice(i, i + PER_SHEET).map((f, k) =>
      `<figure><img src="${pathToFileURL(resolve(f)).href}"><figcaption>${label(i + k).replace(/[<&]/g, '')}</figcaption></figure>`).join('');
    const html = join(out, '.sheet.html');
    writeFileSync(html, `<!doctype html><style>body{margin:0;background:#141413;display:grid;grid-template-columns:repeat(${COLS},320px)}
      figure{margin:0;width:320px;height:200px}img{width:320px;height:180px;object-fit:contain;display:block;background:#000}
      figcaption{font:12px/20px monospace;color:#F0EEE6;padding-left:6px;white-space:nowrap;overflow:hidden}</style>${cells}`);
    await page.goto(pathToFileURL(resolve(html)).href);
    await page.evaluate(() => Promise.all([...document.images].map((im) => im.complete || new Promise((r) => { im.onload = im.onerror = r; }))));
    await page.screenshot({ path: join(out, `contact-${++n}.png`), fullPage: true });
  }
  await browser.close();
  rmSync(join(out, '.sheet.html'), { force: true });
  return n;
}

if (isDir) {
  const imgs = readdirSync(input).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).sort().map((f) => join(input, f));
  if (!imgs.length) { console.error('no images in folder'); process.exit(1); }
  const n = await sheets(imgs, (i) => basename(imgs[i]));
  writeFileSync(join(out, 'library.json'), JSON.stringify({ source: input, images: imgs.map((f) => basename(f)) }, null, 2));
  console.log(`${imgs.length} images -> ${n} contact sheet(s) in ${out}`);
  process.exit(0);
}

// Video: duration, frames every EVERY seconds, scene cuts
const dur = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input]).stdout.trim());
run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vf', `fps=1/${EVERY},scale=640:-2`, join(frames, 'f_%04d.png')]);
const list = readdirSync(frames).sort().map((f) => join(frames, f));
const n = await sheets(list, (i) => `${(i * EVERY).toFixed(1)}s`);

// Shot boundaries via ffmpeg scdet (score 0-100; a cut usually scores 5+, motion stays under 2)
const sc = spawnSync('ffmpeg', ['-i', input, '-vf', `scdet=threshold=${SCENE}`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
const hits = [...sc.stderr.matchAll(/lavfi\.scd\.score: ([\d.]+), lavfi\.scd\.time: ([\d.]+)/g)]
  .map((m) => ({ time: +Number(m[2]).toFixed(2), score: +Number(m[1]).toFixed(1) })).filter((h) => h.time > 0);
const cuts = hits.map((h) => h.time);
const edges = [0, ...cuts, +dur.toFixed(2)];
const shots = edges.slice(0, -1).map((s, i) => ({ shot: i + 1, start: s, end: edges[i + 1], length: +(edges[i + 1] - s).toFixed(2) }));
const avg = +(dur / shots.length).toFixed(2);
writeFileSync(join(out, 'cuts.json'), JSON.stringify({ source: input, duration: +dur.toFixed(2), every: EVERY, sceneThreshold: SCENE, cuts: hits, averageShotLength: avg, shots }, null, 2));
console.log(`${list.length} frames, ${n} contact sheet(s), ${shots.length} shots (avg ${avg}s) -> ${out}`);
