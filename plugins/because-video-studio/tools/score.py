# .venv/bin/python tools/score.py --style cine|fusion|santoor|pulse --out file.wav
#   [--dur 20 --note 0.25 --start 1.0 --groove 3.0 --build 8.0 --stop 15.0 --formed 17.0 --key 58]
# Synthesizes a montage score in code (numpy/scipy, seeded: same args, same file), shaped like a match-cut film:
# silent hook, soft intro, groove, build, a hard stop where the hero appears, soft notes while it forms, ring out.
# Every hit sits on the --note grid, so cuts placed on that grid land on the music. No samples, no model, no licence.
# Built for a festive reel (09-10-2026) as the free alternative to ElevenLabs; styles:
#   cine     reference-like: ticks, plucked ostinato, strings swelling, stop, celesta
#   fusion   Garba: dhol + dandiya + plucks, strings in the build, stop, shehnai note
#   santoor  santoor tremolo + tabla + tanpura, strings in the build, stop, santoor ring
#   pulse    electronic: synth pluck, sub kick, metallic hits in the build, stop, warm chord
import argparse
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, lfilter, fftconvolve

SR = 48000
ap = argparse.ArgumentParser()
ap.add_argument('--style', default='cine', choices=['cine', 'fusion', 'santoor', 'pulse'])
ap.add_argument('--out', required=True)
for k, v in dict(dur=20.0, note=0.25, start=1.0, groove=3.0, build=8.0, stop=15.0, formed=17.0).items():
    ap.add_argument('--' + k, type=float, default=v)
ap.add_argument('--key', type=int, default=58)          # MIDI root, 58 = A#/Bb (the reference sits around Bb minor)
a = ap.parse_args()
rng = np.random.default_rng(2026)
N = int((a.dur + 2) * SR)
L, R = np.zeros(N), np.zeros(N)
Q = a.note                                               # one grid step

def at(t): return int(round(t * SR))
def tt(sec): return np.arange(int(sec * SR)) / SR
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'bandpass', fs=SR, output='sos'), x)
def lp(x, f): return sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)
def hp(x, f): return sosfilt(butter(2, f, 'highpass', fs=SR, output='sos'), x)
def mtof(m): return 440 * 2 ** ((m - 69) / 12)
def put(x, t, g=1.0, pan=0.0):
    i = at(t); j = min(N, i + len(x))
    if 0 <= i < N and j > i:
        L[i:j] += x[:j - i] * g * np.sqrt(0.5 * (1 - pan)); R[i:j] += x[:j - i] * g * np.sqrt(0.5 * (1 + pan))
def grid(t0, t1, step):
    return [t0 + k * step for k in range(int(round((t1 - t0) / step)))]

# ---- voices ----
def ks(f, dur=1.6, bright=0.995, cut=5000):              # Karplus-Strong pluck
    n = max(2, int(SR / f)); x = np.zeros(int(dur * SR)); x[:n] = rng.uniform(-1, 1, n)
    den = np.zeros(n + 2); den[0] = 1; den[n] = -bright / 2; den[n + 1] = -bright / 2
    return lp(lfilter([1], den, x), cut)
def tick(): t = tt(0.05); return np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.008)
def bell(f, dur=3.0):
    t = tt(dur); return sum(g * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, g, d in [(1, 1, 1.6), (2.76, 0.35, 0.6), (5.4, 0.15, 0.25), (8.9, 0.06, 0.1)])
def kick(): t = tt(0.5); return np.sin(2 * np.pi * np.cumsum(45 + 90 * np.exp(-t / 0.03)) / SR) * np.exp(-t / 0.16)
def clap():
    t = tt(0.25); return bp(rng.standard_normal(len(t)), 900, 5000) * (np.exp(-t / 0.05) + 0.6 * np.exp(-((t - 0.012) ** 2) / 1e-6))
def hat(): t = tt(0.06); return hp(rng.standard_normal(len(t)), 7000) * np.exp(-t / 0.012)
def membrane(f0, drop, dk, modes, dur, nb=None, ng=0.0):
    t = tt(dur); f = f0 * (1 + drop * np.exp(-t / 0.035)); ph = 2 * np.pi * np.cumsum(f) / SR
    y = sum(g * np.sin(ph * r) * np.exp(-t / (dk * d)) for r, g, d in modes)
    if nb: y += ng * bp(rng.standard_normal(len(t)), *nb) * np.exp(-t / 0.012)
    return y
def dha(): return membrane(68, 0.9, 0.38, [(1, 1, 1), (1.59, 0.35, 0.45), (2.14, 0.15, 0.3)], 1.0, (150, 1800), 0.5)
def tin(): return membrane(330, 0.12, 0.11, [(1, 0.6, 1), (1.59, 0.45, 0.8), (2.14, 0.3, 0.6), (2.65, 0.2, 0.5)], 0.4, (1800, 6000), 0.7)
def tabla(hi=True): return membrane(380 if hi else 95, 0.05 if hi else 0.6, 0.22 if hi else 0.3, [(1, 1, 1), (2, 0.5, 0.7), (3, 0.3, 0.5), (4, 0.2, 0.4)], 0.6, (2000, 6000), 0.3)
def stick():
    t = tt(0.1); w = 0.8 * np.sin(2 * np.pi * 1150 * t) * np.exp(-t / 0.028) + 0.5 * np.sin(2 * np.pi * 2380 * t) * np.exp(-t / 0.015)
    return w + bp(rng.standard_normal(len(t)), 1500, 5200) * np.exp(-t / 0.008) * 0.9
def metal(dur=0.8):
    t = tt(dur); return sum(g * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, g, d in [(523, 1, 0.5), (1371, 0.7, 0.3), (2210, 0.5, 0.2), (3530, 0.3, 0.12)])
def synth_pluck(f, dur=0.5):
    t = tt(dur); saw = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 14))
    cutoff = 400 + 4000 * np.exp(-t / 0.06)
    y = np.zeros_like(saw); z = 0.0; c = np.exp(-2 * np.pi * cutoff / SR)
    for i in range(len(saw)): z = (1 - c[i]) * saw[i] + c[i] * z; y[i] = z
    return y * np.exp(-t / 0.18)
def pad(notes, t0, t1, bright0=300, bright1=3500):    # string ensemble: detuned saws, filter opening across the span
    t = tt(t1 - t0); y = np.zeros(len(t))
    for m in notes:
        for d in (-0.08, 0.0, 0.07):
            f = mtof(m + d); y += sum(np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6)) / k for k in range(1, 10))
    env = np.clip(t / 1.2, 0, 1)
    y = lp(y, bright0) * (1 - t / (t1 - t0)) + lp(y, bright1) * (t / (t1 - t0))
    return y * env / len(notes)
def reed(m, dur, flute=False):
    t = tt(dur); f = mtof(m) * (1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t * 2, 0, 1)); ph = 2 * np.pi * np.cumsum(f) / SR
    saw = sum(np.sin(k * ph) / k for k in range(1, 16))
    y = (np.sin(ph) + 0.15 * np.sin(2 * ph)) if flute else (0.9 * bp(saw, 700, 1500) + 0.6 * bp(saw, 2200, 3400))
    env = np.clip(t / 0.08, 0, 1) * np.clip((dur - t) / 1.2, 0, 1); return y * env
def drone(m, dur):
    y = np.zeros(int(dur * SR))
    for i, t0 in enumerate(np.arange(0, dur, 1.0)):
        p = ks(mtof([m - 5, m + 12, m + 12, m][i % 4] - 12), dur=3.0, bright=0.997, cut=3500); j = at(t0)
        y[j:j + len(p)] += p[:len(y) - j]
    return y

# ---- harmony: minor key i - VI - III - VII, one chord per two bars of 8 grid steps ----
k = a.key
CH = [[k, k + 3, k + 7], [k - 4, k, k + 3], [k + 3, k + 7, k + 10], [k - 2, k + 2, k + 5]]
def chord_at(t): return CH[int(max(0, t - a.start) // (16 * Q)) % 4]
ARP = [0, 1, 2, 1, 2, 0, 1, 2]                          # ostinato shape over chord tones, octave up on the second half

S = a.style
# intro: ticks or soft single notes on the grid
for t in grid(a.start, a.groove, Q):
    if S in ('cine', 'pulse'): put(tick(), t, 0.12, rng.uniform(-0.3, 0.3))
    elif S == 'fusion': put(stick(), t, 0.15 if (round((t - a.start) / Q) % 2 == 0) else 0.07, 0.3)
for t in grid(a.start, a.groove, 2 * Q):
    m = chord_at(t)[0] + 12
    put(bell(mtof(m + 12), 1.5) if S != 'santoor' else ks(mtof(m + 12), 2.0, 0.997, 7000), t, 0.12, -0.2)
if S == 'santoor': put(drone(k, a.stop - a.start), a.start, 0.10)

# groove and build: ostinato on every grid step
for i, t in enumerate(grid(a.groove, a.stop, Q)):
    c = chord_at(t); m = c[ARP[i % 8]] + (12 if i % 16 >= 8 else 0) + 12
    build = t >= a.build; u = (t - a.build) / (a.stop - a.build) if build else 0
    if S == 'cine': put(ks(mtof(m), 1.4, 0.994, 6000), t, 0.30 + 0.15 * u, -0.25 if i % 2 else 0.25)
    elif S == 'fusion': put(ks(mtof(m), 1.2, 0.993, 5000), t, 0.22 + 0.1 * u, 0.2)
    elif S == 'santoor':
        for d in (0, 0.03): put(ks(mtof(m + 12), 1.6, 0.997, 8000), t + d, 0.18 + 0.08 * u, -0.2)
    elif S == 'pulse': put(synth_pluck(mtof(m)), t, 0.25 + 0.15 * u, -0.2 if i % 2 else 0.2)
    pos = i % 8
    if S == 'cine':
        if pos in (0, 4): put(kick(), t, 0.35 + 0.35 * u)
        if build and pos in (2, 6): put(clap(), t, 0.10 + 0.15 * u, 0.1)
        if t >= a.build + 2: put(hat(), t, 0.06 + 0.06 * u, 0.4); put(hat(), t + Q / 2, 0.04 + 0.05 * u, 0.4)
    elif S == 'fusion':
        if pos in (0, 3, 6): put(dha(), t, 0.55 + 0.3 * u)
        if pos in (2, 5, 7): put(tin(), t, 0.35 + 0.2 * u, -0.1)
        if pos in (0, 4): put(stick(), t, 0.25 + 0.15 * u, -0.4 if pos else 0.4)
        if build: put(tin(), t + Q / 2, 0.15 + 0.25 * u, 0.1)
    elif S == 'santoor':
        if pos in (0, 3, 6): put(tabla(False), t, 0.45 + 0.25 * u)
        put(tabla(True), t + (Q / 2 if build else 0), 0.18 + 0.15 * u, 0.15)
    elif S == 'pulse':
        if pos in (0, 2, 4, 6): put(kick(), t, 0.5 + 0.3 * u)
        if build and pos in (3, 7): put(metal(), t, 0.10 + 0.12 * u, 0.3)
        if t >= a.build + 2: put(hat(), t + Q / 2, 0.08, -0.4)
# strings swelling through the build (all but pulse), the last two steps an upward rush
if S != 'pulse':
    for t0 in np.arange(a.build, a.stop, 16 * Q):
        t1 = min(a.stop, t0 + 16 * Q); put(pad([m + 12 for m in chord_at(t0)], t0, t1, 400 + 300 * (t0 - a.build), 4000), t0, 0.10 + 0.05 * (t0 - a.build) / (a.stop - a.build))
else:
    t = tt(a.stop - a.build); bass = np.sin(2 * np.pi * mtof(k - 24) * t) * np.clip(t / 0.5, 0, 1)
    put(lp(np.sign(bass) * np.abs(bass) ** 0.7, 300), a.build, 0.18)

# the hard stop: nothing rings past it (picture: the hero appears here)
cut = at(a.stop); fade = at(0.03); L[cut - fade:cut] *= np.linspace(1, 0, fade); R[cut - fade:cut] *= np.linspace(1, 0, fade)
L[cut:] = 0; R[cut:] = 0
# after the stop: a soft low hit, single notes while it forms, the resolving chord on `formed`
put(kick(), a.stop, 0.22); put(ks(mtof(k - 12), 2.0, 0.998, 1500), a.stop, 0.13)
for j, (dt, m) in enumerate([(0.5, k + 19), (1.0, k + 15), (1.5, k + 12)]):
    v = bell(mtof(m), 2.5) if S in ('cine', 'pulse') else ks(mtof(m), 2.5, 0.998, 7000)
    put(v, a.stop + dt, 0.16, [-0.3, 0.3, 0][j])
for m in [k, k + 7, k + 12, k + 15]:
    if S == 'fusion': put(reed(k + 12, a.dur - a.formed), a.formed, 0.05); break
    put(bell(mtof(m + 12), 3.5) if S != 'santoor' else ks(mtof(m + 12), 3.5, 0.998, 7000), a.formed, 0.10)

# space and master
irn = int(1.4 * SR); ir_t = np.arange(irn) / SR
for ch in (0, 1):
    ir = lp(rng.standard_normal(irn) * np.exp(-ir_t / 0.4), 6000); ir /= np.sqrt(np.sum(ir ** 2))
    sig = L if ch == 0 else R; wet = fftconvolve(sig, ir)[:N] * 0.22
    if ch == 0: L = sig + wet
    else: R = sig + wet
mix = np.stack([L, R], 1)[:int(a.dur * SR)]
mix = hp(mix.T, 30).T; mix[-at(0.5):] *= np.linspace(1, 0, at(0.5))[:, None]
mix /= np.max(np.abs(mix)) / 0.89
sf.write(a.out, mix, SR, subtype='PCM_24')
print(f'{a.out}  {a.style}  {a.dur:.0f}s  grid {Q}s  stop {a.stop}s  formed {a.formed}s')
