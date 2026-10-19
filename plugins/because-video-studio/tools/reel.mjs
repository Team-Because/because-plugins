// node tools/reel.mjs <command> ...      Reference-based reels in 3 steps, with 2 human checkpoints (Aman, 15-10-2026).
//
//   1. new <client> <reference-url> [--idea "how we replicate it"] [--name <video-slug>] [--facts a.md,b.md]
//        --facts: extra fact files (relative to the client folder) that count for this video only.
//        Analyses the brand (rules, facts, its real photos and screens on one numbered sheet) and the reference (download, tools/ref-dna.py,
//        a frame sheet, a listening pass on its sound). With --idea it expands that idea straight away (no checkpoint 1);
//        without it, it writes 3 ideas and stops.
//   2. pick <video> <1|2|3>      checkpoint 1: choose an idea. Writes the concept map (must pass tools/concept-check.py),
//                                the voice script, a draft film, and the storyboard (reference frame beside our frame, per beat).
//      more <video>              3 new ideas, never repeating one already offered for this brand and reference.
//   3. revise <video> "<note>"   checkpoint 2: change the storyboard; re-renders it.
//      approve <video>           voice (ElevenLabs), sound-alike music, mix, ship.mjs, then ref-dna --compare, audio-check and a
//                                blind human review (tools/human-review.py).
//      storyboard <video>        re-render the storyboard only (no model call)
//      review <video> [file.mp4] a listening model hears the reference and ours and scores the sound (runs inside approve)
//      status <video>
//   board <client> <ref-folder> ... [--out <dir>]   one storyboard per measured reference, all on one Storyboards.html
// <video> is clients/<client>/videos/<slug> or just <slug> with --client <client>.
// Creative stages run on OpenRouter through b1/lib/llm.mjs (ideas, map, film: Claude Opus 5.5; listening: Gemini Flash).
// Every model call and its cost is appended to <video>/docs/reel-log.jsonl. Rules it carries: L-154 (measure the reference),
// L-156 (copy the grammar, translate the content), real assets only, music and voice routing in motion-studio/CLAUDE.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(STUDIO, '..', '.env'));
const { chat, imagePart } = await import('../b1/lib/llm.mjs');
const { withPage, closeBrowser } = await import('../b1/lib/browser.mjs');
const PY = join(STUDIO, '.venv', 'bin', 'python');
const T = (f) => join(STUDIO, 'tools', f);
const PROMPT = (f) => readFileSync(join(STUDIO, 'tools', 'reel', 'prompts', f), 'utf8');

const [cmd, ...rest] = process.argv.slice(2);
const flag = (k) => { const i = rest.indexOf('--' + k); return i >= 0 ? rest[i + 1] : null; };
const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--')));
const run = (bin, args, opts = {}) => {
  const r = spawnSync(bin, args, { encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit', cwd: opts.cwd ?? STUDIO, maxBuffer: 1 << 26 });
  if (r.status && !opts.ok) { if (opts.quiet) console.error((r.stderr || '').slice(-2000)); throw new Error(`${basename(bin)} ${args[0] ?? ''} failed`); }
  return r;
};
const say = (s) => console.log(`\n== ${s}`);

// ---------- state ----------
function videoDir(arg, client) {
  if (existsSync(join(STUDIO, arg, 'docs'))) return join(STUDIO, arg);
  if (client && existsSync(join(STUDIO, 'clients', client, 'videos', arg))) return join(STUDIO, 'clients', client, 'videos', arg);
  for (const c of readdirSync(join(STUDIO, 'clients'))) if (existsSync(join(STUDIO, 'clients', c, 'videos', arg))) return join(STUDIO, 'clients', c, 'videos', arg);
  throw new Error(`no video ${arg}`);
}
const statePath = (vd) => join(vd, 'docs', 'reel.json');
const load = (vd) => JSON.parse(readFileSync(statePath(vd), 'utf8'));
const save = (vd, s) => writeFileSync(statePath(vd), JSON.stringify(s, null, 1));
function logCalls(vd, stage, trace) {
  for (const t of trace.splice(0)) appendFileSync(join(vd, 'docs', 'reel-log.jsonl'), JSON.stringify({ at: new Date().toISOString(), step: stage, ...t }) + '\n');
}
const costSoFar = (vd) => existsSync(join(vd, 'docs', 'reel-log.jsonl'))
  ? readFileSync(join(vd, 'docs', 'reel-log.jsonl'), 'utf8').trim().split('\n').reduce((a, l) => a + (+JSON.parse(l).cost || 0), 0) : 0;

// ---------- brand and reference packs ----------
function brandPack(client, vd) {
  const cd = join(STUDIO, 'clients', client);
  const read = (p, n = 9000) => (existsSync(p) ? readFileSync(p, 'utf8').slice(0, n) : '');
  // facts.txt is the brand's confirmed sources; a video may add its own (reel.mjs new --facts), e.g. a document the client
  // team has not confirmed yet, which then counts for that video only (Aman, 16-10-2026)
  const extra = vd && existsSync(statePath(vd)) ? (load(vd).facts ?? []) : [];
  const factsList = [...read(join(cd, 'brand', 'facts.txt')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')), ...extra];
  // facts on a network share are cached locally whenever the share is mounted, so a dropped share never blocks a run
  mkdirSync(join(cd, 'brand', 'facts-cache'), { recursive: true });
  const facts = factsList.map((f) => {
    const p = f.startsWith('/') ? f : join(cd, f), cache = join(cd, 'brand', 'facts-cache', basename(f));
    if (f.startsWith('/') && existsSync(p)) copyFileSync(p, cache);
    const src = existsSync(p) ? p : (existsSync(cache) ? cache : null);
    return src ? `--- ${f}\n${read(src, 7000)}` : '';
  }).join('\n');
  // Real assets only: machine edge traces were rejected as illustrations (b1 check 14, 16-10-2026), so they are not offered.
  const rel = (p) => relative(vd, join(cd, p));
  const IMG = /\.(webp|png|jpe?g)$/i;
  const dirs = ['brand/assets/product', 'brand/assets/site/named',
    ...(existsSync(join(cd, 'products')) ? readdirSync(join(cd, 'products')).map((p) => `products/${p}/assets`) : [])].filter((d) => existsSync(join(cd, d)));
  const real = dirs.flatMap((d) => readdirSync(join(cd, d)).filter((f) => IMG.test(f) && !/-sheet\./.test(f)).map((f) => join(d, f)));
  const assets = [
    ...real.map((f, i) => `${rel(f)}  (real photo or screen, #${i + 1} on the asset sheet)`),
    ...readdirSync(join(cd, 'brand', 'assets')).filter((f) => /^logo.*\.svg$/.test(f)).map((f) => `${rel(join('brand', 'assets', f))}  (logo, keep its colours)`),
    // Line art (white lines on black, from tools/trace-assets.py): a style for beats the brief asks to draw in line art
    // (Aman, 16-10-2026: monochrome animated line art where a photo would sit static), never the default picture.
    ...Object.values(existsSync(join(cd, 'brand', 'assets', 'traced', 'index.json')) ? JSON.parse(readFileSync(join(cd, 'brand', 'assets', 'traced', 'index.json'), 'utf8')) : {})
      .map((a) => `${rel(a.file)}  (LINE ART of ${a.what}, ${a.w}x${a.h}: only on beats the brief asks to draw in line art)`),
  ];
  const sheetPath = join(vd, 'docs', 'asset-sheet.jpg');
  run(PY, ['-c', `import sys\nfrom PIL import Image, ImageDraw\nfs=sys.argv[2:]; W=300; c=6; r=(len(fs)+c-1)//c\nsh=Image.new('RGB',(W*c,W*r),(90,90,90)); d=ImageDraw.Draw(sh)\nfor i,f in enumerate(fs):\n  im=Image.open(f).convert('RGB'); im.thumbnail((W,W-22)); x,y=(i%c)*W,(i//c)*W; sh.paste(im,(x+(W-im.width)//2,y)); d.text((x+4,y+W-18),'#'+str(i+1)+' '+f.split('/')[-1][:34],fill=(255,255,0))\nsh.save(sys.argv[1],quality=80)`, sheetPath, ...real.map((f) => join(cd, f))], { quiet: true });
  const fonts = existsSync(join(cd, 'brand', 'fonts')) ? readdirSync(join(cd, 'brand', 'fonts')) : [];
  return { text: `BRAND RULES (client CLAUDE.md)\n${read(join(cd, 'CLAUDE.md'))}\n\nBRAND FACTS (the only claims allowed)\n${facts}`, assets, factsList, fonts,
           sheet: readFileSync(sheetPath) };
}
function refPack(refDir) {
  const d = JSON.parse(readFileSync(join(refDir, 'dna', 'dna.json'), 'utf8').replace(/\b(NaN|-?Infinity)\b/g, 'null'));   // older dna files
  const listen = existsSync(join(refDir, 'dna', 'listen.json')) ? JSON.parse(readFileSync(join(refDir, 'dna', 'listen.json'), 'utf8')) : {};
  const g = d.grid ?? {};
  const summary = {
    duration: d.video.duration, size: `${d.video.w}x${d.video.h}`, fps: d.video.fps, hard_cuts: d.video.hard_cuts,
    sync_type: d.sync.type, big_changes: d.sync.big_changes, change_events: (d.sync.change_events ?? []).slice(0, 80),
    beat_grid: { status: g.status, bpm: g.bpm_beat_this, beats: (g.beats ?? []).slice(0, 48), downbeats: g.downbeats ?? [] },
    voice: d.voice, music: d.music && { bpm: d.music.bpm, key: d.music.key, key_confidence: d.music.key_confidence, energy_db_per_s: d.music.energy_db_per_s },
  };
  const words = existsSync(join(refDir, 'dna', 'transcript.json')) ? JSON.parse(readFileSync(join(refDir, 'dna', 'transcript.json'), 'utf8')) : null;
  if (words) summary.voice_words = (Array.isArray(words) ? words : words.words ?? []).map((w) => `${(w.text ?? w.word ?? '').trim()}@${(+w.start).toFixed(2)}`).join(' ');
  return { d, listen, text: `REFERENCE DNA (measured)\n${JSON.stringify(summary)}\n\nLISTEN\n${JSON.stringify(listen)}`, sheet: readFileSync(join(refDir, 'dna', 'sheet.jpg')) };
}
const fmtFor = (w, h) => { const r = w / h; return r > 1.4 ? '16x9' : r > 0.95 ? '1x1' : r > 0.7 ? '4x5' : '9x16'; };
const SIZES = { '9x16': [1080, 1920], '1x1': [1080, 1080], '16x9': [1920, 1080], '4x5': [1080, 1350] };

// ---------- steps ----------
async function analyseReference(client, url) {
  const id = run('yt-dlp', ['--no-warnings', '--print', 'id', '--playlist-items', '1', url], { quiet: true }).stdout.trim().split('\n')[0];
  const refDir = join(STUDIO, 'clients', client, 'refs', 'reels', id); mkdirSync(join(refDir, 'dna'), { recursive: true });
  if (!existsSync(join(refDir, 'ref.mp4'))) {
    say(`downloading the reference ${id}`);
    run('yt-dlp', ['--no-warnings', '-q', '--playlist-items', '1', '-f', 'mp4/best', '-o', join(refDir, 'ref.%(ext)s'), '--write-info-json', url]);
  }
  if (!existsSync(join(refDir, 'dna', 'dna.json'))) { say('measuring the reference (tools/ref-dna.py)'); run(PY, [T('ref-dna.py'), refDir]); }
  if (existsSync(join(refDir, 'transcript.json'))) copyFileSync(join(refDir, 'transcript.json'), join(refDir, 'dna', 'transcript.json'));
  if (!existsSync(join(refDir, 'dna', 'sheet.jpg'))) {
    const dur = JSON.parse(readFileSync(join(refDir, 'dna', 'dna.json'), 'utf8').replace(/\b(NaN|-?Infinity)\b/g, 'null')).video.duration;
    run('ffmpeg', ['-v', 'error', '-y', '-i', join(refDir, 'ref.mp4'), '-vf', `fps=${(48 / dur).toFixed(4)},scale=200:-2,tile=8x6`, '-frames:v', '1', join(refDir, 'dna', 'sheet.jpg')]);
  }
  return { id, refDir };
}
async function listen(refDir, vd) {
  if (existsSync(join(refDir, 'dna', 'listen.json'))) return;
  say('listening to the reference (music and voice brief)');
  const mp3 = join(refDir, 'dna', 'listen.mp3');
  run('ffmpeg', ['-v', 'error', '-y', '-i', join(refDir, 'ref.mp4'), '-vn', '-ac', '1', '-b:a', '64k', mp3]);
  const trace = [];
  const r = await chat('read', { system: PROMPT('listen.md'), json: true, maxTokens: 2000,
    content: [{ type: 'text', text: 'The reel soundtrack:' }, { type: 'input_audio', input_audio: { data: readFileSync(mp3).toString('base64'), format: 'mp3' } }] }, trace);
  logCalls(vd, 'listen', trace);
  writeFileSync(join(refDir, 'dna', 'listen.json'), JSON.stringify(r.json, null, 1));
}
async function ideas(vd) {
  const s = load(vd), bp = brandPack(s.client, vd), rp = refPack(s.refDir);
  const offeredPath = join(s.refDir, `ideas-offered-${s.client}.json`);
  const offered = existsSync(offeredPath) ? JSON.parse(readFileSync(offeredPath, 'utf8')) : [];
  say('writing 3 ideas (Opus 5.5)');
  const trace = [];
  const r = await chat('direct', { system: PROMPT('ideas.md'), json: true, maxTokens: 9000, content: [
    { type: 'text', text: `${bp.text}\n\nBRAND ASSETS\n${bp.assets.join('\n')}\n\n${rp.text}\n\nALREADY OFFERED (never repeat)\n${JSON.stringify(offered.map((o) => o.title + ': ' + o.one_line))}\n\nThe first image is the reference, 48 frames in order. The second is the brand's real photos and screens, numbered as in BRAND ASSETS.` },
    imagePart(rp.sheet, 'image/jpeg'), ...(bp.sheet ? [imagePart(bp.sheet, 'image/jpeg')] : [])] }, trace);
  logCalls(vd, 'ideas', trace);
  const list = r.json.ideas.slice(0, 3);
  writeFileSync(offeredPath, JSON.stringify([...offered, ...list.map((i) => ({ title: i.title, one_line: i.one_line }))], null, 1));
  s.ideas = list; s.stage = 'ideas'; save(vd, s);
  const md = list.map((i, k) => `## ${k + 1}. ${i.title}\n${i.one_line}\n\n- Angle: ${i.angle}\n- Kept from the reference: ${i.grammar_kept.join('; ')}\n- Translated: ${i.content_translated.join('; ')}\n- Beats: ${i.sample_beats.join(' / ')}\n${i.words ? `- Words: ${i.words}\n` : ''}- Why it fits: ${i.why_it_fits}\n`).join('\n');
  writeFileSync(join(vd, 'docs', 'ideas.md'), `# Ideas for ${basename(vd)}\n\nReference: ${s.url}\n\n${md}`);
  console.log('\n' + md + `\nNext: node tools/reel.mjs pick ${relative(STUDIO, vd)} <1|2|3>   (or: more ${relative(STUDIO, vd)})`);
}
async function expand(vd, idea) {
  const s = load(vd), bp = brandPack(s.client, vd), rp = refPack(s.refDir);
  say('expanding the idea into a concept map (Opus 5.5)');
  let fixNote = '', map;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const trace = [];
    const r = await chat('direct', { system: PROMPT('expand.md'), json: true, maxTokens: 14000, content: [
      { type: 'text', text: `${bp.text}\n\nBRAND ASSETS (paths exactly as written)\n${bp.assets.join('\n')}\n\n${rp.text}\n\nIDEA\n${typeof idea === 'string' ? idea : JSON.stringify(idea)}${fixNote}` },
      imagePart(rp.sheet, 'image/jpeg'), ...(bp.sheet ? [imagePart(bp.sheet, 'image/jpeg')] : [])] }, trace);
    logCalls(vd, 'expand', trace);
    map = r.json;
    const k = paceStretch(s.refDir, map.voice_lines);
    if (k > 1) {     // stretch the whole timeline: beats and lines keep their order and proportions
      console.log(`pace: ${map.voice_lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0)} words at the reference's speaking speed need ${k}x its length`);
      for (const b of map.beats) b.t = b.t.map((x) => +(x * k).toFixed(3));
      for (const l of map.voice_lines ?? []) l.t = +(l.t * k).toFixed(3);
    }
    s.stretch = k;
    const yaml = toYaml({ reference: relative(join(vd, 'docs', '..'), s.refDir).replace(/^/, ''), client_facts: bp.factsList.map((f) => f.startsWith('/') ? f : relative(vd, join(STUDIO, 'clients', s.client, f))),
      grammar_kept: map.grammar_kept, beats: map.beats.map((b) => ({ t: b.t, reference_shows: b.reference_shows, reference_nouns: b.reference_nouns ?? [], role: b.role, client_shows: b.client_shows,
        client_line: b.client_line ?? '', motion: b.motion ?? '', source: b.source, keeps_reference_object: !!b.keeps_reference_object, reason: b.reason ?? '' })) });
    writeFileSync(join(vd, 'docs', 'concept-map.yaml'), `# Written by tools/reel.mjs from the chosen idea; checked by tools/concept-check.py. Edit freely, then: reel.mjs revise.\n${yaml}`);
    const c = run(PY, [T('concept-check.py'), join(vd, 'docs', 'concept-map.yaml')], { quiet: true, ok: true });
    console.log(c.stdout.trim());
    // approved copy: every quoted line in the idea must be spoken word for word (the model shortened them, reel-contrast-v4, 16-10-2026)
    const norm = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const spoken = norm((map.voice ? (map.voice_lines ?? []).map((l) => l.text) : map.beats.map((b) => b.client_line ?? '')).join(' '));
    const quoted = typeof idea === 'string' ? [...idea.matchAll(/(?:^|\s)'((?:(?!'[\s.,;]).){4,}?[.?!])'(?=[\s,;)]|$)/g)].map((m) => m[1]) : [];
    const lost = quoted.filter((q) => !spoken.includes(norm(q)));
    if (lost.length) console.log(`FAIL approved lines changed or missing: ${JSON.stringify(lost)}`);
    if (!c.status && !lost.length) break;
    if (attempt === 3) throw new Error('concept map still fails after 2 fixes: edit docs/concept-map.yaml by hand, then run reel.mjs film');
    fixNote = `\n\nYOUR LAST MAP FAILED THESE CHECKS, fix every one:\n${c.stdout}${lost.length ? `\nThese approved lines must be spoken word for word: ${JSON.stringify(lost)}` : ''}`;
  }
  s.map = { title: map.title, voice: !!map.voice, end_card: map.end_card }; s.idea = idea;
  if (map.voice && map.voice_lines?.length) {
    const end = Math.max(...map.beats.map((b) => b.t[1]));
    writeFileSync(join(vd, 'docs', 'script.json'), JSON.stringify({ voice: 'brian', end, lines: map.voice_lines }, null, 1));
    // placeholder word timings so the draft film can type captions before the real voice exists
    const words = map.voice_lines.flatMap((l, i) => { const ws = l.text.split(/\s+/); return ws.map((w, k) => ({ w, line: i, s: +(l.t + k * 0.38).toFixed(3), e: +(l.t + k * 0.38 + 0.3).toFixed(3) })); });
    writeFileSync(join(vd, 'vo.js'), `// placeholder until tools/voice.py runs\nconst VO = ${JSON.stringify({ lines: map.voice_lines.map((l) => l.text), words })};\n`);
  }
  s.stage = 'map'; save(vd, s);
  await film(vd);
}
// Pace: a script with more words than the reference keeps the reference's SPEAKING SPEED, so the timeline stretches
// (Aman, 16-10-2026: v4 v1 packed 57 words into the reference's 20 s, "too quick, not able to get the sense").
function paceStretch(refDir, lines) {
  const tp = join(refDir, 'dna', 'transcript.json');
  if (!existsSync(tp) || !lines?.length) return 1;
  const tr = JSON.parse(readFileSync(tp, 'utf8')); if (tr.length < 5) return 1;
  const refRate = tr.length / Math.max(1, tr.at(-1).end - tr[0].start);          // words per second the reference speaks at
  const ours = lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  const span = tr.at(-1).end - tr[0].start;
  return Math.max(1, +((ours / refRate) / span).toFixed(2));
}
function toYaml(o, ind = '') {
  const q = (v) => typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  if (Array.isArray(o)) return o.map((v) => (typeof v === 'object' && v !== null && !Array.isArray(v)) ? `${ind}- ${toYaml(v, ind + '  ').trimStart()}` : `${ind}- ${q(v)}`).join('\n');
  return Object.entries(o).map(([k, v]) => {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object' && !Array.isArray(v[0])) return `${ind}${k}:\n${toYaml(v, ind + '  ')}`;
    if (Array.isArray(v)) return `${ind}${k}: ${JSON.stringify(v)}`;
    if (v && typeof v === 'object') return `${ind}${k}:\n${toYaml(v, ind + '  ')}`;
    return `${ind}${k}: ${q(v)}`;
  }).join('\n');
}
async function film(vd, note = null) {
  const s = load(vd), bp = brandPack(s.client, vd), rp = refPack(s.refDir);
  const fmt = fmtFor(rp.d.video.w, rp.d.video.h), fps = Math.round(rp.d.video.fps) >= 29 && Math.abs(rp.d.video.fps - 30) < 0.5 ? 30 : Math.round(rp.d.video.fps);
  const k = s.stretch ?? 1;
  const dur = +Math.max(rp.d.video.duration * k, ...readMapEnds(vd)).toFixed(2);
  mkdirSync(join(vd, 'fonts'), { recursive: true });
  for (const f of bp.fonts) copyFileSync(join(STUDIO, 'clients', s.client, 'brand', 'fonts', f), join(vd, 'fonts', f));
  copyFileSync(join(STUDIO, 'templates', 'fonts', 'JetBrainsMono.ttf'), join(vd, 'fonts', 'JetBrainsMono.ttf'));
  const fonts = readdirSync(join(vd, 'fonts')).map((f) => `@font-face { font-family: '${f.replace(/\.(ttf|otf|woff2?)$/, '').replace(/[-_]/g, ' ')}'; src: url('fonts/${f}'); }`).join('\n');
  const starter = readFileSync(join(STUDIO, 'templates', 'engine', 'index.html'), 'utf8');
  const helpers = readFileSync(join(STUDIO, 'templates', 'engine', 'blocks.js'), 'utf8').split('\n').filter((l) => /^(function|const|let) /.test(l)).join('\n');
  const map = readFileSync(join(vd, 'docs', 'concept-map.yaml'), 'utf8');
  let fixNote = '', html = existsSync(join(vd, 'index.html')) ? readFileSync(join(vd, 'index.html'), 'utf8') : '';
  // a reviewer's note stays in force on every retry (it was dropped after the first timing fix, reel-contrast-v4, 16-10-2026)
  const noteKept = note;
  for (let attempt = 1; attempt <= 3; attempt++) {
    say(note ? `revising the film (Opus 5.5): ${note}` : `writing the film (Opus 5.5), attempt ${attempt}`);
    const trace = [];
    const content = [{ type: 'text', text: [
      `FORMAT ${fmt} (${SIZES[fmt].join('x')}), fps ${fps}, duration ${dur} s. Fonts (@font-face to include):\n${fonts}`,
      `ASSETS (paths relative to the film, exactly as written)\n${bp.assets.join('\n')}`,
      `CONCEPT MAP\n${map}`, rp.text,
      `KEY TIMES: the reference's big visual changes, on OUR timeline${k > 1 ? ` (the reference stretched ${k}x so the script is spoken at the reference's pace; every reference time in the DNA multiplies by ${k})` : ''}, happen at ${JSON.stringify((rp.d.sync.big_changes ?? []).map((x) => +(x * k).toFixed(3)))} s. Put a clear change of drawing (a new element arriving, a panel, a cut, a ring) exactly on each of these times, read from T.`,
      `END: every line and the tagline are fully drawn by ${(dur - 1.5).toFixed(2)} s and the last 1.5 s holds still (check.mjs fails a film still changing at its end).`,
      `ENGINE STARTER\n${starter}`, `blocks.js signatures\n${helpers}`,
      note || fixNote ? `CURRENT FILM\n${html}` : '', noteKept ? `REVIEWER NOTE (applies to every version, keep it applied)\n${noteKept}` : '', fixNote,
    ].filter(Boolean).join('\n\n') }, imagePart(rp.sheet, 'image/jpeg'), ...(bp.sheet ? [imagePart(bp.sheet, 'image/jpeg')] : [])];
    const r = await chat('film', { system: PROMPT(note && !fixNote ? 'revise.md' : 'film.md'), content, maxTokens: 40000 }, trace);
    logCalls(vd, note ? 'revise' : 'film', trace);
    html = (r.text.match(/```html\s*([\s\S]*?)```/) ?? [null, r.text])[1].trim();
    writeFileSync(join(vd, 'index.html'), html);
    const c = run('node', [T('check.mjs'), join(vd, 'index.html'), '--no-sheets'], { quiet: true, ok: true });
    if (!c.status) {
      console.log('check.mjs: PASS');
      // timing: a quick draft, compared with the reference's big changes; a rule in the prompt alone drifted (0 of 7 matched,
      // reel-contrast-v3 first run, 15-10-2026), so the film is measured and sent back with the exact times
      const t = timing(vd, fmt, fps, dur, s.refDir);
      console.log(`timing: ${t.detail}`);
      if (t.pass || attempt === 3) break;
      fixNote = `THE FILM PASSES check.mjs BUT ITS TIMING DOES NOT FOLLOW THE REFERENCE: ${t.detail}. Move the drawing changes so a clear change lands exactly on each unmatched reference time, and remove changes that land elsewhere. Return the whole corrected HTML.`; note = null;
      continue;
    }
    const report = existsSync(join(vd, 'docs', 'check.md')) ? readFileSync(join(vd, 'docs', 'check.md'), 'utf8').slice(0, 4000) : (c.stdout + c.stderr).slice(-4000);
    if (attempt === 3) { console.log(report); throw new Error('the film still fails check.mjs after 2 fixes: see docs/check.md'); }
    fixNote = `THE FILM FAILED tools/check.mjs. Fix every failure and return the whole corrected HTML:\n${report}`; note = null;
  }
  await storyboard(vd);
}
function timing(vd, fmt, fps, dur, refDir) {
  const draft = join(vd, 'out', '.timing-draft.mp4'); const [W, H] = SIZES[fmt];
  run('node', [T('render.mjs'), join(vd, 'index.html'), '--fps', String(fps), '--dur', String(dur), '--w', String(Math.round(W / 2 / 2) * 2), '--h', String(Math.round(H / 2 / 2) * 2), '--q', `?fmt=${fmt}`, '--out', draft], { quiet: true });
  run(PY, [T('ref-dna.py'), draft, '--out', join(vd, 'docs', 'dna-draft'), '--no-voice', '--no-clip', '--compare', refDir, '--stretch', String(load(vd).stretch ?? 1)], { quiet: true, ok: true });
  const c = JSON.parse(readFileSync(join(vd, 'docs', 'dna-draft', 'dna.json'), 'utf8').replace(/\b(NaN|-?Infinity)\b/g, 'null')).compare ?? { checks: [] };
  const big = c.checks.find((x) => x.check.startsWith('big changes')); const mot = c.checks.find((x) => x.check.startsWith('motion rises'));
  // sense before grammar: two hard changes under 1.2 s apart read as two screens on one line (Aman, 16-10-2026)
  const ours = (JSON.parse(readFileSync(join(vd, 'docs', 'dna-draft', 'dna.json'), 'utf8').replace(/\b(NaN|-?Infinity)\b/g, 'null')).sync?.big_changes ?? []);
  const quick = ours.slice(1).map((t, i) => [ours[i], t]).filter(([a, b]) => b - a < 1.2);
  const gap = { check: 'no two hard changes under 1.2 s apart', pass: !quick.length, detail: quick.length ? `too close: ${quick.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)} s`).join(', ')}` : 'ok' };
  // the reference match tolerates the skipped fast cuts: 60% of its changes, not 70%, once quick pairs are merged
  const bigOk = !big || big.pass || (/ref->ours (\d+)%/.test(big.detail) && +big.detail.match(/ref->ours (\d+)%/)[1] >= 57 && +big.detail.match(/ours->ref (\d+)%/)[1] >= 70);
  return { pass: bigOk && (!mot || mot.pass) && gap.pass, detail: [big, mot, gap].filter(Boolean).map((x) => `${x.check}: ${x.pass ? 'pass' : (x === big && bigOk ? 'pass (fast reference cuts merged)' : 'FAIL')} (${x.detail})`).join('; ') };
}
function readMapEnds(vd) { const m = readFileSync(join(vd, 'docs', 'concept-map.yaml'), 'utf8'); return [...m.matchAll(/t: \[[^\]]*?,\s*([0-9.]+)\]/g)].map((x) => +x[1]); }
async function storyboard(vd) {
  const s = load(vd), rp = refPack(s.refDir); const fmt = fmtFor(rp.d.video.w, rp.d.video.h); const [W, H] = SIZES[fmt];
  const beats = [...readFileSync(join(vd, 'docs', 'concept-map.yaml'), 'utf8').matchAll(/t: \[\s*([0-9.]+),\s*([0-9.]+)\]/g)].map((x) => [+x[1], +x[2]]);
  const mapText = readFileSync(join(vd, 'docs', 'concept-map.yaml'), 'utf8');
  const field = (k) => [...mapText.matchAll(new RegExp(`\\b${k}: (".*")`, 'g'))].map((x) => JSON.parse(x[1]));
  const shows = field('client_shows'), refShows = field('reference_shows'), roles = field('role'), lines = field('client_line'), motion = field('motion');
  const sb = join(vd, 'storyboard'); mkdirSync(join(sb, 'frames'), { recursive: true }); mkdirSync(join(sb, 'ref'), { recursive: true });
  say(`storyboard: ${beats.length} key frames`);
  const { launch, openFilm } = await import('./film-page.mjs');
  const browser = await launch();
  const p = await openFilm(browser, join(vd, 'index.html'), { width: W, height: H }, `?fmt=${fmt}`);
  await p.addStyleTag({ content: 'canvas{width:100%!important;height:auto!important}' });
  // the key frame is the moment in each beat with the most on screen: a fixed point (60%) landed in a beat's fade to black
  // (beat 4 of reel-contrast-v3, 15-10-2026)
  const times = [];
  for (const [a, b] of beats) {
    let best = [a + (b - a) * 0.5, -1];
    for (const f of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const t = +(a + (b - a) * f).toFixed(2);
      const lit = await p.evaluate(async (tt) => { await window.seek(tt); const c = document.querySelector('canvas'); const s = document.createElement('canvas'); s.width = 64; s.height = 64;
        const x = s.getContext('2d'); x.drawImage(c, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let n = 0; for (let i = 0; i < d.length; i += 4) n += (d[i] + d[i + 1] + d[i + 2]) > 60; return n; }, t);
      if (lit > best[1]) best = [t, lit];
    }
    times.push(best[0]);
  }
  for (let i = 0; i < times.length; i++) {
    await p.evaluate((t) => window.seek(t), times[i]);
    await (await p.$('canvas')).screenshot({ path: join(sb, 'frames', `${String(i + 1).padStart(2, '0')}.png`) });
    run('ffmpeg', ['-v', 'error', '-y', '-ss', String(times[i]), '-i', join(s.refDir, 'ref.mp4'), '-frames:v', '1', '-vf', `scale=${W}:${H}`, join(sb, 'ref', `${String(i + 1).padStart(2, '0')}.png`)]);
  }
  await browser.close();
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = times.map((t, i) => `<section class="row"><div class="n">${String(i + 1).padStart(2, '0')}</div>
<figure><img src="ref/${String(i + 1).padStart(2, '0')}.png" alt=""><figcaption>Reference at ${t.toFixed(1)} s</figcaption></figure>
<figure><img src="frames/${String(i + 1).padStart(2, '0')}.png" alt=""><figcaption>Brand key frame</figcaption></figure>
<div class="txt"><p class="line">${esc(lines[i])}</p><p><span>Time</span>${beats[i][0].toFixed(1)} to ${beats[i][1].toFixed(1)} s</p>
<p><span>Reference shows</span>${esc(refShows[i])}</p><p><span>Role</span>${esc(roles[i])}</p><p><span>Brand shows</span>${esc(shows[i])}</p><p><span>What moves</span>${esc(motion[i])}</p></div></section>`).join('\n');
  writeFileSync(join(sb, 'storyboard.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reel Storyboard</title>
<style>:root{--bg:#f0f0f0;--card:#fff;--fg:#111;--mut:#666;--line:#ddd}@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0d0d0d;--card:#161616;--fg:#eee;--mut:#9a9a9a;--line:#2a2a2a}}:root[data-theme="dark"]{--bg:#0d0d0d;--card:#161616;--fg:#eee;--mut:#9a9a9a;--line:#2a2a2a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,system-ui,sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:28px 16px 60px}h1{font-size:26px;margin:0 0 6px}.mut{color:var(--mut)}
.row{display:grid;grid-template-columns:36px 190px 190px 1fr;gap:18px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:16px 0}.n{font:600 14px ui-monospace,monospace;color:var(--mut)}figure{margin:0}img{width:100%;border-radius:8px;border:1px solid var(--line);display:block;background:#000}figcaption{font-size:12px;color:var(--mut);margin-top:4px}.txt p{margin:0 0 6px}.txt span{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}.line{font:500 17px ui-monospace,monospace}
@media (max-width:720px){.row{grid-template-columns:1fr 1fr}.n,.txt{grid-column:1/-1}}</style>
<div class="wrap"><h1>${esc(s.map?.title ?? basename(vd))}: storyboard</h1><p class="mut">Reference: ${esc(s.url)}. Each pair is the reference and the brand film at the same moment. Change it with: node tools/reel.mjs revise ${esc(relative(STUDIO, vd))} "your note". Approve with: node tools/reel.mjs approve ${esc(relative(STUDIO, vd))}</p>
${rows}</div></html>`);
  s.stage = 'storyboard'; save(vd, s);
  console.log(`\nStoryboard: ${relative(STUDIO, join(sb, 'storyboard.html'))}  (model cost so far $${costSoFar(vd).toFixed(2)})`);
  spawnSync('open', [join(sb, 'storyboard.html')]);
}
async function approve(vd) {
  const s = load(vd); const rp = refPack(s.refDir);
  // the film's own length: the reference stretched for pace, the map, and the script's end (the mix once stopped at the
  // reference's 19.7 s in a 32 s film, reel-contrast-v4 v2)
  const scriptEnd = existsSync(join(vd, 'docs', 'script.json')) ? JSON.parse(readFileSync(join(vd, 'docs', 'script.json'), 'utf8')).end ?? 0 : 0;
  const filmDur = +(readFileSync(join(vd, 'index.html'), 'utf8').match(/const DUR = ([0-9.]+)/)?.[1] ?? 0);
  const dur = +Math.max(rp.d.video.duration * (s.stretch ?? 1), ...readMapEnds(vd), scriptEnd, filmDur).toFixed(2);
  // sound effects only when the reference has them (Aman, 15-10-2026): ship.mjs reads this and skips the film's cues
  s.sfx = rp.listen?.sound_effects?.present === true; save(vd, s);
  if (!s.sfx) console.log('sound effects: off (the reference has none)');
  if (existsSync(join(vd, 'docs', 'script.json'))) { say('voice (ElevenLabs)'); run(PY, [T('voice.py'), vd]); }
  if (!existsSync(join(vd, 'docs', 'music-brief.txt'))) writeFileSync(join(vd, 'docs', 'music-brief.txt'), rp.listen.music_brief ?? 'Premium modern instrumental.');
  say('music: sound-alike candidates, scored and fitted to the reference'); run(PY, [T('music-alike.py'), vd, '--ref', s.refDir, '--dur', String(dur)]);
  say('mix'); run(PY, [T('mix.py'), vd, '--dur', String(dur)]);
  say('ship'); run('node', [T('ship.mjs'), join(vd, 'index.html')], { ok: true });
  const finals = readdirSync(join(vd, 'out')).filter((f) => /-v\d+\.mp4$/.test(f)).sort((a, b) => +a.match(/-v(\d+)/)[1] - +b.match(/-v(\d+)/)[1]);
  const fin = join(vd, 'out', finals.at(-1));
  say('compare with the reference'); const cmp = run(PY, [T('ref-dna.py'), fin, '--out', join(vd, 'docs', 'dna'), '--no-voice', '--compare', s.refDir, '--stretch', String(s.stretch ?? 1)], { quiet: true, ok: true });
  console.log(cmp.stdout.slice(-1500));
  say('audio check'); run(PY, [T('audio-check.py'), fin], { ok: true });
  // a blind first-time viewer watches and hears the final film (tools/human-review.py, calibrated on Aman's verdicts)
  say('human review (blind viewer)'); run(PY, [T('human-review.py'), fin, '--script', join(vd, 'docs', 'script.json')], { ok: true });
  const rv = await review(vd, fin);
  if ((rv.scores?.premium_not_childish ?? 10) < 8 || (rv.sound_effects_in_ours ?? []).length > (rv.sound_effects_in_reference ?? []).length) console.log('\nLISTENING REVIEW FLAGS THE SOUND: fix before showing it (see docs/audio-review.jsonl)');
  s.stage = 'done'; s.final = relative(STUDIO, fin); save(vd, s);
  console.log(`\nFinal: ${s.final}  (model cost $${costSoFar(vd).toFixed(2)})`);
}

// listening review: a listening model hears the reference and our film and scores ours (I, the coding model, cannot
// hear; the engine can). Aman, 15-10-2026: "we have built the engine for this, right?"
async function review(vd, file) {
  const s = load(vd);
  const fin = file ?? join(vd, 'out', readdirSync(join(vd, 'out')).filter((f) => /-v\d+\.mp4$/.test(f)).sort((a, b) => +a.match(/-v(\d+)/)[1] - +b.match(/-v(\d+)/)[1]).at(-1));
  const mp3 = (src, out) => { run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vn', '-ac', '1', '-b:a', '64k', out]); return readFileSync(out).toString('base64'); };
  say(`listening review of ${basename(fin)}`);
  const trace = [];
  const r = await chat('read', { system: PROMPT('review.md'), json: true, maxTokens: 4000, content: [
    { type: 'text', text: 'REFERENCE soundtrack:' }, { type: 'input_audio', input_audio: { data: mp3(join(s.refDir, 'ref.mp4'), join(vd, 'docs', '.ref.mp3')), format: 'mp3' } },
    { type: 'text', text: 'OUR soundtrack:' }, { type: 'input_audio', input_audio: { data: mp3(fin, join(vd, 'docs', '.ours.mp3')), format: 'mp3' } }] }, trace);
  logCalls(vd, 'review', trace);
  const out = { file: relative(STUDIO, fin), at: new Date().toISOString(), ...r.json };
  appendFileSync(join(vd, 'docs', 'audio-review.jsonl'), JSON.stringify(out) + '\n');
  console.log(JSON.stringify(out, null, 1));
  return out;
}

// ---------- board: one storyboard per reference, all in one Storyboards.html (Aman, 16-10-2026) ----------
// Measured reference frames per beat beside stills of the brand's real assets, every claim checked against the facts files.
// The team picks from the page; a pick is built with `reel.mjs new <client> <url> --idea "<the board>"`.
async function board(client, refDirs, out) {
  mkdirSync(join(out, 'docs'), { recursive: true }); mkdirSync(join(out, 'frames'), { recursive: true });
  if (!existsSync(statePath(out))) save(out, { client, stage: 'board' });
  const bp = brandPack(client, out);
  const factsText = bp.text.split('BRAND FACTS')[1] ?? '';
  const norm = (t) => t.toLowerCase().replace(/[^a-z0-9%./ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const factsN = norm(factsText);
  const font = existsSync(join(STUDIO, 'clients', client, 'brand', 'fonts')) ? readdirSync(join(STUDIO, 'clients', client, 'brand', 'fonts')).filter((f) => /\.(ttf|otf)$/i.test(f)).map((f) => join(STUDIO, 'clients', client, 'brand', 'fonts', f)).find((f) => !/sporty/i.test(f)) : '';
  const cards = [];
  const one = async (refDir) => {
    const id = basename(refDir), cache = join(out, 'docs', `${id}.json`);
    if (!existsSync(join(refDir, 'dna', 'sheet.jpg'))) {
      const d0 = JSON.parse(readFileSync(join(refDir, 'dna', 'dna.json'), 'utf8').replace(/\b(NaN|-?Infinity)\b/g, 'null')).video.duration;
      run('ffmpeg', ['-v', 'error', '-y', '-i', join(refDir, 'ref.mp4'), '-vf', `fps=${(48 / d0).toFixed(4)},scale=200:-2,tile=8x6`, '-frames:v', '1', join(refDir, 'dna', 'sheet.jpg')]);
    }
    await listen(refDir, out);
    const rp = refPack(refDir);
    let b;
    if (existsSync(cache)) b = JSON.parse(readFileSync(cache, 'utf8'));
    else {
      const trace = [];
      const r = await chat('direct', { system: PROMPT('board.md'), json: true, maxTokens: 9000, content: [
        { type: 'text', text: `${bp.text}\n\nBRAND ASSETS\n${bp.assets.join('\n')}\n\n${rp.text}\n\nThe first image is the reference, 48 frames in order. The second is the brand's real assets, numbered as in BRAND ASSETS.` },
        imagePart(rp.sheet, 'image/jpeg'), imagePart(bp.sheet, 'image/jpeg')] }, trace);
      logCalls(out, `board ${id}`, trace);
      b = r.json; writeFileSync(cache, JSON.stringify(b, null, 1));
    }
    const info = existsSync(join(refDir, 'ref.info.json')) ? JSON.parse(readFileSync(join(refDir, 'ref.info.json'), 'utf8')) : {};
    const { w: rw, h: rh, duration } = rp.d.video, fw = 216, fh = Math.round(fw * rh / rw / 2) * 2;
    const jobs = [], svgs = [];
    (b.beats ?? []).forEach((bt, i) => {
      const mid = Math.min(duration - 0.05, ((bt.t?.[0] ?? 0) + (bt.t?.[1] ?? 0)) / 2);
      const rf = join(out, 'frames', `${id}-${i + 1}-ref.jpg`);
      if (!existsSync(rf)) run('ffmpeg', ['-v', 'error', '-y', '-ss', String(mid), '-i', join(refDir, 'ref.mp4'), '-frames:v', '1', '-vf', `scale=${fw}:${fh}`, rf]);
      const assetAbs = bt.asset ? resolve(out, bt.asset) : null;
      bt.asset_ok = !bt.asset || existsSync(assetAbs);
      bt.fact_ok = !bt.fact || factsN.includes(norm(bt.fact)) || norm(bt.fact).split(' ').filter((w) => w.length > 3).every((w) => factsN.includes(w));
      let src = bt.asset_ok ? assetAbs : null;
      if (src && src.endsWith('.svg')) { const png = join(out, 'frames', basename(src, '.svg') + '.png'); svgs.push([src, png]); src = png; }
      jobs.push({ out: join(out, 'frames', `${id}-${i + 1}-ours.jpg`), w: fw, h: fh, asset: src, line_art: !!bt.line_art || (src ?? '').endsWith('.png') && svgs.some((x) => x[1] === src), words: bt.words ?? '', font });
    });
    // logos are SVG: Chromium draws them to a transparent PNG (PIL cannot read SVG)
    for (const [svg, png] of svgs) if (!existsSync(png)) await withPage({ width: 800, height: 400 }, async (pg) => {
      await pg.setContent(`<body style="margin:0;background:transparent"><img id="i" src="data:image/svg+xml;base64,${readFileSync(svg).toString('base64')}" style="width:800px">`);
      await pg.locator('#i').screenshot({ path: png, omitBackground: true });
    });
    writeFileSync(join(out, 'docs', `${id}-jobs.json`), JSON.stringify(jobs));
    run(PY, [join(STUDIO, 'tools', 'reel', 'board-frames.py'), join(out, 'docs', `${id}-jobs.json`)], { quiet: true });
    cards.push({ id, b, url: info.webpage_url ?? '', handle: info.uploader_id ?? info.channel ?? info.uploader ?? '', dna: rp.d, listen: rp.listen });
    console.log(`  board ${id}: ${b.title} (${(b.beats ?? []).length} beats, ${b.feasible ? 'feasible' : 'needs: ' + (b.needs ?? []).join('; ')})`);
  };
  const queue = [...refDirs];
  await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const r = queue.shift(); try { await one(r); } catch (e) { console.log(`  board ${basename(r)} FAILED: ${e.message}`); } } }));
  cards.sort((a, b) => refDirs.indexOf(refDirs.find((r) => basename(r) === a.id)) - refDirs.indexOf(refDirs.find((r) => basename(r) === b.id)));
  await closeBrowser();
  writeFileSync(join(out, 'Storyboards.html'), boardHtml(client, cards));
  console.log(`\nStoryboards: ${relative(STUDIO, join(out, 'Storyboards.html'))}  (${cards.length} boards, model cost $${costSoFar(out).toFixed(2)})`);
}
function boardHtml(client, cards) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = new Date().toLocaleDateString('en-GB').replaceAll('/', '-');
  const card = (c, n) => {
    const b = c.b, d = c.dna, g = d.grid ?? {};
    const measured = [`${d.video.duration.toFixed(1)} s`, `${d.video.w}x${d.video.h}`, `sync: ${d.sync.type}`, g.status === 'confirmed' || g.status === 'disputed' ? `${Math.round(g.bpm_beat_this ?? d.music?.bpm ?? 0)} BPM (${g.status})` : 'no steady beat', (d.voice?.words ?? 0) > 3 || c.listen?.voice?.present ? 'voice' : 'no voice'].join(' · ');
    const beats = (b.beats ?? []).map((bt, i) => `<div class="beat"><div class="pair"><figure><img src="frames/${c.id}-${i + 1}-ref.jpg" alt=""><figcaption>Reference</figcaption></figure><figure><img src="frames/${c.id}-${i + 1}-ours.jpg" alt=""><figcaption>Ours</figcaption></figure></div>
      <p class="t">${i + 1}. ${(bt.t ?? []).map((x) => (+x).toFixed(1)).join('-')} s</p><p>${esc(bt.ours_shows)}</p>${bt.words ? `<p class="words">"${esc(bt.words)}"</p>` : ''}
      ${bt.fact ? `<p class="fact ${bt.fact_ok ? 'ok' : 'bad'}">${bt.fact_ok ? 'Fact' : 'Not found in the facts'}: "${esc(bt.fact)}"</p>` : ''}${bt.asset_ok ? '' : `<p class="fact bad">Asset missing: ${esc(bt.asset)}</p>`}</div>`).join('');
    const flags = (b.beats ?? []).filter((bt) => !bt.fact_ok || !bt.asset_ok).length;
    return `<section class="card" id="${esc(c.id)}"><header><span class="num">${String(n + 1).padStart(2, '0')}</span><div><h2>${esc(b.title)}</h2>
      <p class="src">${esc(c.handle ? '@' + c.handle.replace(/^@/, '') : c.id)} · ${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">open original</a>` : ''} · measured: ${esc(measured)}</p></div>
      <span class="badge ${b.feasible && !flags ? 'go' : 'hold'}">${b.feasible ? (flags ? `${flags} check${flags > 1 ? 's' : ''} open` : 'Ready to build') : 'Needs material'}</span></header>
      <dl><dt>The reference</dt><dd>${esc(b.reference_is)}</dd><dt>The trick</dt><dd>${esc(b.mechanic)}</dd><dt>We borrow</dt><dd>${esc(b.we_borrow)}</dd>
      <dt>Our film says</dt><dd><strong>${esc(b.thesis)}</strong></dd><dt>Format</dt><dd>${esc(b.format?.aspect)}, ${esc(b.format?.seconds)} s, ${b.format?.voice ? 'voice' : 'no voice'}, ${esc(b.format?.sync)}</dd>
      <dt>Sound</dt><dd>${esc(b.sound)}</dd>${(b.needs ?? []).length ? `<dt>Needs</dt><dd>${esc(b.needs.join('; '))}</dd>` : ''}<dt>Why it works</dt><dd>${esc(b.why_it_works)}</dd></dl>
      <div class="beats">${beats}</div><p class="end">End: ${esc(b.end)}</p></section>`;
  };
  return `<title>${esc(client[0].toUpperCase() + client.slice(1))} Reel Storyboards</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#f4f4f2;--fg:#151515;--mut:#6b6b68;--card:#fff;--line:#deded9;--go:#1d6b3a;--hold:#9a5b00;--bad:#b3261e;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121212;--fg:#ececea;--mut:#9a9a96;--card:#1b1b1b;--line:#2c2c2a;--go:#6fd391;--hold:#f0b45a;--bad:#ff8a80;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121212;--fg:#ececea;--mut:#9a9a96;--card:#1b1b1b;--line:#2c2c2a;--go:#6fd391;--hold:#f0b45a;--bad:#ff8a80;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,"Helvetica Neue",Arial,sans-serif;padding:32px max(16px,env(safe-area-inset-right,0px)) 64px max(16px,env(safe-area-inset-left,0px))}
main{max-width:1180px;margin:0 auto}h1{font-size:30px;margin:0 0 6px}.lede{color:var(--mut);max-width:70ch;margin:0 0 28px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin:0 0 24px}
header{display:flex;gap:14px;align-items:flex-start}header>div{flex:1;min-width:0}.num{font:600 13px ui-monospace,Menlo,monospace;color:var(--mut);padding-top:6px}
h2{margin:0;font-size:20px;text-wrap:balance}.src{margin:2px 0 0;color:var(--mut);font-size:13px}.src a{color:inherit}
.badge{font-size:12px;font-weight:600;padding:4px 9px;border-radius:99px;border:1px solid currentColor;white-space:nowrap}.go{color:var(--go)}.hold{color:var(--hold)}
dl{display:grid;grid-template-columns:120px 1fr;gap:4px 14px;margin:16px 0}dt{color:var(--mut);font-size:13px}dd{margin:0;min-width:0}
.beats{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.beat{min-width:0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}figure{margin:0}figure img{width:100%;display:block;border-radius:4px;background:#000}
figcaption{font-size:11px;color:var(--mut);margin-top:2px}.beat p{margin:4px 0;font-size:13px}.t{font:600 12px ui-monospace,Menlo,monospace;color:var(--mut)}
.words{font-weight:600}.fact{font-size:12px!important}.fact.ok{color:var(--go)}.fact.bad{color:var(--bad)}.end{color:var(--mut);font-size:13px;margin:14px 0 0}
@media (max-width:600px){dl{grid-template-columns:1fr}dt{margin-top:6px}}
</style>
<main><h1>${esc(client[0].toUpperCase() + client.slice(1))} reel storyboards</h1>
<p class="lede">Made ${today} by the reel engine. Each board: the reference measured (length, sync, tempo, voice), the trick we borrow, the one thing our film says, then per beat the reference's real frame beside a still of the real ${esc(client)} asset. Every claim is checked against the brand's facts files. Default format is a music-led smart edit, no narration. Pick a board to build it.</p>
${cards.map(card).join('\n')}</main>`;
}

// ---------- commands ----------
try {
  if (cmd === 'new') {
    const [client, url] = pos; if (!client || !url) throw new Error('usage: reel.mjs new <client> <reference-url> [--idea "..."] [--name slug]');
    const { id, refDir } = await analyseReference(client, url);
    const slug = flag('name') ?? `reel-${id.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const vd = join(STUDIO, 'clients', client, 'videos', slug);
    if (!existsSync(vd)) run('node', [T('new-video.mjs'), client, slug]);
    const facts = (flag('facts') ?? '').split(',').map((f) => f.trim()).filter(Boolean);
    for (const f of facts) if (!existsSync(f.startsWith('/') ? f : join(STUDIO, 'clients', client, f))) throw new Error(`--facts file not found: ${f}`);
    save(vd, { client, url, refId: id, refDir, stage: 'new', created: new Date().toISOString(), ...(facts.length ? { facts } : {}) });
    await listen(refDir, vd);
    if (flag('idea')) await expand(vd, flag('idea')); else await ideas(vd);
  } else if (cmd === 'more') await ideas(videoDir(pos[0], flag('client')));
  else if (cmd === 'pick') { const vd = videoDir(pos[0], flag('client')); const s = load(vd); const i = s.ideas?.[+pos[1] - 1]; if (!i) throw new Error('no such idea'); await expand(vd, i); }
  else if (cmd === 'board') { const [client, ...refs] = pos; await board(client, refs.map((r) => resolve(r)), resolve(flag('out') ?? join(STUDIO, 'clients', client, 'boards', new Date().toLocaleDateString('en-GB').replaceAll('/', '-')))); }
  else if (cmd === 'film') await film(videoDir(pos[0], flag('client')));
  else if (cmd === 'storyboard') await storyboard(videoDir(pos[0], flag('client')));
  else if (cmd === 'review') await review(videoDir(pos[0], flag('client')), pos[1] ? resolve(pos[1]) : null);
  else if (cmd === 'revise') { const vd = videoDir(pos[0], flag('client')); await film(vd, pos[1]); }
  else if (cmd === 'approve') await approve(videoDir(pos[0], flag('client')));
  else if (cmd === 'status') { const vd = videoDir(pos[0], flag('client')); const s = load(vd); console.log(JSON.stringify({ stage: s.stage, ref: s.url, idea: s.idea?.title ?? s.idea, final: s.final, cost: +costSoFar(vd).toFixed(3) }, null, 1)); }
  else { console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).join('\n')); }
} catch (e) { console.error('\nreel.mjs: ' + e.message); process.exit(1); }
