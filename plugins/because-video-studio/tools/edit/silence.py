#!/usr/bin/env python3
"""Find the speech in a recording and cut out dead air, non-destructively (writes edit-list clips, not video).

  python3 tools/edit/silence.py <media> [--db -35] [--min-gap 0.45] [--margin 0.12] [--format 9x16] [--crop face] [--edl out.json]

Prints the keep ranges and the time saved. With --edl, writes a ready-to-render edl.json (one clip per kept range,
alternating zoom 1.0/1.12 so the jump cuts read as intentional); edit it, then: python3 tools/edit/edl.py out.json
"""
import argparse, json, os, re, subprocess
from pathlib import Path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('media'); ap.add_argument('--db', type=float, default=-35); ap.add_argument('--min-gap', type=float, default=0.45)
    ap.add_argument('--margin', type=float, default=0.12); ap.add_argument('--format', default='16x9'); ap.add_argument('--crop', default='face')
    ap.add_argument('--edl')
    a = ap.parse_args()
    src = Path(a.media).resolve()
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(src)],
                               capture_output=True, text=True).stdout)
    log = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(src), '-vn', '-af', f'silencedetect=noise={a.db}dB:d={a.min_gap}',
                          '-f', 'null', '-'], capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', log)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', log)]
    keep, t = [], 0.0
    for s, e in zip(starts, ends + [dur] * (len(starts) - len(ends))):
        if s - t > 0.05: keep.append([max(0, t - a.margin if t else 0), min(dur, s + a.margin)])
        t = e
    if dur - t > 0.05: keep.append([max(0, t - a.margin), dur])
    keep = [[round(x, 3), round(y, 3)] for x, y in keep if y - x > 0.25]
    kept = sum(y - x for x, y in keep)
    print(f'{len(keep)} speech ranges, {kept:.1f}s of {dur:.1f}s kept ({dur - kept:.1f}s of dead air removed)')
    for x, y in keep: print(f'  {x:8.2f} → {y:8.2f}  ({y - x:.1f}s)')
    if a.edl:
        out = Path(a.edl).resolve()
        rel = os.path.relpath(src, out.parent)
        clips = [{'src': rel, 'in': x, 'out': y, 'crop': a.crop, 'zoom': 1.12 if i % 2 else 1.0} for i, (x, y) in enumerate(keep)]
        out.write_text(json.dumps({'format': a.format, 'fps': 30, 'output': f'renders/{src.stem}_tight_{a.format}.mp4',
                                   'clips': clips, 'loudness': -14}, indent=1))
        print(f'wrote {out}')


if __name__ == '__main__':
    main()
