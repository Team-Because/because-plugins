"""Sidon v0.1 speech restoration (MIT code + MIT weights), CPU, local.

Same maths as the 14-10-2026 shootout runner (run_sidon.py), wrapped as a function.
Source: https://github.com/sarulab-speech/Sidon , weights https://huggingface.co/sarulab-speech/sidon-v0.1 ,
feature extractor config facebook/w2v-bert-2.0.
Files up to about 31 s run in one chunk, exactly as the shootout ran them (the approved file was a
30.5 s clip). Longer files run in 33 s chunks that overlap by 4 s; each seam is a 60 ms
equal-power crossfade at the quietest point of the middle 2 s of the overlap.
Why 33 s and not the original 96 s: Sidon's output depends on how much context it sees. With 95 s
of context the pauses came out 7 dB deeper (11 dB after the chain) than in the approved 30 s run,
so long files would have sounded more gated than what was picked by ear. 33 s chunks keep every
part of a long file within 0.7 dB of the approved sound, and run 3x faster.
Why the overlap: the shootout runner's back-to-back chunks left a high-frequency tick at each seam.
Two runs of the same audio line up in envelope within 1 ms but not in waveform phase, so the seam
goes in a pause with a short fade instead of a long crossfade. (All measured 14-10-2026.)

usage: sidon.py <in.wav> <out.wav>
"""
import sys
import time

import numpy as np

REPO = "sarulab-speech/sidon-v0.1"
SR_OUT = 48000
CHUNK_S = 33  # context length shapes the sound: see learnings.md (14-10-2026)
OVERLAP_S = 4
FADE_MS = 60
SEAMS = []  # seam times (s) of the last restore() call, for seam checks


def load_models():
    import torch
    import transformers
    from huggingface_hub import hf_hub_download
    fe_path = hf_hub_download(REPO, filename="feature_extractor_cpu.pt")
    dec_path = hf_hub_download(REPO, filename="decoder_cpu.pt")
    pre = transformers.SeamlessM4TFeatureExtractor.from_pretrained("facebook/w2v-bert-2.0")
    fe = torch.jit.load(fe_path, map_location="cpu")
    dec = torch.jit.load(dec_path, map_location="cpu")
    return pre, fe, dec


def _chunk(ch, pre, fe, dec):
    import torch
    inp = pre(torch.nn.functional.pad(ch, (160, 160)), return_tensors="pt", sampling_rate=16000)
    f = fe(inp["input_features"])["last_hidden_state"]
    return dec(f.transpose(1, 2)).view(-1)[:-960].numpy()


def _overlapped(w16, C, pre, fe, dec):
    """Overlapping chunks, each output placed at 3x its 16 kHz start; seam in the quietest spot."""
    H = C - 16000 * OVERLAP_S
    R = SR_OUT * FADE_MS // 1000
    starts = [0]
    while starts[-1] + C < len(w16):
        starts.append(starts[-1] + H)
    y = _chunk(w16[:C], pre, fe, dec)
    for s0 in starts[1:]:
        out = _chunk(w16[s0:s0 + C], pre, fe, dec)
        p = 3 * s0
        lo, hi = p + SR_OUT, len(y) - SR_OUT  # middle of the overlap: 1 s from both chunk edges
        e = np.convolve(y[lo:hi] ** 2, np.ones(SR_OUT // 20), "same")  # 50 ms energy
        xs = lo + int(e.argmin()) - R // 2
        xe = xs + R
        SEAMS.append(round((xs + R // 2) / SR_OUT, 3))
        t = np.linspace(0.0, np.pi / 2, R, dtype=np.float32)
        mid = y[xs:xe] * np.cos(t) + out[xs - p:xe - p] * np.sin(t)
        y = np.concatenate([y[:xs], mid, out[xe - p:]])
    return y


def restore(x, sr, models=None):
    """x: mono float array at sr. Returns mono float32 at 48 kHz, same duration."""
    import torch
    import torchaudio
    pre, fe, dec = models or load_models()
    SEAMS.clear()
    x = np.asarray(x, dtype=np.float64)
    x = 0.9 * x / (np.abs(x).max() + 1e-12)
    n_out = int(SR_OUT / sr * len(x))
    w = torch.tensor(x, dtype=torch.float32).view(1, -1)
    with torch.inference_mode():
        w = torchaudio.functional.highpass_biquad(w, sr, 50)
        w16 = torchaudio.functional.resample(w, sr, 16000)
        w16 = torch.nn.functional.pad(w16, (0, 24000)).view(-1)
        C = 16000 * CHUNK_S
        if len(w16) <= C:  # one chunk: the shootout's exact path
            inp = pre(torch.nn.functional.pad(w16, (160, 160)), return_tensors="pt", sampling_rate=16000)
            f = fe(inp["input_features"])["last_hidden_state"]
            y = dec(f.transpose(1, 2)).view(-1)[:-960].numpy()[:n_out]
        else:
            y = _overlapped(w16, C, pre, fe, dec)[:n_out]
    if len(y) < n_out:  # never shorter than the input: pad the tail
        y = np.concatenate([y, np.zeros(n_out - len(y), dtype=y.dtype)])
    return y.astype(np.float32)


if __name__ == "__main__":
    import soundfile as sf
    x, sr = sf.read(sys.argv[1], always_2d=True)
    t = time.time()
    y = restore(x.mean(1), sr)
    print("TIME", round(time.time() - t, 1))
    sf.write(sys.argv[2], y, SR_OUT, subtype="PCM_24")
