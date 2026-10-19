# .venv/bin/python tools/ref-dna.py <reel-folder | video.mp4> [--out <dir>] [--audio <wav>] [--compare <reel-folder>]
#                                    [--no-voice] [--no-clip]
# Measures a reel so it can be rebuilt for a client shot for shot, and runs the SAME tests on our render.
# A reel folder holds ref.mp4 (yt-dlp); results go to <folder>/dna/. A single video writes to --out (default <dir>/dna-<name>/).
#
# Writes dna.json with:
#   video      size, fps, duration, cuts (hard cuts only)
#   music      tempo, key, brightness, bass share, loudness per second, drop (tools/music-dna.py), beat grid (tools/beats.py)
#   voice      word timings if someone speaks (npx hyperframes transcribe)
#   sync       which kind of sync the picture has, each tested against chance (L-154, check 7):
#                loudness-driven  picture motion follows the music's loudness (cross-correlation vs 200 shifted copies)
#                stepped          picture changes lock to the beat grid at 1, 1/2 or 1/4 beat (phase lock vs 400 random sets)
#                voice-led        picture changes land on word starts (median distance vs 400 random sets)
#                timeline-locked  no musical rule beats chance: the picture keeps its own timing, so our version copies the
#                                 reference's change frames exactly and --compare checks them within 1 frame
#   grid       two independent beat trackers (librosa and beat_this, CPJKU 2024): agree within 70 ms = confirmed;
#              disagree = beat_this's grid is used and the grid is marked disputed. Replaces the by-ear check.
#   beat-check.mp4 (reel folders only): the reel with a click and a flash on every beat of the chosen grid, for audit.
# Why the baselines: on a dense grid a +-2 frame window catches most random events (85% for eighth notes at 123 BPM),
# so a hit rate alone proves nothing. Calibrated 15-10-2026 on the posterkraft clip (loudness r 0.64, lag 0).
import sys, os, re, json, argparse, subprocess
import numpy as np, librosa, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__)); PY = sys.executable
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('--out'); ap.add_argument('--audio'); ap.add_argument('--compare')
ap.add_argument('--no-voice', action='store_true'); ap.add_argument('--no-clip', action='store_true')
# --stretch k: our film runs the reference's timeline k times slower (a longer script at the reference's speaking pace);
# --compare then scales the reference's change times and curves by k before matching
ap.add_argument('--stretch', type=float, default=1.0)
a = ap.parse_args()
folder = os.path.isdir(a.src)
vid = os.path.join(a.src, 'ref.mp4') if folder else a.src
if not os.path.exists(vid): sys.exit(f'missing video {vid}')
out = a.out or (os.path.join(a.src, 'dna') if folder else os.path.join(os.path.dirname(vid), 'dna-' + os.path.splitext(os.path.basename(vid))[0]))
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(154)
sh = lambda cmd: subprocess.run(cmd, capture_output=True, text=True)

# ---- video ----
probe = json.loads(sh(['ffprobe', '-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height,r_frame_rate:format=duration', '-of', 'json', vid]).stdout)
st = probe['streams'][0]; n_, d_ = st['r_frame_rate'].split('/'); fps = float(n_) / float(d_)
dur = float(probe['format']['duration']); W0, H0 = st['width'], st['height']
w = 96; h = max(2, int(round(w * H0 / W0 / 2)) * 2)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', vid, '-vf', f'scale={w}:{h},format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
fr = np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)
mov = np.concatenate([[0], np.abs(np.diff(fr, axis=0)).mean(axis=(1, 2))])          # picture motion per frame
big = np.concatenate([[0], (np.abs(np.diff(fr, axis=0)) > 40).mean(axis=(1, 2))])   # share of pixels that flipped
cuts = [round(i / fps, 3) for i in range(1, len(big)) if big[i] > 0.5]

# ---- audio ----
wav = a.audio
if not wav:
    wav = os.path.join(out, 'audio.wav')
    r = sh(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-vn', '-ac', '1', '-ar', '22050', wav])
    if r.returncode or not os.path.exists(wav): wav = None
music = beats = None
if wav:
    beats_dir = out
    sh([PY, os.path.join(HERE, 'beats.py'), wav, '--out', beats_dir])
    beats = json.load(open(os.path.join(beats_dir, 'beats.json')))
    music = json.loads(sh([PY, os.path.join(HERE, 'music-dna.py'), wav]).stdout or 'null')

# ---- grid: two independent trackers must agree, or the stronger one wins and the grid is marked disputed ----
grid = None
if wav and beats:
    lb = np.array(beats['beats']); bt = dn = None
    try:
        import warnings; warnings.filterwarnings('ignore')
        from beat_this.inference import File2Beats
        bt, dn = File2Beats(checkpoint_path='final0', device='cpu', dbn=False)(wav); bt, dn = np.array(bt), np.array(dn)
    except Exception as e:
        grid = {'status': 'single tracker (beat_this unavailable: ' + str(e)[:80] + ')', 'source': 'librosa', 'beats': lb.round(3).tolist(),
                'downbeats': beats.get('downbeats', [])}
    if bt is not None:
        def fmeasure(ref, est, tol=0.07):
            used = set(); hit = 0
            for r_ in ref:
                j = [k for k in range(len(est)) if k not in used and abs(est[k] - r_) <= tol]
                if j: used.add(j[0]); hit += 1
            P = hit / max(1, len(est)); R_ = hit / max(1, len(ref)); return 0 if hit == 0 else 2 * P * R_ / (P + R_)
        bpm_bt = 60 / float(np.median(np.diff(bt))) if len(bt) > 1 else None
        bpm_lb = 60 / float(np.median(np.diff(lb))) if len(lb) > 1 else None
        span = float((bt[-1] - bt[0]) / dur) if len(bt) > 1 else 0.0
        # a steady beat: at least 8 beats, over half the reel, at a tempo music actually uses
        steady = len(bt) >= 8 and span >= 0.5 and bpm_bt is not None and 60 <= bpm_bt <= 200
        base = {'bpm_beat_this': bpm_bt and round(bpm_bt, 1), 'bpm_librosa': bpm_lb and round(bpm_lb, 1),
                'steady_beat_span': [round(float(bt[0]), 2), round(float(bt[-1]), 2)] if len(bt) else None, 'span_share': round(span, 2)}
        if not steady:
            grid = {'status': 'no steady beat', 'source': None, **base, 'beats': [], 'downbeats': [],
                    'note': 'voice-over, ambient or free-time audio: no grid to sync to'}
        else:
            # compare only where beat_this hears a beat; librosa at double or half speed still counts as agreement
            lbw = lb[(lb >= bt[0] - 0.07) & (lb <= bt[-1] + 0.07)]
            dbl = np.sort(np.concatenate([bt, (bt[:-1] + bt[1:]) / 2]))
            fs = {'same': fmeasure(bt, lbw), 'double': fmeasure(dbl, lbw), 'half': max(fmeasure(bt[::2], lbw), fmeasure(bt[1::2], lbw))}
            how = max(fs, key=fs.get); F = fs[how]
            grid = {'status': 'confirmed' if F >= 0.8 else 'disputed', 'source': 'beat_this', 'agreement_f': round(F, 2),
                    'librosa_speed': how, **base, 'beats': bt.round(3).tolist(), 'downbeats': dn.round(3).tolist()}
            if F < 0.8 and len(lbw):
                off = float(np.median([x - bt[np.argmin(abs(bt - x))] for x in lbw]))
                half = 30 / bpm_bt
                grid['note'] = f'librosa sits {off:+.2f} s from beat_this (median)' + ('; that is half a beat, so librosa locked on the off-beats' if abs(abs(off) - half) < 0.06 else '') + (f'; tempo differs ({bpm_lb:.0f} vs {bpm_bt:.0f} BPM)' if bpm_lb and min(abs(bpm_lb - bpm_bt), abs(bpm_lb - 2 * bpm_bt), abs(2 * bpm_lb - bpm_bt)) > 3 else '')

# ---- voice ----
words = []
if wav and not a.no_voice:
    # word timings with faster-whisper (runs on Mac and Windows; the model downloads once on first use)
    try:
        from faster_whisper import WhisperModel
        segs, _ = WhisperModel('small', device='cpu', compute_type='int8').transcribe(wav, word_timestamps=True)
        ws = [w for s in segs for w in (s.words or [])]
        words = [{'w': w.word.strip(), 't': round(float(w.start), 3)} for w in ws]
        json.dump([{'text': w.word.strip(), 'start': w.start, 'end': w.end} for w in ws], open(os.path.join(out, 'transcript.json'), 'w'))
    except ImportError:
        print('voice timings skipped: faster-whisper is not installed (run setup)')

# ---- sync tests, each against chance ----
z = lambda x: (x - x.mean()) / (x.std() + 1e-9)
def xcorr(p, q, maxlag):
    m = min(len(p), len(q)); p, q = z(p[:m]), z(q[:m])
    return max((float(np.mean(p[max(0, L):m + min(0, L)] * q[max(0, -L):m - max(0, L)])), L) for L in range(-maxlag, maxlag + 1))
sync = {'tests': {}}
# picture-only measurements: computed for every file, with or without sound (a silent draft once reported 0 changes
# because these sat inside the audio branch, 15-10-2026)
# a change counts only when it stands out from the motion around it (continuous animation flips pixels every frame)
from scipy.signal import find_peaks
med = float(np.median(big)); mad = float(np.median(np.abs(big - med))) + 1e-6
ev_idx = list(find_peaks(big, prominence=max(0.01, 6 * mad), distance=max(2, int(fps * 0.08)))[0])
ev = np.array(ev_idx) / fps
sync['change_events'] = [round(float(x), 3) for x in ev]
# big state changes only (a panel, a cut, a new drawing): a 24 fps film inside 30 fps repeats every 5th frame, which
# makes small false peaks during smooth motion, so frame-level matching uses these
sync['big_changes'] = [round(float(i / fps), 3) for i in find_peaks(big, height=0.05, distance=max(2, int(fps * 0.25)))[0]]
tb = np.arange(0, dur, 0.1)
sync['motion_10hz'] = [round(float(np.nan_to_num(mov[int(a_ * fps):int((a_ + 0.1) * fps) + 1].mean() if int(a_ * fps) < len(mov) else 0.0)), 4) for a_ in tb]   # no NaN past the last frame
if wav:
    y, sr = librosa.load(wav, sr=22050); hop = max(1, int(round(sr / fps)))
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    on = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    # stored at fixed rates so films with different frame rates compare on the same time grid
    sync['onset_envelope_100hz'] = [round(float(x), 3) for x in librosa.onset.onset_strength(y=y, sr=sr, hop_length=sr // 100)]
    m = min(len(mov), len(rms)); maxlag = int(round(fps * 0.2))
    r, L = xcorr(mov, rms, maxlag)
    shifts = rng.integers(int(fps), max(int(fps) + 1, m - int(fps)), 200)
    null = [xcorr(mov[:m], np.roll(rms[:m], int(s)), maxlag)[0] for s in shifts]
    sync['tests']['loudness'] = {'r': round(r, 2), 'lag_frames': L, 'chance95': round(float(np.percentile(null, 95)), 2),
                                 'pass': bool(r > np.percentile(null, 95) and r >= 0.4),
                                 'meaning': 'positive lag = picture moves after the sound'}
    # pulses: where clear motion starts vs strong audio onsets
    pk = librosa.util.peak_pick(on, pre_max=3, post_max=3, pre_avg=3, post_avg=5, delta=np.std(on) * 0.8, wait=5)
    moving = mov > max(np.percentile(mov, 20) * 3, 1e-3)
    starts = [i for i in range(1, min(len(moving), len(on))) if moving[i] and not moving[i - 1]]
    if len(pk) and starts:
        off = float(np.median([np.min(np.abs(pk - s)) for s in starts]))
        nul = [float(np.median([np.min(np.abs(pk - s)) for s in rng.integers(0, m, len(starts))])) for _ in range(300)]
        sync['tests']['motion_starts_on_pulses'] = {'median_frames': round(off, 1), 'chance_median': round(float(np.median(nul)), 1),
                                                     'chance5': round(float(np.percentile(nul, 5)), 1), 'pass': bool(off < np.percentile(nul, 5))}
    # stepped: big picture changes phase-locked to the beat grid
    bt = np.array(grid['beats']) if grid else (np.array(beats['beats']) if beats else np.array([]))
    if grid and grid['status'] == 'no steady beat': bt = np.array([])
    def lock(times, div):
        ph = []
        for e in times:
            i = np.searchsorted(bt, e) - 1
            if 0 <= i < len(bt) - 1: ph.append(((e - bt[i]) / ((bt[i + 1] - bt[i]) / div)) % 1)
        return (float(abs(np.mean(np.exp(2j * np.pi * np.array(ph))))), len(ph)) if ph else (0.0, 0)
    # lock the big changes when there are enough: continuous motion (a large moving rider) adds off-grid peaks that hide
    # a cut-on-the-beat structure (pilot 1, 15-10-2026: all peaks 0.15 vs chance 0.24; big changes 0.45 vs 0.36)
    ev_lock = np.array(sync['big_changes']) if len(sync['big_changes']) >= 8 else ev
    sync['stepped_test_on'] = 'big changes' if len(sync['big_changes']) >= 8 else 'all change peaks'
    if len(bt) > 3 and len(ev_lock) >= 6:
        best = None
        for div in (1, 2, 4):
            R, k = lock(ev_lock, div)
            nl = np.percentile([lock(np.sort(rng.uniform(bt[0], bt[-1], max(k, 1))), div)[0] for _ in range(400)], 95)
            row = {'per_beat': div, 'lock': round(R, 2), 'chance95': round(float(nl), 2), 'events': k, 'pass': bool(R > nl)}
            sync['tests'][f'stepped_1/{div}'] = row
            if row['pass'] and best is None: best = (R - nl, div)          # coarsest grid that locks: on-beat changes also fit half-beats
        sync['stepped_grid'] = f'1/{best[1]} beat' if best else None
    # voice-led: picture changes on word starts
    if len(words) >= 3 and len(ev) >= 6:
        wt = np.array([x['t'] for x in words])
        off = np.array([np.min(np.abs(wt - e)) for e in ev]) * fps
        nul = [float(np.median([np.min(np.abs(wt - e)) for e in rng.uniform(0, dur, len(ev))]) * fps) for _ in range(400)]
        sync['tests']['voice'] = {'median_frames': round(float(np.median(off)), 1), 'chance_median': round(float(np.median(nul)), 1),
                                  'chance5': round(float(np.percentile(nul, 5)), 1), 'pass': bool(np.median(off) < np.percentile(nul, 5))}
t = sync['tests']
if t.get('loudness', {}).get('pass'): sync['type'] = 'loudness-driven'
elif sync.get('stepped_grid'): sync['type'] = 'stepped on ' + sync['stepped_grid']
elif t.get('voice', {}).get('pass'): sync['type'] = 'voice-led'
else: sync['type'] = 'timeline-locked'

dna = {'source': os.path.relpath(vid), 'video': {'w': W0, 'h': H0, 'fps': round(fps, 3), 'duration': round(dur, 2), 'hard_cuts': cuts},
       'music': music, 'grid': grid,
       'voice': {'words': len(words), 'text': ' '.join(x['w'] for x in words)} if words else None, 'sync': sync}

# ---- compare our render with its reference: same tests, same thresholds ----
if a.compare:
    ref = json.load(open(os.path.join(a.compare, 'dna', 'dna.json')))
    rs, os_ = ref['sync'], sync; res = {'reference_type': rs['type'], 'ours_type': os_['type'], 'checks': []}
    k = a.stretch
    if abs(k - 1) > 1e-6:
        rs = dict(rs); rs['big_changes'] = [x * k for x in rs.get('big_changes', [])]
        res['stretch'] = k
        def _scale(v):
            v = np.array(v, dtype=float); n = int(round(len(v) * k))
            return list(np.interp(np.arange(n) / k, np.arange(len(v)), v)) if len(v) else []
        for f in ('motion_10hz', 'onset_envelope_100hz'):
            if rs.get(f): rs[f] = _scale(rs[f])
    def chk(name, ok, detail): res['checks'].append({'check': name, 'pass': bool(ok), 'detail': detail})
    # a timeline-locked reference is matched by its change frames (below), not by a label: our redraw may also lock to a beat
    if rs['type'] != 'timeline-locked':
        chk('same sync type', rs['type'].split(':')[0] == os_['type'].split(':')[0], f"{rs['type']} vs {os_['type']}")
    if rs['type'] == 'loudness-driven':
        rr, oo = rs['tests']['loudness'], os_['tests'].get('loudness', {})
        chk('motion follows loudness at least 80% as strongly', oo.get('r', 0) >= 0.8 * rr['r'], f"ours {oo.get('r')} vs ref {rr['r']}")
        chk('delay within 1 frame of the reference', abs(oo.get('lag_frames', 99) - rr['lag_frames']) <= 1, f"ours {oo.get('lag_frames')} vs ref {rr['lag_frames']}")
    if rs['type'].startswith('stepped'):
        k = 'stepped_' + rs['stepped_grid'].split(' ')[0]
        chk('locks to the same grid', os_['tests'].get(k, {}).get('pass', False), f"{k}: ours {os_['tests'].get(k)}")
    if rs['type'] == 'voice-led':
        chk('changes land on word starts', os_['tests'].get('voice', {}).get('pass', False), str(os_['tests'].get('voice')))
    if rs['type'] == 'timeline-locked':
        rb_, ob_ = np.array(rs.get('big_changes', [])), np.array(os_.get('big_changes', []))
        # each film can only show a change on its next frame: allow one frame of each, plus 10 ms
        tol = 1 / ref['video']['fps'] + 1 / fps + 0.01
        if len(rb_):
            a_ = float(np.mean([np.min(np.abs(ob_ - x)) <= tol for x in rb_])) if len(ob_) else 0
            b_ = float(np.mean([np.min(np.abs(rb_ - x)) <= tol for x in ob_])) if len(ob_) else 0
            chk('big changes on the same frames (one frame of each film, 70%+ both ways)', a_ >= 0.7 and b_ >= 0.7,
                f'{len(rb_)} in ref, {len(ob_)} ours; ref->ours {a_:.0%}, ours->ref {b_:.0%}; unmatched ref: {[x for x in rb_ if not len(ob_) or np.min(np.abs(ob_ - x)) > tol]}')
        rm, om = np.array(rs.get('motion_10hz', [])), np.array(os_.get('motion_10hz', [])); mm = min(len(rm), len(om))
        if mm > 20:
            r_, L_ = xcorr(om[:mm], rm[:mm], 2)
            nl = np.percentile([xcorr(om[:mm], np.roll(rm[:mm], int(s)), 2)[0] for s in rng.integers(10, max(11, mm - 10), 300)], 95)
            chk('motion rises and falls with the reference (0.1 s steps, vs chance)', r_ > nl and abs(L_) <= 1, f'r {r_:.2f} at lag {L_ * 0.1:+.1f} s vs chance {nl:.2f}')
    if rs.get('onset_envelope_100hz') and os_.get('onset_envelope_100hz') and (((ref.get('grid') or {}).get('status') == 'confirmed') or rs['type'] == 'timeline-locked'):
        ro, oo = np.array(rs['onset_envelope_100hz']), np.array(os_['onset_envelope_100hz']); mm = min(len(ro), len(oo))
        sm = lambda v: np.convolve(v, np.ones(10) / 10, mode='same')        # 0.1 s smoothing: phrasing, not single notes
        r_, L_ = xcorr(sm(oo[:mm]), sm(ro[:mm]), 10)
        nl = np.percentile([xcorr(sm(oo[:mm]), np.roll(sm(ro[:mm]), int(s)), 10)[0] for s in rng.integers(100, max(101, mm - 100), 200)], 95)
        chk('sound rises and falls with the reference (onset pattern vs chance)', r_ > nl, f'r {r_:.2f} vs chance {nl:.2f}')
    if ref.get('grid'): res['reference_grid'] = ref['grid']['status']
    if ref.get('music') and music:
        # the same tracker on both sides: beat_this when both grids have it, else librosa
        # compare only what the reference measures reliably: no tempo when it has no steady beat, no key when the key is weak
        if (ref.get('grid') or {}).get('status') in ('confirmed', 'disputed'):
            src = 'beat_this' if (ref.get('grid') or {}).get('bpm_beat_this') and (grid or {}).get('bpm_beat_this') else 'librosa'
            rb, ob = (ref['grid']['bpm_beat_this'], grid['bpm_beat_this']) if src == 'beat_this' else (ref['music']['bpm'], music['bpm'])
            chk(f'tempo within 3 BPM (or half/double), {src}', min(abs(ob - rb), abs(ob - 2 * rb), abs(2 * ob - rb)) <= 3, f'ours {ob} vs ref {rb}')
        else: res['skipped'] = res.get('skipped', []) + [f"tempo: reference has no steady beat ({(ref.get('grid') or {}).get('status')})"]
        if ref['music'].get('key_confidence', 0) >= 0.5:
            chk('same key', ref['music']['key'] == music['key'], f"ours {music['key']} vs ref {ref['music']['key']}")
        else: res['skipped'] = res.get('skipped', []) + [f"key: reference key is weak (confidence {ref['music'].get('key_confidence')})"]
    res['pass'] = all(c['pass'] for c in res['checks']); dna['compare'] = res

# NaN and Infinity are not JSON: other tools (reel.mjs) parse this file, so undefined values are written as null
open(os.path.join(out, 'dna.json'), 'w').write(re.sub(r'\b(NaN|-?Infinity)\b', 'null', json.dumps(dna, indent=1)))

# ---- beat-check clip (reference folders): check the grid by eye and ear ----
if folder and beats and not a.no_clip:
    y44, s44 = librosa.load(wav, sr=44100); click = np.zeros_like(y44); Lc = int(0.03 * s44); tt = np.arange(Lc) / s44
    gb = grid['beats'] if grid else beats['beats']; gd = grid['downbeats'] if grid else beats.get('downbeats', [])
    down = set(round(x, 3) for x in gd)
    for b_ in gb:
        i = int(b_ * s44); s = np.sin(2 * np.pi * (1600 if round(b_, 3) in down else 1000) * tt) * np.exp(-tt * 120) * 0.5
        click[i:i + Lc] += s[:max(0, min(Lc, len(y44) - i))]
    cw = os.path.join(out, 'click.wav'); sf.write(cw, np.stack([y44 * 0.8, click], 1), s44)
    en = '+'.join(f'between(t,{x:.3f},{x + 0.1:.3f})' for x in gb) or '0'
    dn = '+'.join(f'between(t,{x:.3f},{x + 0.1:.3f})' for x in gd) or '0'
    vf = f"scale=-2:960,drawbox=x=20:y=20:w=60:h=60:color=white@1:t=fill:enable='{en}',drawbox=x=20:y=90:w=60:h=20:color=red@1:t=fill:enable='{dn}'"
    sh(['ffmpeg', '-v', 'error', '-y', '-i', vid, '-i', cw, '-map', '0:v', '-map', '1:a', '-vf', vf, '-c:v', 'libx264', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', os.path.join(out, 'beat-check.mp4')])

summary = {'sync': sync['type'], 'grid': grid and {k: grid[k] for k in grid if k not in ('beats', 'downbeats')}, 'bpm': music and music['bpm'], 'key': music and music['key'], 'voice_words': len(words),
           'tests': {k: {kk: v[kk] for kk in v if kk not in ('meaning',)} for k, v in sync['tests'].items()}}
if a.compare: summary['compare'] = {'pass': dna['compare']['pass'], 'checks': [(c['check'], c['pass'], c['detail']) for c in dna['compare']['checks']], 'skipped': dna['compare'].get('skipped', [])}
print(json.dumps(summary))
