// Images for posts, carousels, stories and banners, made with the person's ChatGPT subscription through the Codex CLI
// (no API key: Codex signs in with ChatGPT once, see the setup skill). Two steps:
//
//   node tools/image.mjs make   --out <dir> --size 1x1|4x5|9x16|16x9 [--n 3] (--prompt "..." | --prompt-file p.txt)
//                               [--ref a.png,b.png] [--name option]
//     Asks Codex for n pictures in parallel (about a minute each) and saves <dir>/<name>-1.png ... The picture carries no
//     words and no logo: image models bend letters and logos, so those go on in the next step, exact, from the brand kit.
//
//   node tools/image.mjs finish <picture.png> --size 4x5 --out final.png [--logo logo.png] [--corner tl|tr|bl|br]
//                               [--headline "..."] [--sub "..."] [--font "Inter"] [--font-file f.ttf] [--color #fff]
//                               [--plate #000000aa] [--align top|bottom]
//     Crops the picture to the exact size and puts the real logo and the words on top in the brand's font and colour.
//
// CODEX overrides the codex command (tests use a stand-in).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SIZES = { '1x1': [1080, 1080], '4x5': [1080, 1350], '9x16': [1080, 1920], '16x9': [1920, 1080] };
const ASPECT = { '1x1': 'square, 1:1', '4x5': 'portrait, 4:5', '9x16': 'tall portrait, 9:16', '16x9': 'wide landscape, 16:9' };

export function codexPrompt(prompt, size, file) {
  return [
    'Generate one image with your image generation tool.',
    prompt.trim(),
    `Format: ${ASPECT[size]}.`,
    'Leave out all text, letters, numbers, watermarks and logos: they are added later. Keep the space where a headline would sit calm.',
    `Save the image in the current folder as ${file} and reply with only the file name.`,
  ].join('\n');
}

// Codex is always started without a shell, so nothing in a prompt or a folder name can run as a command. On Windows npm
// installs a .cmd shim, which only starts through cmd.exe: run the script behind it with node instead.
export function codexCommand() {
  if (process.env.CODEX) return [process.env.CODEX, []];
  if (process.platform !== 'win32') return ['codex', []];
  for (const path of (spawnSync('where', ['codex'], { encoding: 'utf8' }).stdout || '').split(/\r?\n/).filter(Boolean)) {
    if (/\.exe$/i.test(path)) return [path, []];
    const js = join(dirname(path), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(js)) return [process.execPath, [js]];
  }
  return ['codex.exe', []];
}

function runCodex(dir, prompt, refs) {
  const [cmd, pre] = codexCommand();
  // The prompt goes in on stdin ("-"), never on the command line
  const a = [...pre, 'exec', '--skip-git-repo-check', '-s', 'workspace-write', '-C', dir, ...refs.flatMap((r) => ['-i', r]), '-'];
  return new Promise((done) => {
    const p = spawn(cmd, a, { stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    p.stdin.end(prompt);
    let log = '';
    p.stdout.on('data', (d) => (log += d)); p.stderr.on('data', (d) => (log += d));
    const timer = setTimeout(() => p.kill(), 6 * 60 * 1000);
    p.on('error', (e) => { clearTimeout(timer); done({ code: -1, log: String(e) }); });
    p.on('close', (code) => { clearTimeout(timer); done({ code, log }); });
  });
}

function explain(log) {
  if (/ENOENT|not recognized|command not found/i.test(log)) return 'Codex is not installed on this computer: run the setup skill and pick "Images with ChatGPT".';
  if (/log ?in|auth|unauthori[sz]ed|401/i.test(log)) return 'Codex is not signed in: run `codex login` and finish the ChatGPT sign-in in the browser.';
  if (/usage limit|rate limit|quota|429/i.test(log)) return 'The ChatGPT plan has hit its image limit for now: try again later.';
  return 'Codex did not save a picture. The last lines it printed:\n' + log.trim().split('\n').slice(-6).join('\n');
}

async function make(args, opt) {
  const size = opt('size', '1x1');
  if (!SIZES[size]) throw new Error(`--size must be one of ${Object.keys(SIZES).join(', ')}`);
  const out = resolve(opt('out', '.')); mkdirSync(out, { recursive: true });
  const prompt = opt('prompt') ?? (opt('prompt-file') ? readFileSync(opt('prompt-file'), 'utf8') : null);
  if (!prompt) throw new Error('give --prompt "..." or --prompt-file p.txt');
  const n = Math.min(4, Math.max(1, +opt('n', 3))), name = opt('name', 'option');
  const refs = (opt('ref') ?? '').split(',').filter(Boolean).map((r) => resolve(r));
  for (const r of refs) if (!existsSync(r)) throw new Error(`reference not found: ${r}`);
  console.log(`asking Codex for ${n} picture(s), ${size}, about a minute each, in parallel...`);
  const results = await Promise.all(Array.from({ length: n }, (_, i) => {
    const file = `${name}-${i + 1}.png`;
    const started = Date.now();
    return runCodex(out, codexPrompt(prompt, size, file), refs).then((r) => {
      const path = join(out, file);
      const made = existsSync(path) && statSync(path).size > 1000;
      return { file: path, made, secs: Math.round((Date.now() - started) / 1000), why: made ? '' : explain(r.log) };
    });
  }));
  for (const r of results) console.log(r.made ? `OK   ${r.file} (${r.secs} s)` : `FAIL ${r.file}: ${r.why}`);
  if (!results.some((r) => r.made)) process.exit(1);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dataUri = (f) => `data:image/${extname(f).slice(1).replace('jpg', 'jpeg').replace('svg', 'svg+xml')};base64,${readFileSync(f).toString('base64')}`;

export function finishHtml({ picture, size, logo, corner = 'tr', headline, sub, font = 'Inter', fontFile, color = '#ffffff', plate, align = 'bottom' }) {
  const [W, H] = SIZES[size], pad = Math.round(W * 0.06), logoH = Math.round(H * 0.07);
  const [v, h] = [corner[0] === 't' ? 'top' : 'bottom', corner[1] === 'l' ? 'left' : 'right'];
  const face = fontFile ? `@font-face{font-family:"Brand";src:url(${dataUri(fontFile)})}` : '';
  const family = fontFile ? '"Brand"' : `"${font}"`;
  const shade = plate ? `background:${plate};padding:${Math.round(pad * 0.6)}px;border-radius:${Math.round(pad * 0.3)}px;`
    : 'text-shadow:0 2px 18px rgba(0,0,0,.45);';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${face}
*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;overflow:hidden}
body{background:#000 url(${dataUri(picture)}) center/cover no-repeat;font-family:${family},system-ui,sans-serif;color:${color}}
.logo{position:absolute;${v}:${pad}px;${h}:${pad}px;height:${logoH}px;max-width:${Math.round(W * 0.35)}px;object-fit:contain}
.words{position:absolute;left:${pad}px;right:${pad}px;${align}:${pad + (corner[0] === align[0] && logo ? logoH + pad / 2 : 0)}px;${shade}}
h1{font-size:${Math.round(W * 0.075)}px;line-height:1.05;font-weight:700;letter-spacing:-.01em}
p{font-size:${Math.round(W * 0.034)}px;line-height:1.3;margin-top:${Math.round(pad * 0.35)}px}
</style></head><body>${logo ? `<img class="logo" src="${dataUri(logo)}">` : ''}${headline || sub ? `<div class="words">${headline ? `<h1>${esc(headline)}</h1>` : ''}${sub ? `<p>${esc(sub)}</p>` : ''}</div>` : ''}</body></html>`;
}

async function finish(args, opt) {
  const picture = resolve(args[1] ?? ''), size = opt('size', '1x1');
  if (!existsSync(picture)) throw new Error(`picture not found: ${picture}`);
  if (!SIZES[size]) throw new Error(`--size must be one of ${Object.keys(SIZES).join(', ')}`);
  const out = resolve(opt('out', picture.replace(/\.png$/i, `-${size}.png`)));
  const logo = opt('logo') && resolve(opt('logo')), fontFile = opt('font-file') && resolve(opt('font-file'));
  for (const f of [logo, fontFile]) if (f && !existsSync(f)) throw new Error(`file not found: ${f}`);
  const html = finishHtml({ picture, size, logo, corner: opt('corner', 'tr'), headline: opt('headline'), sub: opt('sub'),
    font: opt('font', 'Inter'), fontFile, color: opt('color', '#ffffff'), plate: opt('plate'), align: opt('align', 'bottom') });
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const [W, H] = SIZES[size];
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.setContent(html, { waitUntil: 'load' });   // every file is inlined, so nothing is read from disk
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
  await browser.close();
  console.log(`OK   ${out} (${W}x${H})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const job = { make, finish }[args[0]];
  if (!job) { console.error('usage: node tools/image.mjs make --out <dir> --size 4x5 --prompt "..." | finish <picture.png> --size 4x5 --out final.png'); process.exit(1); }
  job(args, opt).catch((e) => { console.error(`FAIL ${e.message}`); process.exit(1); });
}
