# .venv/bin/python tools/footage-cut.py <video> [--fmt 9x16] [--draft]
# A reel cut from the editor's own footage, on the reference's measured beats (skills/reel, "From a B1 brief").
#   1. docs/concept-map.yaml -> docs/edl-<fmt>.json: one clip per beat, cut to the beat's exact length (times the reel's
#      stretch). `footage: <path>@<in>-<out>` plays from <in>; a photo holds with a slow push-in; `asset: <video file>`
#      (a generated shot) plays from 0; any other beat is black here, because the film draws it in code.
#   2. tools/edit/edl.py renders the cut (hard cuts, cover-cropped to the format, the takes' own sound muted).
#   3. tools/render.mjs --alpha renders index.html as a see-through layer (the words, the end card and the code-built beats).
#      The seek(t) engine does not hold a video layer: the footage lives outside the film's sandbox and a <video> cannot be
#      seeked frame-exactly in headless Chrome, so the two are composited by ffmpeg instead.
#   4. ffmpeg lays the film over the cut: out/cut-<fmt>.mp4 (silent; reel-kit approve adds voice and music).
import sys, os, json, re, subprocess
import yaml

HERE = os.path.dirname(os.path.abspath(__file__)); STUDIO = os.path.dirname(HERE)
FORMATS = {'9x16': (1080, 1920), '1x1': (1080, 1080), '16x9': (1920, 1080), '4x5': (1080, 1350)}
VIDEO = ('.mp4', '.mov', '.m4v', '.mkv', '.avi', '.webm', '.mts', '.m2ts', '.mxf')
PHOTO = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.tif', '.tiff')

def run(args, **kw):
    r = subprocess.run(args, **kw)
    if r.returncode: sys.exit(f'{os.path.basename(args[0])} failed')
    return r

def probe_dur(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True)
    try: return float(r.stdout.strip())
    except ValueError: return 0.0

def fmt_for(w, h):
    r = w / h
    return '16x9' if r > 1.4 else '1x1' if r > 0.95 else '4x5' if r > 0.7 else '9x16'

def main():
    a = sys.argv[1:]
    vd = os.path.abspath(os.path.join(STUDIO, a[0])); docs = os.path.join(vd, 'docs')
    state = json.load(open(os.path.join(docs, 'reel.json')))
    dna = json.load(open(os.path.join(state['refDir'], 'dna', 'dna.json')))
    fmt = a[a.index('--fmt') + 1] if '--fmt' in a else fmt_for(dna['video']['w'], dna['video']['h'])
    fps = 30 if abs(dna['video']['fps'] - 30) < 0.5 else round(dna['video']['fps'])
    k = float(state.get('stretch', 1) or 1); W, H = FORMATS[fmt]; draft = '--draft' in a
    m = yaml.safe_load(open(os.path.join(docs, 'concept-map.yaml'), encoding='utf-8'))
    beats = sorted(m.get('beats') or [], key=lambda b: b['t'][0])
    work = os.path.join(docs, 'cut-work'); os.makedirs(work, exist_ok=True); os.makedirs(os.path.join(vd, 'out'), exist_ok=True)
    resolve = lambda p: next((c for c in (os.path.expanduser(p), os.path.join(vd, p), os.path.join(vd, '..', '..', p)) if os.path.exists(c)), None)

    clips, notes, end = [], [], 0.0
    for i, b in enumerate(beats, 1):
        t0 = round(round(b['t'][0] * k * fps) / fps, 4); t1 = round(round(b['t'][1] * k * fps) / fps, 4); L = round(t1 - t0, 4)
        if L <= 0: continue
        srcs = [s.strip() for s in str(b.get('source') or '').split(';')]
        foot = next((s[8:].strip() for s in srcs if s.startswith('footage:')), None)
        gen = next((resolve(s[6:].strip()) for s in srcs if s.startswith('asset:') and s.lower().rstrip().endswith(VIDEO)), None)
        clip = {'crop': 'center', 'volume': 0, 'label': f'beat {i}'}
        if foot:
            path, _, rng = foot.rpartition('@'); f = resolve(path.strip()); x, z = [float(v) for v in re.findall(r'[0-9.]+', rng)[:2]]
            if f is None: sys.exit(f'beat {i}: footage not found: {path}')
            if f.lower().endswith(PHOTO):
                still = os.path.join(work, f'beat-{i:02d}-{fmt}.mp4'); n = max(1, round(L * fps))
                run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', f, '-vf',
                     f"scale={W * 2}:{H * 2}:force_original_aspect_ratio=increase,crop={W * 2}:{H * 2},"
                     f"zoompan=z='1+0.05*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s={W}x{H}:fps={fps},format=yuv420p",
                     '-frames:v', str(n), '-r', str(fps), '-c:v', 'libx264', '-crf', '16', still])
                clip.update(src=still, **{'in': 0, 'out': L})
            else:
                dur = probe_dur(f); have = min(z, dur) - x
                if have + 1e-3 < L:
                    speed = max(0.5, have / L); clip['speed'] = round(speed, 4)
                    notes.append(f'beat {i}: the take has {have:.2f} s for a {L:.2f} s beat, slowed to {speed:.2f}x' + (' and still short: pick a longer take' if have / L < 0.5 else ''))
                    clip.update(src=f, **{'in': x, 'out': round(x + L * clip['speed'], 4)})
                else: clip.update(src=f, **{'in': x, 'out': round(x + L, 4)})
        elif gen:
            dur = probe_dur(gen); clip.update(src=gen, **{'in': 0, 'out': round(min(L, dur), 4)})
            if dur + 1e-3 < L: clip['speed'] = round(max(0.5, dur / L), 4); clip['out'] = round(L * clip['speed'], 4); notes.append(f'beat {i}: the generated shot is {dur:.2f} s for a {L:.2f} s beat, slowed')
        else:
            black = os.path.join(work, f'black-{i:02d}-{fmt}.mp4')
            run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c=black:s={W}x{H}:r={fps}:d={L}', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', black])
            clip.update(src=black, **{'in': 0, 'out': L}); notes.append(f'beat {i}: no take, the film draws it in code')
        clips.append(clip); end = t1

    edl = {'format': fmt, 'fps': fps, 'output': f'cut-work/cut-{fmt}.mp4', 'clips': clips}
    ep = os.path.join(docs, f'edl-{fmt}.json'); json.dump(edl, open(ep, 'w'), indent=1)
    py = sys.executable
    run([py, os.path.join(HERE, 'edit', 'edl.py'), ep])
    cut = os.path.join(docs, 'cut-work', f'cut-{fmt}.mp4'); film = os.path.join(vd, 'index.html'); out = os.path.join(vd, 'out', f'cut-{fmt}.mp4')
    if os.path.exists(film):
        layer = os.path.join(work, f'overlay-{fmt}.mov')
        run(['node', os.path.join(HERE, 'render.mjs'), film, '--alpha', '--fps', str(fps), '--dur', f'{end:.3f}',
             '--w', str(W // 2 * 2 if not draft else W // 4 * 2), '--h', str(H if not draft else H // 4 * 2), '--q', f'?fmt={fmt}', '--out', layer])
        run(['ffmpeg', '-v', 'error', '-y', '-i', cut, '-i', layer, '-filter_complex', f'[1:v]scale={W}:{H}[o];[0:v][o]overlay=0:0:format=auto:eof_action=pass,format=yuv420p[v]',
             '-map', '[v]', '-an', '-t', f'{end:.3f}', '-c:v', 'libx264', '-crf', '23' if draft else '16', '-preset', 'ultrafast' if draft else 'medium', '-movflags', '+faststart', out])
    else:
        notes.append('no index.html yet: the cut has no words or end card')
        run(['ffmpeg', '-v', 'error', '-y', '-i', cut, '-an', '-c', 'copy', out])
    for n in notes: print('  - ' + n)
    try: shown = os.path.relpath(out, STUDIO)
    except ValueError: shown = out                                                    # another drive on Windows
    print(f'cut: {shown}  {end:.2f} s, {len(clips)} beats, {fmt}')

if __name__ == '__main__':
    main()
