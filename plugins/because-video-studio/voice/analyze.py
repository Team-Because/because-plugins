"""Band measurements of one or more files against a reference (the shootout's analyze.py bands).

Every file is loudness-matched to -16 LUFS first, so the louder file does not win by default.
Columns are dB vs the reference (positive = more energy than the reference):
  >6k  >10k  (air / top end)   100-250 (chest, proximity)   300-500 (box)   3-5k (presence)
  6-9k (sibilance)   gap = speech-to-pause gap (95th minus 10th percentile of 30 ms frames)

usage: analyze.py <reference.wav> <file.wav> [<file2.wav> ...]
"""
import os
import sys
import numpy as np
import pyloudnorm as pyln
from scipy.signal import stft

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sync import load48, SR  # noqa: E402

BANDS = [(">6k", 6000, 24000), (">10k", 10000, 24000), ("100-250", 100, 250), ("300-500", 300, 500),
         ("3-5k", 3000, 5000), ("6-9k", 6000, 9000)]


def lufs16(x):
    m = pyln.Meter(SR)
    return x * 10 ** ((-16 - m.integrated_loudness(x)) / 20)


def frames_db(x, hop=480, win=1440):
    k = (len(x) - win) // hop
    idx = np.arange(win)[None] + hop * np.arange(k)[:, None]
    return 10 * np.log10((x[idx] ** 2).mean(1) + 1e-12)


def measure(x, n):
    f, _, Z = stft(x[:n], SR, nperseg=2048, noverlap=1536)
    P = np.abs(Z) ** 2
    out = {name: 10 * np.log10(P[(f >= lo) & (f < hi)].sum(0).mean() + 1e-20) for name, lo, hi in BANDS}
    d = frames_db(x[:n])
    out["gap"] = float(np.percentile(d, 95) - np.percentile(d, 10))
    return out


def compare(ref, files):
    sig = [lufs16(load48(p)) for p in [ref] + files]
    n = min(len(s) for s in sig)
    base = measure(sig[0], n)
    rows = []
    for p, s in zip(files, sig[1:]):
        m = measure(s, n)
        row = {k: round(m[k] - base[k], 1) for k, _, _ in BANDS}
        row["gap"] = round(m["gap"], 1)
        rows.append((os.path.basename(p), row))
    return round(base["gap"], 1), rows


if __name__ == "__main__":
    g0, rows = compare(sys.argv[1], sys.argv[2:])
    print(f"reference gap {g0} dB")
    for name, r in rows:
        print(name[:40].ljust(40), "  ".join(f"{k} {v:+.1f}" if k != "gap" else f"gap {v}" for k, v in r.items()))
