# Step 07 · Engine (the seek(t) renderer)

Source: @0xMovez course, step 07 (https://x.com/0xMovez/article/2104216919033192746).
Route A, the one Opus picks by default. Two files: the page paints any moment on demand, the renderer walks
time and pipes frames into ffmpeg.

## What we have (nothing to write per video)
| Piece | File | What it does |
|---|---|---|
| Page starter | `templates/engine/index.html` | Copied into every new video as `index.html` by `tools/new-video.mjs` |
| Renderer | `tools/render.mjs` | Walks t, screenshots the canvas, pipes to ffmpeg (H.264, yuv420p, CRF 16), `--sub N` motion blur |
| Stills | `tools/stills.mjs` | Chosen moments as one labelled contact sheet, for the critique loop |

```
node tools/new-video.mjs <client> <video>                          # index.html is the starter
open clients/<client>/videos/<video>/index.html                    # live preview, loops
node tools/stills.mjs clients/<client>/videos/<video>/index.html --every 0.5 --dur 10
node tools/render.mjs clients/<client>/videos/<video>/index.html --fps 60 --dur 10 --sub 4
# other formats from the same file:
node tools/render.mjs <...>/index.html --w 1080 --h 1080 --q '?fmt=1x1' --out <...>/out/1x1.mp4
```

## The prompt (paste into the client session after the shot list or state list is approved)
```
Build this video on the engine in index.html. Keep the contract: one canvas, window.ready, window.seek(t),
no timers, no CSS transitions, no Math.random (use rng(seed)), no state carried between frames.
1. Colours and fonts from ../../brand/brand.json; register every image in IMAGES.
2. One SCENES object per shot in docs/shotlist.md (or per state in docs/state_list.md), same timings.
3. Sizes from W and H only, so ?fmt=1x1 and ?fmt=16x9 still compose.
4. Show me a stills sheet (tools/stills.mjs, one still per shot) before any full render.
```

## What we changed from the course and why
| Course | Ours | Why |
|---|---|---|
| `page.evaluate(() => document.fonts.ready)` | `window.ready` = fonts + every image in IMAGES | One film used photos and AI frames; a frame rendered before its image loaded comes out blank and nobody notices until review |
| Page errors ignored | render and stills exit with the page errors | A broken scene should stop the render, not ship |
| `seek(t)` is synchronous | `seek(t)` is async and awaits `window.ready` | Lets a scene pull a frame from an AI clip (mixed pipeline, an earlier product film) |
| Fixed 1080x1920, `index.html` in cwd | `--w --h --q '?fmt=..'`, any page path, output next to the page | One file, three formats, many clients |
| Fixed fps/dur/sub | Flags with defaults 30 fps, 10 s, sub 1 | Fast drafts by default, `--fps 60 --sub 4` for the final |
| Chromium defaults | GPU + local file access flags | Three.js and local ES modules render too |

## The course original (verbatim, for comparison)

index.html
```html
<style>html,body{margin:0;background:#141413}canvas{display:block}</style>
<canvas id="c" width="1080" height="1920"></canvas>
<script>
const W = 1080, H = 1920, DUR = 15;
const g = document.getElementById('c').getContext('2d');
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));

// Closed-form damped spring, 0 → 1. Pure function of time (step 08 explains it).
function spring(t, k = 170, d = 26) {
if (t <= 0) return 0;
const w0 = Math.sqrt(k), z = d / (2 * w0);
if (z < 1) {
const wd = w0 * Math.sqrt(1 - z * z);
return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
}
return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // z >= 1 treated as critical
}

// Seeded noise, never Math.random: the render must be identical every run
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SCENES = [
{ from: 0, to: 3, draw(t) { // kinetic title
const s = spring(t - 0.1, 220, 22);
g.save(); g.translate(W / 2, H / 2); g.scale(0.6 + 0.4 * s, 0.6 + 0.4 * s);
g.globalAlpha = clamp(t * 4);
g.fillStyle = '#F0EEE6'; g.font = '700 190px "Source Serif 4", serif';
g.textAlign = 'center'; g.fillText('MOTION', 0, 0);
g.fillStyle = '#D97757'; g.fillRect(-320 * s, 50, 640 * s, 18);
g.restore();
}},
{ from: 3, to: 6, draw(t) { // grid of squares on a stagger
const r = rng(7);
for (let i = 0; i < 48; i++) {
const x = (i % 6) * 170 + 115, y = Math.floor(i / 6) * 170 + 360;
const s = spring(t - i * 0.03 - r() * 0.1, 260, 20);
g.fillStyle = i % 7 ? '#F0EEE6' : '#D97757';
g.fillRect(x - 60 * s, y - 60 * s, 120 * s, 120 * s);
}
}},
// ... more scenes: Opus appends here, one object per shot
];

function draw(t) {
g.fillStyle = '#141413'; g.fillRect(0, 0, W, H);
for (const s of SCENES) if (t >= s.from && t < s.to) s.draw(t - s.from);
}
window.seek = (t) => { draw(t); return true; };

// Live preview in a normal browser, off during headless render
if (!navigator.webdriver) {
const t0 = performance.now();
(function loop() { draw(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); })();
}
</script>
```

render.mjs
```js
// node render.mjs --fps 60 --dur 15 --sub 4
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const FPS = arg('fps', 60), DUR = arg('dur', 15), SUB = arg('sub', 4);
mkdirSync('out', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto('file://' + process.cwd() + '/index.html');
await page.evaluate(() => document.fonts.ready); // canvas text needs loaded fonts

// tmix averages SUB consecutive subframes; select keeps the last of each group
const vf = `tmix=frames=${SUB},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB`;
const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS * SUB), '-i', '-',
'-vf', vf, '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', 'out/silent.mp4'],
{ stdio: ['pipe', 'inherit', 'inherit'] });

const total = Math.round(DUR * FPS * SUB);
for (let i = 0; i < total; i++) {
await page.evaluate((t) => window.seek(t), i / (FPS * SUB));
const png = await page.locator('#c').screenshot({ type: 'png' });
if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
if (i % (FPS * SUB) === 0) console.log(`rendered ${i / (FPS * SUB)}s / ${DUR}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
```

## Route B: same prompt, a framework (only when it pays off)
Remotion and HyperFrames skills are already installed at user level (step 02). Use them for a template
series (same layout, 20 clients' data) or a data-driven batch; for a single film route A is simpler.
```
# Remotion (React)
npx create-video@latest launch-film && cd launch-film
npx skills add remotion-dev/skills
claude
> /remotion-create a 20s 9:16 launch film for [PRODUCT], springs only, one accent color
npx remotion studio
npx remotion render Main out/launch.mp4

# HyperFrames (HTML + GSAP)
npx hyperframes init my-video && cd my-video
npx hyperframes skills update
claude
> Using /hyperframes, turn ./notes.md into a 45-second pitch video with kinetic captions
npx hyperframes preview && npx hyperframes render
```
