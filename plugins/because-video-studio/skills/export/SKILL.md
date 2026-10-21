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
| `video/NN_<scene>_alpha_WxH.mov` | each scene alone, ProRes 4444 with transparency |
| background | a live solid in After Effects, a still on the bottom track in Premiere |
| `audio/` | voice, music and sound effects as separate tracks, plus the final mix as a muted reference |
| `data/captions.srt` | captions from the voiceover's word times, when the film has a voiceover |
| `*_AfterEffects.jsx` | File > Scripts > Run Script File: builds the comp with markers and saves the `.aep` |
| `*_premiere.xml` | File > Import: a sequence with one track per layer |
| `README.md` | how to open both, the layer table, what is live and what is pixels |

## Read the check, then hand over
The export stacks the layers and compares them with the final render at three moments. `PASS` means the editor's package
looks exactly like the approved film. A `FAIL` stops the handover: look at which moment differs.

Tell the person in two or three lines: the package path, that each scene is a layer (text inside a scene is pixels, not live
text), and how to open it (the README has the steps). Films made before this version come out as one layer; say so.

## Know the limits
- Text and shapes inside a scene are pixels in v1. To change a word, the editor masks over it or asks for a new export.
- Lottie animations and canvas effects are inside the scene layers.
- More detail on app quirks: `references/premiere-ae-notes.md`. The package format: `references/manifest.md`.
