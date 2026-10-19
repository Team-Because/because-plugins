---
name: voice
description: Make any recorded speech sound like the speaker wore a close microphone, locally and free - removes room echo, hall sound and phone or camera-mic thinness, keeps lip sync, and can put the clean voice back onto the video. Use whenever someone says "clean up the audio", "enhance this voice", "make it sound like a mic", "make it sound studio", "the voice sounds echoey / hollow / muffled / roomy / thin", "Adobe Podcast but local", "fix the speaker's audio", or shares a video or audio of someone talking that was recorded on a camera, in a hall, on a phone or over Zoom, even without naming a tool. Not for making a new voice or voiceover (that is ElevenLabs in the video skill), and not for music.
---

# Voice

Turns a camera, room, phone or Zoom recording of speech into a close-mic'd voice: full top end, chest warmth, no hall, clean
pauses. Runs on the computer's CPU, free, nothing uploaded. The chain (Sidon v0.1 restoration plus a close-mic finishing chain)
was picked by ear as the best of 10 candidates; why it won and what never to use instead is in `references/shootout.md`.

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`.
Run commands from the workspace. `<python>` is `.venv/bin/python` on Mac and `.venv\Scripts\python.exe` on Windows
(any Python works: the script switches to its own environment).

**First use on this computer:** the voice tools are a separate 2 GB install. If `.venv-voice` is missing in the workspace,
say so in one line ("one-time download for the voice tools, about 2 GB, a few minutes") and run in the background:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --voice --skip-test`. Wait for `OK   voice tools`.

## Before each use
Read `references/learnings.md`: every outcome so far, as rules.

## The one command
```
<python> voice/enhance.py <input> <out.wav> [--video <out.mp4>]
```
| Option | Use |
|---|---|
| `<input>` | Any audio or video (wav, mp3, m4a, mp4, mov, mkv). The first audio stream is used |
| `<out.wav>` | Clean voice, 48 kHz mono, 24-bit |
| `--video out.mp4` | Also write the video with the clean voice (video copied, not re-encoded); sync is re-checked on the result |
| `--lufs -16` | Default, for a voice that sits under music. `--lufs -14` for a voice-only social upload |
| `--blend 0.1` | Mix 10% of the original back in when the voice stops sounding like the person, or pauses sound gated |
| `--light` | Skip the warmth EQ when the input is already warm |
| `--json report.json` | Save the run report |

Write outputs next to the input with a new name, never over it.

Speed on an Apple-chip Mac: about 9 s for a 30 s clip. A Windows PC without a graphics card is slower; tell the person
roughly how long before a long file.

## Workflow
1. **Look at the input.** One speaker? Music or a crowd under the voice? Language? If music sits under the voice, separate it
   first (`references/when-it-struggles.md`, section 3).
2. **Run the command.** For a video, pass `--video` so lip sync is kept.
3. **Read the report.** Sync windows within 20 ms, loudness at target. A WARNING stops the handover until you have looked at
   the printed timestamps.
4. **Hand over honestly:** output path, loudness, sync range. Say the result was judged by measurement and needs a listen,
   especially "does it still sound like them".
5. **Learn.** If the person says something by ear (better, worse, too bright, not them), tell the plugin owner so the
   studio's learnings update for everyone.

## Hard rules
- Local and free. No paid APIs, no uploads.
- Never resemble-enhance in enhance mode (drifts lip sync) and never AudioSR (no licence for its weights; never on client footage).
- Never overwrite the input.
- Sync is a gate: a video with a window above 20 ms is not handed over without a look at the cut.
