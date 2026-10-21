---
name: vox
description: Turn footage of someone talking (a raw talking head, interview, keynote, testimonial or event clip, or someone else's finished reel) into a Vox-style paper-collage 9:16 reel, locally and free - the real speaker becomes a sticker cut-out over a paper world built in code (flat grounds, halftone, torn labels, tape, stop-motion props, red marker timed to their words), with a sampled-instrument score. Use whenever someone says "make this Vox style", "turn this video into a Vox reel", "paper collage reel", "restyle this talking head", "Vox version of this clip", "make a reel from this keynote / testimonial / interview", or shares speaker footage and wants a premium explainer-style reel, even without saying Vox. Not for a video with no footage (use the video skill).
---

# Vox reel

Footage of a person talking becomes a Vox-style paper-collage reel (1080x1920, 25 fps): the real speaker as a sticker
cut-out, a hand-made paper world built in code around their exact words, and a score from real sampled instruments.
Everything runs locally and free: the speaker cut-out (Apple Vision on a Mac, BiRefNet on Windows), numpy, OpenCV, PIL,
FluidSynth with the MuseScore General soundfont, pedalboard and ffmpeg. The method was proven on six reels
(`references/examples.md`); the first was approved with "This really looks good".

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`.
Each vox build lives at `clients/<client>/videos/<name>/` and gets a row in `clients/<client>/campaigns.md`
(`| <name> | vox reel | in progress |`), because the studio's library check expects every video folder to be listed.
No client folder yet: run the client skill first.

**First vox on this computer:** if `soundfont/MuseScore_General.sf2` or `.venv-voice` is missing in the workspace, say so in
one line ("one-time download for the vox tools, about 3 GB, 10-20 minutes") and run in the background:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --vox --skip-test`. Wait for its OK lines.

## Top 1% by default
Name the benchmark in one line in `docs/brief.md` and gate against it before handover:
- **Motion:** Vox paper-collage explainers (one idea per beat, an event every 2-4 s, flat grounds, halftone, torn paper,
  tape, stop-motion, red marker on real documents).
- **Music:** Apple keynote and brand films (felt piano, pulse, strings, sub hits only on turns, space).
Report the honest score and the 3 weakest points.

## Hard constraints
1. **Local and free.** No Higgsfield, ElevenLabs or other paid service in this pipeline unless the person says yes to that
   one job after seeing the model, settings and price.
2. **The real face is never redrawn.** The speaker stays real footage; props never cover the face or hands.
3. **Every word on screen is typed in code**, from the speaker's words or vetted captions. Write the newsprint body copy fresh.
4. **Never recreate a photograph.** The real room appears only as real footage on photo cards.
5. **Safe zones:** nothing important above y 192 or below y 1536. Frame 0 is the thumbnail.
6. **Never modify another build's folder or an earlier version.** A new version is a new file.
7. **Writing rules** on screen and in docs: no em dashes, no emojis, dates DD-MM-YYYY.
8. **CPU:** cap render pools at 2-3 workers. On Windows without a graphics card the cut-out runs slower; say how long.

## Before every build
Read `references/learnings.md` in full: every mistake so far, as a rule. Then skim the closest build in `references/examples.md`.

## Workflow
Commands for every step are in `references/method.md`. `K` is the studio's `vox/` folder (`../../../../vox` from the video
folder), `PY` the studio python.
1. **Set up** the folder with `docs/ src/ tools/ out/` and the campaigns row.
2. **Understand the content.** ffprobe, a contact sheet of the source, extract the audio, transcribe with word timestamps
   (`$PY $K/transcribe.py`). Write `docs/brief.md`: source, language, what is said, reel type, audience, the one feeling,
   music mood, event (context cards) or seated interview (none). Trust the frames over any brief. Someone else's finished
   edit (burned-in captions, music, cuts, non-English): read `references/finished-edits.md` now.
3. **Pick the segment.** The hook lands in the first 2 s; the reel ends on a complete thought, usually 30-60 s.
4. **Matte and reframe.** Extract JPEG frames, run `$PY $K/personmask.py frames masks`, check a full-res face crop, and fix
   only what the footage needs (`keep_largest`, `matte.py track/crops/clean`, `strip_rim_colour`, `matte.py plate`,
   `bust_cut`). Reframe 16:9 to 9:16 with `warp_speaker(follow=0.7)`. On Windows the cut-out is BiRefNet at 512 (about 1.6 s a frame
   on a fast CPU, so 25-60 minutes for a 36 s reel; a few minutes with an NVIDIA card): say how long before starting, and
   run it in the background. Add `--size 1024` only for fine hair in a big close-up (about 4x slower).
5. **Clean the audio** with the voice tools: `$PY ../../../../voice/enhance.py src/a48k.wav out/voice48k.wav`. Music bed
   under the voice: demucs first (`references/audio-cleanup.md`).
6. **Beat sheet** `docs/beats.md`: one row per event (time, hook word, ground, "X becomes Y"), timed to word starts,
   following `references/vox-grammar.md`.
7. **Build.** Copy `$K/compose_template.py` to `compose.py`, fill CONFIG, `BODY_TEXT`, ACTS, labels, `behind()` and
   `front()`. Captions from `captions.chunk_words`. Render test frames with `--only ... --audit`, contact-sheet, fix, then all.
8. **Context cards** (event or stage footage only): `references/context-cards.md`.
9. **Score.** Copy `$K/music_template.py` to `music.py`, one section per story beat, sub hits only on turns, mix at -14 LUFS
   (`references/music.md`).
10. **Gates, then deliver.** Every gate in `references/gates.md`, then encode, open the file once, and report: path, length,
    loudness, the score vs Vox, the 3 weakest points, and what could not be checked (listening, real-time viewing).
11. **Learn.** Anything new that should change the method for everyone: tell the plugin owner, because the studio's
    reference files are replaced on every plugin update.

## Scripts (in the studio's `vox/`)
| File | Holds |
|---|---|
| `voxkit.py` | The drawing library: paper, halftone, torn shapes, grounds, labels, tape, stop-motion timing, markers, sticker speaker, context cards |
| `captions.py` | Phrase-boundary caption chunking and a lint for bad breaks |
| `compose_template.py`, `music_template.py` | The files to copy and fill |
| `score.py` | Score engine (pretty_midi, FluidSynth, MuseScore General, pedalboard), ducking, loudness |
| `personmask.py` | Speaker cut-out: Apple Vision (Mac, `personmask.swift` built by setup) or BiRefNet |
| `transcribe.py` | Word-timed transcript (faster-whisper) |
| `matte.py`, `finished_edit.py`, `audio.py`, `gates.py` | Matte fixes, edit measurement, audio helpers, the gates |

## References
| File | Read when |
|---|---|
| `references/learnings.md` | Before every build |
| `references/method.md` | Running any step |
| `references/vox-grammar.md` | Writing the beat sheet, judging the contact sheet |
| `references/context-cards.md` | Event or stage footage |
| `references/music.md` | Writing music.py |
| `references/finished-edits.md` | Someone else's edited reel, or non-English speech |
| `references/audio-cleanup.md` | Hall or camera audio, a hollow voice, an old music bed |
| `references/gates.md` | Before handover |
| `references/examples.md` | Picking the closest past build |
