# Premiere Pro / After Effects notes

Targets: After Effects 2026 and Premiere Pro 2026 on macOS (works on older versions where noted).

## After Effects (ExtendScript)
- Run: File ▸ Scripts ▸ Run Script File…, or from a shell (when the user agrees):
  `osascript -e 'tell application "Adobe After Effects 2026" to DoScriptFile "/abs/path/<slug>_AfterEffects.jsx"'`. (Mac only; on Windows, run the script from File > Scripts > Run Script File.)
  Saving the `.aep` from a script needs Settings ▸ Scripting & Expressions ▸ *Allow Scripts to Write Files and Access Network*.
- ExtendScript is ES3: no `let`/`const`/arrow functions/`JSON`. The generator embeds data as a JS literal with `\uXXXX`
  escapes, so non-Latin text (Gujarati, Hindi, Arabic…) survives any file encoding.
- Fonts are set by **PostScript name** (`NotoSerifGujarati-Black`, `Inter-Bold`). If AE can't find it the layer keeps its
  default font; the script lists those at the end. Variable fonts: use the named instance's PostScript name.
- Text anchor: `anchorMode: center` moves the anchor to the centre of `sourceRectAtTime` so the sampled browser box centre
  lands right; `baseline` keeps AE's native baseline anchor (what hand-placed layers use).
- Complex scripts (Indic, Arabic) need AE's *South Asian and Middle Eastern* text engine (Settings ▸ Type) to shape correctly.
- Track mattes use the AE 2023+ API (`setTrackMatte`); on older versions the script reports them and moves on.
- Keyframes are written linear by default (dense samples from springs); `ease: "ease"` adds easy-ease, `hold` steps.
- Missing files become magenta "MISSING" solids so the structure survives; relink via File ▸ Replace Footage.

## Premiere Pro (FCP7 XML / xmeml v4)
- Import: File ▸ Import → the `.xml`. Premiere asks to relink when paths moved: point at `video/` and `audio/`.
- Set Preferences ▸ Media ▸ Default Media Scaling = None, otherwise smaller layers get scaled to frame.
- One video track per layer (V1 = bottom). Basic Motion `center` is written as the offset from frame centre divided by
  the sequence width (horiz) and height (vert) (`--center-units frame`, used in the Kesariyo package). If Premiere
  places layers wrongly, regenerate with `--center-units width` or set Motion ▸ Position from the README table.
  Not yet confirmed in Premiere 2026: test with one layer first and record the answer in LEARNING.md.
- Keyframe `when` = frames from the clip's source in-point. Rotation sign may need `--rotation-sign -1` (unverified).
- Scale is uniform in xmeml; non-uniform scale exports the X value (warning printed).
- Text, shapes and solids don't travel: Premiere gets the baked renders. For live titles in Premiere, use AE + Dynamic
  Link, or Essential Graphics templates (MOGRT) built in AE from the generated comp.
- ProRes 4444 with alpha imports with alpha automatically ("Straight" alpha). H.264 has no alpha.

## Formats
| Use | Codec | ffmpeg |
|---|---|---|
| Layer with transparency | ProRes 4444 (+ alpha) | `-c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le -alpha_bits 16` |
| Opaque plate, edit-friendly | ProRes 422 HQ | `-c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le` |
| Opaque plate, small | H.264 | `-c:v libx264 -crf 14 -pix_fmt yuv420p` |
| Stems | WAV 48 kHz 24-bit | `-ar 48000 -c:a pcm_s24le` |

## Optional: live control of the apps (opt-in, not installed)
MCP servers can drive AE directly (create layers, set keyframes, read the comp) instead of running a generated script:
https://github.com/p10q/ae-mcp and "aftr". They need a CEP/UXP panel installed into AE and an open socket on the Mac.
Only add one if the user asks; review its code first, and register it in the hub's `.mcp.json`, never globally without asking.

## After Effects 26.5, verified on a real install (2026-10-14)
- Scripts run via `osascript -e 'tell application "Adobe After Effects 2026" to DoScriptFile "<abs>"'`; the AppleScript result is only 0/1, write to a log file.
- Needs Settings > Scripting & Expressions > Allow Scripts to Write Files and Access Network (otherwise 0-byte files, callSystem blocked).
- Lumetri property writes abort the script; the LUT file path is not scriptable; blurred shape layers need an invisible full-comp rect; `saveFrameToPng` on the master is reliable.
- Full notes: `knowledge/studio/AFTER-EFFECTS-EDITABLES.md`.
