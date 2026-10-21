# Method: the full pipeline with commands

Every command runs from the video folder, `clients/<client>/videos/<name>/` inside the studio. `PY` is the studio
python (`../../../../.venv/bin/python` on Mac, `..\..\..\..\.venv\Scripts\python.exe` on Windows); it has numpy,
opencv, pillow, pretty_midi, pedalboard, soundfile and faster-whisper after `setup.mjs --vox`. `K` is the studio's
`vox/` folder (`../../../../vox`).

## Contents
0. Folder and setup
1. Understand the content
2. Pick the segment
3. Frames, matte and reframe
4. Audio clean-up
5. Beat sheet
6. Build (compose.py)
7. Context cards
8. Score
9. Gates
10. Encode and deliver
11. Learn

---

## 0. Folder and setup

```
<studio>/clients/<client>/videos/<name>/
  docs/   brief.md, beats.md, transcript.json, measurements, sheets
  src/    audio stems, the source copy (if any)
  frames/ masks/   working images (delete frames after delivery, keep masks)
  tools/  per-video helpers
  out/    frames/, audit/, voice48k.wav, score.wav, mix.wav, <name>-vox.mp4
  compose.py  music.py
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --vox    # once per computer: soundfont, FluidSynth, cut-out models, python deps
```

Never write into another build's folder. If other agents render at the same time, keep `POOL = 2`.
Add a `.gitignore` for `frames/ masks*/ matte/ out/frames/ tools/*venv*/ src/` before anyone runs `git add`
(a resemble-enhance venv is 2.1-2.4 GB and contains a nested git clone).

## 1. Understand the content

```bash
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate,sample_rate -show_entries format=duration "$SRC"
$PY $K/audio.py extract "$SRC" src            # src/a48k.wav + src/a16k.wav (add --ss/--t once the segment is known)
$PY $K/transcribe.py src/a16k.wav docs/a16k.json        # faster-whisper large-v3-turbo, word timestamps, Mac and Windows
# non-English: add --language gu (or hi ...); expect it to struggle, see finished-edits.md
```

Contact-sheet the SOURCE (every 2 s) and look before deciding anything: framing, how big the
speaker is, whether they turn away, what is around them (stage, banner, audience, lectern), whether
captions or graphics are burned in. On 14-10-2026 one brief said "audience heads in frame" and the
footage had none; trust the frames over the brief.

Write `docs/brief.md` before any code:

```
# <name>: Vox paper-collage reel (DD-MM-YYYY)
**Benchmark and route:** Vox (motion), Apple brand films (music). Route: vox-reel skill.
**Source:** file, WxH, fps, duration, what the camera sees.
**Language:** spoken language, caption language, transcript fixes (e.g. "Transferred" = "Transworld").
**What is said:** 3-5 sentences, plain.
**What kind of reel:** keynote rule / testimonial / human story / one-idea explainer ...
**Audience:** who watches it, and who judges this cut.
**The one feeling:** one sentence.
**Music mood:** keynote or warm, and the arc in one line.
**Segment:** kept / cut ranges with the reason for each cut.
**Context:** event or stage? Then context cards (which shots). Seated interview? None.
```

## 2. Pick the segment

1. The hook lands in the first 2 s. If the first 10 s are introductions (name, firm, client count),
   start on the first claim and move the credentials onto paper tags in the first 2-3 s.
2. End on a complete thought, plus ~0.8 s of room tone so the last chord can land.
3. Cut a repeated example when it pushes the payoff late (tba-clip4 cut an 11.5 s third example;
   the payoff moved from 41 s to 30 s).
4. Cut dead air (below about -43 dB for over 1 s). Put every cut ON a ground change, so the jump
   reads as a new beat, not a glitch.
5. 30-60 s is the range all six builds landed in.

For multi-range edits, build the audio with ffmpeg `atrim`/`concat` and the frames from the same
ranges, so picture and sound share one timeline. Keep a table of output time vs source time in
beats.md.

## 3. Frames, matte and reframe

```bash
ffmpeg -v error -ss $SS -t $DUR -i "$SRC" -q:v 2 frames/%04d.jpg     # JPEG keeps a 40 s build under 1 GB
$PY $K/personmask.py frames masks          # Apple Vision on a Mac, BiRefNet on Windows (--engine to force one); background
```

Then check a full-resolution crop of the mask on the face and on the edges (gates.py crop). Pick the
fixes the footage needs, no more:

| Problem seen | Fix |
|---|---|
| Audience heads or a second person in the mask | `keep_largest()`, and zero all rows below the audience line (`m[cut:] = 0`) |
| Speaker small in a wide shot, or turns their back (Vision drops them) | `matte.py track`, `crops` (2x upscaled 640 px crops around the smoothed head), personmask on crops, `matte.py clean`. tba-clip2 went from missing frames to 992/992 |
| Lectern flowers, petals, garlands stuck to the silhouette | `strip_rim_colour()` (saturated non-skin colour on the matte rim only, never inside the face) |
| Static camera, Vision leaks onto the backdrop or goes soft on one side | `matte.py plate` (median plate + shake-tolerant difference key, kept near the Vision person) |
| Holes in ear, hand, glasses | `fill_holes()` (enclosed, under 6000 px) |
| A lectern or desk hides the lower body anyway | torn bust cut (`bust_cut`) above it, plus a paper ledge or desk prop as the anchor |
| An editor's old white sticker edge around the person (finished edits) | erode the matte ~10 px, inpaint enclosed holes from the face, then draw your own edge |

**Reframe 16:9 to 9:16:** the canvas is 1080x1920. The speaker is scaled so the head sits at a
fixed canvas row (`HEAD_SRC -> HEAD_DST`, head top around y 650-800), and centred with
`warp_speaker(..., cx, follow=0.7)` where `cx` is the Gaussian-smoothed matte centroid
(`smooth_track`). follow 0.7-0.8 cancels most drift but keeps natural movement. Scale ranges seen:
0.92-1.1 for a medium shot, 1.45-1.62 for a stage shot, up to 2.6x for a far wide shot (soft: use
Lanczos plus a mild unsharp, never an AI upscaler, so the face stays his).

**Per-shot size normalisation** (footage with cuts): measure head width per frame
(`finished_edit.py heads`, `shots`), then `scale = target_head_width / head_width` per shot
(e.g. `min(1.62, 345 / hw)`), times the act's punch-in factor.

## 4. Audio clean-up

See `audio-cleanup.md`. Output is always `out/voice48k.wav` (48 kHz) for the score mixer.

## 5. Beat sheet

`docs/beats.md`, one row per event, timed to word starts from the transcript:

```
| Time | Hook word | Ground | Event (what visibly happens: X becomes Y) |
| 0.00 | (frame 0) | newsprint | ... already on screen, nothing in the top 10% |
```

Rules in `vox-grammar.md`. Something new every 2-4 s (1-3 s is better). A ground change marks a
new idea. Write the event as a change ("the ? card becomes a mustard 2"), never as decoration.

## 6. Build

```bash
cp $K/compose_template.py compose.py     # fill CONFIG, ACTS, L, behind(), front(), INSERTS
$PY compose.py --only 0,35,60,100 --audit
$PY $K/gates.py audit out/audit
$PY $K/gates.py sheet docs/sheet1.jpg out/frames 0,1.4,2.6,...   # times of the beat rows
```

Iterate on test frames (fast) until the sheet holds up, then render all frames. Render speed seen:
about 36 s of compute per 5 s of video at 6 workers; with 2 workers a 40 s reel takes 10-20 min.

Write props as functions of `t` only. Every prop: slap in at its word (`prop(..., t0)`), jitter on
the 12 fps grid, leave at the act change. Marker strokes draw on with `partial(..., draw_p())`.

## 7. Context cards

Event or stage footage only. See `context-cards.md`. Set `OPEN_CARD` and `INSERTS` in compose.py.

## 8. Score

```bash
cp $K/music_template.py music.py   # fill END, MOOD, SECTIONS, HITS, FINAL
$PY music.py                        # out/score.wav + out/mix.wav (ducked, -14 LUFS)
```

See `music.md`.

## 9. Gates

See `gates.md`. All of them, every build, before handover.

## 10. Encode and deliver

```bash
ffmpeg -v error -y -framerate 25 -i out/frames/%04d.jpg -vf "scale=in_range=pc:out_range=tv,format=yuv420p" \
  -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p out/silent.mp4
ffmpeg -v error -y -i out/silent.mp4 -i out/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out/<name>-vox.mp4
$PY $K/gates.py probe out/<name>-vox.mp4 && $PY $K/gates.py loud out/<name>-vox.mp4
open out/<name>-vox.mp4        # Mac; Windows: start "" out\<name>-vox.mp4. ONE open command, never a loop
```

v2 and later versions get a new file name (`<name>-vox-v2.mp4`); never overwrite a version the
person has seen. Delete `frames/` and `out/frames/` after the mp4 is verified; keep masks, code,
docs and audio. Report: path, duration, loudness, the honest score against Vox, the 3 weakest
points, what could not be checked (listening, real-time viewing).

## 11. Learn

Append to `references/learnings.md` (see SKILL.md, step 11).
