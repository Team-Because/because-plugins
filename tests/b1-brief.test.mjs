// A reel from a B1 brief and the editor's own footage: the brief parser, snapping B1's beats to the measured cuts, the
// reference-copy link rules, the footage index keys and the `footage:` source in the concept-map check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const TOOLS = join(import.meta.dirname, '..', 'plugins', 'because-video-studio', 'tools');
const B = await import(pathToFileURL(join(TOOLS, 'b1-brief.mjs')).href);
const F = await import(pathToFileURL(join(TOOLS, 'footage-index.mjs')).href);

const BRIEF = `Make a reel like this one for Sample Client.

Reference: https://www.instagram.com/reel/ABC123/ (@account)
Why it fits Sample Client: slow ritual.
Our angle: the first hour of the day.

b1-storyboard v1
client: Sample Client
say: "Every day starts here: early."
duration: 33
reference_file: https://storage.example.com/media.mp4?token=x   (B1's copy, valid 7 days)
future_key: ignored
beats:
- t: [0, 6]
  reference_shows: POV hands unbox a roll of film
  role: sets up the ritual
  client_shows: hands unbox a film roll, the building soft behind
  client_line: ""
  make: our-footage            # our-footage | generate | studio-decides
- t: [6, 15]
  reference_shows: the camera is loaded   # a comment
  role: the craft
  client_shows: "close-up: hands at work"
  client_line: "Made by hand"
  make: generate
- t: [15, 33]
  reference_shows: the first photo
  role: the payoff
  client_shows: the end card
  make: studio-decides

Keep the reference's grammar (structure, timing, the trick, the pacing), not its content.
`;

test('the brief parser reads the block, ignores unknown keys and comments', () => {
  const b = B.parseBrief(BRIEF);
  assert.equal(b.client, 'Sample Client');
  assert.equal(b.say, 'Every day starts here: early.');
  assert.equal(b.duration, 33);
  assert.equal(b.reference, 'https://www.instagram.com/reel/ABC123/');
  assert.equal(b.reference_file, 'https://storage.example.com/media.mp4?token=x');
  assert.equal(b.future_key, undefined);
  assert.equal(b.beats.length, 3);
  assert.deepEqual(b.beats[0].t, [0, 6]);
  assert.equal(b.beats[0].make, 'our-footage');
  assert.equal(b.beats[0].client_line, '');
  assert.equal(b.beats[1].reference_shows, 'the camera is loaded');
  assert.equal(b.beats[1].client_shows, 'close-up: hands at work');
  assert.equal(b.beats[1].make, 'generate');
  assert.equal(b.beats[2].client_line, '');
});

test('no marker or no beats: not a B1 brief, the normal path runs', () => {
  assert.equal(B.parseBrief('make something like https://www.instagram.com/reel/X/'), null);
  assert.equal(B.parseBrief('b1-storyboard v1\nclient: X\nsay: hi\n\nThe end.'), null);
});

test('an unknown make value becomes studio-decides', () => {
  const b = B.parseBrief('b1-storyboard v1\nclient: X\nbeats:\n- t: [0, 4]\n  role: r\n  make: anything\n');
  assert.equal(b.beats[0].make, 'studio-decides');
});

test('B1 beat starts snap to a measured cut within 0.5 s', () => {
  const beats = [{ t: [0, 6], role: 'a' }, { t: [6, 15], role: 'b' }, { t: [15, 33], role: 'c' }];
  const { beats: out } = B.snapBeats(beats, [5.7, 15.3], 32.4);
  assert.deepEqual(out.map((x) => x.t), [[0, 5.7], [5.7, 15.3], [15.3, 32.4]]);
  assert.deepEqual(out.map((x) => x.role), ['a', 'b', 'c']);
});

test('two B1 beats inside one measured shot merge', () => {
  const beats = [{ t: [0, 3], role: 'a', client_line: 'one' }, { t: [3, 8], role: 'b', client_line: 'two' }, { t: [8, 12], role: 'c' }];
  const { beats: out } = B.snapBeats(beats, [8.1], 12);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].t, [0, 8.1]);
  assert.equal(out[0].role, 'a / b');
  assert.equal(out[0].client_line, 'one / two');
  assert.deepEqual(out[0].b1, [1, 2]);
});

test('a measured shot with no B1 beat takes the role of its neighbour', () => {
  const beats = [{ t: [0, 6], role: 'a' }, { t: [6, 12], role: 'b' }];
  const { beats: out, ledger } = B.snapBeats(beats, [3, 6.2], 12);
  assert.deepEqual(out.map((x) => x.t), [[0, 3], [3, 6.2], [6.2, 12]]);
  assert.equal(out[1].role, 'a');
  assert.equal(out[1].from_neighbour, 1);
  assert.match(ledger.join('\n'), /neighbour/);
});

test('no measured cuts: B1 beats are kept and the last one ends with the reference', () => {
  const beats = [{ t: [0, 6], role: 'a' }, { t: [6, 15], role: 'b' }, { t: [15, 40], role: 'c' }];
  const { beats: out } = B.snapBeats(beats, [], 30);
  assert.deepEqual(out.map((x) => x.t), [[0, 6], [6, 15], [15, 30]]);
});

test('the reference copy is only an https link that is in the brief', () => {
  const b = B.parseBrief(BRIEF);
  assert.doesNotThrow(() => B.checkFileUrl(b.reference_file, BRIEF));
  assert.throws(() => B.checkFileUrl('http://storage.example.com/media.mp4', 'http://storage.example.com/media.mp4'), /https/);
  assert.throws(() => B.checkFileUrl('https://elsewhere.example.com/x.mp4', BRIEF), /brief/);
  assert.equal(B.MAX_REF_BYTES, 100 * 1024 * 1024);
});

test('footage index keys change with size or time, and sheets hold at most 40 frames', () => {
  const k = F.fileKey('D:/Shoot/a.mp4', 100, 1700000000000);
  assert.notEqual(k, F.fileKey('D:/Shoot/a.mp4', 101, 1700000000000));
  assert.notEqual(k, F.fileKey('D:/Shoot/a.mp4', 100, 1700000000001));
  assert.equal(F.sheetStep(30), 2);
  assert.equal(F.sheetStep(200), 5);
  assert.ok(F.isVideo('x.MOV') && F.isPhoto('y.jpeg') && !F.isVideo('z.txt'));
});

const py = process.platform === 'win32' ? 'python' : 'python3';
const hasYaml = spawnSync(py, ['-c', 'import yaml'], { encoding: 'utf8' }).status === 0;

test('concept-check accepts a footage source whose range fits, and refuses a bad one', { skip: !hasYaml && 'python yaml not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cc-')), vd = join(dir, 'clients', 'x', 'videos', 'v'), docs = join(vd, 'docs');
  mkdirSync(docs, { recursive: true });
  const photo = join(dir, 'still.jpg'); writeFileSync(photo, 'x');
  const map = (src) => `beats:\n  - t: [0, 4]\n    reference_shows: a\n    role: r\n    client_shows: b\n    source: "${src}"\n`;
  const check = (src) => { writeFileSync(join(docs, 'concept-map.yaml'), map(src.split('\\').join('/')));
    return spawnSync(py, [join(TOOLS, 'concept-check.py'), join(docs, 'concept-map.yaml')], { encoding: 'utf8' }); };
  let r = check(`footage: ${photo}@0-4`);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = check(`footage: ${join(dir, 'missing.mp4')}@0-4`);
  assert.equal(r.status, 1); assert.match(r.stdout, /footage not found/);
  r = check(`footage: ${photo}@5-2`);
  assert.equal(r.status, 1); assert.match(r.stdout, /range/);
  r = check('gap: a wide shot of the building at dawn, 5 s');
  assert.equal(r.status, 1); assert.match(r.stdout, /gap/);
});

test('the storyboard page is visual: both cuts play in sync, takes move, words sit on the take, a gap is a shoot-this frame', async () => {
  const { storyboardHtml } = await import(pathToFileURL(join(TOOLS, 'storyboard-page.mjs')).href);
  const html = storyboardHtml({ title: 'v1', fmt: '9x16', refCut: 'ref/cut.mp4', ourCut: 'take/cut.mp4', beats: [
    { t: [0, 4.8], kind: 'footage', line: 'Made <by> hand', label: 'A001.mp4 3.0–7.8 s', refImg: 'ref/01.jpg', refClip: 'ref/01.mp4', takeImg: 'take/01.jpg', takeClip: 'take/01.mp4', role: 'sets up' },
    { t: [4.8, 9.6], kind: 'gap', shoot: 'a wide shot of the building at dawn, 5 s', refImg: 'ref/02.jpg', refClip: 'ref/02.mp4' },
    { t: [9.6, 12], kind: 'code', refImg: 'ref/03.jpg' }] });
  assert.match(html, /id="ref" src="ref\/cut\.mp4"/);
  assert.match(html, /id="ours" src="take\/cut\.mp4"/);
  assert.match(html, /Play both/);
  assert.match(html, /<video src="take\/01\.mp4" poster="take\/01\.jpg" muted loop autoplay playsinline/);
  assert.match(html, /<p class="words">Made &lt;by&gt; hand<\/p>/);
  assert.match(html, /class="ph gap">[\s\S]*Shoot this[\s\S]*a wide shot of the building at dawn, 5 s/);
  assert.match(html, /1 gap to shoot/);
  assert.match(html, /aspect-ratio:9\/16/);
  assert.match(html, /<details><summary>Details/, 'the long notes stay folded');
  assert.match(html, /prefers-color-scheme:dark/);
});
