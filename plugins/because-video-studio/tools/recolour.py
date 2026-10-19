#!/usr/bin/env python3
"""Recolour a library asset into a client's accent, writing a copy (the generic file is never changed).
  .venv/bin/python tools/recolour.py <in.json|in.svg> <out> --accent "#CC9433" [--ink "#FFFFFF"]
Lottie: every saturated colour (fills, strokes, gradients, animated colour keys) becomes the accent, keeping its
lightness relative to the file's brightest saturated colour; whites, blacks and greys stay. --ink also maps white.
SVG (Lucide): currentColor and any hex fill/stroke become the accent."""
import sys, json, re, colorsys, argparse

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--accent', required=True); ap.add_argument('--ink')
a = ap.parse_args()
hexrgb = lambda h: tuple(int(h.lstrip('#')[i:i + 2], 16) / 255 for i in (0, 2, 4))
acc = colorsys.rgb_to_hls(*hexrgb(a.accent))
ink = hexrgb(a.ink) if a.ink else None

def saturated(rgb):
    h, l, s = colorsys.rgb_to_hls(*rgb)
    return s > 0.18 and 0.08 < l < 0.95

if a.src.endswith('.svg'):
    t = open(a.src).read()
    t = t.replace('currentColor', a.accent)
    t = re.sub(r'(fill|stroke)="#[0-9a-fA-F]{6}"', lambda m: f'{m.group(1)}="{a.accent}"', t)
    open(a.out, 'w').write(t); print('svg ->', a.out); sys.exit(0)

d = json.load(open(a.src))
cols = []          # every colour slot: (list, offset) pointing at r,g,b
def slots(o):
    if isinstance(o, dict):
        ty = o.get('ty')
        if ty in ('fl', 'st') and isinstance(o.get('c'), dict):
            k = o['c'].get('k')
            if isinstance(k, list) and k and isinstance(k[0], (int, float)): cols.append((k, 0))
            elif isinstance(k, list):
                for kf in k:
                    for key in ('s', 'e'):
                        if isinstance(kf, dict) and isinstance(kf.get(key), list) and len(kf[key]) >= 3: cols.append((kf[key], 0))
        if ty in ('gf', 'gs') and isinstance(o.get('g'), dict):
            n, k = o['g'].get('p', 0), o['g'].get('k', {}).get('k')
            arrs = [k] if k and isinstance(k[0], (int, float)) else [kf.get(x) for kf in (k or []) for x in ('s', 'e') if isinstance(kf, dict) and kf.get(x)]
            for arr in arrs:
                for i in range(n): cols.append((arr, i * 4 + 1))
        for v in o.values(): slots(v)
    elif isinstance(o, list):
        for v in o: slots(v)
slots(d)
sat = [colorsys.rgb_to_hls(*arr[o:o + 3])[1] for arr, o in cols if saturated(arr[o:o + 3])]
top = max(sat) if sat else 1
changed = 0
for arr, o in cols:
    rgb = tuple(arr[o:o + 3])
    if saturated(rgb):
        l = colorsys.rgb_to_hls(*rgb)[1]
        arr[o:o + 3] = [round(x, 4) for x in colorsys.hls_to_rgb(acc[0], max(0.05, min(0.95, acc[1] * l / top)), acc[2])]; changed += 1
    elif ink and min(rgb) > 0.95:
        arr[o:o + 3] = list(ink); changed += 1
json.dump(d, open(a.out, 'w'), separators=(',', ':'))
print(f'lottie -> {a.out}: {changed} of {len(cols)} colour slots changed')
