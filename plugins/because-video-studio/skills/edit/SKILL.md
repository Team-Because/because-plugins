---
name: edit
description: One editing job on an existing video or recording, in plain words - cut the pauses, remove mistakes and restarts, add captions, make it vertical for Reels/Shorts (face-tracked), resize for Instagram, YouTube or LinkedIn, trim, join clips, speed up, add music, take the audio out, or check a finished video for problems. Use when someone wants one fix to footage they already have rather than a new video, or says "cut the silences", "just add captions", "make it vertical", "trim this", "check my video", "remove the umms".
---

# Edit · one job on existing footage

Each job: ask at most one or two plain questions, do it, show the result, offer the next step. Never overwrite the original:
write `<name>_edited.mp4` (or a `renders/` file) next to it and keep the source.

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`.
`<python>` is `<workspace>/.venv/bin/python` (Mac) or `<workspace>\.venv\Scripts\python.exe` (Windows); the tools are in
`<workspace>/tools/edit/`. Run them from the folder that holds the footage, so their files land beside it. If the footage
belongs to a client, keep it under `clients/<client>/`.

## Start every job by looking
`<python> <workspace>/tools/edit/probe.py <file-or-folder> --out probe` gives length, size, frame rate, audio, and a 12-frame
contact sheet per video in `probe/sheets/`. Look at the sheet before deciding anything (`--scenes` adds a shot list).

## The jobs
| The person says | Do this |
|---|---|
| **"Cut the pauses / dead air"** | Ask: natural or punchy. `silence.py <file> --edl cut.json` (natural: defaults; punchy: `--min-gap 0.25 --margin 0.08`), then `edl.py cut.json`. Jump cuts alternate a slight zoom so they read as intentional. Check frames and the transcript at each joint: never cut inside a word |
| **"Remove mistakes and restarts"** | `transcribe.py <file>`, read `<file>_transcript/transcript.md`, propose the keep-list in plain times ("keep 0:04-0:11, 0:19-0:31"), get a yes, write it as clips in an edl.json, render with `edl.py` |
| **"Add captions"** | Ask the style: bold 2-3 words, or a clean line. Bold: put `"captions": {"style": "bold", "max_words": 3}` in the edl.json and render with `edl.py` (they stay off the bottom 20%). A plain subtitle file only: `transcribe.py` writes `transcript.srt`; to burn it in, `ffmpeg -i in.mp4 -vf subtitles=transcript.srt out.mp4`. Check names and brand words in the transcript first (`--vocab "Brand, Name"` helps) |
| **"Make it vertical / for Reels, Shorts"** | An edl.json with `"format": "9x16"` and `"crop": "face"` keeps the speaker centred as they move. Other sizes: 16x9 YouTube, 4x5 or 1x1 feeds. No face (product, screen): `"crop": "center"` or `"blur"` (the whole picture over a blurred fill) |
| **"Trim the start/end"** | `ffmpeg -ss 00:00:03 -to 00:00:41 -i in.mp4 -c:v libx264 -c:a aac out.mp4` (re-encode for exact cuts) |
| **"Join these clips"** | One edl.json listing each file as a clip, in order; it matches size and frame rate itself |
| **"Speed up / slow down"** | `"speed": 1.25` on a clip in the edl.json; the voice keeps its natural pitch |
| **"Clean up the voice"** | The voice skill (local, free) |
| **"Add music"** | Ask the mood. Free: the studio's score engine (`tools/score.py`); ElevenLabs music only with the price named and a yes. In the edl.json: `"music": {"src": "...", "volume_db": -18, "duck": true}` (it dips under speech) |
| **"Take the audio out"** | `ffmpeg -i in.mp4 -vn -acodec libmp3lame audio.mp3` |
| **"A title card"** | The video skill (it builds in the studio engine, on brand) |
| **"Check my video"** | `final_check.py <file>`: length, frame rate, size, loudness, peak, black or frozen frames, in plain words |

`edl.py <edl.json> --draft` renders fast at half size for a first look; the full render drops `--draft`. The full edl.json
format is in the header of `tools/edit/edl.py`.

## After every job
- Run `final_check.py` on the result before handing it over, and fix any FAIL.
- Say what changed and where the file is, in one or two lines, and offer the next step (captions after a cut, music after
  captions, the export skill if it is going to an editor).
