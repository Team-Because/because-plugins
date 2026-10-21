# Audio clean-up: hall and camera audio

Event footage is recorded by the camera mic in a hall: room echo, crowd noise, a thin voice.
Aman's verdict on plain AI denoise: "the voice heard as hollow".

## Default: the `studio-voice` skill (since 14-10-2026)

Sidon v0.1 restoration plus a close-mic chain won a 10-candidate shootout by ear: "This is the
best voice which we have got." It adds the top end and the chest a close mic gives, keeps lip sync
within 12 ms, and has MIT code and weights. One command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --voice   # once per computer
$PY $K/audio.py extract "$SRC" src --ss 11.2 --t 36.2   # segment at 48 kHz
$PY ../../../../voice/enhance.py src/a48k.wav out/voice48k.wav
```

Output is 48 kHz mono at -16 LUFS, which `score.mix_with_voice` takes as is. Read the
`studio-voice` SKILL.md for the options (`--blend 0.1` for more of the real voice, sync warnings)
and its `references/when-it-struggles.md` (sibilance, identity, music under the voice). An old
music bed: demucs first, then studio-voice on `vocals.wav`.

## Fallback (older recipe, before 14-10-2026): resemble-enhance denoise + warmth EQ + blend

Use only if Sidon fails on a file or the user prefers this sound by ear. Proven on speed-wins,
tba-clip1, tba-clip2. Never use resemble-enhance in enhance mode on video: it drifts lip sync
56-126 ms.

1. **Extract** the segment at 48 kHz: `$PY $K/audio.py extract "$SRC" src --ss 11.2 --t 36.2`
2. **Denoise** with resemble-enhance (local, free, runs on CPU in a few minutes per 40 s):

   ```bash
   uv venv -q -p 3.11 tools/re-venv                       # its own venv: it pins torch 2.1 and old numpy
   VIRTUAL_ENV=$PWD/tools/re-venv uv pip install -q resemble-enhance
   mkdir -p src/re_in src/re_out && cp src/a48k.wav src/re_in/seg.wav    # mono is fine: -ac 1
   tools/re-venv/bin/resemble-enhance src/re_in src/re_out --denoise_only --device cpu
   ```

   **The git-lfs weight workaround.** On first run it clones the Hugging Face model repo with
   `GIT_LFS_SKIP_SMUDGE=1`, then runs `git lfs pull`, which failed here and left a pointer file in
   place of the 713 MB weight. Fix, inside the venv only:

   ```bash
   MR=tools/re-venv/lib/python3.11/site-packages/resemble_enhance
   curl -L -C - --retry 3 -o $MR/model_repo/enhancer_stage2/ds/G/default/mp_rank_00_model_states.pt \
     "https://huggingface.co/ResembleAI/resemble-enhance/resolve/main/enhancer_stage2/ds/G/default/mp_rank_00_model_states.pt"
   ls -l $MR/model_repo/enhancer_stage2/ds/G/default/mp_rank_00_model_states.pt   # expect 713,176,232 bytes
   # then make download() skip the git step when the weight is present:
   python3 - <<EOF
   p="$MR/enhancer/download.py"; s=open(p).read()
   s=s.replace('    logger.info("Downloading the model...")\n','    logger.info("Downloading the model...")\n    if (REPO_DIR / "enhancer_stage2/ds/G/default/mp_rank_00_model_states.pt").stat().st_size > 1e6:\n        return REPO_DIR / "enhancer_stage2"\n',1)
   open(p,"w").write(s)
   EOF
   ```

   (On a machine where the clone exists but `git lfs pull` works, none of this is needed.)
3. **Warm it back up and blend**: `$PY $K/audio.py warm src/re_out/seg.wav src/re_in/seg.wav out/voice48k.wav`
   - EQ: high-pass 70 Hz, +4 dB at 110 Hz (chest), +1.5 dB at 220 Hz, +2 dB at 3 kHz (presence).
   - Blend 30% of the original (level-matched) back in. Blending keeps it sounding like a real
     voice, at the cost of a little hall.
   - Gentle compressor, peak at 0.89.
4. **A/B by numbers, then by ear**: `$PY $K/audio.py bands <file>` on each version.

| Version (speed-wins) | Chest 80-150 Hz | Speech-to-pause gap |
|---|---|---|
| A original | -7.4 dB | 21.6 dB |
| C AI denoise only | -15.3 dB (hollow) | 26.9 dB |
| C2 denoise + warmth EQ | -9.3 dB | 26.1 dB |
| **C3 denoise + warmth EQ + 30% original** (shipped) | -9.2 dB | 24.6 dB |

tba-clip1: speech-to-noise in pauses went from 19 dB to 24 dB with the same chain.

If the hall echo still bothers him, C2 (no blend) is the cleaner option. Offer it as an A/B; he
picks by ear.

## An old music bed under the voice

Use demucs, not the denoiser (finished-edits.md, step 5).

## Housekeeping

The resemble-enhance venv is 2.1-2.4 GB with a nested git clone. Keep it out of git
(`.gitignore`), and delete it after the voice is final (re-running means reinstalling). Never
install it into the shared project venv.

## Honest limit

I cannot listen, with either route. Say at handover that the voice was judged by measurement only and needs a listen,
and keep the original audio file untouched beside the cleaned one.
