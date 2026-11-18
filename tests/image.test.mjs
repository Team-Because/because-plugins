// The image tool (tools/image.mjs): the Codex request, saving the options, plain-words failures, and the finish page.
// Codex itself is replaced by a stand-in, so this runs without a ChatGPT login; the real run is checked by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const TOOL = join(import.meta.dirname, '..', 'plugins', 'because-video-studio', 'tools', 'image.mjs');
const I = await import(pathToFileURL(TOOL).href);
const unix = process.platform !== 'win32';

function fakeCodex(dir, behaviour) {
  const f = join(dir, 'fake-codex');
  writeFileSync(f, `#!/usr/bin/env node
const a = process.argv.slice(2), dir = a[a.indexOf('-C') + 1], prompt = a.at(-1);
require('fs').writeFileSync(require('path').join(dir, 'prompt-seen.txt'), prompt);
${behaviour}
`);
  chmodSync(f, 0o755);
  return f;
}
const make = (codex, out, extra = []) => spawnSync(process.execPath, [TOOL, 'make', '--out', out, '--size', '4x5', '--n', '2', '--prompt', 'a sunlit classroom', ...extra],
  { env: { ...process.env, CODEX: codex }, encoding: 'utf8' });

test('the Codex request asks for the right shape and leaves words and logos out', () => {
  const p = I.codexPrompt('a sunlit classroom', '4x5', 'option-1.png');
  assert.match(p, /image generation tool/);
  assert.match(p, /4:5/);
  assert.match(p, /Leave out all text, letters, numbers, watermarks and logos/);
  assert.match(p, /option-1\.png/);
});

test('make saves one picture per option', { skip: !unix && 'the stand-in is a Unix script' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-')), out = join(dir, 'out');
  const codex = fakeCodex(dir, `const file = prompt.match(/as (\\S+\\.png)/)[1];
require('fs').writeFileSync(require('path').join(dir, file), Buffer.alloc(4096, 1));`);
  const r = make(codex, out);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(existsSync(join(out, 'option-1.png')) && existsSync(join(out, 'option-2.png')));
  assert.match(readFileSync(join(out, 'prompt-seen.txt'), 'utf8'), /sunlit classroom/);
});

test('a Codex that is not signed in gives a plain next step, not a stack trace', { skip: !unix && 'the stand-in is a Unix script' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-'));
  const r = make(fakeCodex(dir, `console.error('Not logged in. Please run codex login'); process.exit(1);`), join(dir, 'out'));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /not signed in: run `codex login`/);
});

test('the finish page is the exact size, with the real logo and escaped words', () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-')), pic = join(dir, 'p.png'), logo = join(dir, 'logo.png');
  writeFileSync(pic, Buffer.alloc(10)); writeFileSync(logo, Buffer.alloc(10));
  const html = I.finishHtml({ picture: pic, size: '9x16', logo, corner: 'tl', headline: 'Fees <b>& more</b>', color: '#013CB2' });
  assert.match(html, /width:1080px;height:1920px/);
  assert.match(html, /<img class="logo" src="data:image\/png;base64,/);
  assert.match(html, /Fees &lt;b&gt;&amp; more&lt;\/b&gt;/);
  assert.match(html, /top:\d+px;left:\d+px/);
  assert.deepEqual(I.SIZES['16x9'], [1920, 1080]);
});
