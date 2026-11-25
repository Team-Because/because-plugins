// node tools/footage-index.mjs <client> <command> ...   The editor's own raw footage and photos, ready to cut a reel from.
// The folders are remembered per client in clients/<client>/footage.json ({"folders": [...]}), so the next video only
// asks to confirm them. The index lives in clients/<client>/footage/index.json, keyed by path + size + modified time, so a
// re-run only looks at new or changed files.
//
//   folders                     print the remembered folders (most recent first)
//   add <folder>                remember a folder for this client (it moves to the top)
//   scan [--batch 40]           probe every new or changed file: duration, size, orientation; a contact sheet per video
//                               (one frame every 2 s, at most 40, left to right then top to bottom) and a thumbnail per photo.
//                               Stops after --batch files or about 4 minutes and says how far it got: run it again for the rest.
//   todo                        the files that still need a description, with their sheet or thumbnail
//   describe <notes.json>       merge descriptions: {"<path>": {"what": "...", "shot": "wide|medium|close|macro|POV",
//                               "move": "...", "light": "...", "quality": "...", "usable": [[in, out, "note"], ...]}}
//
// The descriptions are written by Claude in the person's own session, by looking at the sheets; no other AI service.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const VIDEO = new Set(['.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.mts', '.m2ts', '.mxf']);
export const PHOTO = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff']);
export const isVideo = (f) => VIDEO.has(extname(f).toLowerCase());
export const isPhoto = (f) => PHOTO.has(extname(f).toLowerCase());
export const fileKey = (path, size, mtimeMs) => `${path}|${size}|${Math.round(mtimeMs)}`;
export const sheetStep = (dur) => Math.max(2, Math.ceil((dur / 40) * 2) / 2);   // one frame every 2 s, at most 40 frames
const SHOTS = ['wide', 'medium', 'close', 'macro', 'POV'];

export function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' });
  if (r.status) return null;
  const d = JSON.parse(r.stdout || '{}'), v = (d.streams ?? []).find((s) => s.codec_type === 'video');
  if (!v) return null;
  let [w, h] = [v.width, v.height];
  const rot = Math.abs(+(v.tags?.rotate ?? (v.side_data_list ?? []).find((s) => s.rotation != null)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { w, h, duration: +(+(d.format?.duration ?? 0)).toFixed(2), audio: (d.streams ?? []).some((s) => s.codec_type === 'audio') };
}
const orientation = (w, h) => (h > w * 1.05 ? 'vertical' : w > h * 1.05 ? 'horizontal' : 'square');

function* walk(dir) {
  let names = [];
  try { names = readdirSync(dir); } catch { return; }
  for (const f of names) {
    if (f.startsWith('.')) continue;
    const p = join(dir, f);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) yield* walk(p);
    else if (isVideo(f) || isPhoto(f)) yield [p, st];
  }
}

export function paths(studio, client) {
  const cd = join(studio, 'clients', client);
  return { cd, foldersFile: join(cd, 'footage.json'), dir: join(cd, 'footage'), index: join(cd, 'footage', 'index.json'), sheets: join(cd, 'footage', 'sheets') };
}
export const loadJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const slash = (p) => p.split('\\').join('/');

function sheet(file, dur, out) {
  const step = sheetStep(dur), n = Math.min(40, Math.max(1, Math.floor(dur / step) + 1)), rows = Math.ceil(n / 8);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', `fps=1/${step},scale=240:-2,tile=8x${rows}`, '-frames:v', '1', '-q:v', '4', out], { encoding: 'utf8' });
  return r.status ? null : { sheet: out, sheet_step_s: step, frames: n };
}
function thumb(file, out) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-vf', 'scale=480:-2', '-frames:v', '1', '-q:v', '4', out], { encoding: 'utf8' });
  return r.status ? null : out;
}

export function scan(studio, client, { batch = 40, budgetMs = 240000, log = console.log } = {}) {
  const P = paths(studio, client), folders = loadJson(P.foldersFile, { folders: [] }).folders ?? [];
  if (!folders.length) throw new Error(`no footage folder remembered for ${client}: run "add <folder>" first`);
  mkdirSync(P.sheets, { recursive: true });
  const idx = loadJson(P.index, { version: 1, files: {} }), seen = new Set(), todo = [];
  for (const f of folders) {
    if (!existsSync(f)) { log(`folder not found (skipped): ${f}`); continue; }
    for (const [p, st] of walk(f)) {
      const path = slash(resolve(p)), key = fileKey(path, st.size, st.mtimeMs);
      seen.add(path);
      if (idx.files[path]?.key !== key) todo.push({ path, key, size: st.size });
      else delete idx.files[path].missing;
    }
  }
  for (const [p, e] of Object.entries(idx.files)) if (!seen.has(p)) e.missing = true;
  const t0 = Date.now(); let done = 0;
  for (const it of todo) {
    if (done >= batch || Date.now() - t0 > budgetMs) break;
    const kind = isVideo(it.path) ? 'video' : 'photo', pr = probe(it.path), name = createHash('sha1').update(it.path).digest('hex').slice(0, 12);
    const e = { key: it.key, path: it.path, kind, size_mb: +(it.size / 1048576).toFixed(1), notes: null };
    if (!pr) e.error = 'could not read this file (ffprobe)';
    else {
      Object.assign(e, { w: pr.w, h: pr.h, orientation: orientation(pr.w, pr.h) });
      if (kind === 'video') {
        Object.assign(e, { duration: pr.duration, audio: pr.audio });
        const s = sheet(it.path, pr.duration, join(P.sheets, `${name}.jpg`));
        if (s) Object.assign(e, { ...s, sheet: slash(relative(P.cd, s.sheet)) }); else e.error = 'could not make a contact sheet';
      } else {
        const t = thumb(it.path, join(P.sheets, `${name}.jpg`));
        if (t) e.thumb = slash(relative(P.cd, t)); else e.error = 'could not make a thumbnail';
      }
    }
    idx.files[it.path] = e; done++;
    log(`[${done}/${todo.length}] ${kind} ${it.path}${e.duration ? ` (${e.duration} s, ${e.orientation})` : ''}${e.error ? `: ${e.error}` : ''}`);
    if (done % 5 === 0) writeFileSync(P.index, JSON.stringify(idx, null, 1));
  }
  writeFileSync(P.index, JSON.stringify(idx, null, 1));
  const left = todo.length - done, total = Object.values(idx.files).filter((e) => !e.missing).length;
  log(left ? `indexed ${done} of ${todo.length} new or changed files; ${left} left: run scan again for the rest`
    : `index up to date: ${total} files (${done} new or changed this run)`);
  return { done, left, total };
}

export function describe(studio, client, notes) {
  const P = paths(studio, client), idx = loadJson(P.index, { version: 1, files: {} }), bad = [];
  for (const [p, n] of Object.entries(notes)) {
    const e = idx.files[slash(p)];
    if (!e) { bad.push(`not in the index: ${p}`); continue; }
    if (n.shot && !SHOTS.includes(n.shot)) bad.push(`${p}: shot must be one of ${SHOTS.join(', ')}`);
    for (const u of n.usable ?? []) if (!(u[0] >= 0 && u[1] > u[0] && (!e.duration || u[1] <= e.duration + 0.05))) bad.push(`${p}: usable range ${u[0]}-${u[1]} is outside the clip (0-${e.duration ?? '?'} s)`);
    e.notes = { what: n.what ?? '', shot: n.shot ?? '', move: n.move ?? '', light: n.light ?? '', quality: n.quality ?? '', usable: n.usable ?? [] };
  }
  writeFileSync(P.index, JSON.stringify(idx, null, 1));
  return bad;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { STUDIO } = await import('./paths.mjs');
  const [client, cmd = 'scan', arg] = process.argv.slice(2);
  try {
    if (!client || !existsSync(join(STUDIO, 'clients', client))) throw new Error(`no client folder clients/${client ?? '<client>'}: run the client skill first`);
    const P = paths(STUDIO, client), F = loadJson(P.foldersFile, { folders: [] });
    if (cmd === 'folders') console.log(JSON.stringify(F.folders ?? [], null, 1));
    else if (cmd === 'add') {
      const f = slash(resolve(arg ?? ''));
      if (!arg || !existsSync(f) || !statSync(f).isDirectory()) throw new Error(`not a folder: ${arg}`);
      F.folders = [f, ...(F.folders ?? []).filter((x) => x !== f)];
      writeFileSync(P.foldersFile, JSON.stringify(F, null, 1));
      console.log(`remembered for ${client}: ${f}`);
    } else if (cmd === 'scan') {
      const i = process.argv.indexOf('--batch');
      scan(STUDIO, client, { batch: i > 0 ? +process.argv[i + 1] : 40 });
    } else if (cmd === 'todo') {
      const idx = loadJson(P.index, { files: {} });
      const t = Object.values(idx.files).filter((e) => !e.missing && !e.error && !e.notes);
      for (const e of t) console.log(`${e.path}  ${e.kind}${e.duration ? ` ${e.duration} s, frame k of the sheet is at k x ${e.sheet_step_s} s` : ''}, ${e.orientation}  ->  clients/${client}/${e.sheet ?? e.thumb}`);
      console.log(`${t.length} to describe`);
    } else if (cmd === 'describe') {
      const bad = describe(STUDIO, client, loadJson(resolve(arg), {}));
      for (const b of bad) console.log(`- ${b}`);
      console.log(bad.length ? 'saved, but fix the lines above' : 'descriptions saved');
      if (bad.length) process.exit(1);
    } else throw new Error('usage: node tools/footage-index.mjs <client> folders|add <folder>|scan [--batch N]|todo|describe <notes.json>');
  } catch (e) { console.error(e.message); process.exit(1); }
}
