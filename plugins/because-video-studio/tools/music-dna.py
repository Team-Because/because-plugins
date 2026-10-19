# .venv/bin/python tools/music-dna.py <audio> [--out <dir>]
# Measures a reference track so a sound-alike can be briefed and checked by numbers:
# tempo, key, brightness, low-end share, energy curve per second, biggest energy jump (the drop), onset density.
import sys, json, os, argparse
import numpy as np, librosa

ap = argparse.ArgumentParser(); ap.add_argument("track"); ap.add_argument("--out", default=None); a = ap.parse_args()
y, sr = librosa.load(a.track, sr=22050, mono=True)
dur = len(y) / sr
tempo = float(np.atleast_1d(librosa.beat.beat_track(y=y, sr=sr)[0])[0])
chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
maj = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]); mnr = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
scores = [(np.corrcoef(np.roll(maj, i), chroma)[0,1], names[i] + ' major') for i in range(12)] + [(np.corrcoef(np.roll(mnr, i), chroma)[0,1], names[i] + ' minor') for i in range(12)]
scores.sort(reverse=True)
S = np.abs(librosa.stft(y)); freqs = librosa.fft_frequencies(sr=sr)
centroid = float(librosa.feature.spectral_centroid(S=S, sr=sr).mean())
low = float(S[freqs < 150].sum() / S.sum()); high = float(S[freqs > 4000].sum() / S.sum())
rms = librosa.feature.rms(y=y)[0]; t = librosa.times_like(rms, sr=sr)
per_s = [round(float(20*np.log10(rms[(t >= s) & (t < s+1)].mean() + 1e-9)), 1) for s in range(int(np.ceil(dur)))]
diffs = np.diff(per_s); drop = int(np.argmax(diffs)) + 1 if len(diffs) else 0
onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time')
flat = float(librosa.feature.spectral_flatness(y=y).mean())
out = {"track": os.path.basename(a.track), "duration": round(dur, 2), "bpm": round(tempo, 1),
       "key": scores[0][1], "key_confidence": round(float(scores[0][0]), 2), "key_runner_up": scores[1][1],
       "brightness_hz": round(centroid), "low_end_share": round(low, 3), "high_share": round(high, 3),
       "noisiness": round(flat, 4), "onsets_per_s": round(len(onsets) / dur, 2),
       "energy_db_per_s": per_s, "biggest_rise_at_s": drop, "biggest_rise_db": round(float(diffs.max()), 1) if len(diffs) else 0}
if a.out:
    os.makedirs(a.out, exist_ok=True); json.dump(out, open(os.path.join(a.out, "music.json"), "w"), indent=1)
print(json.dumps(out))
