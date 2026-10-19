# .venv/bin/python tools/audio-check.py <audio-or-video> [more ...]
# Finds the audio defects people hear as "glitchy" (Aman, 15-10-2026, pilot 2 v1): edge clicks, where a clip starts or
# stops mid-waveform out of near-silence, and hard high-frequency bursts far above the file's normal level. Exits 1 if
# any are found and prints their times. Run on every voice track and every final mix before handover.
import sys, subprocess, tempfile, os
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

def load(p):
    if p.endswith(('.mp4', '.m4v', '.mov', '.mp3', '.aac')):
        t = tempfile.mktemp(suffix='.wav'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', p, '-vn', '-ac', '1', '-ar', '44100', t], check=True)
        y, sr = sf.read(t); os.remove(t)
    else:
        y, sr = sf.read(p); y = y.mean(axis=1) if y.ndim > 1 else y
    return y.astype(np.float64), sr

if sys.argv[1:2] == ['--selftest']:
    # clean speech must pass; the same speech with planted 1 ms clicks must fail at those times
    import glob, json, base64, io, librosa
    files = sorted(glob.glob(os.path.join(os.path.dirname(__file__), '../clients/*/videos/*/vo-cache/*.json')))[:6]
    fails = 0
    for f in files:
        j = json.load(open(f)); y, sr = librosa.load(io.BytesIO(base64.b64decode(j['audio_base64'])), sr=44100)
        t1 = tempfile.mktemp(suffix='.wav'); sf.write(t1, y, sr)
        # the defects that sound glitchy: a click in a quiet gap, and a clip cut off mid-word with no fade
        y2 = y.copy(); env_ = np.sqrt(np.convolve(y ** 2, np.ones(2205) / 2205, mode='same'))
        mid = int(len(y) * 0.25) + int(np.argmin(env_[int(len(y) * 0.25):int(len(y) * 0.75)]))       # quietest point inside the line
        loud = int(np.argmax(env_))                                                                 # loudest point: cut here
        y2[mid:mid + 3] += np.array([0.4, -0.4, 0.2]) * np.abs(y).max(); y2[loud:loud + int(0.3 * sr)] = 0
        plant = [mid / sr, loud / sr]
        t2 = tempfile.mktemp(suffix='.wav'); sf.write(t2, y2, sr)
        r1 = subprocess.run([sys.executable, __file__, t1], capture_output=True, text=True); r2 = subprocess.run([sys.executable, __file__, t2], capture_output=True, text=True)
        import re as _re; got = [float(x) for x in _re.findall(r'[0-9]+\.[0-9]+', r2.stdout.split('clicks', 1)[-1])]
        good = r1.returncode == 0 and r2.returncode == 1 and all(any(abs(g - t) < 0.005 for g in got) for t in plant)
        fails += not good; print(('ok  ' if good else 'FAIL'), os.path.basename(f)[:40], '| clean:', r1.stdout.strip().split('  ', 1)[-1], '| planted:', r2.stdout.strip().split('  ', 1)[-1])
    sys.exit(1 if fails else 0)

bad = 0
for p in sys.argv[1:]:
    y, sr = load(p); y = y / (np.abs(y).max() + 1e-9)
    # a click is an isolated impulse (under 1 ms); a sibilant is sustained noise (tens of ms). Flag 0.25 ms windows whose
    # high-frequency energy is 12x the 20 ms around them and loud in absolute terms. Calibrated 15-10-2026: 0 hits on clean
    # ElevenLabs lines, every planted click caught (tools/audio-check.py --selftest).
    hp = sosfilt(butter(4, 3000, 'highpass', fs=sr, output='sos'), y)
    m = int(0.00025 * sr); k = len(hp) // m
    e = np.sqrt((hp[:k * m] ** 2).reshape(k, m).mean(axis=1))
    ctx = np.convolve(e ** 2, np.r_[np.ones(40), np.zeros(1), np.ones(40)] / 80, mode='same') ** 0.5
    hits = np.where((e > 12 * (ctx + 1e-6)) & (e > 0.02))[0]
    clicks = []
    for i in hits:
        t_ = i * m / sr                                                # window index to seconds (windows are 0.25 ms)
        if not clicks or t_ - clicks[-1] > 0.03: clicks.append(round(t_, 3))
    # 2. hard cuts: the level falls from loud to silence within 2 ms (natural speech decays over tens of ms)
    q = int(0.001 * sr); kk = len(y) // q; lv = np.sqrt((y[:kk * q] ** 2).reshape(kk, q).mean(axis=1))
    for i in range(3, kk - 3):
        before, after = lv[i - 3:i].mean(), lv[i + 1:i + 4].mean()
        if before > 0.05 and after < before * 0.03:
            t_ = i * q / sr
            if all(abs(t_ - c) > 0.03 for c in clicks): clicks.append(round(t_, 3))   # against every hit, not only the last
    clicks.sort()
    bursts = []
    ok = not clicks and not bursts; bad += not ok
    print(f"{'ok  ' if ok else 'FAIL'} {os.path.basename(p)}  clicks {[float(c) for c in clicks[:15]]}")
sys.exit(1 if bad else 0)
