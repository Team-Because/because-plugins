// Studio media (images, video, audio, fonts) lives in a private Supabase Storage bucket, not in git
// (Aman, 13-10-2026, after Meet's review of PR #28: 53 MB in git history is permanent). Git keeps
// media.lock.json: each file's studio path, sha256 and size. Objects are stored by content hash, so
// the same file is uploaded once and a path can be re-pointed without re-uploading.
//
//   node --env-file=../.env tools/media.mjs status                 what is missing, changed or untracked here
//   node --env-file=../.env tools/media.mjs pull [prefix ...]      fetch missing or changed files (all, or under prefixes)
//   node --env-file=../.env tools/media.mjs push <file|dir> ...    upload media and record it in media.lock.json
//
// Staging only for now (STAGING_VITE_SUPABASE_URL + STAGING_SUPABASE_SECRET_KEY), like the B1 worker.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const STUDIO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK = join(STUDIO, 'media.lock.json');
export const BUCKET = 'studio-assets';
export const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.webm', '.wav', '.mp3', '.m4a', '.ttf', '.otf', '.woff', '.woff2', '.ico']);
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

const posix = (p) => p.split(sep).join('/');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const key = (hash) => `sha256/${hash.slice(0, 2)}/${hash}`;

let client;
function db() {
  if (client) return client;
  const url = (process.env.STAGING_VITE_SUPABASE_URL ?? '').trim(), k = (process.env.STAGING_SUPABASE_SECRET_KEY ?? '').trim();
  if (!url || !k) throw new Error('STAGING_VITE_SUPABASE_URL and STAGING_SUPABASE_SECRET_KEY must be set (run with node --env-file=../.env from motion-studio/).');
  return (client = createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export function readLock() {
  return existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : { bucket: BUCKET, files: {} };
}
function writeLock(lock) {
  const files = Object.fromEntries(Object.keys(lock.files).sort().map((p) => [p, lock.files[p]]));
  writeFileSync(LOCK, JSON.stringify({ bucket: BUCKET, note: 'Studio media in Supabase Storage. node tools/media.mjs pull', files }, null, 1) + '\n');
}

// Download every file under the prefixes that is missing here or differs from the lock. Returns counts.
export async function pull(prefixes = [], { quiet = false } = {}) {
  const lock = readLock();
  const want = Object.entries(lock.files).filter(([p]) => !prefixes.length || prefixes.some((x) => p.startsWith(x)));
  let fetched = 0, ok = 0;
  for (const [p, f] of want) {
    const abs = join(STUDIO, p);
    if (existsSync(abs) && statSync(abs).size === f.size && sha(readFileSync(abs)) === f.sha256) { ok++; continue; }
    const { data, error } = await db().storage.from(BUCKET).download(key(f.sha256));
    if (error) throw new Error(`pull ${p}: ${error.message}`);
    const buf = Buffer.from(await data.arrayBuffer());
    if (sha(buf) !== f.sha256) throw new Error(`pull ${p}: the stored file does not match its hash`);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
    fetched++;
    if (!quiet) console.log(`pulled ${p}`);
  }
  return { fetched, ok, total: want.length };
}

// Upload files (or every media file under directories) and record them.
export async function push(targets) {
  const lock = readLock();
  const files = targets.flatMap((t) => {
    const abs = resolve(t);
    if (!existsSync(abs)) throw new Error(`not found: ${t}`);
    const walk = (d) => readdirSync(d).flatMap((n) => { const q = join(d, n); return statSync(q).isDirectory() ? walk(q) : [q]; });
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  }).filter((f) => MEDIA.has(extname(f).toLowerCase()));
  let uploaded = 0;
  for (const abs of files) {
    const rel = posix(relative(STUDIO, abs));
    if (rel.startsWith('..')) throw new Error(`outside motion-studio: ${abs}`);
    const buf = readFileSync(abs), hash = sha(buf);
    if (lock.files[rel]?.sha256 === hash) continue;
    const { error } = await db().storage.from(BUCKET).upload(key(hash), buf, { contentType: TYPES[extname(abs).toLowerCase()], upsert: false });
    if (error && !/exists|Duplicate/i.test(error.message)) throw new Error(`push ${rel}: ${error.message}`);
    lock.files[rel] = { sha256: hash, size: buf.length };
    uploaded++;
    console.log(`pushed ${rel} (${(buf.length / 1048576).toFixed(2)} MB)`);
  }
  writeLock(lock);
  return { uploaded, considered: files.length };
}

function status() {
  const lock = readLock();
  let missing = 0, changed = 0;
  for (const [p, f] of Object.entries(lock.files)) {
    const abs = join(STUDIO, p);
    if (!existsSync(abs)) missing++;
    else if (statSync(abs).size !== f.size || sha(readFileSync(abs)) !== f.sha256) { changed++; console.log(`changed here: ${p}`); }
  }
  console.log(`${Object.keys(lock.files).length} files in media.lock.json: ${missing} not pulled here, ${changed} changed here (push them to record the change).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'pull') { const r = await pull(args); console.log(`pulled ${r.fetched}, already here ${r.ok}, of ${r.total}`); }
  else if (cmd === 'push') { const r = await push(args); console.log(`uploaded ${r.uploaded} of ${r.considered} media files; media.lock.json updated`); }
  else if (cmd === 'status') status();
  else { console.error('usage: node tools/media.mjs status | pull [prefix ...] | push <file|dir> ...'); process.exit(1); }
}
