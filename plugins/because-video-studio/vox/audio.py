"""Voice clean-up for hall / camera audio, and old-music-bed removal. Local and free.

  extract  <video> <src_dir> [--ss 11.2 --t 36.2]   -> src_dir/a48k.wav (stereo 48k), a16k.wav (mono, Whisper)
  warm     <denoised.wav> <original.wav> <out.wav> [--blend 0.3]
           resemble-enhance output -> warmth EQ + 30% of the original blended back + gentle comp.
           Denoise alone sounded hollow (80-150 Hz fell from -7.4 to -15.3 dB). This put the body
           back (-9.2 dB) and kept most of the noise gain (speech-to-pause 21.6 -> 24.6 dB).
  bands    <wav>   prints chest-tone (80-150 Hz) share and speech-to-pause gap. Compare versions of the
           SAME clip only (A/B); the absolute values depend on the method, the deltas are what count

The denoiser and the stem splitter run as separate commands (see references/audio-cleanup.md):
  resemble-enhance <in_dir> <out_dir> --denoise_only --device cpu          (own venv, Python 3.11)
  python -m demucs --two-stems vocals -n htdemucs -j 1 -o <dir> <in.wav>    (strip an old music bed)
"""
import argparse
import subprocess

import numpy as np
import soundfile as sf

SR = 48000


def extract(video, src, ss=None, t=None):
    cut = (["-ss", str(ss)] if ss is not None else []) + (["-t", str(t)] if t is not None else [])
    subprocess.run(["ffmpeg", "-v", "error", "-y", *cut, "-i", video, "-ac", "2", "-ar", str(SR), f"{src}/a48k.wav"], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f"{src}/a48k.wav", "-ac", "1", "-ar", "16000", f"{src}/a16k.wav"], check=True)
    print("wrote", f"{src}/a48k.wav", f"{src}/a16k.wav")


def warm(denoised, original, out, blend=0.3):
    from pedalboard import Compressor, HighpassFilter, Pedalboard, PeakFilter

    def load(p):
        x, sr = sf.read(p, dtype="float32", always_2d=True)
        x = x.mean(1)
        if sr != SR:
            import tempfile, os
            with tempfile.TemporaryDirectory() as d:
                q = os.path.join(d, "r.wav")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p, "-ac", "1", "-ar", str(SR), q], check=True)
                x, _ = sf.read(q, dtype="float32")
        return x

    d, o = load(denoised), load(original)
    n = min(len(d), len(o))
    d, o = d[:n], o[:n]
    # +4 dB at 110 Hz (chest), +1.5 dB at 220 Hz, +2 dB at 3 kHz (presence)
    eq = Pedalboard([HighpassFilter(70), PeakFilter(110, 4, 0.8), PeakFilter(220, 1.5, 0.9), PeakFilter(3000, 2, 1.0)])
    d = eq(d[None], SR)[0]
    o = o * (np.sqrt((d**2).mean()) / max(1e-9, np.sqrt((o**2).mean())))  # match level before blending
    v = (1 - blend) * d + blend * o
    v = Pedalboard([Compressor(-20, 2.5, 8, 120)])(v[None], SR)[0]
    v = v / max(1e-9, np.abs(v).max()) * 0.89
    sf.write(out, np.stack([v, v], 1), SR)
    print("voice", round(n / SR, 2), "s ->", out)


def bands(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    x = x.mean(1)
    spec = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    f = np.fft.rfftfreq(len(x), 1 / sr)
    tot = (spec**2).sum()
    chest = (spec[(f >= 80) & (f <= 150)] ** 2).sum()
    win = int(0.05 * sr)
    rms = np.sqrt(np.convolve(x**2, np.ones(win) / win, mode="valid") + 1e-12)
    db = 20 * np.log10(rms)
    gap = np.percentile(db, 90) - np.percentile(db, 10)
    print(f"chest 80-150 Hz: {10 * np.log10(chest / tot):.1f} dB of total | speech-to-pause gap: {gap:.1f} dB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("extract"); a.add_argument("video"); a.add_argument("src")
    a.add_argument("--ss", type=float); a.add_argument("--t", type=float)
    a = sub.add_parser("warm"); a.add_argument("denoised"); a.add_argument("original"); a.add_argument("out")
    a.add_argument("--blend", type=float, default=0.3)
    a = sub.add_parser("bands"); a.add_argument("wav")
    g = ap.parse_args()
    if g.cmd == "extract":
        extract(g.video, g.src, g.ss, g.t)
    elif g.cmd == "warm":
        warm(g.denoised, g.original, g.out, g.blend)
    else:
        bands(g.wav)
