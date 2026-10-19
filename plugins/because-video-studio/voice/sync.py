"""Lip-sync check: how far the speech envelope of B sits from A, globally and in windows.

Method (from the shootout's drift.py): 300-4000 Hz band, 1 ms energy envelope smoothed over 10 ms,
log scale, best Pearson lag in +-150 ms. Positive lag = B is LATE. Video lip sync starts to show at
roughly 45 ms early or 125 ms late; this skill warns at 20 ms.

usage: sync.py <reference.wav> <candidate.wav> [--win 5]
"""
import argparse
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt, resample_poly

SR = 48000
H = 48  # 1 ms hop at 48 kHz
_BP = butter(4, [300, 4000], btype="band", fs=SR, output="sos")


def env(x):
    x = sosfiltfilt(_BP, np.asarray(x, dtype=np.float64)) ** 2
    k = len(x) // H
    e = x[:k * H].reshape(k, H).mean(1)
    e = np.convolve(e, np.ones(10) / 10, "same")
    return np.log10(e + 1e-10)


def lag(a, b, M=150):
    """Best lag in ms (positive = b late) and its correlation."""
    best, bl = -9.0, 0
    for l in range(-M, M + 1):
        if l >= 0:
            x, y = a[:len(a) - l], b[l:len(a)]
        else:
            x, y = a[-l:], b[:len(a) + l]
        if len(x) < 50 or x.std() == 0 or y.std() == 0:
            continue
        r = np.corrcoef(x, y)[0, 1]
        if r > best:
            best, bl = r, l
    return bl, float(best)


def check(ref, cand, win_s=5.0):
    """ref, cand: mono 48 kHz arrays. Returns dict with global lag and per-window lags.
    A window counts only when the reference has speech in it (envelope range > 1.5 decades)
    and the best correlation is at least 0.5; quiet or ambiguous windows are listed as None."""
    A = env(ref)
    B = env(cand)[:len(A)]
    if len(B) < len(A):
        B = np.concatenate([B, np.full(len(A) - len(B), B.min() if len(B) else -10.0)])
    g, gr = lag(A, B)
    W = int(win_s * 1000)
    wins = []
    for s in range(0, max(1, len(A) - W // 2), W):
        a, b = A[s:s + W], B[s:s + W]
        if len(a) < 1000 or np.percentile(a, 95) - np.percentile(a, 10) < 1.5:
            wins.append(None)
            continue
        l, r = lag(a, b)
        wins.append(l if r >= 0.5 else None)
    return {"global_ms": int(g), "global_r": round(gr, 3), "window_s": win_s, "windows_ms": wins}


def shift(x, ms):
    """ms > 0 delays the audio (moves it later), ms < 0 advances it. Length is kept."""
    n = int(round(ms / 1000 * SR))
    if n > 0:
        return np.concatenate([np.zeros(n, dtype=x.dtype), x[:len(x) - n]])
    if n < 0:
        return np.concatenate([x[-n:], np.zeros(-n, dtype=x.dtype)])
    return x


def load48(p):
    x, sr = sf.read(p, always_2d=True)
    x = x.mean(1)
    if sr != SR:
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g)
    return x


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("ref"); ap.add_argument("cand"); ap.add_argument("--win", type=float, default=5.0)
    a = ap.parse_args()
    r = check(load48(a.ref), load48(a.cand), a.win)
    w = [v for v in r["windows_ms"] if v is not None]
    print(r)
    if w:
        print(f"windows: min {min(w)} ms, max {max(w)} ms, spread {max(w) - min(w)} ms")
