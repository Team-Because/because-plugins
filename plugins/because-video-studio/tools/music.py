# <python> tools/music.py <video-dir> --dur <s> [--mood keynote|warm] [--turns 3.2,9.8] [--lift 0.45]
#   [--sections "0:0,0.15:1,0.45:2,0.85:0"] [--chords Dm,Bb,F,C]
# Free music for any film, made on this computer: real sampled instruments (felt piano, strings, harp, pizzicato) through
# the vox score engine (pretty_midi + FluidSynth + the MuseScore soundfont + a pedalboard studio chain). No key, no credits.
# Writes <video>/music.wav (what mix.py and ship read). The default arc follows the film: piano alone on the hook, the
# story moving, the lift, then a last chord that rings over the end card. --sections gives the arc as share-of-length:energy
# pairs (energy 0 piano, 1 + pulse or harp, 2 + soft drums and bass, 3 full); --turns puts sub hits on story turns (2-4).
# keynote = confident, 112 bpm (launches, a push to act); warm = human, 84 bpm (stories, testimonials, festive wishes).
# The music engine is an optional setup choice. Without it (no soundfont or FluidSynth) this writes the same arc with the
# built-in synth score (tools/score.py, cine style), so every film still has music; it says so in one line.
import os, sys, argparse, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'vox'))

ap = argparse.ArgumentParser()
ap.add_argument('video'); ap.add_argument('--dur', type=float, required=True)
ap.add_argument('--mood', default='keynote', choices=['keynote', 'warm'])
ap.add_argument('--turns', default=''); ap.add_argument('--sections', default='0:0,0.15:1,0.45:2,0.85:0')
ap.add_argument('--chords', default='')
a = ap.parse_args()

chords = a.chords.split(',') if a.chords else (['Dm', 'Bb', 'F', 'C'] if a.mood == 'keynote' else ['Fmaj7', 'C', 'Dm', 'Bbmaj7'])
tonic = 'F' if a.mood == 'keynote' else 'Fmaj7'
marks = [(float(s), int(e)) for s, e in (p.split(':') for p in a.sections.split(','))]
D = a.dur
secs = []
for (s, e), nxt in zip(marks, marks[1:] + [(1.0, 0)]):
    t0, t1 = s * D, nxt[0] * D
    if t1 - t0 > 0.2: secs.append((round(t0, 2), round(t1, 2), e))
# the last section rings out on the tonic instead of cycling the progression over the end card
last = secs.pop() if secs and secs[-1][2] == 0 and len(secs) > 1 else None
hits = [float(t) for t in a.turns.split(',') if t.strip()]
out = os.path.join(a.video, 'music.wav')
try:
    from score import Section, render_score, check_soundfont, _fluidsynth
    check_soundfont(); _fluidsynth()
except Exception:
    # same arc on the built-in synth: groove from the first lift, build from the second, the hard stop where it settles
    lifts = [s * D for s, e in marks if e > 0] or [0.15 * D]
    stop = (last[0] if last else 0.85 * D)
    groove, build = lifts[0], (lifts[1] if len(lifts) > 1 else (lifts[0] + stop) / 2)
    subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'score.py'), '--style', 'cine', '--out', out,
                    '--dur', f'{D}', '--start', f'{min(1.0, groove / 2):.2f}', '--groove', f'{groove:.2f}', '--build', f'{build:.2f}',
                    '--stop', f'{stop:.2f}', '--formed', f'{min(D - 0.3, stop + 1.5):.2f}'], check=True)
    print(f'wrote {out} ({D:.1f} s) with the built-in score: the real-instrument music engine is not installed (setup --music adds it)')
    sys.exit(0)
render_score([Section(t0, t1, chords, e) for t0, t1, e in secs], hits, end=D, mood=a.mood, out=out,
             final_chord=(last[0], tonic) if last else None)
print(f'wrote {out} ({D:.1f} s, {a.mood}, {len(secs)} sections, {len(hits)} hits)')
