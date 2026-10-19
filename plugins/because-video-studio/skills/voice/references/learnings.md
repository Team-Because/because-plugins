# Learnings: outcomes of every use

Read this before every use. After every use, append one entry at the bottom in the format below.
Write rules that transfer to the next file, not one-off facts.

## Entries

### 14-10-2026 - speed-wins hall voice (the shootout clip), skill build test
- **Input:** camera mic in a hall, 30.5 s, English, one speaker, no music.
- **Result:** reproduced the winning file `10-L-sidon-closemic.wav` with every band within 0.0 dB
  (>6 kHz +22.4, 100-250 Hz +7.9, 3-5 kHz -1.9, 6-9 kHz +22.5 vs the original). Constant offset
  -3 ms corrected, windows -10 to +3 ms vs the input. De-esser max reduction 4.7 dB. 10.0 s total.
- **By ear:** Aman picked this chain as the best of 10.
- **Rule:** Sidon's output runs about 3 ms early on hall audio; the automatic constant-offset fix
  covers it.

### 14-10-2026 - 12 s cut of the same reel's mp4, `--video --blend 0.1`
- **Result:** video stream bit-identical to the input, voice vs input on the finished mp4 2 ms,
  worst window 0 ms. De-esser did not engage on this 12 s (few sibilants in the opening line).
- **Rule:** `deess_max_gr_db` near 0 is normal on a short clip with few "s" sounds; judge it on a
  sibilant-heavy line.

### 14-10-2026 - 6.1-minute file (the shootout clip looped 12 times), long-file test
- **Input:** 366.6 s, the same hall voice repeated 12 times, to test Sidon past one chunk.
- **Found 1, seam ticks:** the shootout runner's back-to-back 96 s chunks left a high-frequency
  tick at the 96 s seam, in a pause, 24 dB above the same spot in the short run. Two Sidon runs of
  the same audio agree in envelope within 1 ms but not in waveform phase, so a long crossfade would
  sound phasey.
- **Found 2, context changes the sound:** with 95 s of context Sidon's pauses came out 7 dB deeper
  (11 dB after the chain: gap 47 vs 36 dB), the de-esser stopped engaging (0.5 vs 4.7 dB), and
  >10 kHz dropped about 3 dB. A long file would have sounded more gated than the approved clip.
- **Fix:** `sidon.py` now runs files longer than about 31 s in 33 s chunks overlapping by 4 s, each
  seam a 60 ms equal-power fade at the quietest point of the middle 2 s of the overlap. Seam times
  are in the run report (`sidon_seams_s`).
- **Result after the fix:** every loop within 0.7 dB of the short run on all bands, gap 37-38 dB,
  de-esser 4.1 dB, constant offset -3 ms (same as the short run), windows -12 to +6 ms. All 12
  seams within 5 dB of the short run in the >10 kHz band (file-wide 99.9th percentile is 10 dB), so
  no ticks. Sidon 50 s, total 60 s, peak RAM 9.5 GB (was 192 s and 13.5 GB with 96 s chunks).
  Files up to about 31 s still take the shootout's exact path (waveform correlation 1.0 with the
  winning file).
- **Rule:** any chunked neural audio model gets two long-file checks before it is trusted: a seam
  check (high band at each seam vs the same content elsewhere) and a context check (the same
  passage processed short and long must measure the same).
- **Rule:** keep the chunk length near the length of the clip that was approved by ear; context is
  part of the sound, not just a memory setting.

## Format

```
### DD-MM-YYYY - <what the input was>
- **Input:** source type, length, language, speakers, anything under the voice.
- **Result:** the numbers from the report (sync range, de-esser, LUFS) and any warning.
- **By ear:** what the user said, or "not heard yet".
- **Rule:** the general lesson for the next file, or "none new".
```
