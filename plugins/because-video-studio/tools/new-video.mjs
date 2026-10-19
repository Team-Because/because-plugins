// node tools/new-video.mjs <client-slug> <video-slug>
// Creates clients/<client>/videos/<video>/ with a brief to fill in, index.html + motion.js + blocks.js (the seek(t) engine starter, its springs and the shared blocks), docs/ (templates copied in, ledger.md among them) and out/ (renders, gitignored).
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [client, video] = process.argv.slice(2);
const ok = (s) => s && /^[a-z0-9-]+$/.test(s);
if (!ok(client) || !ok(video)) {
  console.error('usage: node tools/new-video.mjs <client-slug> <video-slug>   (a-z, 0-9, -)');
  process.exit(1);
}
const clientDir = join(root, 'clients', client);
if (!existsSync(clientDir)) { console.error(`no client clients/${client}; run tools/new-client.mjs first`); process.exit(1); }
const dir = join(clientDir, 'videos', video);
if (existsSync(dir)) { console.error(`clients/${client}/videos/${video} already exists`); process.exit(1); }

for (const d of ['docs', 'out']) mkdirSync(join(dir, d), { recursive: true });
// Start every video with the shared doc templates (style guide, shot list, ...)
for (const t of readdirSync(join(root, 'templates')).filter((f) => f.endsWith('.md'))) copyFileSync(join(root, 'templates', t), join(dir, 'docs', t));
// Start every video's code from the step 07 engine starter (seek(t), window.ready, springs, seeded noise)
for (const f of ['index.html', 'motion.js', 'blocks.js']) copyFileSync(join(root, 'templates', 'engine', f), join(dir, f));
const today = new Date().toLocaleDateString('en-GB').replaceAll('/', '-');
writeFileSync(join(dir, 'brief.md'), `# ${video} · brief

Client: ${client}  ·  Created ${today}  ·  Status: draft

## The video in one line
[What the viewer should feel or do at the end]

## Recipe and medium
- Recipe: [recipes/<name>.md, or "none"]
- Medium: [motion graphics in code (default for "motion video") / mixed: Higgsfield shots + code / live action only if the person says film or ad]

## Format
- Duration: [seconds]
- Formats: [9:16 / 1:1 / 16:9], first one is the master
- Where it runs: [Instagram reel, LinkedIn, website hero, ad]

## Content
- Hook (first 2 s): [the single most striking image or line]
- Key messages, one per beat: [1 to 5]
- One number that proves it: [metric]
- CTA: [what the viewer should do]

## Inputs
- Brand kit: ../../brand/  ·  References: ../../refs/ (name the files to use)
- Music: [file in this folder, or "synthesize"]

## Approvals
- Concept picked by: [name, DD-MM-YYYY] (the pitch gate)
- Shot list approved by: [only for films over 30 s]
- Final approved by: [name, DD-MM-YYYY]
`);
// Register the video in the client's campaign list (campaign = the part of the slug before the first '-')
const camp = join(clientDir, 'campaigns.md');
if (existsSync(camp)) appendFileSync(camp, `| ${video.split('-')[0]} | [product] | videos/${video} | [length · formats] | brief (${today}) | - |\n`);
console.log(`created clients/${client}/videos/${video}/  (fill in brief.md; docs/ has the templates; index.html is the engine starter)`);
