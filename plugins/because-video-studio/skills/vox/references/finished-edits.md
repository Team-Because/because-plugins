# Rebuilding someone else's finished reel

The VIP reels (Meet's edits, 14-10-2026) were already edited: burned-in captions, a music bed,
several framings with cuts, a white sticker edge of his own, Gujarati speech. Rebuilding one is a
different job from raw footage. Measure the edit first, then design around it.

## 1. Measure the edit

```bash
$PY $K/personmask.py frames masks
$PY $K/finished_edit.py heads masks docs/head.json     # head top, width, x per frame
$PY $K/finished_edit.py shots docs/head.json docs/shots.json   # the editor's cuts and framings
$PY $K/finished_edit.py tape frames docs/tape.json     # burned-in caption tape per frame, MIN top
$PY $K/finished_edit.py capchg docs/tape.json          # caption change times
```

Also contact-sheet the bottom band at 2 fps with a time stamp to read the captions by eye:

```bash
ffmpeg -v error -i src.mp4 -vf "fps=2,crop=1080:420:0:1380,scale=540:-1,drawtext=text='%{eif\:t*1\:d}':x=5:y=5:fontsize=28:fontcolor=red" -q:v 4 refs/cap_%03d.jpg
```

## 2. Burned-in captions: cut above them, never cover or inpaint them

Measure the caption tape top on EVERY frame (Meet: never above source y 1545 in one reel, 1557 in
the other). Then cut the speaker as a torn photo clipping / torn bust whose bottom edge maps at least
12-14 px ABOVE that row in every shot (`bust_cut`). The old captions then never reach the canvas,
by construction, with no inpainting. Your own captions go on tape just below the bust (y ~1430-1520),
one line.

Trade-off to state at handover: hands that gesture below the chest are cut off.

Anchor the torn edge with a fixed paper prop when the bust bottom moves between shots: a teacher's
desk at y 1390 (VIP ni Class) hides the edge in every shot and carries the captions on its front. It
costs ~28% of the frame and his lap, so give it a job (nameplate, sign) rather than leave it plain.

## 3. The editor's sticker edge

Meet's ~10 px white edge sits inside the Vision matte. Erode the matte (21 px ellipse), fill
enclosed holes (ear, hand), inpaint those holes from the face (`cv2.inpaint`, TELEA), and suppress
leftover near-white low-saturation pixels on the rim. Then draw your own edge (`sticker_composite`).
Check on a full-res crop.

## 4. Framings vary: normalise per shot

Each of the editor's shots has its own head size. Per shot: `scale = min(1.62, 345 / head_width)`
times the act's punch-in. Smooth the centroid within a shot only (never across a cut). Hold a clean
frame over the editor's own transitions (a zoom-out into the end card) so the sticker does not
morph (`src_index` trick in vip-class-39s).

## 5. The old music bed

Separate it with demucs and keep the voice only:

```bash
$PY -m demucs --two-stems vocals -n htdemucs -j 1 -o src/demucs src/orig48k.wav
$PY ../../../../voice/enhance.py src/demucs/htdemucs/orig48k/vocals.wav out/voice48k.wav
```

(Before 14-10-2026 the vocals stem went straight to `out/voice48k.wav` with ffmpeg. Now it goes
through the `studio-voice` skill, which also brings a camera-recorded voice up to close-mic.)

Check the music stem level per 5 s window to confirm the bed was there (it was louder on the end
card). Then score fresh (music.md).

## 6. Non-English speech (Gujarati, Hindi)

Whisper (large-v3-turbo, even with `--language gu` and on the demucs vocal stem) produced junk
after ~10 s. Do not fight it:

1. Take the timing from the editor's caption changes (`capchg`, or frames read at 0.1 s steps)
   plus voice-energy onsets inside each caption.
2. Take the English wording from the editor's vetted captions, word for word, into
   `docs/captions.json`. Never machine-translate over a human translation.
3. Write CAPTIONS by hand as `[(start, end, "TEXT")]`, one line each, phrase-whole.
4. Prop timing inside a caption is an estimate; say so at handover.

For raw footage with one non-English line (tba-clip4's Gujarati "ek ne ek ... agiyar"), keep the
line, gloss it on paper ("IN GUJARATI") and fix Whisper's spelling by hand.

## 7. Judge against the editor's version too

Score against Vox AND against the editor's cut, with a side-by-side sheet at the same timestamps
(`gates.py sbs`). Both VIP rebuilds scored 8.5 vs Meet and 7-7.5 vs Vox. Name honestly where the
editor's version is better (Meet's illustrated paper kids beat a head-on-a-block).
