---
name: video
description: Make an on-brand motion video for a Team Because client, end to end - from a one-line idea to checked MP4s in every format (9:16, 4:5, 1:1, 16:9). The person picks one of three concepts and reviews the film; everything between is built, checked and fixed here. Use whenever someone asks for a video, reel, short, motion video, motion graphics, festive wish, product teaser, launch film, explainer, ad or animation for a client or brand, says "make the video for <client>", "create a reel", or wants to revise, re-render or extend an existing studio video, even if they never say "video".
---

# Video · one ask, two touches

The person gives a client and an idea. They touch the work twice: they pick a concept, and they review the film. Everything
between is yours, and nothing reaches them before the checks pass. This shape exists because waiting on approvals and fixing
defects someone found by eye cost two thirds of the time on earlier films.

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`. No file, or
`done` is false: run the setup skill first, in one plain sentence. Every path below is relative to the workspace. Python is
`.venv/bin/python` on Mac and `.venv\Scripts\python.exe` on Windows. To show a file, open it with `open` (Mac) or
`start "" "<file>"` (Windows).

## Engine
Our own seek(t) engine builds every video, with the library and every check below. Each brief carries `engine: seek-t`.
- **HyperFrames, only when the person asks for it by name.** Write `engine: hyperframes` in that video's `brief.md`, tell them in
  one line that our detailed checks only partly apply (the final MP4 checks and the handoff still do), install its skills once
  with `npx --yes hyperframes@0.8.174 skills update`, and build with its own commands inside the video folder. The choice holds
  for that video only.
- **Remotion is not available** (a paid company licence is needed for a team this size). Say so in one line and offer HyperFrames.
A check runs before every command in the studio and stops a render from an engine the brief did not name.

## 0 · Orient (silent)
Read, in this order:
1. `studio/taste.md`: what the studio accepts and rejects. Every pitch is checked against it.
2. `clients/<client>/CLAUDE.md`: brand facts, colours, voice, never-say list. No client folder yet: run the client skill first.
3. `recipes/`: pick the one matching the ask (festive-wish, product-teaser, mascot-explainer). A recipe fills most of the brief.
4. Know what exists, without letting it steer the pitch: `library/index.yaml` (generic looks, kits, pieces),
   `clients/<client>/library.yaml`, `clients/<client>/campaigns.md`, and the product's `products/<product>/facts.md`.
If the video folder exists, read its `brief.md` and `docs/ledger.md` and resume from the last stage logged.

## 1 · Intake (one question round at most)
`node tools/new-video.mjs <client> <campaign>-<video>`, then fill `brief.md` yourself from the client file, the recipe and the
ask. Add a line `engine: seek-t`. "Motion video" means motion graphics built in code (taste 1).
Ask only what you cannot find or infer, in one AskUserQuestion call, plain words. Typical gaps: duration, formats, a fact the
site does not state. Anything a tool can fetch, fetch it.
Log the stage row in `docs/ledger.md`: `| DD-MM-YYYY HH:MM | intake | <min> | ... |`.

## 2 · Pitch · touch 1
Three concepts, each one still and one line. Build stills from the engine first (`node tools/stills.mjs <video>/index.html
--times ...`): free and fast. Use a Higgsfield still only when the look needs material code cannot draw, and only after naming
the price and getting a yes.
Put the three side by side in `docs/variants.png` and open it.

Before showing, check each concept against `studio/taste.md` and say so in one line each:
- the medium matches their words; the reference was chosen by craft, not topic
- at least two concepts sit in an accepted genre (real product in premium light, type, springs); a character or crowd concept
  carries a one-line ceiling warning (taste 11)
- the product is plausible where it appears, or it is carried graphically
- premium, not cliche; brand colours, not the reference's

Ask them to pick (AskUserQuestion, concept names as options, plus duration if still open). Record the pick in `brief.md`.
Films over 30 s: after the pick, write `docs/shotlist.md` and stop once more for their OK; long films drift without it.

## 3 · Build (no stops)
1. Higgsfield clips, if the concept needs them: start them first in the background, each priced, logged in
   `docs/generation_log.md` with a running total, and approved by the person. Stop and ask at 80% of the agreed budget.
2. `docs/shotlist.md` (short form up to 30 s: time, what we see, motion, text, sound).
3. Code `index.html` from the starter. It already has the contract the tools read; keep it:
   - one timing table `T`; scenes, `window.film.cues` and `window.film.sync` all read from it (never retype a time)
   - every drawn thing that must stay in frame calls `rec(name, ...)`; readable text is named `text ...`; camera probes `_cam`
   - `window.film.allow` only for cuts the shot list asks for; `window.film.smooth` for every camera move or pan
   - the picked concept decides the shots. Where a shot is the same move as an approved piece in `library/index.yaml` or the
     client's `library.yaml`, reuse it re-dressed in this brand; never bend a shot to fit a piece.
     Helpers in `blocks.js`: line, pill, wordCaptions, band, bloom, lockup, prop, cover, hop, squash, softTrack, clipFrame.
4. Optional animatic for films over 20 s: `node tools/ship.mjs clients/<client>/videos/<video>/index.html --draft`.
5. Voiceover, when the brief has one: `<python> tools/voice.py clients/<client>/videos/<video>` (ElevenLabs; costs credits, so
   name it in the plan). Music: `tools/score.py` makes a free score in code; ElevenLabs music only with a yes.

## 4 · Check loop (until clean, before they see anything)
`node tools/check.mjs clients/<client>/videos/<video>/index.html` runs every format and writes `docs/check.md`. Fix every FAIL.
Read every WARN and decide in one line in `docs/review_log.md`. Then look at `out/check-<fmt>.png` for every format and score
1-10: hook in 2 s, readable at phone size, motion quality, variety, brand accuracy, sound sync, premium bar. Fix the 3 worst,
re-run. Repeat until every score is 8+ and check passes. Look at a frame strip around every big move
(`tools/stills.mjs --times` at 1/30 s steps): a contact sheet samples, it does not prove motion.

## 5 · Ship
`node tools/ship.mjs clients/<client>/videos/<video>/index.html`: checks again, renders every format, sound from `film.cues`,
-14 LUFS mix, poster and contact sheet, frame 0 of every file, a ledger row. Never hand over a file it printed FAIL or WARNING
for. Look at frame 0 of the master yourself.

## 6 · Review · touch 2
Open the master file and show the contact sheet and scores in a few lines. Ask for notes as: timestamp, what, the change
(`prompts/director-notes.md`), but accept them however they come. Log each note in `docs/ledger.md` with a class
(direction / taste / defect / fact). Fix all notes, check, ship again (the version number rises by itself).

## 7 · Close-out (when they say it is done)
- Fill the close-out block in `docs/ledger.md`.
- Update the video's row in `clients/<client>/campaigns.md` (status, final files).
- Add the film, its approved plates and any brand piece to `clients/<client>/library.yaml`.
- A scene other clients could reuse, or a note that should change `studio/taste.md` or a recipe: tell the person to send it to
  the plugin owner, because studio files are replaced on every plugin update.

## Never
- Code before the concept pick, or a pitch that fails a taste line without saying so.
- A second hand-typed time for a sound tied to a motion.
- Showing a film that `check.mjs` has not passed in every format.
- Spending Higgsfield or ElevenLabs credits without the price named and a yes; going past the agreed budget without asking.
- Touching another client's folder, or redrawing a real product UI or logo.
