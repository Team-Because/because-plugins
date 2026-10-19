// node tools/svg-sheet.mjs <out.png> <folder> [--tint '#111']
// Contact sheet of SVG icons or logos, each on white and on dark, labelled. currentColor icons are drawn in --tint on white
// and in white on dark. Fails if any file is not an SVG.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const [out, dir] = process.argv.slice(2);
const ti = process.argv.indexOf('--tint'), tint = ti > 0 ? process.argv[ti + 1] : '#111';
const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
const bad = files.filter((f) => !readFileSync(join(dir, f), 'utf8').includes('<svg'));
if (bad.length) { console.error('not SVG: ' + bad.join(', ')); process.exit(1); }
// An SVG with its own <style> or ids is drawn as an image, so its classes cannot restyle another file on the sheet
// (two logos sharing ".s0" once showed a dark wordmark as white, 12-10-2026). Only currentColor icons are inlined.
const cell = (f) => { const svg = readFileSync(join(dir, f), 'utf8'), own = /<style|\bid="/.test(svg) || !svg.includes('currentColor');
  const draw = (c) => own ? `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">` : `<div style="color:${c}">${svg}</div>`;
  return `<div><div class=p><div class="b w">${draw(tint)}</div><div class="b d">${draw('#fff')}</div></div><div class=id>${basename(f, '.svg')}</div></div>`; };
const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#141413;color:#eee;padding:14px;font-family:monospace}
.g{display:grid;grid-template-columns:repeat(8,150px);gap:10px}.p{display:flex;gap:3px}.b{width:72px;height:72px;border-radius:6px;display:flex;align-items:center;justify-content:center}
.b svg{width:40px;height:40px}.b img{max-width:64px;max-height:48px}.w{background:#fff}.d{background:#1b1d22}.id{font-size:11px;margin-top:4px;color:#bbb}</style><div class=g>${files.map(cell).join('')}</div>`;
const tmp = resolve(dirname(out), '.svg-sheet.html'); writeFileSync(tmp, html);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1260, height: 300 } });
await p.goto(pathToFileURL(tmp).href); await p.screenshot({ path: out, fullPage: true }); await b.close();
console.log(`${files.length} SVGs -> ${out}`);
