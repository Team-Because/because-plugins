// The plugin is for every Team Because client, so nothing inside it may name one client: not code, not prompts, not
// examples, not comments. Names come from tests/client-names.yaml (copied from B1's docs/team-because-clients.yaml plus
// the studio's client folders). That list lives outside the plugin folder so it is never shipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const PLUGIN = join(ROOT, 'plugins', 'because-video-studio');
const EXT = new Set(['.js', '.mjs', '.py', '.md', '.html', '.json', '.yaml', '.yml', '.txt', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'lottie', 'fonts', 'icons', 'logos', 'previews', '.venv']);

function terms() {
  const list = readFileSync(join(import.meta.dirname, 'client-names.yaml'), 'utf8');
  const names = [];
  for (const m of list.matchAll(/\bname: ("[^"]+"|[^,}\n]+)/g)) names.push(m[1].replace(/^"|"$/g, '').trim());
  for (const m of list.matchAll(/\baka: \[([^\]]+)\]/g)) names.push(...m[1].split(',').map((x) => x.trim().replace(/^"|"$/g, '')));
  // a full name counts anywhere; a single word only when it is not ordinary English, so "words" or "venus" in normal
  // text does not fail, but "shridhar" or "avore" does
  const dictPath = '/usr/share/dict/words';
  const dict = new Set(existsSync(dictPath) ? readFileSync(dictPath, 'utf8').toLowerCase().split('\n') : []);
  const common = new Set(['group', 'school', 'team', 'india', 'real', 'estate', 'brand', 'motion', 'studio', 'kids', 'tech',
    'electric', 'international', 'academy', 'kitchen', 'hospital', 'developers', 'educators', 'realty', 'garba', 'smile', 'venus']);
  const inDict = (w) => [w, w.replace(/es$/, ''), w.replace(/s$/, ''), w.replace(/d$/, ''), w.replace(/ed$/, ''), w.replace(/ing$/, ''), w.replace(/ing$/, 'e')].some((x) => dict.has(x));
  const out = new Set();
  for (const n of names) {
    if (/because/i.test(n)) continue;                          // the agency itself, not a client
    const ws = n.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (ws.length > 1) out.add(ws.join('[^a-z0-9]+'));
    for (const w of ws) if (w.length >= 3 && !common.has(w) && !inDict(w)) out.add(w);
  }
  return [...out];
}

function* files(dir) {
  for (const f of readdirSync(dir)) {
    if (SKIP_DIRS.has(f) || f.startsWith('.') && f !== '.claude-plugin') continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (EXT.has(extname(f))) yield p;
  }
}

test('no client names anywhere in the plugin', () => {
  const re = new RegExp(`(?<![a-z0-9])(${terms().join('|')})(?![a-z0-9])`, 'i');
  const hits = [];
  for (const f of files(PLUGIN)) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      const m = line.match(re);
      if (m) hits.push(`${relative(ROOT, f)}:${i + 1}: "${m[0]}"`);
    });
  }
  assert.deepEqual(hits, [], `client names found:\n${hits.join('\n')}`);
});
