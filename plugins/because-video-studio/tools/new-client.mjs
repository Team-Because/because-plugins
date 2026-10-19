// node tools/new-client.mjs <client-slug> "<Client Name>" [website-url]
// Creates clients/<slug>/ in the standard layout: CLAUDE.md, client.json, brand/, products/, refs/, videos/, archive/,
// campaigns.md and library.yaml (checked by library/check_index.py).
// With a URL it also runs grab-brand into clients/<slug>/brand/.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [slug, name, url] = process.argv.slice(2);
if (!slug || !name || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('usage: node tools/new-client.mjs <client-slug (a-z, 0-9, -)> "<Client Name>" [website-url]');
  process.exit(1);
}
const dir = join(root, 'clients', slug);
if (existsSync(dir)) { console.error(`clients/${slug} already exists`); process.exit(1); }

for (const d of ['brand', 'products', 'refs', 'videos', 'archive']) mkdirSync(join(dir, d), { recursive: true });
const today = new Date().toLocaleDateString('en-GB').replaceAll('/', '-');
writeFileSync(join(dir, 'client.json'), JSON.stringify({ slug, name, website: url || null, created: today }, null, 2) + '\n');
writeFileSync(join(dir, 'CLAUDE.md'), `# ${name} · client rules

Loaded on top of the studio rules in motion-studio/CLAUDE.md. One Claude Code session per client, started in this folder.
Website: ${url || '[add]'}  ·  Brand kit: brand/brand.json + brand/assets/  ·  Created ${today}

## Brand (fill in before the first video)
- Positioning: [one line on what they stand for]
- Audience: [who the videos are for]
- Tone of voice: [3 to 5 words]
- Say: [words and phrases to use]
- Never say: [words, claims or comparisons to avoid]
- Colours and fonts: take them from brand/brand.json unless listed here.

## Rules for this client
- Real product UI and real assets only (brand/assets/). Never redraw screens or invent logos.
- Client references live in refs/. Take their grammar, never their content.
- Products (a property, model or product line): products/<product>/ with assets/ and facts.md (claim, source, disclaimer).
- Each video gets its own folder: node ../../tools/new-video.mjs ${slug} <campaign>-<video> (rows land in campaigns.md).
`);
writeFileSync(join(dir, 'campaigns.md'), `# ${name} · campaigns and videos

One row per video. Folder: videos/<campaign>-<video> (archive/ for rejected or superseded ones). Status: brief, pitch, build, review, production (went live or delivered and used), not produced (with reason), archived.

| Campaign | Product | Video folder | Length · formats | Status | Final files |
|---|---|---|---|---|---|
`);
writeFileSync(join(dir, 'library.yaml'), `# ${name} · client library (scope: client). Only ${name} videos may use these. Paths relative to clients/${slug}/.
# Filled at close-out of each approved video (see the /motion skill, step 7). Checked by library/check_index.py.
brand: []
products: []
plates: []
films: []
`);
console.log(`created clients/${slug}/`);

if (url) {
  const r = spawnSync('node', [join(root, 'tools', 'grab-brand.mjs'), url, slug], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) console.error('grab-brand failed; run it again later: node tools/grab-brand.mjs <url> ' + slug);
}
