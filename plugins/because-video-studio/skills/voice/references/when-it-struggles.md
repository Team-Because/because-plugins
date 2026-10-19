# When it struggles: risks to check on every run

Sidon is a restoration model. It does not filter the voice, it re-synthesises it from speech
features. That is why it sounds like a close mic, and it is also where every risk below comes from.

## 1. Sibilance

Sidon had the strongest 6-9 kHz energy of all 10 candidates (+22.5 dB vs the original). The
chain's split-band de-esser (5.5-9 kHz, 4:1 above -30 dB) is what keeps "s" and "sh" from
spitting. Check the report's `deess_max_gr_db`:

- Around -3 to -9 dB: the de-esser is working as designed.
- Near 0 on a voice with many "s" sounds: listen to the sibilants, the threshold may be too high
  for this level.
- Still harsh by ear: drop the de-esser threshold in `closemic.deess` to -34 dB for this run, never
  remove the 10 kHz air shelf first (it is not where the hiss lives).

## 2. Is it still the same person?

It regenerates the voice, so accent, pitch and timbre can shift slightly. Before handover:

1. Play 5 s of the input and 5 s of the output back to back on a vowel-heavy line.
2. Flag anything that sounds like a different speaker, a lisp that was not there, or a flattened
   accent. The fallback is `--blend 0.1` to `0.2`, which keeps some of the real voice in.
3. I cannot hear. Say at handover that identity was not checked by ear unless the user did it.

## 3. Music, crowd or a second speaker under the voice

Sidon assumes one voice. A music bed or loud crowd gets mangled into the speech. Separate first:

```bash
python -m demucs --two-stems vocals -n htdemucs -j 1 -o <dir> <in.wav>   # in its own venv
python voice/enhance.py <dir>/htdemucs/<name>/vocals.wav out.wav
```

Then mix the music back under the enhanced voice if the edit needs it. Two speakers talking over
each other: do not run this skill on the overlap.

## 4. Non-English speech

Sidon was trained on multilingual FLEURS-R plus LibriTTS-R, so other languages may work. It has not
been tested here. Run a 10-15 s piece first and verify by ear (ideally a native speaker) that the
words are intact before processing the whole file.

## 5. Lip sync

`enhance.py` measures the speech-envelope offset in 5 s windows, corrects a constant offset, and
warns above 20 ms. If it warns, the drift is not constant and a single shift cannot fix it. Look at
the timestamps it prints, and compare those spots on the cut. Never "fix" drift by stretching audio.

## 6. Pauses that sound gated

Restored output has near-silent pauses (speech-to-pause gap about 36 dB vs 19 dB in the hall
original). Over video with visible room or crowd, dead silence between words can feel unnatural.
`--blend 0.1` brings back a little room tone.

## 7. Very long files

Files longer than about 31 s run in 33 s chunks with 4 s overlaps, and each seam sits in a pause
(times in the run report, `sidon_seams_s`). A 6.1-minute file took 60 s and 9.5 GB RAM, with no
seam ticks and every part within 0.7 dB of the approved clip. If a seam ever sounds wrong, listen
at the printed seam time. Never raise the chunk length to "give the model more context": with 95 s
of context the pauses came out 11 dB deeper, measured, which reads as more gated (learnings.md).

## 8. Inputs that are already clean

A good lavalier or podcast mic recording gains little and can lose identity. Compare before and
after, and skip the skill if the original already sounds close-mic'd. If the input is already
warmed by another EQ, use `--light`.
