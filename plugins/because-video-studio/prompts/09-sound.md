# Step 09 · Sound (score it to the beat)

Source: @0xMovez course, step 09 (https://x.com/0xMovez/article/2104216919033192746).
Sound is where "AI video" starts feeling like a film. @oozn's Steve Jobs film synthesized its soundtrack in Node with
every cut locked to 120 BPM; Vox's "small print" synthesized music in Python, then polished the render second by
second against it. Two paths: if you supply a track, measure it. If you don't, synthesize on the same timeline as the picture.

## The tools
| Path | Command | Writes |
|---|---|---|
| Supplied track: measure it | `.venv/bin/python tools/beats.py <song> --out <video>/docs` | beats.json (bpm, beats, downbeats, hits, phase, kickRatio) |
| No track: a grid | `node tools/beatgrid.mjs --bpm 120 --bars 8 --out <video>/docs` | beats.json (same shape, source "grid") |
| SFX on the picture's timeline | `node tools/sfx.mjs <video>/docs/cues.json --dur 10` | out/sfx.wav (48 kHz, seeded, identical every run) |
| Sound under the picture | `node tools/mux.mjs <video>/out/silent.mp4 --sfx out/sfx.wav [--music song.mp3]` | out/final.mp4 at -14 LUFS, true peak under -1 dB |

beats.json drives three things: state changes on `beats`, big moments on `downbeats`, SFX on `hits`.

cues.json:
```json
[
  {"t": 0.0, "type": "rise", "len": 0.5},
  {"t": 0.5, "type": "hit"},
  {"beats": "beats.json", "on": "downbeats", "type": "thump", "gain": 0.8},
  {"t": 9.4, "type": "final"}
]
```
Voices: `click pop thump whoosh` (course) and `tick hit rise beep final` (from a product teaser). Premium brief: tick, click,
thump, hit, rise, final only, no novelty effects.

## The prompt (paste after the stills are approved)
```
Score this video to the beat.
[Track supplied: measure it with tools/beats.py into docs/beats.json and tell me the BPM, the phase and the kick ratio.]
[No track: use docs/beats.json from tools/beatgrid.mjs.]
1. Move every cut and state change onto a beat, every big moment onto a downbeat. List any that moved more than 0.1 s.
2. Write docs/cues.json: one sound per on-screen event, on its exact frame. Restrained register (tick, click, thump,
   hit, rise, final), no melody unless I ask.
3. node tools/sfx.mjs docs/cues.json, then tools/render.mjs, then tools/mux.mjs. Report loudness and true peak.
```

## The course original (verbatim)
```python
# python beats.py song.wav > beats.json (the animation reads this file)
import sys, json, numpy as np, librosa

y, sr = librosa.load(sys.argv[1], sr=None, mono=True)
tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
beats = librosa.frames_to_time(frames, sr=sr).round(3).tolist()

onset = librosa.onset.onset_strength(y=y, sr=sr)
peaks = librosa.util.peak_pick(onset, pre_max=3, post_max=3, pre_avg=3,
                               post_avg=5, delta=0.5, wait=10)
json.dump({
    "bpm": float(np.atleast_1d(tempo)[0]),
    "beats": beats,                                   # state changes go here
    "downbeats": beats[::4],                          # big moments go here
    "hits": librosa.frames_to_time(peaks, sr=sr).round(3).tolist(),  # SFX go here
}, sys.stdout, indent=1)
```
```js
// node sfx.mjs cues.json out/sfx.wav     cues: [{"t":0.5,"type":"click"}, ...]
import { readFileSync, writeFileSync } from 'node:fs';
const SR = 48000, cues = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const buf = new Float32Array(Math.ceil((Math.max(...cues.map(c => c.t)) + 2) * SR));

let s = 42; const noise = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
const VOICES = {
  click:  [0.05, t => Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 90) * 0.5],
  pop:    [0.15, t => Math.sin(2 * Math.PI * (600 + 900 * t) * t) * Math.exp(-t * 30) * 0.4],
  thump:  [0.50, t => Math.sin(2 * Math.PI * (90 - 60 * t) * t) * Math.exp(-t * 9) * 0.9],
  whoosh: [0.35, t => noise() * Math.sin(Math.PI * Math.min(1, t / 0.35)) * 0.25],
};
for (const c of cues) {
  const [len, fn] = VOICES[c.type], start = Math.floor(c.t * SR);
  for (let i = 0; i < len * SR && start + i < buf.length; i++) buf[start + i] += fn(i / SR);
}

const n = buf.length, b = Buffer.alloc(44 + n * 2);                // 16-bit mono WAV
b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8);
b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
b.write('data', 36); b.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i])) * 32767), 44 + i * 2);
writeFileSync(process.argv[3], b);
```

## What we changed and why (each found by a test with a known answer)
| Course | Ours | Why |
|---|---|---|
| beat_track as is | + a phase check on the kick (low end under 200 Hz) | On a track with a hi-hat between kicks (97 BPM test), the course script found the tempo (96.98) but every beat sat 300 ms late, exactly half a beat. Cuts would land off the beat. With the check, 4 test tracks land within 26 ms (under one frame at 30 fps), and tracks without hi-hats are not shifted |
| prints JSON to stdout | writes beats.json with source, duration, phase, kickRatio | Same shape as beatgrid.mjs; kickRatio near 1 means "check by ear" |
| 4 voices, fixed lengths | 9 voices, `len` and `gain` per cue, beat-list expansion | a product teaser's restrained set; cues on every downbeat in one line |
| clipping silent | warns with the clipped sample count | Stacked thumps clipped 300 samples in the test |
| no mux, no loudness | tools/mux.mjs: gain, oversampled limiter at -2 dB, re-measure, check the final AAC | Plain loudnorm stopped at -16.5 LUFS on sparse SFX; a plain limiter left true peak at +0.4 dB. Now -14.3 to -14.5 LUFS, peak -1.7 to -1.9 dB on 4 mixes |
| | timing checked through AAC | Cues land within 1 ms of their sfx.wav position after muxing |
