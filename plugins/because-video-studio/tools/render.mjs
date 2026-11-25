// node tools/render.mjs <index.html> [--fps 30] [--dur 10] [--start 0] [--sub 1] [--w 1080] [--h 1920] [--out <dir>/out/silent.mp4] [--q '?fmt=1x1']
// Walks time frame by frame through window.seek(t) in headless Chrome and pipes frames into ffmpeg.
// --sub N renders N subframes per frame and blends them (motion blur). H.264, yuv420p, CRF 16.
// --alpha renders a see-through layer (ProRes 4444 .mov) with ?overlay=1, which tells the engine to clear instead of painting
// its background: the words and end card of a reel cut from footage (tools/footage-cut.py lays it over the cut).
import { launch, openFilm, autoSandbox } from './film-page.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
autoSandbox(page);   // reel films always run sealed (film-page.mjs)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page) { console.error('usage: node tools/render.mjs <index.html> [--fps 30] [--dur 10] [--sub 1] [--out file.mp4]'); process.exit(1); }
const FPS = +opt('fps', 30), DUR = +opt('dur', 10), START = +opt('start', 0), SUB = +opt('sub', 1), W = +opt('w', 1080), H = +opt('h', 1920);
const ALPHA = args.includes('--alpha');
const out = resolve(opt('out', join(dirname(page), 'out', ALPHA ? 'overlay.mov' : 'silent.mp4')));
mkdirSync(dirname(out), { recursive: true });

// GPU + local ES modules so 3D (Three.js) films render; harmless for 2D canvas films
const browser = await launch();
const errors = [];
const q = (opt('q', '') || '') + (ALPHA ? ((opt('q', '') || '').includes('?') ? '&' : '?') + 'overlay=1' : '');
const p = await openFilm(browser, page, { width: W, height: H }, q, (p) => p.on('pageerror', (e) => errors.push(e.message)));  // --q '?fmt=1x1' passes a query to the page
await p.addStyleTag({ content: 'html,body{margin:0' + (ALPHA ? ';background:transparent!important' : '') + '}canvas{width:' + W + 'px!important;height:' + H + 'px!important;margin:0!important}' });
await p.evaluate(() => window.ready);

const vf = SUB > 1 ? `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB` : 'null';
const enc = ALPHA ? ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0']
  : ['-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
  '-vf', vf, '-r', String(FPS), ...enc, out],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round(DUR * FPS * SUB);
// page.screenshot with an explicit clip, not locator.screenshot(): the locator's actionability/stability
// wait (poll two consecutive stable animation frames) can stall for 30s under ffmpeg's concurrent CPU load
// on heavier films (because life-at-because, 10-10-2026), even though the canvas itself never moves.
const clip = { x: 0, y: 0, width: W, height: H };
const t0 = Date.now();
for (let i = 0; i < total; i++) {
  await p.evaluate((t) => window.seek(t), START + i / (FPS * SUB));
  const png = await p.screenshot({ type: 'png', clip, omitBackground: ALPHA });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % (FPS * SUB) === 0) console.log(`rendered ${i / (FPS * SUB)}s / ${DUR}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
