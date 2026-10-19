// node tools/ship.mjs <video>/index.html [--fps 30] [--sub 2] [--fmt 9x16] [--draft] [--skip-check]
// From a checked film to finished files, in one command:
//   1. tools/check.mjs (stops on FAIL)        2. render every format in window.film.formats
//   3. docs/cues.json from window.film.cues, tools/sfx.mjs   4. tools/mux.mjs per format (+ window.film.music)
//   5. tools/deliver.mjs on the master (poster, contact, loop check if window.film.loop)
//   6. frame 0 of every encoded file must not be flat (it is the thumbnail)
//   7. appends one line to <video>/docs/ledger.md (stage, minutes)
// Output: <video>/out/<client>-<video>-<fmt>-v<N>.mp4, N one above the highest existing version.
// --draft: 540 px wide, 24 fps, no subframes, master only (the animatic gate). Nothing is versioned.
import { launch, openFilm } from './film-page.mjs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname, join, basename } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, readdirSync, existsSync, appendFileSync, rmSync, readFileSync, copyFileSync } from 'node:fs';

const args = process.argv.slice(2);
const page = args.find((a) => a.endsWith('.html'));
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!page) { console.error('usage: node tools/ship.mjs <video>/index.html [--fps 30] [--sub 2] [--fmt 9x16] [--draft] [--skip-check]'); process.exit(1); }
const DRAFT = args.includes('--draft');
const dir = dirname(resolve(page)), out = join(dir, 'out'), tools = dirname(fileURLToPath(import.meta.url));
const video = basename(dir), client = basename(dirname(dirname(dir)));
const SIZES = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080], '4x5': [1080, 1350] };
const t0 = Date.now();
const { PY } = await import('./paths.mjs');
const run = (cmd, a, quiet = false) => { const r = spawnSync(cmd, a, { stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' }); if (r.status) { if (quiet) console.error(r.stderr); process.exit(r.status); } return r.stdout; };

if (!args.includes('--skip-check') && !DRAFT) {
  const r = spawnSync('node', [join(tools, 'check.mjs'), resolve(page), '--no-sheets'], { stdio: 'inherit' });
  if (r.status) { console.error('check failed: fix docs/check.md before shipping'); process.exit(1); }
}

// A film built from a reference must carry a concept map that translates the reference's content into the client's own
// (L-156): grammar is copied, objects and metaphors are not. Any film whose code points at refs/ needs one.
{ const code = ['index.html', 'film.py'].map((f) => join(dir, f)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
  if (/refs\//.test(code) || existsSync(join(dir, 'docs', 'concept-map.yaml'))) {
    const map = join(dir, 'docs', 'concept-map.yaml');
    if (!existsSync(map)) { console.error('concept map missing: write docs/concept-map.yaml (template: templates/concept-map.yaml)'); process.exit(1); }
    const cc = spawnSync(PY, [join(tools, 'concept-check.py'), map], { stdio: 'inherit' });
    if (cc.status) { console.error('concept check failed: translate the content before shipping'); process.exit(1); }
  } }

// The library and client layout must be valid too (paths, statuses, no client words in generic files)
{ const lc = spawnSync(PY, [join(tools, '..', 'library', 'check_index.py')], { stdio: 'inherit' });
  if (lc.status) { console.error('library check failed: fix it before shipping'); process.exit(1); } }
const b = await launch();
const p = await openFilm(b, page, { width: 1080, height: 1920 });
const film = await p.evaluate(() => JSON.parse(JSON.stringify(window.film)));
await b.close();
const formats = DRAFT ? [film.formats[0]] : opt('fmt') ? [opt('fmt')] : film.formats;
const FPS = DRAFT ? 24 : +opt('fps', film.fps || 30), SUB = DRAFT ? 1 : +opt('sub', film.sub || 2);

// sound: cues come from the film's own timing table, never retyped
let sfx = null;
// sound effects only when the reference has them: a model-written film added 11 whooshes and hits to a voice-and-bed
// reference, heard as childish (Aman, 15-10-2026). docs/reel.json { "sfx": false } (set by tools/reel.mjs) switches them off.
const reelState = existsSync(join(dir, 'docs', 'reel.json')) ? JSON.parse(readFileSync(join(dir, 'docs', 'reel.json'), 'utf8')) : null;
if (reelState && reelState.sfx === false && film.cues?.length) console.log(`sound effects off: the reference has none (${film.cues.length} cues in the film ignored)`);
if (film.cues?.length && !(reelState && reelState.sfx === false)) {
  const cues = join(dir, 'docs', 'cues.json');
  writeFileSync(cues, JSON.stringify(film.cues, null, 1));
  sfx = join(out, 'sfx.wav');
  run('node', [join(tools, 'sfx.mjs'), cues, '--out', sfx, '--dur', String(film.dur)]);
}
const music = film.music ? resolve(dir, film.music) : null;
if (music && !existsSync(music)) { console.error('missing music ' + music); process.exit(1); }

const versions = readdirSync(out).map((f) => f.match(/-v(\d+)\.mp4$/)).filter(Boolean).map((m) => +m[1]);
const V = DRAFT ? 'draft' : 'v' + (Math.max(0, ...versions) + 1);
const finals = [];
for (const fmt of formats) {
  let [w, h] = SIZES[fmt]; if (DRAFT) { h = Math.round(h * 540 / w / 2) * 2; w = 540; }
  const silent = join(out, `.silent-${fmt}.mp4`);
  run('node', [join(tools, 'render.mjs'), resolve(page), '--fps', String(FPS), '--sub', String(SUB), '--dur', String(film.dur),
    '--w', String(w), '--h', String(h), '--q', '?fmt=' + fmt, '--out', silent]);
  const final = join(out, `${client}-${video}-${fmt}-${V}.mp4`);
  if (sfx || music) run('node', [join(tools, 'mux.mjs'), silent, ...(sfx ? ['--sfx', sfx] : []), ...(music ? ['--music', music] : []), '--out', final]);
  else copyFileSync(silent, final);
  rmSync(silent);
  // frame 0 at full size: the thumbnail
  const px = spawnSync('ffmpeg', ['-v', 'error', '-i', final, '-vf', 'scale=64:64,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout;
  let m = 0, m2 = 0; for (const v of px) { m += v; m2 += v * v; } m /= px.length; const spread = Math.sqrt(Math.max(0, m2 / px.length - m * m));
  const flat = !px.length || spread < 4;
  console.log(`${basename(final)}  frame 0 luma spread ${spread.toFixed(1)}${flat ? '  FAIL: frame 0 is flat (blank thumbnail)' : ''}`);
  if (flat) process.exitCode = 1;
  // length: the file must be as long as the film (a short music track once cut v5 of a festive reel to 17 s of 20)
  const got = +spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final], { encoding: 'utf8' }).stdout;
  const short = Math.abs(got - film.dur) > 1.5 / FPS;
  console.log(`${basename(final)}  length ${got.toFixed(2)} s of ${film.dur} s${short ? '  FAIL: length does not match the film' : ''}`);
  if (short) process.exitCode = 1;
  // sound must run the whole film: a mix made to the reference's 19.7 s silenced the last 12 s of a 32 s reel (reel-contrast-v4 v2, 16-10-2026)
  const aDur = +spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'csv=p=0', final], { encoding: 'utf8' }).stdout;
  if (aDur && film.dur - aDur > 0.5) { console.log(`${basename(final)}  FAIL: the sound stops at ${aDur.toFixed(2)} s of ${film.dur} s`); process.exitCode = 1; }
  finals.push(final);
}
if (!DRAFT) {
  const [w, h] = SIZES[formats[0]];
  run('node', [join(tools, 'deliver.mjs'), resolve(page), '--dur', String(film.dur), '--w', String(w), '--h', String(h), '--q', '?fmt=' + formats[0], ...(film.loop ? ['--loop'] : [])]);
}

const mins = ((Date.now() - t0) / 60000).toFixed(1);
const ledger = join(dir, 'docs', 'ledger.md');
const today = new Date().toLocaleDateString('en-GB').replaceAll('/', '-'), time = new Date().toTimeString().slice(0, 5);
if (existsSync(ledger)) appendFileSync(ledger, `| ${today} ${time} | ${DRAFT ? 'animatic' : 'ship ' + V} | ${mins} | tools/ship.mjs, ${formats.join(' ')} at ${FPS} fps |\n`);
console.log(`\n${finals.length} file(s) in ${mins} min:\n${finals.map((f) => '  ' + f).join('\n')}`);
