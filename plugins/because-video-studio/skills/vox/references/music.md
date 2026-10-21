# Music: a sampled-instrument score at Apple brand-film level

Aman wants Apple-level music without being asked. The benchmark is Apple keynote and brand films:
sparse felt piano, a clean muted pulse, strings that swell, soft rim on 2 and 4, sub hits on the
turns, lots of space. Never playful, never marimba, no whooshes or novelty sound effects (lesson
L-118: never prompt playful/bouncy/marimba/sparkle music).

## Why code-only synthesis is not enough

Sine and FM tones written in numpy sound like a ringtone next to a real instrument. The score
engine (`scripts/score.py`) writes notes in code with pretty_midi, plays them through FluidSynth
with the MuseScore General soundfont (real sampled piano, strings, harp, pizzicato, kit), then runs
a studio chain with Spotify's pedalboard (felt-piano low-pass, plate reverb, glue compression,
limiter). Only the sub hit is synthesised, because a sub hit is a sine sweep anyway. All local
and free; ElevenLabs and other paid music are out of this pipeline.

## Choose the mood from the content

| Content | Mood | Tempo and colour |
|---|---|---|
| Keynote rule, launch speech, a push to act ("speed wins", "1 + 1 = what you want") | `keynote` | 112 bpm, felt piano, pizzicato pulse, strings, soft kick and side stick from energy 2 |
| Testimonial, human story, nostalgia, a teacher, respect for years of work | `warm` | 84 bpm, felt piano, harp arpeggios, strings, brushes only at energy 2+ |

Write the one feeling from the brief at the top of `music.py`, then the arc in one line.

## Sections follow the story, not a loop

`Section(start, end, chords, energy)`, one per story beat, times from the beat sheet:

- **energy 0**: felt piano (and pad) alone. The hook, doubt lines ("not perfect", "not 100% ready"),
  a held breath, the line after a loss ("vanish").
- **energy 1**: + pulse (keynote) or harp (warm), low strings. The story moving.
- **energy 2**: + soft kick and rim (keynote) or brushes (warm), bass. The lift.
- **energy 3**: full. Rarely; the last push before the close.

Patterns that worked:
1. Start low, lift at the turn: piano alone under the credentials, harp on "creating value",
   brushes through the numbers (tba-clip1).
2. Drop to piano on doubt, lift on every "let's go" (tba-clip2).
3. Minor for the problem, near silence after the loss, lift to major on the answer
   ("this is the platform").
4. A `Dsus` hit section with drums out on the title line ("speed wins") before the lift.
5. `final_chord=(t, "F")` lets a last chord ring over the ending; resolve on the tonic (F or Fmaj7).
6. Chord sets: keynote Dm-Bb-F-C, Gm-Bb-C-A for tension; warm Fmaj7-C-Dm-Bb(maj7).

## Sub hits only on story turns

2-4 per reel, on the words that turn the story: "gone", "speed wins" (the title), "vanish", "this
is the platform", the students' answer, "but never ponch". A hit on every label is noise.

## Mix

`mix_with_voice(score, voice, out, music_db=-17, duck_db=8, lift_at=None)`:
- The score sits at -17 dB under the voice and ducks a further 8 dB while he speaks (60 ms attack,
  400 ms release). Use -15 for a quieter speaker (tba-clip1).
- `lift_at`: after the last word, lift the score (+16 dB over 0.8 s) so an end card is not silent.
- Two-pass ffmpeg loudnorm (linear) lands on **-14 LUFS**, true peak -1.5 dBTP. A one-pass
  loudnorm undershoots (-15.6 seen).
- The voice must be 48 kHz (`out/voice48k.wav`).

## Limits

- I cannot listen. Every score so far was judged by measurement and structure only. Say so at
  handover, and offer a variant (warm vs keynote, or with/without the pulse) for Aman to pick by ear
  (lesson L-110: a taste call I cannot perceive is the person's).
- The soundfont must be complete (215,614,036 bytes). `score.check_soundfont()` fails fast;
  `setup.mjs --vox` resumes a stalled download.
