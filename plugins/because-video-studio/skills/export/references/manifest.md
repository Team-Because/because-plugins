# The layer manifest

One JSON file describes the film as a stack of layers. Every script reads it; the package keeps a copy so the AE script
and Premiere XML can be regenerated after edits. Schema: [manifest.schema.json](manifest.schema.json).
Full example: [../examples/kesariyo-rang/manifest.json](../examples/kesariyo-rang/manifest.json).

## Top level
| Field | Req | Meaning |
|---|---|---|
| `name` | ✓ | comp / sequence name |
| `slug` | | file-name stem for `<slug>_AfterEffects.jsx`, `<slug>_premiere.xml`, `<slug>.aep` |
| `width`, `height`, `fps` | ✓ | frame size and rate (25, 30, 60, 29.97 …) |
| `duration` or `frames` | ✓ | length in seconds, or in frames |
| `bgColor` | | comp background, `#RRGGBB` |
| `root` | | package root relative to the manifest (default `.`); `src` paths are relative to it |
| `editableDefault` | | `true` (default): AE script starts with live layers on, baked twins off |
| `ease` | | keyframe interpolation for all layers: `linear` (default, best for dense samples) · `ease` · `hold` |
| `markers` | | `[{ "t": 4.2, "name": "c1A" }]` → AE comp markers and Premiere sequence markers |
| `fonts` | | `[{ "family", "postscript", "file", "from", "license" }]` |
| `source`, `mix`, `caveats` | | free text for the README (engine, final render path, mix recipe, extra caveats) |

## Layers (array, **bottom → top**)
Common fields:
| Field | Meaning |
|---|---|
| `id` | unique id (used by `parent` and `matte`) |
| `name` | layer / clip name the editor sees |
| `type` | `footage` · `image` · `text` · `solid` · `shape` · `null` · `audio` |
| `in`, `out` | seconds on the comp timeline (default 0 → duration) |
| `srcIn` | seconds into the source file where the clip starts (default 0) |
| `role` | `main` (both apps) · `live` (native AE layer; on when `EDITABLE`) · `baked` (pixel twin; on when not `EDITABLE`; Premiere uses it) · `reference` |
| `targets` | `["ae","premiere"]`; default: text/shape/solid/null → `["ae"]`, the rest → both |
| `enabled` | initial visibility for `main` layers (default true) |
| `transform` | `{ "anchor": [x,y], "position": [x,y], "scale": [sx,sy], "rotation": deg, "opacity": 0-100 }` (comp pixels; position = layer centre for footage/solids/shapes) |
| `keyframes` | `{ "position": [[t,[x,y]],…], "scale": [[t,[sx,sy]],…], "rotation": [[t,deg],…], "opacity": [[t,v],…], "anchor": … }` (t in comp seconds) |
| `ease` | per-layer override of the top-level `ease` |
| `parent` | id of the parent layer (AE `setParentWithJump`: values stay as written) |
| `matte` | `{ "layer": "<id>", "type": "alpha" | "alphaInverted" | "luma" | "lumaInverted" }` (AE 2023+; matte source is switched off) |
| `blend` | `normal` · `multiply` · `screen` · `add` · `overlay` · `soft-light` · `hard-light` · `darken` · `lighten` · `difference` · `color-dodge` · `color-burn` · `color` · `luminosity` |
| `effects` | `[{ "matchName": "ADBE Gaussian Blur 2", "props": { "Blurriness": 12 } }]` (AE only, by match name) |
| `comment`, `label` | AE layer comment / label colour index |
| `from` | absolute or manifest-relative source path; `build_package.py` copies it to `src` |

By type:
| Type | Extra fields |
|---|---|
| `footage` | `src` (`video/…`), `width`, `height`, `alpha` (bool, documentation), `srcDuration` |
| `image` | `src` (`images/…`), `width`, `height` (natural size; layout scaling goes into `scale`) |
| `text` | `text` (`\n` = new line), `font` (PostScript name, e.g. `Inter-Bold`), `fontFamily`, `fontSize` (px), `color`, `justify` (`left`/`center`/`right`), `tracking` (1/1000 em), `leading` (px), `allCaps`, `strokeColor`, `strokeWidth`, `box` ([w,h] → paragraph text), `anchorMode`: `center` (default; position = centre of the text's bounds, matches what probe_layers samples) or `baseline` (AE native: position = baseline start/centre) |
| `solid` | `color`, `size` ([w,h], default comp size) |
| `shape` | `shape` (`rect`/`ellipse`), `size` [w,h], `roundness` (px), `fill` (colour or `null`), `stroke` `{ "color", "width" }` |
| `null` | – (parenting / rig) |
| `audio` | `src` (`audio/…`), `gainDb`, `channels`, `sampleRate` |

## Conventions
- Times are seconds (floats); the scripts convert to frames with `round(t × fps)`.
- Colours: `#RRGGBB`, `rgb(…)`, or `[r,g,b]` (0–1 or 0–255).
- One layer per text change: a caption that swaps words is several text layers (probe_layers does this automatically).
- Keep ids stable between re-exports so editors' notes ("lyric 12 is wrong") stay valid.
