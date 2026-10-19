# .venv/bin/python tools/beats.py <song.wav|mp3> [--out <dir>] [--beats-per-bar 4]
# Measures a supplied track: tempo, every beat, downbeats, onset hits. Writes <dir>/beats.json in the same shape
# as tools/beatgrid.mjs (source: "track"), so the film code reads either. Course step 09, path 1.
# Beats are where state changes go, downbeats are big moments, hits are where SFX go.
import sys, json, os, argparse
import numpy as np, librosa

ap = argparse.ArgumentParser()
ap.add_argument("track")
ap.add_argument("--out", default=None)
ap.add_argument("--beats-per-bar", type=int, default=4)
a = ap.parse_args()

y, sr = librosa.load(a.track, sr=None, mono=True)
tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
beats = librosa.frames_to_time(frames, sr=sr)

# Phase check (not in the course script): librosa's onset strength favours bright sounds, so on a track with
# hi-hats between the kicks it can lock half a beat late. Compare low-end (kick) energy on the beats with the
# half-beat positions and shift the grid if the kicks sit in between.
low = librosa.onset.onset_strength(y=y, sr=sr, fmax=200, n_mels=8)
def low_at(times):
    f = librosa.time_to_frames(times, sr=sr)
    f = f[(f >= 0) & (f < len(low))]
    return float(np.mean([low[max(0, i - 2):i + 3].max() for i in f])) if len(f) else 0.0
period = 60.0 / float(np.atleast_1d(tempo)[0])
on, off = low_at(beats), low_at(beats - period / 2)
shifted = off > 1.5 * on
if shifted:
    beats = beats - period / 2
    beats = beats[beats >= 0]
beats = beats.round(3).tolist()

onset = librosa.onset.onset_strength(y=y, sr=sr)
peaks = librosa.util.peak_pick(onset, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=0.5, wait=10)

out = {
    "bpm": round(float(np.atleast_1d(tempo)[0]), 2),
    "source": "track",
    "track": os.path.basename(a.track),
    "beatsPerBar": a.beats_per_bar,
    "beats": beats,                                   # state changes go here
    "downbeats": beats[:: a.beats_per_bar],           # big moments (assumes the first beat is a downbeat: check by ear)
    "hits": librosa.frames_to_time(peaks, sr=sr).round(3).tolist(),  # SFX go here
    "duration": round(len(y) / sr, 3),
    "phase": "shifted half a beat to the kicks" if shifted else "on the kicks",
    "kickRatio": round(max(on, off) / max(min(on, off), 1e-9), 2),  # low-end energy on the final beats vs between them; > 1.5 = confident, near 1 = check by ear
}
out_dir = a.out or os.path.dirname(os.path.abspath(a.track))
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(out_dir, "beats.json"), "w") as f:
    json.dump(out, f, indent=1)
print(f"{out['bpm']} BPM ({out['phase']}, kick ratio {out['kickRatio']}), {len(beats)} beats, {len(out['hits'])} hits, {out['duration']} s -> {os.path.join(out_dir, 'beats.json')}")
