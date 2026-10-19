"""Close-mic finishing chain (the 14-10-2026 shootout chain.py, unchanged maths).

Peak-normalise to -6 dBFS, then: high-pass 70 Hz, +3 dB at 150 Hz (Q 0.8, proximity warmth),
-2 dB at 400 Hz (Q 1.2, de-box), +3 dB at 4 kHz (Q 0.9, presence), +2 dB high shelf at 10 kHz only
when real content exists above 10 kHz, split-band de-esser 5.5-9 kHz (4:1 above -30 dB),
compressor 3:1 / 15 ms / 150 ms, +4 dB make-up, limiter at -1.5 dB.

usage: closemic.py <in.wav> <out.wav> [--light]
--light: skip the 150 Hz / 400 Hz moves (input already has warmth EQ).
pedalboard is GPL-3.0: that covers the tool, not the audio it processes.
"""
import sys, json
import numpy as np, soundfile as sf
from scipy.signal import resample_poly, butter, sosfiltfilt
from pedalboard import (Pedalboard, HighpassFilter, PeakFilter, HighShelfFilter,
                        Compressor, Limiter, Gain)

SR = 48000


def load48(p):
    x, sr = sf.read(p, always_2d=True)
    x = x.mean(axis=1).astype(np.float64)
    if sr != SR:
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g)
    return x


def band_db(x, lo, hi):
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return 10 * np.log10(X[(f >= lo) & (f < hi)].mean() + 1e-30)


def deess(x, lo=5500, hi=9000, thresh_db=-30, ratio=4.0, att=0.002, rel=0.06):
    """Subtractive split-band de-esser: compress only the 5.5-9 kHz band when it is loud."""
    sos = butter(4, [lo, hi], btype="band", fs=SR, output="sos")
    s = sosfiltfilt(sos, x)
    env = np.abs(s).tolist()  # plain floats: same maths, about 10x faster than numpy scalars
    a_a, a_r = float(np.exp(-1 / (att * SR))), float(np.exp(-1 / (rel * SR)))
    e = [0.0] * len(env); prev = 0.0
    for i, v in enumerate(env):  # simple peak follower
        c = a_a if v > prev else a_r
        prev = c * prev + (1 - c) * v
        e[i] = prev
    e = np.asarray(e)
    lvl = 20 * np.log10(e + 1e-9)
    over = np.maximum(lvl - thresh_db, 0)
    gr_db = -over * (1 - 1 / ratio)
    g = 10 ** (gr_db / 20)
    return x - s * (1 - g), float(gr_db.min())


def process(x, light=False):
    """x: mono float at 48 kHz. Returns (float32 array, info dict)."""
    x = np.asarray(x, dtype=np.float64)
    x = x / (np.abs(x).max() + 1e-9) * 10 ** (-6 / 20)  # common headroom before the chain
    has_air = band_db(x, 10000, 16000) - band_db(x, 1000, 4000) > -45
    fx = [HighpassFilter(cutoff_frequency_hz=70)]
    if not light:
        fx += [PeakFilter(cutoff_frequency_hz=150, gain_db=3.0, q=0.8),   # proximity warmth
               PeakFilter(cutoff_frequency_hz=400, gain_db=-2.0, q=1.2)]  # de-box
    fx += [PeakFilter(cutoff_frequency_hz=4000, gain_db=3.0, q=0.9)]      # presence
    if has_air:
        fx += [HighShelfFilter(cutoff_frequency_hz=10000, gain_db=2.0, q=0.7)]
    y = Pedalboard(fx)(x.astype(np.float32)[None, :], SR)[0].astype(np.float64)
    y, gr = deess(y)
    # compressor: 3:1, 15 ms attack lets consonants through, threshold relative to the signal
    rms = 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-9)
    comp = Pedalboard([Compressor(threshold_db=rms + 2, ratio=3.0, attack_ms=15, release_ms=150),
                       Gain(gain_db=4.0),
                       Limiter(threshold_db=-1.5, release_ms=100)])
    y = comp(y.astype(np.float32)[None, :], SR)[0]
    return y, {"air_shelf": bool(has_air), "deess_max_gr_db": round(gr, 1), "light": light}


def run(inp, out, light=False):
    y, info = process(load48(inp), light)
    sf.write(out, y, SR, subtype="PCM_24")
    return info


if __name__ == "__main__":
    info = run(sys.argv[1], sys.argv[2], "--light" in sys.argv)
    print(json.dumps(info))
