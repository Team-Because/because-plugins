// node tools/deliver.mjs <index.html> --dur 10 [--poster 2.5] [--w 1080 --h 1920 --q '?fmt=1x1'] [--loop]
// The director's-brief deliverables that are not the film itself (course step 10), written to <video>/out/:
//   poster.png       one frame at --poster seconds (default: 40% in), full resolution
//   contact.png      one still every 0.5 s, labelled (via tools/stills.mjs)
//   loop_check.mp4   with --loop: the last 1.5 s straight into the first 1.5 s, so the seam can be watched
// With --loop it also measures the seam: mean pixel difference between the last frame shown (t = dur - 1/30)
// and frame 0, which the loop plays next. A smooth loop differs by one frame of motion; a jump differs a lot.
import { launch, openFilm } from './film-page.mjs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page || !opt('dur')) { console.error('usage: node tools/deliver.mjs <index.html> --dur 10 [--poster 2.5] [--loop]'); process.exit(1); }
const DUR = +opt('dur'), W = +opt('w', 1080), H = +opt('h', 1920), Q = opt('q', ''), POSTER = +opt('poster', +(DUR * 0.4).toFixed(2));
const out = join(dirname(resolve(page)), 'out');
mkdirSync(out, { recursive: true });
const tools = dirname(fileURLToPath(import.meta.url));
const pass = ['--w', String(W), '--h', String(H), ...(Q ? ['--q', Q] : [])];

const browser = await launch();
const errors = [];
const p = await openFilm(browser, page, { width: W, height: H }, Q, (p) => p.on('pageerror', (e) => errors.push(e.message)));
await p.addStyleTag({ content: 'html,body{margin:0}canvas{width:' + W + 'px!important;height:' + H + 'px!important;margin:0!important}' });
await p.evaluate(() => window.ready);
const shot = async (t) => { await p.evaluate((t) => window.seek(t), t); return p.locator('canvas').first().screenshot({ type: 'png' }); };

writeFileSync(join(out, 'poster.png'), await shot(POSTER));
console.log(`poster.png at ${POSTER}s`);

if (args.includes('--loop')) {
  // Seam: the last frame shown, then frame 0. (t = dur itself is not shown and is often blank, which once faked a pass.)
  const diff = await p.evaluate(async ([a, b]) => {
    const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = 'data:image/png;base64,' + src; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const c = new OffscreenCanvas(ia.width, ia.height), g = c.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
    return s / (da.length / 4) / 3;
  }, [(await shot(0)).toString('base64'), (await shot(DUR - 1 / 30)).toString('base64')]);
  console.log(`loop seam: mean pixel difference ${diff.toFixed(2)} of 255 between the last frame and frame 0${diff > 2 ? '  WARNING: the loop jumps' : '  (seamless)'}`);
}
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); process.exit(1); }

const run = (cmd, a) => { const r = spawnSync(cmd, a, { stdio: 'inherit' }); if (r.status) process.exit(r.status); };
run('node', [join(tools, 'stills.mjs'), resolve(page), '--every', '0.5', '--dur', String(DUR), '--cols', '8', '--out', join(out, 'contact.png'), ...pass]);

if (args.includes('--loop')) {
  const tail = join(out, '.tail.mp4'), head = join(out, '.head.mp4'), list = join(out, '.loop.txt');
  run('node', [join(tools, 'render.mjs'), resolve(page), '--fps', '30', '--dur', '1.5', '--out', head, ...pass]);
  // seek(t) is pure, so the tail renders on its own from DUR - 1.5
  run('node', [join(tools, 'render.mjs'), resolve(page), '--fps', '30', '--dur', '1.5', '--start', String(DUR - 1.5), '--out', tail, ...pass]);
  writeFileSync(list, `file '${tail}'\nfile '${head}'\n`);
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', join(out, 'loop_check.mp4')]);
  for (const f of [tail, head, list]) rmSync(f, { force: true });
  console.log('loop_check.mp4: last 1.5 s then first 1.5 s');
}
