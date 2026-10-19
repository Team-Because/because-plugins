# Director notes (how to give feedback on a render)

Source: Rexan Wong's workflow, step 6 (https://x.com/rexan_wong/status/2103707054108299437).
The first render is usually 80% there; the last 20% is what makes it look pro. Vague notes ("make it better")
get random changes. Camera and timing words get exactly the change you want.

## Format: one note per line, each with a timestamp, a target and a measurable change
```
0:02.4  shot 3   slow the push-in to 0.7x
0:04.1  cut      hard cut here, no blur
0:05.0  button   push in on the button, hold 0.5 s longer
0:06.8  caption  bigger, 1.3x, stays until the beat at 7.5
```

## Vocabulary that works
| Say | Means |
|---|---|
| hard cut / match cut / whip | the transition type |
| push in / pull out / hold / lock off | the camera |
| slow to 0.7x / speed to 1.5x | duration of a move or shot |
| ease out / snappier / no overshoot | the spring (stiffer, more damping) |
| land on the downbeat / on beat 3 | timing against beats.json |
| bigger 1.3x / move up 80 px / safe zone | layout |
| louder / under the music / cut the tail | sound |

## Vague words to translate before sending
| Instead of | Say |
|---|---|
| make it pop | bigger 1.2x, hard cut in on the downbeat |
| feels slow | cut 0.3 s from shots 4 and 5, speed the push-in to 1.3x |
| more premium | fewer elements, slower moves, one accent colour, restrained sound |
| it's busy | remove the [x], hold the [y] for 1 s |

Claude applies notes to the code (index.html, sound.mjs), re-renders only the affected seconds as stills
(tools/stills.mjs --times ...), shows them, then re-renders the MP4. Every round of notes is logged in docs/review_log.md.
