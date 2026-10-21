"""Matte tools: track the speaker, re-mask on upscaled crops, clean mattes, refine with a plate.

All proven on the TBA builds. Run from the video folder with the project venv python.

  track   masks/ docs/track.json [--band 200,650]        per-frame head top / head x / area
  crops   frames/ docs/track.json crops/ [--cw 640 --y0 300]
          2x upscaled square crops around the smoothed head x (writes docs/crops.json). Run
          personmask on crops/ -> masks_crop/. Use when the speaker is small in a wide shot or turns
          their back: full-frame Vision misses them, the 2x crop finds them (tba-clip2: 992/992).
  clean   masks_crop/ frames/ docs/crops.json matte/ [--cut 860]
          keep the component holding the head, zero rows below the audience line, strip lectern
          flowers / petals on the matte rim, fill enclosed holes, report frames whose area drops.
  plate   frames/ masks/ masks2/ [--rows 900]
          static camera only: median background plate + shake-tolerant difference key, kept only
          near the Vision person (tba-clip4: fixed Vision leaking onto the backdrop logo).

Every step writes files a human can open. Check a full-res crop of the face after each one.
"""
import argparse
import json
import os

import cv2
import numpy as np


def _frames(d, exts=(".png", ".jpg")):
    return sorted(f for f in os.listdir(d) if f.endswith(exts))


def smooth(xs, med=6, sigma=5.0, radius=12):
    xs = np.asarray(xs, float)
    m = np.array([np.median(xs[max(0, i - med):i + med + 1]) for i in range(len(xs))])
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(m, radius, mode="edge"), k, mode="valid")


def track(masks_dir, out_json, band=(200, 650), min_area=800):
    """Pick the speaker component per frame by size, height and continuity with the last frame."""
    rows, prev = [], None
    for k, f in enumerate(_frames(masks_dir)):
        m = (cv2.imread(os.path.join(masks_dir, f), 0) > 127).astype(np.uint8)
        n, lab, st, cen = cv2.connectedComponentsWithStats(m)
        best, bs = None, -1e9
        for c in range(1, n):
            x, y, w, h, a = st[c]
            if a < min_area or not (band[0] <= y <= band[1]):
                continue
            s = a / 1000 - (abs(cen[c][0] - prev) / 20 if prev is not None else 0) + h / 50
            if s > bs:
                best, bs = c, s
        if best is None:
            rows.append(dict(i=k, ok=0))
            continue
        x, y, w, h, a = st[best]
        head = (lab == best)[y:y + 60]
        hx = float(np.where(head.any(0))[0].mean())
        prev = hx
        rows.append(dict(i=k, ok=1, top=int(y), hx=hx, cx=float(cen[best][0]), area=int(a), h=int(h), w=int(w)))
    json.dump(rows, open(out_json, "w"))
    print("frames", len(rows), "tracked", sum(r["ok"] for r in rows))


def crops(frames_dir, track_json, out_dir, cw=640, y0=300, crops_json="docs/crops.json"):
    rows = json.load(open(track_json))
    good = np.array([bool(r["ok"]) for r in rows])
    idx = np.arange(len(rows))
    hx = np.array([r.get("hx", 0) for r in rows], float)
    hx = np.interp(idx, idx[good], hx[good])
    sm = smooth(hx)
    np.save(os.path.join(os.path.dirname(crops_json) or ".", "hx.npy"), sm)
    os.makedirs(out_dir, exist_ok=True)
    fs = _frames(frames_dir)
    sw = cv2.imread(os.path.join(frames_dir, fs[0])).shape[1]
    x0s = []
    for i, f in enumerate(fs):
        img = cv2.imread(os.path.join(frames_dir, f))
        x0 = int(np.clip(sm[i] - cw / 2, 0, sw - cw))
        x0s.append(x0)
        c = img[y0:y0 + cw, x0:x0 + cw]
        cv2.imwrite(os.path.join(out_dir, os.path.splitext(f)[0] + ".png"), cv2.resize(c, (cw * 2, cw * 2), interpolation=cv2.INTER_CUBIC))
    json.dump({"x0": x0s, "y0": y0, "cw": cw}, open(crops_json, "w"))
    print("crops", len(fs), "->", out_dir)


def strip_rim_colour(matte, src_bgr, max_y, rim_px=40, sat=60):
    """Remove saturated non-skin colour (lectern flowers, petals, garlands) on the matte RIM only.

    Petals sit on the silhouette edge, never inside the face, so anything deeper than rim_px stays.
    """
    hsv = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2HSV)
    skin = (hsv[..., 0] <= 20) & (hsv[..., 1] < 170)
    flower = ((hsv[..., 1] > sat) & ~skin).astype(np.uint8)
    flower[max_y:] = 0
    inner = (matte > 127).astype(np.uint8)
    flower[cv2.distanceTransform(inner, cv2.DIST_L2, 5) > rim_px] = 0
    flower = cv2.dilate(flower, np.ones((7, 7), np.uint8))
    return matte * (1 - flower)


def fill_enclosed(matte):
    solid = (matte > 127).astype(np.uint8)
    ff = solid.copy()
    h, w = ff.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    out = matte.copy()
    out[ff == 0] = 255
    return out


def clean(masks_dir, frames_dir, crops_json, out_dir, cut=860, flower_rows=420):
    c = json.load(open(crops_json))
    hx = np.load(os.path.join(os.path.dirname(crops_json) or ".", "hx.npy"))
    os.makedirs(out_dir, exist_ok=True)
    fs = _frames(masks_dir)
    srcs = _frames(frames_dir)
    areas = []
    for i, f in enumerate(fs):
        m = cv2.imread(os.path.join(masks_dir, f), 0)
        m[cut:] = 0  # rows below the audience line never reach the canvas
        b = (m > 127).astype(np.uint8)
        n, lab, st, cen = cv2.connectedComponentsWithStats(b)
        hcol = (hx[i] - c["x0"][i]) * 2
        best, bs = 0, -1e18
        for k in range(1, n):
            x, y, w, h, a = st[k]
            if a < 2000 or y > flower_rows:
                continue
            s = a - abs(cen[k][0] - hcol) * 300
            if s > bs:
                best, bs = k, s
        keep = (lab == best) if best else np.zeros_like(b, bool)
        keep = cv2.dilate(keep.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        out = m.astype(np.float32) * keep
        src = cv2.imread(os.path.join(frames_dir, srcs[i]))
        cw = c["cw"]
        crop = src[c["y0"]:c["y0"] + cw, c["x0"][i]:c["x0"][i] + cw]
        crop = cv2.resize(crop, (cw * 2, cw * 2), interpolation=cv2.INTER_LINEAR)
        out = strip_rim_colour(out, crop, flower_rows)
        b2 = (out > 127).astype(np.uint8)
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(b2)
        if n2 > 2:
            big = 1 + np.argmax(st2[1:, 4])
            out *= cv2.dilate((lab2 == big).astype(np.uint8), np.ones((5, 5), np.uint8))
        out = fill_enclosed(out.astype(np.uint8))
        cv2.imwrite(os.path.join(out_dir, f), out)
        areas.append(int(keep.sum()))
    a = np.array(areas, float)
    med = np.array([np.median(a[max(0, i - 12):i + 13]) for i in range(len(a))])
    bad = [i for i in range(len(a)) if a[i] < 0.6 * med[i]]
    print("cleaned", len(fs), "suspect frames (area < 60% of local median):", bad[:80])


def plate(frames_dir, masks_dir, out_dir, rows=900, samples=140):
    """Static camera: build an empty-stage plate, then alpha = Vision region minus known background."""
    fs = _frames(frames_dir)
    ms = _frames(masks_dir)
    os.makedirs(out_dir, exist_ok=True)
    ell = lambda k: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    if not os.path.exists("plate.jpg"):
        idx = np.linspace(0, len(fs) - 1, min(samples, len(fs))).astype(int)
        imgs = np.stack([cv2.imread(os.path.join(frames_dir, fs[i])) for i in idx])
        mk = np.stack([cv2.dilate((cv2.imread(os.path.join(masks_dir, ms[i]), 0) > 12).astype(np.uint8), np.ones((45, 45), np.uint8)) for i in idx])
        pl = np.zeros(imgs.shape[1:], np.uint8)
        valid = np.zeros(imgs.shape[1:3], np.uint8)
        for y0 in range(0, imgs.shape[1], 64):
            blk = imgs[:, y0:y0 + 64].astype(np.float32)
            blk[mk[:, y0:y0 + 64].astype(bool)] = np.nan
            valid[y0:y0 + 64] = ((~mk[:, y0:y0 + 64].astype(bool)).sum(0) >= 15).astype(np.uint8) * 255
            pl[y0:y0 + 64] = np.nan_to_num(np.nanmedian(blk, axis=0)).astype(np.uint8)
        cv2.imwrite("plate.jpg", pl, [cv2.IMWRITE_JPEG_QUALITY, 95])
        cv2.imwrite("plate_valid.png", valid)
    pb = cv2.GaussianBlur(cv2.imread("plate.jpg").astype(np.float32), (0, 0), 1.2)
    valid = cv2.GaussianBlur(cv2.erode(cv2.imread("plate_valid.png", 0), np.ones((9, 9), np.uint8)).astype(np.float32) / 255, (0, 0), 4)
    for f, mf in zip(fs, ms):
        fr = cv2.GaussianBlur(cv2.imread(os.path.join(frames_dir, f)).astype(np.float32), (0, 0), 1.2)
        d = np.full(fr.shape[:2], 255, np.float32)
        for dy in range(-2, 3):  # the camera micro-shakes: best plate match within +-2 px
            for dx in range(-2, 3):
                sp = np.roll(pb[:rows + 8], (dy, dx), (0, 1))[:rows]
                d[:rows] = np.minimum(d[:rows], np.abs(fr[:rows] - sp).max(2))
        bg = np.clip((22 - d) / 8, 0, 1) * valid
        v = cv2.imread(os.path.join(masks_dir, mf), 0).astype(np.float32) / 255
        loose = cv2.dilate(np.clip((v - 0.08) / 0.22, 0, 1), ell(9))  # Vision decides WHERE, generously
        alpha = loose * (1 - bg)
        hard = cv2.morphologyEx((alpha > 0.5).astype(np.uint8), cv2.MORPH_OPEN, ell(5))
        n, lab, st, _ = cv2.connectedComponentsWithStats(hard)
        if n > 1:
            main = 1 + np.argmax(st[1:, 4])
            body = (lab == main).astype(np.uint8)
            near = cv2.dilate(body, ell(161))
            for k in range(1, n):  # a raised hand can separate from the body
                if k != main and st[k, 4] > 2500 and near[lab == k].any():
                    body[lab == k] = 1
            hn, hl, hs, _ = cv2.connectedComponentsWithStats(1 - body)
            for k in range(1, hn):  # fill small holes only, arm gaps stay open
                if hs[k, 4] < 1500:
                    body[hl == k] = 1
            edge = cv2.dilate(body, ell(5)) - cv2.erode(body, ell(5))
            alpha = np.where(edge > 0, alpha * cv2.dilate(body, ell(5)), body.astype(np.float32))
        alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 0.8)
        cv2.imwrite(os.path.join(out_dir, os.path.splitext(mf)[0] + ".png"), (np.clip(alpha, 0, 1) * 255).astype(np.uint8))
    print("refined", len(fs), "->", out_dir)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("track"); a.add_argument("masks"); a.add_argument("out"); a.add_argument("--band", default="200,650")
    a = sub.add_parser("crops"); a.add_argument("frames"); a.add_argument("track"); a.add_argument("out")
    a.add_argument("--cw", type=int, default=640); a.add_argument("--y0", type=int, default=300)
    a = sub.add_parser("clean"); a.add_argument("masks"); a.add_argument("frames"); a.add_argument("crops"); a.add_argument("out")
    a.add_argument("--cut", type=int, default=860)
    a = sub.add_parser("plate"); a.add_argument("frames"); a.add_argument("masks"); a.add_argument("out"); a.add_argument("--rows", type=int, default=900)
    g = ap.parse_args()
    if g.cmd == "track":
        track(g.masks, g.out, tuple(int(v) for v in g.band.split(",")))
    elif g.cmd == "crops":
        crops(g.frames, g.track, g.out, g.cw, g.y0)
    elif g.cmd == "clean":
        clean(g.masks, g.frames, g.crops, g.out, g.cut)
    elif g.cmd == "plate":
        plate(g.frames, g.masks, g.out, g.rows)
