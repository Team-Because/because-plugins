---
name: export
description: Turn a finished studio film into an editable package for Premiere Pro and After Effects - every scene as its own layer with transparency, the background, voice, music and sound effects as separate tracks, captions, scene markers, an After Effects script that rebuilds the comp and a Premiere timeline file, plus a README for the editor. Use whenever someone says "send it to the editor", "make it editable", "export to Premiere", "export to After Effects", "give me the layers", "I need the project file", "an .aep / .prproj", or an editor asks for the pieces of a video the studio made.
---

# Export · the editor's package

Editors finish in Premiere Pro and After Effects, so a flat MP4 is not enough. This turns a film the studio has shipped into
pieces they can change.

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`, and run
from there. The film must already be shipped (`tools/ship.mjs`), because the package is checked against the final render.

## Run it
```
node tools/export.mjs clients/<client>/videos/<video>/index.html [--fmt 9x16] [--zip]
```
- One format per package (default: the film's first). Run again with `--fmt 16x9` for another size.
- `--zip` when it is going to someone.
- About 15 seconds for a 6 s film; longer films take longer (each scene is rendered frame by frame).

What it writes to `out/<client>-<video>-<fmt>_editable/`:
| Item | For |
|---|---|
| `video/NN_<scene>_alpha_WxH.mov` | each scene alone with its text, ProRes 4444 with transparency (Premiere, and After Effects with EDITABLE off) |
| `video/NN_<scene>_art_alpha_WxH.mov` | the same scene without its words, under the live text in After Effects |
| live text layers (After Effects) | every word the film draws, as editable text with its font, colour, size, position and fade keyframes |
| background | a live solid in After Effects, a still on the bottom track in Premiere |
| `audio/` | voice, music and sound effects as separate tracks, plus the final mix as a muted reference |
| `data/captions.srt` | captions from the voiceover's word times, when the film has a voiceover |
| `*_AfterEffects.jsx` | File > Scripts > Run Script File: builds the comp with markers and saves the `.aep` |
| `*_premiere.xml` | File > Import: a sequence with one track per layer |
| `README.md` | how to open both, the layer table, what is live and what is pixels |

## Read the check, then hand over
The export stacks the layers and compares them with the final render at three moments. `PASS` means the editor's package
looks exactly like the approved film. A `FAIL` stops the handover: look at which moment differs.

Tell the person in two or three lines: the package path, that each scene is a layer and its words are live text in After
Effects (Premiere gets the words baked in), and how to open it (the README has the steps). Films made before this version
come out as one layer; say so.

## Walking someone through opening it
Many people asking for this are not technical. When they ask how to open it ("walk me through opening it in After Effects
and Premiere"), open the `_editable` folder for them (`open <folder>` on Mac, `start "" "<folder>"` on Windows) and give
one plain step at a time, naming the exact file:
- **After Effects:** File, then Scripts, then Run Script File, then pick `<name>_AfterEffects.jsx`. It builds the whole video
  as layers and saves a project next to it. If After Effects says scripts are not allowed, the setting is in Settings (Mac)
  or Edit, Preferences (Windows), then Scripting & Expressions, then "Allow Scripts to Write Files and Access Network".
- **Premiere Pro:** a new project, then File, then Import, then pick `<name>_premiere.xml`. If it asks where the files are,
  choose the `video` and `audio` folders inside.
Ask them to tell you what they see after each step; no jargon.

## Know the limits
- Words are live in After Effects; shapes, images and effects inside a scene are pixels. A generic font (sans-serif) becomes
  Arial; a brand font needs installing from the client's fonts. Check line breaks on the first frame: browser and AE text
  metrics differ slightly.
- Lottie animations and canvas effects are inside the scene layers.
- More detail on app quirks: `references/premiere-ae-notes.md`. The package format: `references/manifest.md`.
