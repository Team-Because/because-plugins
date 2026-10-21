"""Measure someone else's finished reel before rebuilding it (references/finished-edits.md).

  heads   masks/ docs/head.json            per-frame head top, head width (row top+110), head x
  shots   docs/head.json docs/shots.json   cut points where head top jumps > 30 px or width > 18%
  tape    frames/ docs/tape.json [--band 1300,1900]
          burned-in caption tape per frame (light, low-saturation band spanning the body):
          bbox + a text signature; prints the MIN tape top over the whole clip = your bust-cut limit
  capchg  docs/tape.json [--fps 25]        caption change times (the timing source when Whisper
                                           fails on non-English speech, e.g. Gujarati)

All thresholds came from two Meet edits (white sticker tape, dark text). Check the printed values
against a few frames by eye before trusting them on a new editor's style.
"""
import json
import os
import sys

import cv2
import numpy as np


def _frames(d):
    return sorted(f for f in os.listdir(d) if f.endswith((".png", ".jpg")))


def heads(masks, out):
    rows = []
    for k, f in enumerate(_frames(masks)):
        b = cv2.imread(os.path.join(masks, f), 0) > 128
        w = b.shape[1]
        r = np.where(b[:, w // 5: w - w // 5].sum(1) > 30)[0]
        top = int(r[0]) if len(r) else -1
        row = b[min(b.shape[0] - 1, top + 110)] if top >= 0 else np.zeros(w, bool)
        cols = np.where(row)[0]
        rows.append(dict(i=k, top=top, hw=int(row.sum()), cx=float(cols.mean()) if len(cols) else w / 2))
    json.dump(rows, open(out, "w"))
    print("heads", len(rows))


def shots(head_json, out, dtop=30, dw=0.18):
    M = json.load(open(head_json))
    cuts = [0]
    for k in range(1, len(M)):
        a, b = M[k - 1], M[k]
        if abs(b["top"] - a["top"]) > dtop or abs(b["hw"] - a["hw"]) / max(a["hw"], 1) > dw:
            cuts.append(k)
    cuts.append(len(M))
    res = []
    for s, e in zip(cuts[:-1], cuts[1:]):
        seg = M[s:e]
        res.append([s, e, int(np.median([m["top"] for m in seg])), int(np.median([m["hw"] for m in seg]))])
    json.dump(res, open(out, "w"))
    for r in res:
        print("shot frames %d-%d  head top %d  head width %d" % tuple(r))
    print("normalise speaker size per shot: scale = target_head_width / head width (e.g. 345 / hw)")


def tape(frames, out, band=(1300, 1900)):
    res, prev = [], None
    for i, f in enumerate(_frames(frames)):
        im = cv2.imread(os.path.join(frames, f))
        hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
        S, V = hsv[..., 1].astype(int), hsv[..., 2].astype(int)
        t = ((S < 60) & (V > 175)).astype(np.uint8)
        t[: band[0]] = 0
        t[band[1]:] = 0
        w = t.shape[1]
        rows = np.where(t[:, w // 5: w - w // 5].sum(1) > 0.6 * (w - 2 * (w // 5)))[0]
        d = None
        if len(rows):
            y0, y1 = int(rows.min()), int(rows.max())
            cols = np.where(t[y0:y1 + 1].sum(0) > (y1 - y0) * 0.3)[0]
            x0, x1 = int(cols.min()), int(cols.max())
            txt = (V < 120).astype(np.float32)[y0:y1 + 1, x0:x1 + 1]
            sig = cv2.resize(txt, (64, 16))
            if prev is not None:
                d = float(np.abs(sig - prev).mean())
            prev = sig
        else:
            y0 = y1 = x0 = x1 = -1
        res.append(dict(i=i, y0=y0, y1=y1, x0=x0, x1=x1, d=d))
    json.dump(res, open(out, "w"))
    tops = [r["y0"] for r in res if r["y0"] >= 0]
    print(f"tape found on {len(tops)} of {len(res)} frames; MIN tape top = {min(tops) if tops else 'none'}"
          " -> cut the bust at least 12-14 px above this in source rows")


def capchg(tape_json, fps=25, thresh=0.08):
    res = json.load(open(tape_json))
    t_prev = 0.0
    for r in res:
        if r["d"] is not None and r["d"] > thresh:
            t = r["i"] / fps
            if t - t_prev > 0.3:
                print(f"{t:6.2f}  caption change")
                t_prev = t


if __name__ == "__main__":
    c, a = sys.argv[1], sys.argv[2:]
    if c == "heads":
        heads(a[0], a[1])
    elif c == "shots":
        shots(a[0], a[1])
    elif c == "tape":
        b = tuple(int(v) for v in a[a.index("--band") + 1].split(",")) if "--band" in a else (1300, 1900)
        tape(a[0], a[1], b)
    elif c == "capchg":
        capchg(a[0], int(a[a.index("--fps") + 1]) if "--fps" in a else 25)
    else:
        print(__doc__)
