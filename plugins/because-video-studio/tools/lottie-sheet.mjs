// node tools/lottie-sheet.mjs <out.png> <a.json> [b.json ...]   (or a folder: every *.json in it)
// Contact sheet of Lottie files: each at its middle frame, on white and on dark, labelled with id, size, length and
// layer count. Uses library/lottie/player/lottie.min.js (lottie-web, MIT). Fails loudly if a file does not render.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, basename, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [out, ...ins] = process.argv.slice(2);
if (!out || !ins.length) { console.error('usage: node tools/lottie-sheet.mjs <out.png> <file.json|folder> ...'); process.exit(1); }
const files = ins.flatMap((p) => statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => join(p, f)) : [p]);
const player = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'lottie', 'player', 'lottie.min.js');
const items = files.map((f) => { const d = JSON.parse(readFileSync(f, 'utf8'));
  return { id: basename(f, '.json'), data: d, label: `${d.w}x${d.h} · ${((d.op - d.ip) / d.fr).toFixed(1)} s · ${d.layers.length} layers` }; });
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#141413;font-family:Helvetica;color:#eee;padding:16px}
.g{display:grid;grid-template-columns:repeat(${Math.min(5, items.length)},300px);gap:14px}.p{display:flex;gap:4px}.b{width:148px;height:148px;border-radius:6px}
.w{background:#fff}.d{background:#1b1d22}.id{font:700 15px monospace;margin-top:6px}.l{font:12px monospace;color:#aaa}</style>
<script src="${pathToFileURL(player).href}"></script><div class=g>${items.map((it, i) => `<div><div class=p><div class="b w" id=w${i}></div><div class="b d" id=d${i}></div></div>
<div class=id>${it.id}</div><div class=l>${it.label}</div></div>`).join('')}</div>`;
const tmp = resolve(dirname(out), '.lottie-sheet.html'); writeFileSync(tmp, html);
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1600, height: 400 } });
const errors = []; p.on('pageerror', (e) => errors.push(e.message));
await p.goto(pathToFileURL(tmp).href);
const res = await p.evaluate((items) => items.map((it, i) => {
  try {
    for (const k of ['w', 'd']) { const a = lottie.loadAnimation({ container: document.getElementById(k + i), renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(it.data)) });
      a.goToAndStop(Math.floor((it.data.op - it.data.ip) / 2), true); }
    return document.getElementById('w' + i).querySelector('svg') ? 'ok' : 'no svg';
  } catch (e) { return 'error: ' + e.message; }
}), items.map((it) => ({ data: it.data })));
await p.waitForTimeout(400);
await p.screenshot({ path: out, fullPage: true });
await b.close();
const bad = res.map((r, i) => [items[i].id, r]).filter(([, r]) => r !== 'ok');
console.log(`${items.length} Lottie files -> ${out}${bad.length ? '\nFAILED: ' + bad.map((x) => x.join(' ')).join(', ') : ''}${errors.length ? '\nPAGE ERRORS: ' + errors.join('; ') : ''}`);
if (bad.length || errors.length) process.exit(1);
