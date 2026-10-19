// node tools/render.mjs <index.html> [--fps 30] [--dur 10] [--start 0] [--sub 1] [--w 1080] [--h 1920] [--out <dir>/out/silent.mp4] [--q '?fmt=1x1']
// Walks time frame by frame through window.seek(t) in headless Chrome and pipes frames into ffmpeg.
// --sub N renders N subframes per frame and blends them (motion blur). H.264, yuv420p, CRF 16.
import { launch, openFilm } from './film-page.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page) { console.error('usage: node tools/render.mjs <index.html> [--fps 30] [--dur 10] [--sub 1] [--out file.mp4]'); process.exit(1); }
const FPS = +opt('fps', 30), DUR = +opt('dur', 10), START = +opt('start', 0), SUB = +opt('sub', 1), W = +opt('w', 1080), H = +opt('h', 1920);
const out = resolve(opt('out', join(dirname(page), 'out', 'silent.mp4')));
mkdirSync(dirname(out), { recursive: true });

// GPU + local ES modules so 3D (Three.js) films render; harmless for 2D canvas films
const browser = await launch();
const errors = [];
const p = await openFilm(browser, page, { width: W, height: H }, (opt('q', '') || ''), (p) => p.on('pageerror', (e) => errors.push(e.message)));  // --q '?fmt=1x1' passes a query to the page
await p.addStyleTag({ content: 'html,body{margin:0}canvas{width:' + W + 'px!important;height:' + H + 'px!important;margin:0!important}' });
await p.evaluate(() => window.ready);

const vf = SUB > 1 ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB` : 'null';
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round(DUR * FPS * SUB);
// page.screenshot with an explicit clip, not locator.screenshot(): the locator's actionability/stability
// wait (poll two consecutive stable animation frames) can stall for 30s under ffmpeg's concurrent CPU load
// on heavier films (because life-at-because, 10-10-2026), even though the canvas itself never moves.
const clip = { x: 0, y: 0, width: W, height: H };
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await p.evaluate((t) => window.seek(t), START + i / (FPS * SUB));
  const png = await p.screenshot({ type: 'png', clip });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (FPS * SUB) === 0) console.log(`rendered ${i / (FPS * SUB)}s / ${DUR}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
