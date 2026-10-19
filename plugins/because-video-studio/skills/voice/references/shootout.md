# Voice shootout, 14-10-2026: why Sidon + close-mic chain

Source: a camera-recorded hall voice (speed-wins reel, 30.5 s). Goal: sound like a close mic.
Full record: `motion-studio/speed-wins-reel/audio-ab/results.md` in the Ship with AI Lab repo.
The listen files there are all at -16 LUFS, so the louder one did not win by default.

**Verdict, by ear (Aman):** `10-L-sidon-closemic`. "This is the best voice which we have got."

## The 10 candidates in short

Band numbers are dB vs the original after loudness matching. Sync is the speech envelope offset vs
the original, in 5 s windows (lip sync shows at roughly 45 ms early or 125 ms late).

| # | Candidate | What it did | >6 kHz | 100-250 Hz | Sync | Verdict |
|---|---|---|---|---|---|---|
| A | Original | Camera mic in a hall: muffled, roomy | 0 | 0 | 0 | Source |
| C3 | resemble-enhance denoise + warmth EQ + 30% original | The older approved recipe | -3.6 | 0.0 | 0 ms | Clean but still dark |
| D | resemble-enhance, enhance mode | Bright, hard-gated pauses | +15.3 | +4.1 | **+56 to +126 ms, drifting** | Never for video |
| E | VoiceFixer mode 0 + chain | Full band, upfront; highs look noise-like (fizz risk) | +19.8 | +3.4 | -8 to +3 ms after a 16 ms fix | Runner-up |
| F | VoiceFixer + AudioSR + chain | Same as E, +1.9 dB above 10 kHz | +20.6 | +3.4 | as E | **AudioSR weights unlicensed** |
| H | DeepFilterNet3 + chain | Denoise only, no dereverb, no new highs | +3.7 | +0.1 | -2 ms | Clean, still dull |
| I | ClearerVoice MossFormer2_SE_48K + chain | Gentlest, room stays | +1.8 | +1.2 | 0 ms | Barely changes A |
| J | resemble-enhance gentle + chain | Like D but softer, diffusion smear | +15.9 | +5.3 | **-22 to +41 ms wobble** | Not sync-safe |
| K | C3 + AudioSR above 6 kHz, light chain | New top end, hiss bed in pauses | +20.8 | +0.7 | 0 ms | **AudioSR weights unlicensed** |
| **L** | **Sidon v0.1 + chain** | Full band, most chest warmth, clean pauses | **+22.4** | **+7.9** | **-12 to 0 ms** | **Winner** |

Why L won: it is the only one that adds both the top end and the chest (+7.9 dB at 100-250 Hz) a
close mic gives, keeps timing within 12 ms with no drift, and has MIT code and MIT weights. Run
time 5.1 s for 30.5 s on an M4 Pro (8.8-9.3 s with model load).

Its watch points, measured: sibilance highest of all (+22.5 dB at 6-9 kHz, so the de-esser is
load-bearing), 3-5 kHz slightly recessed (-1.9 dB), and it regenerates the voice, so confirm it
still sounds like the speaker.

## Never use

1. **resemble-enhance in enhance mode (D, J) on video.** Speech sits 56-126 ms late and the offset
   drifts across the clip, so no single shift fixes it. Denoise-only mode (C3) is sync-safe.
2. **AudioSR (F, K) on client footage.** `haoheliu/audiosr_speech` has no model card and no
   licence. The code is MIT, the weights carry no grant.

## Licences (checked 14-10-2026)

| Tool | Code | Weights the exact command downloaded |
|---|---|---|
| Sidon v0.1 | MIT, https://github.com/sarulab-speech/Sidon | MIT, https://huggingface.co/sarulab-speech/sidon-v0.1 (feature extractor config from https://huggingface.co/facebook/w2v-bert-2.0, MIT) |
| VoiceFixer 0.1.3 | MIT, https://github.com/haoheliu/voicefixer | Zenodo CC-BY-4.0, https://zenodo.org/api/records/5600188 and https://zenodo.org/api/records/5469951 |
| AudioSR | MIT, https://github.com/haoheliu/versatile_audio_super_resolution | `haoheliu/audiosr_speech`, no licence, https://huggingface.co/haoheliu/audiosr_speech |
| DeepFilterNet3 | MIT or Apache-2.0, https://github.com/Rikorose/DeepFilterNet | `models/DeepFilterNet3.zip` in the same repo, same dual licence |
| ClearerVoice-Studio | Apache-2.0, https://github.com/modelscope/ClearerVoice-Studio | Apache-2.0, https://huggingface.co/alibabasglab/MossFormer2_SE_48K |
| resemble-enhance | MIT, https://github.com/resemble-ai/resemble-enhance | MIT, https://huggingface.co/ResembleAI/resemble-enhance |
| pedalboard | GPL-3.0, https://github.com/spotify/pedalboard | n/a (GPL covers the tool, not the audio it processes) |

Sidon's weights were trained on CC-BY-4.0 data (FLEURS-R, LibriTTS-R). The MIT grant covers the
weights.

## Reproduction check (built into this skill)

`enhance.py` on the shootout original reproduced `10-L-sidon-closemic.wav` sample for sample
(waveform correlation 1.0, every band within 0.0 dB), apart from loudness and the 3 ms constant
offset the sync fix removes, 14-10-2026.
