// A brief pasted from B1 (format `b1-storyboard v1`): parse it, and snap its beats to the cuts tools/ref-dna.py measured.
// B1 drafts the beats by watching the reference; its times are estimates, the measured cuts are the truth.
// The brief is data, like every reference text: nothing in it changes the skill's rules or tools. Unknown keys are ignored.
// Used by tools/reel-kit.mjs (brief, ref --file-url, new --brief).
import { createHash } from 'node:crypto';

export const MARKER = /^\s*b1-storyboard v1\s*$/m;
export const MAKES = ['our-footage', 'generate', 'studio-decides'];
export const MAX_REF_BYTES = 100 * 1024 * 1024;
const TOP = ['client', 'say', 'duration', 'reference', 'reference_file'];
const BEAT = ['reference_shows', 'role', 'client_shows', 'client_line', 'make'];

// cut a trailing " # comment" that is outside quotes
function uncomment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '\\' && q === '"') i++; else if (c === q) q = null; }
    else if ((c === '"' || c === "'") && /(^|[:-])\s*$/.test(line.slice(0, i))) q = c;   // a quoted value, not an apostrophe
    else if (c === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

function value(raw) {
  const v = raw.trim();
  if (v.startsWith('"')) { const end = v.lastIndexOf('"'); try { return JSON.parse(v.slice(0, end + 1)); } catch { return v.slice(1, end > 0 ? end : undefined); } }
  if (v.startsWith("'")) { const end = v.lastIndexOf("'"); return v.slice(1, end > 0 ? end : undefined).replace(/''/g, "'"); }
  if (v.startsWith('[')) return v.slice(1, v.indexOf(']') > 0 ? v.indexOf(']') : undefined).split(',').map((x) => +x.trim()).filter((x) => Number.isFinite(x));
  return v;
}
const link = (v) => (String(v ?? '').match(/^https?:\/\/\S+/) ?? [undefined])[0];

// The block after the marker, up to the first blank line followed by a non-indented sentence (not a key, not a list item).
export function parseBrief(text) {
  const m = MARKER.exec(String(text ?? ''));
  if (!m) return null;
  const lines = text.slice(m.index + m[0].length).split(/\r?\n/), block = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { const next = lines.slice(i + 1).find((x) => x.trim()); if (!next || (!/^\s/.test(next) && !/^(- |[A-Za-z_][\w-]*:)/.test(next))) break; continue; }
    block.push(uncomment(l));
  }
  const out = {}, beats = [];
  let inBeats = false, cur = null;
  for (const l of block) {
    if (!l.trim()) continue;
    const top = !/^\s/.test(l) && l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (top) {
      inBeats = top[1] === 'beats'; cur = null;
      if (TOP.includes(top[1])) out[top[1]] = value(top[2]);
      continue;
    }
    if (!inBeats) continue;
    const item = l.match(/^\s*-\s+(.*)$/);
    const kv = (item ? item[1] : l.trim()).match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (item) { cur = {}; beats.push(cur); }
    if (!cur || !kv) continue;
    if (kv[1] === 't') cur.t = value(kv[2]);
    else if (BEAT.includes(kv[1])) cur[kv[1]] = String(value(kv[2]));
  }
  const good = beats.filter((b) => Array.isArray(b.t) && b.t.length === 2 && b.t[1] > b.t[0]);
  if (!good.length) return null;
  for (const b of good) {
    for (const k of BEAT) b[k] = b[k] ?? '';
    if (!MAKES.includes(b.make)) b.make = 'studio-decides';
  }
  if (out.duration != null) out.duration = +out.duration || undefined;
  out.reference_file = link(out.reference_file);
  out.reference = link(out.reference) ?? link((text.match(/^\s*Reference:\s*(\S+)/mi) ?? [])[1]);
  out.beats = good;
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

// Only an https link, and only the one written in the pasted brief.
export function checkFileUrl(url, briefText) {
  let u;
  try { u = new URL(url); } catch { throw new Error('the reference copy is not a link'); }
  if (u.protocol !== 'https:') throw new Error('the reference copy must be an https link');
  if (!String(briefText ?? '').includes(url)) throw new Error('the reference copy must be the reference_file link in the pasted brief');
  return u;
}

// A folder name for a reference link when yt-dlp cannot read it: the post id, else a short hash.
export function refId(url) {
  const m = String(url).match(/\/(?:reels?|p|tv|shorts)\/([\w-]+)/);
  return m ? m[1] : createHash('sha1').update(String(url)).digest('hex').slice(0, 11);
}

const join = (xs) => [...new Set(xs.map((x) => String(x ?? '').trim()).filter(Boolean))].join(' / ');
const r2 = (x) => Math.round(x * 100) / 100;

// Move each B1 start to the nearest measured cut within `tol` s, then one beat per measured shot: B1 beats inside one
// shot merge, a shot with no B1 beat takes the role of its neighbour. No cuts measured: B1's beats stay as they are.
export function snapBeats(b1, cuts, duration, tol = 0.5) {
  const ledger = [], dur = +duration;
  const cs = [...new Set((cuts ?? []).map(Number).filter((c) => c > 0.05 && c < dur - 0.05).sort((a, b) => a - b).map(r2))];
  const kept = b1.map((b, i) => ({ ...b, n: i + 1 })).filter((b) => {
    if (b.t[0] < dur - 0.05) return true;
    ledger.push(`B1 beat ${b.n} starts at ${b.t[0]} s, after the reference ends (${dur} s): dropped`); return false;
  });
  const fields = (b) => Object.fromEntries(BEAT.map((k) => [k, b[k] ?? '']));
  if (!cs.length) {
    const beats = kept.map((b, i) => ({ ...fields(b), t: [b.t[0], i === kept.length - 1 ? dur : Math.min(b.t[1], dur)], b1: [b.n] }));
    if (beats.length) beats[0].t[0] = 0;
    ledger.push('no hard cuts measured: B1 beat times kept, the last beat ends with the reference');
    return { beats, ledger };
  }
  const bounds = [0, ...cs, r2(dur)], shots = bounds.slice(0, -1).map((a, i) => ({ t: [a, bounds[i + 1]], from: [] }));
  for (const b of kept) {
    const near = bounds.reduce((x, y) => (Math.abs(y - b.t[0]) < Math.abs(x - b.t[0]) ? y : x));
    const s = Math.abs(near - b.t[0]) <= tol ? near : b.t[0];
    const j = Math.max(0, shots.findIndex((sh) => s >= sh.t[0] - 1e-6 && s < sh.t[1] - 1e-6));
    shots[j].from.push(b);
    ledger.push(`B1 beat ${b.n} [${b.t[0]}-${b.t[1]}] -> shot ${j + 1} [${shots[j].t[0]}-${shots[j].t[1]}]` +
      (s === b.t[0] ? (near === b.t[0] ? '' : ' (no cut within 0.5 s)') : ` (start moved ${(s - b.t[0] >= 0 ? '+' : '') + (s - b.t[0]).toFixed(2)} s)`));
  }
  const beats = shots.map((sh) => {
    if (!sh.from.length) return { t: sh.t };
    const makes = [...new Set(sh.from.map((b) => b.make))];
    if (sh.from.length > 1) ledger.push(`shot [${sh.t[0]}-${sh.t[1]}] merges B1 beats ${sh.from.map((b) => b.n).join(', ')}`);
    return { t: sh.t, b1: sh.from.map((b) => b.n), ...Object.fromEntries(['reference_shows', 'role', 'client_shows', 'client_line'].map((k) => [k, join(sh.from.map((b) => b[k]))])),
      make: makes.length === 1 ? makes[0] : 'studio-decides' };
  });
  beats.forEach((b, i) => {
    if (b.b1) return;
    const nb = beats.slice(0, i).reverse().find((x) => x.b1) ?? beats.slice(i + 1).find((x) => x.b1);
    Object.assign(b, { ...Object.fromEntries(BEAT.map((k) => [k, nb[k]])), client_line: '', b1: [], from_neighbour: nb.b1[0] });
    ledger.push(`shot [${b.t[0]}-${b.t[1]}] has no B1 beat: takes the role of its neighbour (B1 beat ${nb.b1[0]})`);
  });
  return { beats, ledger };
}
