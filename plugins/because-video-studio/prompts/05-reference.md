# Step 05 · Reference prompt

Source: @0xMovez course, step 05 (https://x.com/0xMovez/article/2104216919033192746).
Without a reference Opus falls back to its default: centered text, gradient background, everything fading in.
Naming a style beats describing one. A reference gives pacing, type and transitions to copy.

## Three kinds of reference (all live in clients/<client>/refs/)
- A frame: one screenshot of a video you love. Say what to take (palette, type, grain) and what not to take (subject).
- A video: the file itself. Run `node tools/extract-frames.mjs clients/<client>/refs/<file>.mp4` first.
  You get `<file>-ref/`: a frame every 0.5 s, contact sheets, and cuts.json (every cut, its score, shot lengths).
- A library: a folder of the client's images or past work. Run the same tool on the folder for a contact sheet.

Where to find references: whatships.com (launch videos), Dribbble motion, competitors' launch films,
and the client's own past work (a reference nobody else can copy).

## The prompt (run from clients/<client>/, the video folder already made with new-video.mjs)

```
Reference: refs/[FILE] and its -ref/ folder (contact sheets + cuts.json).

1. Study the contact sheets and cuts.json. Open single frames from -ref/frames/ when you need detail.
2. Fill videos/[VIDEO]/docs/style_guide.md: palette (hex), type (family, weight, tracking),
   shot lengths, transition types, camera moves, texture/grain, how text enters and exits.
3. Fill videos/[VIDEO]/docs/shotlist.md for a [DURATION]s video about [SUBJECT] in THAT style.
   Take the grammar of the reference, never its content, logos or characters.
4. Show me both files. Wait for my OK before any code.
```

## The course original (verbatim, for comparison)

```
Reference: ./refs/launch.mp4 (and ./refs/frames/*.png)

1. Extract one frame every 0.5s with ffmpeg. Study them.
2. Write ./docs/style_guide.md: palette (hex), type (family, weight, tracking),
   shot lengths, transition types, camera moves, texture/grain, how text enters and exits.
3. Write ./docs/shotlist.md for a [DURATION]s video about [SUBJECT] in THAT style.
   Take the grammar of the reference, never its content, logos or characters.
4. Show me both files. Wait for my OK before any code.
```

What we changed and why: step 1 runs tools/extract-frames.mjs, which does the same 0.5 s frames plus contact
sheets and cuts.json (measured cuts and shot lengths); paths point at the client folder; docs are templates already
copied into the video by new-video.mjs.

## Lessons from the first real use (a product teaser, 07-10-2026)
- 0.5 s sampling misses fast references. The x-ray reference had 23 shots in 9.9 s (0.43 s average, 1-frame flashes).
  Check cuts.json first; if the average shot is under 0.5 s, also pull every frame of the busiest stretches
  (`ffmpeg -ss <start> -t <len> -i <ref> -vf "scale=180:-2,tile=8x4" -frames:v 1 strip.png`).
- Sample the palette, don't eyeball it: measure hex values from full-size frames.
- Before writing the style guide, prove the look is producible with the client's real assets (a quick test render).
- If the reference is a 3D render, plan the mixed pipeline (FAL still + Kling clips, code on top). See
  clients/<client>/videos/<video>/docs/generation_log.md.

## Rule from the course
Specify the look and the constraints, not the library. When you give a reference, let the model pick the
technique (Pleometric suggested p5.js and Opus wrote its own paper renderer). Name a framework only when
you need it for reuse.
