#!/usr/bin/env python3
"""Inventory raw footage before editing: what is there, how long, what it looks like.

  python3 tools/edit/probe.py <file-or-folder> [...] [--out <dir>] [--scenes]

For every video/audio/image: duration, size, fps, audio, rotation → <out>/media.json and a printed table.
For every video: a 12-frame contact sheet <out>/sheets/<name>.jpg (Read them to SEE the footage).
--scenes adds shot boundaries (PySceneDetect) per video: useful for activity/event footage and B-roll libraries.
"""
import argparse, json, subprocess, sys
from pathlib import Path

VID = {'.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.mts', '.mxf'}
AUD = {'.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg'}
IMG = {'.jpg', '.jpeg', '.png', '.webp', '.heic'}


def probe(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', str(p)],
                       capture_output=True, text=True)
    d = json.loads(r.stdout or '{}')
    v = next((s for s in d.get('streams', []) if s.get('codec_type') == 'video'), None)
    a = next((s for s in d.get('streams', []) if s.get('codec_type') == 'audio'), None)
    info = {'file': str(p), 'kind': 'video' if p.suffix.lower() in VID else 'audio' if p.suffix.lower() in AUD else 'image',
            'duration': round(float(d.get('format', {}).get('duration', 0) or 0), 2), 'audio': bool(a)}
    if v:
        w, h = v.get('width'), v.get('height')
        rot = 0
        for sd in v.get('side_data_list', []) or []:
            rot = int(sd.get('rotation', 0) or 0)
        if abs(rot) in (90, 270): w, h = h, w
        num, den = (v.get('avg_frame_rate') or '0/1').split('/')
        info.update({'width': w, 'height': h, 'fps': round(int(num) / int(den), 2) if int(den) else 0,
                     'orientation': 'vertical' if h > w else 'square' if h == w else 'horizontal', 'codec': v.get('codec_name')})
    return info


def sheet(p, dur, out):
    n = 12
    times = [dur * (i + 0.5) / n for i in range(n)]
    tmp = out.with_suffix('')
    tmp.mkdir(parents=True, exist_ok=True)
    for i, t in enumerate(times):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(p), '-frames:v', '1',
                        '-vf', 'scale=320:-2', str(tmp / f'{i:02d}.jpg')])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '1', '-i', str(tmp / '%02d.jpg'),
                    '-vf', 'tile=6x2:padding=4:color=0x141414', '-frames:v', '1', str(out)])
    for f in tmp.glob('*.jpg'): f.unlink()
    tmp.rmdir()


def scenes(p):
    import csv, tempfile
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([sys.executable, '-m', 'scenedetect', '-q', '-i', str(p), '-o', tmp, 'detect-adaptive', 'list-scenes', '-s'],
                       capture_output=True, text=True)
        f = next(Path(tmp).glob('*.csv'), None)
        if not f: return []
        rows = list(csv.reader(f.open()))
        return [[float(r[3]), float(r[6])] for r in rows if r and r[0].isdigit()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+'); ap.add_argument('--out', default='.'); ap.add_argument('--scenes', action='store_true')
    a = ap.parse_args()
    files = []
    for p in map(Path, a.paths):
        files += sorted(x for x in (p.rglob('*') if p.is_dir() else [p]) if x.suffix.lower() in VID | AUD | IMG)
    out = Path(a.out); (out / 'sheets').mkdir(parents=True, exist_ok=True)
    rows = []
    for f in files:
        i = probe(f)
        if i['kind'] == 'video' and i['duration'] > 0:
            sp = out / 'sheets' / f'{f.stem}.jpg'; sheet(f, i['duration'], sp); i['sheet'] = str(sp)
            if a.scenes: i['scenes'] = scenes(f)
        rows.append(i)
        print(f"{f.name[:40]:40} {i['kind']:5} {i['duration']:8.1f}s  {str(i.get('width', '')) + 'x' + str(i.get('height', '')) if i.get('width') else '':>10}"
              f"  {i.get('fps', ''):>6}  audio={'y' if i['audio'] else 'n'}" + (f"  shots={len(i['scenes'])}" if 'scenes' in i else ''))
    (out / 'media.json').write_text(json.dumps(rows, indent=1))
    tot = sum(r['duration'] for r in rows if r['kind'] == 'video')
    print(f'{len(rows)} files, {tot / 60:.1f} min of video → {out}/media.json, contact sheets in {out}/sheets/')


if __name__ == '__main__':
    main()
