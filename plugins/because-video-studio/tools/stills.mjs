// node tools/stills.mjs <index.html> [--times 0.05,0.4,...] [--every 0.5] [--dur 10] [--w 1080] [--h 1920] [--cols 6] [--out sheet.png] [--q '?fmt=1x1']
// Renders chosen moments of a seek(t) film into one labelled contact sheet (for the critique loop).
// Fails loudly on any page error, so a broken frame never passes review unnoticed.
import { launch, openFilm, autoSandbox } from './film-page.mjs';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
autoSandbox(page);   // reel films always run sealed (film-page.mjs)
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page) { console.error('usage: node tools/stills.mjs <index.html> [--times a,b,c | --every 0.5] [--out sheet.png]'); process.exit(1); }
const W = +opt('w', 1080), H = +opt('h', 1920), COLS = +opt('cols', 6), DUR = +opt('dur', 10);
const times = opt('times') ? opt('times').split(',').map(Number)
  : Array.from({ length: Math.floor(DUR / +opt('every', 0.5)) }, (_, i) => +(i * +opt('every', 0.5) + 0.05).toFixed(3));
const out = resolve(opt('out', join(dirname(page), 'out', 'stills.png')));

// GPU + local ES modules so 3D (Three.js) films render; harmless for 2D canvas films
const browser = await launch();
const errors = [];
const p = await openFilm(browser, page, { width: W, height: H }, (opt('q', '') || ''), (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
});  // --q '?fmt=1x1' passes a query to the page
await p.addStyleTag({ content: 'canvas{height:auto!important;width:100%!important}' });
const thumbs = [];
const clip = { x: 0, y: 0, width: W, height: H }; // page.screenshot+clip, not locator.screenshot(): see render.mjs note
for (const t of times) {
  await p.evaluate((t) => window.seek(t), t);
  const png = await p.screenshot({ type: 'jpeg', quality: 85, clip });
  thumbs.push([t, png.toString('base64')]);
}
if (errors.length) { console.error('PAGE ERRORS:\n' + [...new Set(errors)].join('\n')); await browser.close(); process.exit(1); }

const tw = 270, th = Math.round(tw * H / W);
const html = join(dirname(out), '.stills.html');
writeFileSync(html, `<!doctype html><style>body{margin:0;background:#141413;display:grid;grid-template-columns:repeat(${COLS},${tw}px)}
figure{margin:0}img{width:${tw}px;height:${th}px;display:block}figcaption{font:13px/22px monospace;color:#F0EEE6;padding-left:6px}</style>` +
  thumbs.map(([t, b]) => `<figure><img src="data:image/jpeg;base64,${b}"><figcaption>${t.toFixed(2)}s</figcaption></figure>`).join(''));
const sheet = await browser.newPage({ viewport: { width: COLS * tw, height: 400 } });
await sheet.goto(pathToFileURL(html).href);
await sheet.screenshot({ path: out, fullPage: true });
rmSync(html);
await browser.close();
console.log(`${times.length} stills -> ${out}`);
