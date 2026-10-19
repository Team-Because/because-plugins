// node tools/sfx.mjs <cues.json> [--out out/sfx.wav] [--dur 10]
// Synthesizes sound effects on the picture's timeline (course step 09, path 2). 48 kHz, 16-bit mono WAV, seeded noise
// so every render is identical. cues.json: [{"t":0.5,"type":"click"}, {"t":2,"type":"rise","len":0.6,"gain":0.8}, ...]
// or {"beats":"beats.json","on":"downbeats","type":"thump"} entries that expand to one cue per beat.
// Voices: course set (click, pop, thump, whoosh) + the restrained set proven on a product teaser (tick, hit, rise, beep, final).
// Premium briefs: tick, click, thump, hit, rise, final only. No novelty effects.
// Music bed voices (Because life-at-because, 10-10-2026): kick, hat, ohat, clap, bass, pluck, pad. Pitched voices read
// "f" (Hz) from the cue; build the pattern in the page from the timing table so every note sits on the beat grid.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const file = args.find((a) => a.endsWith('.json'));
if (!file) { console.error('usage: node tools/sfx.mjs <cues.json> [--out out/sfx.wav] [--dur 10]'); process.exit(1); }
const base = dirname(resolve(file));
const out = resolve(opt('out', join(base, 'out', 'sfx.wav')));

const cues = [];
for (const c of JSON.parse(readFileSync(file, 'utf8'))) {
  if (c.beats) {                                  // expand a beat list into cues
    const b = JSON.parse(readFileSync(resolve(base, c.beats), 'utf8'));
    for (const t of b[c.on || 'beats']) cues.push({ ...c, t: t + (c.offset || 0) });
  } else cues.push(c);
}
const SR = 48000;
const DUR = +opt('dur', Math.max(...cues.map((c) => c.t + (c.len || 0))) + 2);
const buf = new Float32Array(Math.ceil(DUR * SR));

let s = 42; const noise = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
// [default length s, fn(x seconds into the sound, len)]; filtered voices are factories so each cue starts fresh
const VOICES = {
  click:  [0.05, (x) => Math.sin(2 * Math.PI * 1800 * x) * Math.exp(-x * 90) * 0.5],
  pop:    [0.15, (x) => Math.sin(2 * Math.PI * (600 + 900 * x) * x) * Math.exp(-x * 30) * 0.4],
  thump:  [0.50, (x) => Math.sin(2 * Math.PI * (90 - 60 * x) * x) * Math.exp(-x * 9) * 0.9],
  whoosh: [0.35, (x, len) => noise() * Math.sin(Math.PI * Math.min(1, x / len)) * 0.25],
  tick:   [0.02, () => { let p = 0; return (x) => { const n = noise(), h = n - p; p = n; return h * Math.exp(-x * 250) * 0.32; }; }, true],
  hit:    [0.25, () => { let lp = 0; return (x) => { lp += 0.25 * (noise() - lp); return Math.tanh(lp * 6) * Math.exp(-x * 14) * 0.35; }; }, true],
  rise:   [0.50, () => { let lp = 0; return (x, len) => { const k = x / len; lp += (0.01 + 0.4 * k * k) * (noise() - lp); return lp * 0.75 * k; }; }, true],
  beep:   [0.09, (x, len) => Math.sign(Math.sin(2 * Math.PI * 880 * x)) * 0.07 * Math.min(1, (len - x) * 200)],
  // temple bell (festive film): inharmonic partials, long decay, soft strike
  bell:   [3.00, (x, len, c) => [[1, 1, 1.1], [2.76, 0.5, 1.8], [5.4, 0.28, 3], [8.93, 0.14, 5], [0.5, 0.35, 0.8]]
    .reduce((s, [r, a, d]) => s + a * Math.sin(2 * Math.PI * (c.f || 523) * r * x + 0.4 * Math.sin(2 * Math.PI * 4.2 * x)) * Math.exp(-x * d), 0) * 0.16 * Math.min(1, x * 400)],
  // current through copper (festive film): sparse filtered clicks, density follows a swell over len
  crackle: [1.00, () => { let lp = 0; return (x, len) => { const k = Math.sin(Math.PI * Math.min(1, x / len)); const n = noise();
    lp += 0.5 * (n - lp); return (Math.abs(n) > 1 - 0.05 * k ? Math.sign(n) * 0.55 : 0) * k + lp * 0.05 * k; }; }, true],
  // 50 Hz mains hum with harmonics, fades in and out over len (festive film)
  hum:    [2.00, (x, len) => { const e = Math.sin(Math.PI * Math.min(1, x / len)) ** 1.5;
    return e * (0.5 * Math.sin(2 * Math.PI * 50 * x) + 0.3 * Math.sin(2 * Math.PI * 100 * x) + 0.12 * Math.sin(2 * Math.PI * 150 * x)) * 0.5; }],
  // ---- music bed (life-at-because) ----
  // kick: pitch-dropping sine with a short click, tight decay so 16ths stay clean
  kick:   [0.32, (x) => Math.sin(2 * Math.PI * (48 * x + 110 * (1 - Math.exp(-x * 28)) / 28)) * Math.exp(-x * 11) * 0.8 + Math.sin(2 * Math.PI * 1500 * x) * Math.exp(-x * 400) * 0.12],
  // closed / open hat: high-passed seeded noise
  hat:    [0.05, () => { let p = 0; return (x) => { const n = noise(), h = n - p; p = n; return h * Math.exp(-x * 90) * 0.18; }; }, true],
  ohat:   [0.22, () => { let p = 0; return (x) => { const n = noise(), h = n - p; p = n; return h * Math.exp(-x * 16) * 0.12; }; }, true],
  // clap: three quick noise bursts then a short tail, band-limited
  clap:   [0.20, () => { let lp = 0, p = 0; return (x) => { const n = noise(); lp += 0.45 * (n - lp); const b = lp - p; p = lp;
    const env = x < 0.03 ? Math.exp(-((x % 0.01) * 400)) : Math.exp(-(x - 0.03) * 22); return b * env * 0.55; }; }, true],
  // bass: sine + soft second harmonic, plucked envelope, click-free attack and release
  bass:   [0.24, (x, len, c) => { const f = c.f || 55, e = Math.min(1, x * 300) * Math.exp(-x * 7) * Math.min(1, (len - x) * 60);
    return Math.tanh(1.6 * (Math.sin(2 * Math.PI * f * x) + 0.35 * Math.sin(4 * Math.PI * f * x))) * e * 0.42; }],
  // pluck: Karplus-Strong string, real-sounding and short
  pluck:  [0.45, (c) => { const n = Math.max(2, Math.round(SR / (c.f || 440))), ring = Float32Array.from({ length: n }, () => noise() * 0.5); let i = 0;
    return (x, len) => { const a = ring[i % n], b = ring[(i + 1) % n]; ring[i % n] = 0.497 * (a + b); i++; return a * Math.min(1, (len - x) * 40); }; }, true],
  // pad: detuned sines, slow swell and release, for a held chord
  pad:    [3.00, (x, len, c) => { const f = c.f || 220, e = Math.min(1, x / 0.35) * Math.min(1, (len - x) / 1.2);
    return (Math.sin(2 * Math.PI * f * x) + Math.sin(2 * Math.PI * f * 1.004 * x) + 0.3 * Math.sin(4 * Math.PI * f * 0.998 * x)) * e * 0.08; }],
  final:  [1.40, () => { let lp = 0; return (x) => { lp += 0.05 * (noise() - lp);
    return Math.tanh(2.5 * Math.sin(2 * Math.PI * (75 - 35 * x) * x)) * Math.exp(-x * 6) * 0.75
      + Math.sin(2 * Math.PI * (58 - 20 * x) * x) * Math.exp(-x * 2.6) * 0.5 + lp * Math.exp(-x * 3) * 0.6; }; }, true],
};
for (const c of cues) {
  if (!VOICES[c.type]) { console.error(`unknown sound "${c.type}"; use one of: ${Object.keys(VOICES).join(', ')}`); process.exit(1); }
  const [def, f, isFactory] = VOICES[c.type], fn = isFactory ? f(c) : f, len = c.len || def, gain = c.gain ?? 1, start = Math.floor(c.t * SR);
  for (let i = 0; i < len * SR && start + i < buf.length; i++) buf[start + i] += fn(i / SR, len, c) * gain;
}

const n = buf.length, b = Buffer.alloc(44 + n * 2);   // 16-bit mono WAV
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
b.write('data', 36); b.writeUInt32LE(n * 2, 40);
let clipped = 0;
for (let i = 0; i < n; i++) { if (Math.abs(buf[i]) > 1) clipped++; b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2); }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, b);
console.log(`${cues.length} cues, ${DUR.toFixed(2)} s -> ${out}${clipped ? `  (WARNING: ${clipped} samples clipped, lower some gains)` : ''}`);
