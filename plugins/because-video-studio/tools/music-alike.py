# .venv/bin/python tools/music-alike.py <video-dir> --ref <ref-folder> --dur <s> [--n 4]
# A licensed sound-alike of a reference's music (ElevenLabs Music), chosen by measurement and fitted to the reference:
#   prompt  <video>/docs/music-brief.txt (what the music sounds like, written by a listening model) + measured tempo and key
#   score   tempo (only when the reference has a steady beat), key (only when the reference's key is strong), energy shape
#           over time vs the reference, no early fade-out (text-to-music often ends early; 4 of 4 did on 15-10-2026)
#   align   the biggest rise (the drop) moved onto the reference's; with a steady grid, warped beat by beat onto its beats
#   finish  two-pass loudnorm to -14 LUFS, true peak -2 dB, so mux.mjs never has to raise it
# Writes music.wav and docs/music.json. ElevenLabs first; with no credit it stops and says to use FAL from a Claude session.
import os, sys, json, subprocess, urllib.request, warnings
import numpy as np, librosa, soundfile as sf
from scipy.signal import resample
warnings.filterwarnings('ignore')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from paths import env
KEY = env('ELEVEN_LABS_API_KEY')
vd = sys.argv[1]; a = sys.argv[2:]
ref = a[a.index('--ref') + 1]; DUR = float(a[a.index('--dur') + 1]); N = int(a[a.index('--n') + 1]) if '--n' in a else 4
SR = 44100
dna = json.load(open(os.path.join(ref, 'dna', 'dna.json'))); m = dna['music']; grid = dna.get('grid') or {}
steady = grid.get('status') in ('confirmed', 'disputed') and grid.get('span_share', 0) >= 0.5
bpm = grid.get('bpm_beat_this') if steady else None
brief = open(os.path.join(vd, 'docs', 'music-brief.txt')).read().strip() if os.path.exists(os.path.join(vd, 'docs', 'music-brief.txt')) else 'Premium modern instrumental.'
prompt = (brief + (f' {bpm:.0f} BPM.' if bpm else ' Free time, no steady beat.') + (f" Key of {m['key']}." if m.get('key_confidence', 0) >= 0.5 else '')
          + ' Instrumental, no vocals. Premium and modern, nothing childish, playful or plucky. Steady to the very end, no early fade-out.')
from beat_this.inference import File2Beats
f2b = File2Beats(checkpoint_path='final0', device='cpu', dbn=False)
refE = np.array(m['energy_db_per_s'], float); refE[refE < -90] = -90

def generate(path):
    body = {'prompt': prompt[:2000], 'music_length_ms': int((DUR + 4) * 1000), 'model_id': 'music_v1'}
    req = urllib.request.Request('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192', data=json.dumps(body).encode(),
                                 headers={'xi-api-key': KEY, 'Content-Type': 'application/json'})
    open(path, 'wb').write(urllib.request.urlopen(req, timeout=300).read())

def rise(db, t, lo=0.5, hi=None):
    j = np.convolve(np.diff(db), np.ones(3), mode='same'); w = (t[1:] > lo) & (t[1:] < (hi or t[-1]))
    i = int(np.argmax(np.where(w, j, -1e9))); return float(t[i + 1]), float(j[i])

def measure(path):
    y, sr = librosa.load(path, sr=22050, mono=True)
    db = 20 * np.log10(librosa.feature.rms(y=y, hop_length=2205)[0] + 1e-9); t = np.arange(len(db)) / 10
    b, d = f2b(path); b, d = np.array(b), np.array(d)
    cb = 60 / float(np.median(np.diff(b))) if len(b) > 2 else 0
    s = {'file': path, 'bpm': round(cb, 1)}
    s['tempo_off'] = round(min(abs(cb - bpm), abs(cb / 2 - bpm), abs(cb * 2 - bpm)), 1) if bpm else 0
    per_s = np.array([db[(t >= k) & (t < k + 1)].mean() for k in range(int(min(DUR, t[-1])))])
    L = min(len(per_s), len(refE)); s['shape_r'] = round(float(np.corrcoef(per_s[:L], refE[:L])[0, 1]), 2) if L > 3 and per_s[:L].std() > 0.3 and refE[:L].std() > 0.3 else 0.0
    s['early_fade'] = bool(np.median(db[(t > DUR * 0.6) & (t < DUR)]) < np.median(db[(t > 1) & (t < DUR * 0.6)]) - 12)
    s['drop_s'], s['drop_db'] = rise(db, t, 0.5, DUR)
    s['first_downbeat_after_drop'] = float(d[d >= s['drop_s'] - 0.15][0]) if np.any(d >= s['drop_s'] - 0.15) else s['drop_s']
    s['penalty'] = round(2 * s['tempo_off'] + 10 * (1 - s['shape_r']) + (25 if s['early_fade'] else 0), 1)
    return s

if not KEY: sys.exit('ElevenLabs key missing: run setup again to add it')
os.makedirs(os.path.join(vd, 'music-candidates'), exist_ok=True); res = []
for i in range(N):
    p = os.path.join(vd, 'music-candidates', f'cand-{i + 1}.mp3')
    if not os.path.exists(p):
        try: generate(p)
        except urllib.error.HTTPError as e: sys.exit(f'ElevenLabs music failed ({e.code}): if it is credit, run the FAL (Suno) fallback from a Claude session')
    s = measure(p); res.append(s); print(os.path.basename(p), {k: v for k, v in s.items() if k != 'file'})
best = min(res, key=lambda r: r['penalty'])
y, _ = librosa.load(best['file'], sr=SR, mono=False); y = y if y.ndim > 1 else np.stack([y, y])
refT = np.arange(len(refE)); ref_drop, ref_rise = (refT[1:][np.argmax(np.diff(refE))] if len(refE) > 2 else 0), (np.diff(refE).max() if len(refE) > 2 else 0)
if steady:
    rate = best['bpm'] / bpm if abs(best['bpm'] - bpm) <= abs(best['bpm'] / 2 - bpm) else best['bpm'] / 2 / bpm
    if abs(rate - 1) > 0.003: y = np.stack([librosa.effects.time_stretch(c, rate=rate) for c in y])
    rd = np.array(grid['downbeats']); target = float(rd[rd >= ref_drop - 0.2][0]) if ref_rise > 8 and np.any(rd >= ref_drop - 0.2) else float(rd[0])
    shift = best['first_downbeat_after_drop'] / rate - target
else:
    # free-time music: align a drop only when both tracks have one and the move is small. A 10 dB lift late in a voice reel
    # is not a drop; shifting the candidate's intro onto it padded 11.8 s of silence (reel-contrast-v3, 15-10-2026)
    shift = (best['drop_s'] - float(ref_drop)) if ref_rise > 12 and best['drop_db'] > 12 and abs(best['drop_s'] - float(ref_drop)) < 3 else 0.0
assert abs(shift) < 3, f'music shift {shift:.1f} s is not plausible'
k = int(shift * SR); y = y[:, k:] if k >= 0 else np.pad(y, ((0, 0), (-k, 0)))
y = y[:, :int(DUR * SR)]; y = np.pad(y, ((0, 0), (0, max(0, int(DUR * SR) - y.shape[1]))))
tmp = os.path.join(vd, '.music-tmp.wav'); sf.write(tmp, y.T.astype(np.float32), SR)
if steady:                                                           # warp beat by beat onto the reference's beats
    ours = np.array(f2b(tmp)[0]); rb = np.array(grid['beats'])
    pairs = [(r, ours[np.argmin(abs(ours - r))]) for r in rb if len(ours) and np.min(abs(ours - r)) < 0.12]
    src = np.array([0.0] + [o for _, o in pairs] + [DUR]); dst = np.array([0.0] + [r for r, _ in pairs] + [DUR])
    keep = np.concatenate([[True], np.diff(src) > 0.05]) & np.concatenate([[True], np.diff(dst) > 0.05]); src, dst = src[keep], dst[keep]
    parts = [resample(y[:, int(src[i] * SR):int(src[i + 1] * SR)], max(1, int(round((dst[i + 1] - dst[i]) * SR))), axis=1) for i in range(len(src) - 1)]
    y = np.concatenate(parts, axis=1)[:, :int(DUR * SR)]
y[:, :int(0.02 * SR)] *= np.linspace(0, 1, int(0.02 * SR)); y[:, -int(0.4 * SR):] *= np.linspace(1, 0, int(0.4 * SR))
y /= np.abs(y).max() / 0.89; sf.write(tmp, y.T.astype(np.float32), SR)
st = subprocess.run(['ffmpeg', '-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-14:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
st = json.loads(st[st.rindex('{'):st.rindex('}') + 1])
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', f"loudnorm=I=-14:TP=-2:LRA=11:measured_I={st['input_i']}:measured_TP={st['input_tp']}:measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true",
                '-ar', str(SR), os.path.join(vd, 'music.wav')], check=True); os.remove(tmp)
# clicks inside generated music (cand-3 had one at 7.28 s, 15-10-2026): find them with tools/audio-check.py and smooth each
# over 3 ms; a click that survives fails the run
def clicks_in(path):
    r = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'audio-check.py'), path], capture_output=True, text=True)
    import re as _re; return [float(x) for x in _re.findall(r'[0-9]+\.[0-9]+', r.stdout.split('clicks', 1)[-1])]
mw = os.path.join(vd, 'music.wav'); fixed = []
for _ in range(2):
    cl = clicks_in(mw)
    if not cl: break
    y2, sr2 = sf.read(mw); y2 = y2 if y2.ndim > 1 else y2[:, None]
    for t in cl:
        i = int(t * sr2); a, b = max(0, i - int(0.003 * sr2)), min(len(y2) - 1, i + int(0.003 * sr2))
        for ch in range(y2.shape[1]): y2[a:b, ch] = np.linspace(y2[a, ch], y2[b, ch], b - a)
        fixed.append(t)
    sf.write(mw, y2 if y2.shape[1] > 1 else y2[:, 0], sr2)
left = clicks_in(mw)
if left: sys.exit(f'music still clicks at {left} after smoothing: pick another candidate (delete it and re-run)')
json.dump({'prompt': prompt, 'steady_grid': steady, 'clicks_smoothed': fixed, 'chosen': best, 'candidates': res, 'shift_s': round(shift, 3)}, open(os.path.join(vd, 'docs', 'music.json'), 'w'), indent=1)
print('chosen', os.path.basename(best['file']), 'penalty', best['penalty'], 'shift', round(shift, 2))
