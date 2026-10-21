"""voxkit: the paper-collage drawing library behind every vox-reel build.

Factored from the approved speed-wins reel (motion-studio/speed-wins-reel/vox-local/compose.py)
and the five builds that followed it (vox-reels/*). Every function is deterministic: randomness is
seeded from the arguments, so a frame is a pure function of its index and any frame can be
re-rendered alone.

Canvas convention: float32 RGB array, shape (H, W, 3), values 0-1. Props are PIL RGBA images,
placed with place()/prop(). Colours are 0-255 RGB tuples.

    import sys; sys.path.insert(0, "<skill>/scripts")
    from voxkit import *
"""
import math
import zlib

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 25
STEP = 12  # props move on 12 fps "stop motion" steps; the speaker stays at the source rate
SAFE_TOP, SAFE_BOTTOM = 192, 1536  # Shorts/Reels UI: nothing important above or below these rows

SUP = "/System/Library/Fonts/Supplemental/"
F_HEAD = SUP + "Impact.ttf"
F_CAP = SUP + "DIN Condensed Bold.ttf"
F_BODY = SUP + "Georgia.ttf"
F_TYPE = SUP + "AmericanTypewriter.ttc"
F_DIDOT = SUP + "Didot.ttc"
F_HAND = SUP + "Bradley Hand Bold.ttf"
F_CHALK = SUP + "Chalkduster.ttf"
F_ROCK = SUP + "Rockwell.ttc"

CREAM = (239, 230, 210)
INK = (34, 31, 28)
RED = (178, 36, 31)
MUSTARD = (232, 177, 58)
PAPER_W = (250, 246, 236)
GREY = (150, 144, 134)
CHALK = (44, 72, 58)
GREEN = (74, 128, 84)
NAVY = (40, 52, 92)

# Audit log: when AUDIT is True, place() records every placed element's box so gates.py can
# check safe zones and frame edges mechanically. Each entry: (tag, x0, y0, x1, y1).
AUDIT = False
PLACED = []


# ---------- randomness, fonts, noise ----------

def rng(*seed):
    return np.random.default_rng(zlib.crc32(repr(seed).encode()))


def font(path, size, index=0):
    return ImageFont.truetype(path, size, index=index)


def smooth_noise(h, w, cell, seed):
    g = rng("noise", seed).random((h // cell + 2, w // cell + 2)).astype(np.float32)
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)[:h, :w]


# ---------- paper, halftone, torn edges ----------

def paper(h, w, color, seed, grain=0.06):
    base = np.ones((h, w, 3), np.float32) * np.array(color, np.float32) / 255
    blotch = smooth_noise(h, w, 90, seed) - 0.5
    fiber = rng("fiber", seed).random((h, w)).astype(np.float32) - 0.5
    fiber = cv2.GaussianBlur(fiber, (0, 0), 0.8)
    shade = 1 + blotch * 0.10 + fiber * grain
    return np.clip(base * shade[..., None], 0, 1)


def halftone(h, w, spacing, seed, rmax):
    """Alpha of a 45 degree dot screen whose dot size drifts with low-frequency noise."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (xx + yy) / math.sqrt(2) / spacing
    v = (xx - yy) / math.sqrt(2) / spacing
    du, dv = u - np.round(u), v - np.round(v)
    d = np.sqrt(du**2 + dv**2) * spacing
    r = rmax * (0.35 + 0.65 * smooth_noise(h, w, 160, seed))
    return np.clip(r - d + 0.5, 0, 1)


def torn_polygon(w, h, seed, rough=7, step=9):
    r = rng("torn", seed)
    pts = []
    for x in range(0, w + 1, step):
        pts.append((x, r.uniform(0, rough)))
    for y in range(0, h + 1, step):
        pts.append((w - r.uniform(0, rough), y))
    for x in range(w, -1, -step):
        pts.append((x, h - r.uniform(0, rough)))
    for y in range(h, -1, -step):
        pts.append((r.uniform(0, rough), y))
    return pts


def tear_line(seed, width=W, amp=7):
    """A 1-D torn edge (pixel offsets per column) for bust cuts, ground rips and ledges."""
    r = rng("tear", seed)
    coarse = np.repeat(r.uniform(-amp, amp, width // 9 + 2), 9)[:width]
    fine = cv2.GaussianBlur(coarse.reshape(1, -1).astype(np.float32), (0, 0), 1.2).ravel()
    return fine + smooth_noise(4, width, 120, seed)[0] * 16 - 8


# ---------- grounds (one per beat) ----------

def flat_ground(color, seed, dot_color, spacing=16, rmax=4.2, w=W, h=H):
    g = paper(h, w, color, seed)
    ht = halftone(h, w, spacing, seed, rmax)[..., None]
    return g * (1 - ht) + np.array(dot_color, np.float32)[None, None] / 255 * ht


def newsprint_ground(body_text, seed=11, top=1180, cols=4, w=W, h=H, color=CREAM):
    """Cream page with justified columns of body copy below `top`.

    body_text MUST be written for this video (its own story, its own nouns). Never reuse another
    video's copy: four reels once shipped with the speed-wins "rule of business" paragraph behind a
    teacher talking about his accent (see references/learnings.md).
    """
    g = paper(h, w, color, seed)
    img = Image.fromarray((g * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    fb = font(F_BODY, 19)
    gap = 26
    cw = (w - 80 - gap * (cols - 1)) // cols
    words = (body_text.strip() + " ") * 12
    for c in range(cols):
        x, y, line = 40 + c * (cw + gap), top, ""
        # each column starts at a different word so the columns never repeat side by side
        ws = words.split()
        ws = ws[(c * 37) % max(1, len(ws) // 12):]
        for wd in ws:
            if fb.getlength(line + wd + " ") > cw:
                d.text((x, y), line, font=fb, fill=(120, 110, 95))
                y, line = y + 25, ""
                if y > h - 40:
                    break
            line += wd + " "
    for c in range(1, cols):
        x = 40 + c * (cw + gap) - gap // 2
        d.line([(x, top), (x, h - 40)], fill=(150, 140, 120), width=1)
    d.line([(40, top - 18), (w - 40, top - 18)], fill=(90, 80, 70), width=3)
    return np.asarray(img, np.float32) / 255


def ruled_ground(seed=71, color=PAPER_W, line=(150, 180, 210), margin=(200, 80, 80), w=W, h=H):
    """Notebook paper: blue rules and a red margin line."""
    g = paper(h, w, color, seed)
    img = Image.fromarray((g * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    for y in range(160, h, 56):
        d.line([(0, y), (w, y)], fill=line, width=2)
    d.line([(120, 0), (120, h)], fill=margin, width=3)
    return np.asarray(img, np.float32) / 255


def chalk_ground(seed=81, color=CHALK, w=W, h=H):
    """Green chalkboard with smeared chalk dust."""
    g = paper(h, w, color, seed, grain=0.04)
    dust = cv2.GaussianBlur(smooth_noise(h, w, 40, seed + 1), (0, 0), 12)
    return np.clip(g + (dust[..., None] - 0.5) * 0.10, 0, 1)


def make_grain(seed="grain", amount=0.07, w=W, h=H):
    """Multiply the finished frame by this for a shared film/paper grain."""
    return 1 + cv2.GaussianBlur(rng(seed).random((h, w)).astype(np.float32) - 0.5, (0, 0), 0.7)[..., None] * amount


def ground_rip(canvas, old_ground, t, t_start, seed):
    """Torn-paper transition: the new ground tears down over the old one in 3 stop-motion steps.

    Call right after copying the new ground into canvas, before drawing props. Returns canvas.
    """
    k = math.floor((t - t_start) * STEP)
    if k < 0 or k >= 3:
        return canvas
    h, w = canvas.shape[:2]
    yw = h * (k + 1) / 3.6 + tear_line(seed, w) * 3
    rows = np.arange(h)[:, None]
    keep_old = (rows > yw[None, :]).astype(np.float32)[..., None]
    edge = ((rows > yw[None, :]) & (rows < yw[None, :] + 14)).astype(np.float32)[..., None]
    canvas = canvas * (1 - keep_old) + old_ground * keep_old
    return canvas * (1 - edge) + np.array(PAPER_W, np.float32) / 255 * edge


# ---------- paper props ----------

def add_tape(img, seed, x=None, y=None, ang=None):
    """A strip of translucent masking tape across a prop corner (in place)."""
    r = rng("tape", seed)
    tp = Image.new("RGBA", (110, 38), (236, 228, 196, 170))
    tp = tp.rotate(ang if ang is not None else r.uniform(-25, -15), expand=True, resample=Image.BICUBIC)
    img.alpha_composite(tp, (int(x if x is not None else 0), int(y if y is not None else 0)))
    return img


def label(text, fpath, size, fg, bg, seed, pad=(34, 18), index=0, tape=False, tex_img=None):
    """A torn paper clipping with text, as RGBA. tex_img replaces the flat paper colour."""
    f = font(fpath, size, index)
    l, t, r, b = f.getbbox(text) if text.strip() else (0, 0, 0, 0)
    tw, th = r - l, b - t
    w, h = tw + pad[0] * 2, th + pad[1] * 2
    m = 24
    img = Image.new("RGBA", (w + 2 * m, h + 2 * m), (0, 0, 0, 0))
    if tex_img is not None:
        tex = tex_img[: h + 2 * m, : w + 2 * m]
    else:
        tex = (paper(h + 2 * m, w + 2 * m, bg, seed) * 255).astype(np.uint8)
    core = (paper(h + 2 * m, w + 2 * m, PAPER_W, seed + 7) * 255).astype(np.uint8)
    mk_core = Image.new("L", img.size, 0)
    ImageDraw.Draw(mk_core).polygon([(x + m - 4, y + m - 4) for x, y in torn_polygon(w + 8, h + 8, seed + 1, 9)], fill=255)
    mk = Image.new("L", img.size, 0)
    ImageDraw.Draw(mk).polygon([(x + m, y + m) for x, y in torn_polygon(w, h, seed, 6)], fill=255)
    img = Image.composite(Image.fromarray(core).convert("RGBA"), img, mk_core)
    img = Image.composite(Image.fromarray(np.ascontiguousarray(tex)).convert("RGBA"), img, mk)
    if text.strip():
        ImageDraw.Draw(img).text((m + pad[0] - l, m + pad[1] - t), text, font=f, fill=fg)
    if tape:
        add_tape(img, seed, max(0, m - 30), max(0, m - 20))
    return img


def fit_label(text, fpath, size, fg, bg, seed, max_w=920, min_size=50, **kw):
    """label() that shrinks the font until the clipping fits max_w (captions, long tags)."""
    while font(fpath, size).getlength(text) > max_w and size > min_size:
        size -= 2
    return label(text, fpath, size, fg, bg, seed, **kw)


def cutout(size, draw_fn, color, seed, dots=True, border=9):
    """Scissor-cut paper shape: draw_fn(draw, S) paints white on an L mask at 2x (S = 2)."""
    w, h = size
    S = 2
    big = Image.new("L", (w * S, h * S), 0)
    draw_fn(ImageDraw.Draw(big), S)
    shape = big.resize((w, h), Image.LANCZOS)
    edge = shape.filter(ImageFilter.MaxFilter(border))
    tex = (paper(h, w, color, seed, 0.09) * 255).astype(np.float32)
    if dots:
        tex *= 1 - 0.28 * halftone(h, w, 11, seed, 3.2)[..., None]
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img = Image.composite(Image.new("RGBA", (w, h), PAPER_W + (255,)), img, edge)
    return Image.composite(Image.fromarray(tex.astype(np.uint8)).convert("RGBA"), img, shape)


def disc(r, color, seed):
    d0 = 2 * r + 16
    return cutout((d0, d0), lambda d, S: d.ellipse([8 * S, 8 * S, (8 + 2 * r) * S, (8 + 2 * r) * S], fill=255),
                  color, seed, dots=False, border=7)


def person(color, seed, hgt=150):
    """A plain paper person (head on a rounded block). Fine as a crowd, crude up close."""
    w = int(hgt * 0.62) + 24

    def draw(d, S):
        cx = w / 2 * S
        r = hgt * 0.17 * S
        d.ellipse([cx - r, 12 * S, cx + r, 12 * S + 2 * r], fill=255)
        top = 12 * S + 2 * r + 6 * S
        d.rounded_rectangle([cx - hgt * 0.29 * S, top, cx + hgt * 0.29 * S, (12 + hgt) * S], radius=int(hgt * 0.2 * S), fill=255)

    return cutout((w, hgt + 24), draw, color, seed, dots=False, border=7)


def arrow_shape(length, color, seed, thick=60):
    """A fat paper arrow pointing right."""
    h = thick * 2 + 20

    def draw(d, S):
        y = h / 2 * S
        d.rectangle([10 * S, (y / S - thick / 3) * S, (length - thick) * S, (y / S + thick / 3) * S], fill=255)
        d.polygon([((length - thick - 10) * S, 10 * S), ((length - thick - 10) * S, (h - 10) * S), (length * S, y)], fill=255)

    return cutout((length + 10, h), draw, color, seed, dots=True)


def doc(w, h, color, seed, ruled=False, margin=False):
    """A blank document/card to type real text onto (memos, tickets, dictionary pages)."""
    img = Image.fromarray((paper(h, w, color, seed, 0.05) * 255).astype(np.uint8)).convert("RGBA")
    d = ImageDraw.Draw(img)
    if ruled:
        for y in range(70, h - 20, 44):
            d.line([(20, y), (w - 20, y)], fill=(150, 180, 210, 255), width=2)
    if margin:
        d.line([(70, 0), (70, h)], fill=(200, 80, 80, 255), width=3)
    al = Image.new("L", img.size, 0)
    ImageDraw.Draw(al).polygon(torn_polygon(w, h, seed, 4), fill=255)
    img.putalpha(al)
    return img


# ---------- stop-motion timing ----------

def step_t(t):
    return math.floor(t * STEP) / STEP


def jitter(t, seed, amp=2.0, rot=0.6):
    r = rng("jit", seed, math.floor(t * STEP))
    return r.uniform(-amp, amp), r.uniform(-amp, amp), r.uniform(-rot, rot)


def slap(t, t0):
    """Stop-motion slap-in: big for one step, settle on the next. Never use at t0 = 0 for a
    label near the top edge: the 1.22x first step pushes it past y 192 on frame 0."""
    s = math.floor((t - t0) * STEP)
    return {0: 1.22, 1: 1.06}.get(s, 1.0)


def draw_p(t, t0, dur):
    """Draw-on progress (0-1) on the stop-motion grid."""
    return (step_t(t) - t0) / dur if t >= t0 else 0.0


def ease_out(k):
    k = max(0.0, min(1.0, k))
    return 1 - (1 - k) ** 2


# ---------- compositing ----------

def _blend(canvas, rgb, al, x0, y0):
    h, w = al.shape
    ch, cw = canvas.shape[:2]
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(cw, x0 + w), min(ch, y0 + h)
    if cx1 <= cx0 or cy1 <= cy0:
        return
    sx0, sy0 = cx0 - x0, cy0 - y0
    a = al[sy0:sy0 + cy1 - cy0, sx0:sx0 + cx1 - cx0][..., None]
    c = rgb[sy0:sy0 + cy1 - cy0, sx0:sx0 + cx1 - cx0]
    canvas[cy0:cy1, cx0:cx1] = canvas[cy0:cy1, cx0:cx1] * (1 - a) + c * a


def place(canvas, img, cx, cy, scale=1.0, rot=0.0, shadow=0.35, sh_off=(10, 14), tag=""):
    """Alpha-composite a PIL RGBA onto the float canvas, centred at (cx, cy), with a paper drop shadow."""
    if scale != 1.0:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))), Image.LANCZOS)
    if rot:
        img = img.rotate(rot, expand=True, resample=Image.BICUBIC)
    a = np.asarray(img, np.float32) / 255
    rgb, al = a[..., :3], a[..., 3]
    x0, y0 = int(cx - img.width / 2), int(cy - img.height / 2)
    if AUDIT:
        ys, xs = np.where(al > 0.1)
        if len(xs):
            PLACED.append((tag, int(x0 + xs.min()), int(y0 + ys.min()), int(x0 + xs.max()), int(y0 + ys.max())))
    if shadow:
        sa = cv2.GaussianBlur(al, (0, 0), 7) * shadow
        _blend(canvas, np.zeros_like(rgb), sa, x0 + sh_off[0], y0 + sh_off[1])
    _blend(canvas, rgb, al, x0, y0)


def prop(canvas, img, t, t0, x, y, rot, seed, shadow=0.35, amp=2.0, jr=0.6, t1=None, scale=1.0, tag=""):
    """A prop that slaps in at t0, jitters on the stop-motion grid, and leaves at t1 (if given)."""
    if t < t0 or (t1 is not None and t >= t1):
        return
    dx, dy, dr = jitter(t, seed, amp, jr)
    place(canvas, img, x + dx, y + dy, slap(t, t0) * scale, rot + dr, shadow, tag=tag)


def overlay(canvas, draw_fn):
    """Draw with PIL on a transparent full-canvas layer and blend it (polygons, arrow heads)."""
    h, w = canvas.shape[:2]
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(ov))
    oa = np.asarray(ov, np.float32) / 255
    _blend(canvas, oa[..., :3], oa[..., 3], 0, 0)


# ---------- marker draw-ons ----------

def partial(pts, p):
    """First p (0-1) of a polyline, by segment count."""
    p = max(0.0, min(1.0, p))
    seg = p * (len(pts) - 1)
    out = list(pts[: int(seg) + 1])
    if int(seg) < len(pts) - 1:
        a, b = pts[int(seg)], pts[int(seg) + 1]
        f = seg - int(seg)
        out = out + [(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)]
    return out


def marker(canvas, pts, color, width, alpha=235):
    if len(pts) < 2:
        return
    overlay(canvas, lambda d: d.line(pts, fill=tuple(color) + (alpha,), width=width, joint="curve"))


def ring(cx, cy, rx, ry, seed, turns=1.15, n=48):
    """Hand-drawn marker ellipse that overshoots its start, as points for marker()/partial()."""
    r = rng("ring", seed)
    return [(cx + rx * (1 + r.uniform(-0.04, 0.04)) * math.cos(-2.2 + 2 * math.pi * turns * k / n),
             cy + ry * (1 + r.uniform(-0.04, 0.04)) * math.sin(-2.2 + 2 * math.pi * turns * k / n)) for k in range(n + 1)]


def arrow_head(canvas, tip, prev, color, size=40):
    ang = math.atan2(tip[1] - prev[1], tip[0] - prev[0])
    head = [(tip[0] + size * math.cos(ang), tip[1] + size * math.sin(ang)),
            (tip[0] + size * 1.1 * math.cos(ang + 2.4), tip[1] + size * 1.1 * math.sin(ang + 2.4)),
            (tip[0] + size * 1.1 * math.cos(ang - 2.4), tip[1] + size * 1.1 * math.sin(ang - 2.4))]
    overlay(canvas, lambda d: d.polygon(head, fill=tuple(color) + (255,)))


def tick(canvas, t, t0, x, y, size=1.0, color=RED, width=14):
    """Red marker tick drawn on over 0.2 s."""
    pts = [(x, y), (x + 22 * size, y + 26 * size), (x + 64 * size, y - 34 * size)]
    marker(canvas, partial(pts, draw_p(t, t0, 0.2)), color, width, 255)


def cross(canvas, t, t0, x, y, rx, ry, color=RED, width=20, dur=0.17):
    """Red X: two strokes drawn on one after the other."""
    marker(canvas, partial([(x - rx, y - ry), (x + rx, y + ry)], draw_p(t, t0, dur)), color, width, 255)
    if t >= t0 + dur:
        marker(canvas, partial([(x + rx, y - ry), (x - rx, y + ry)], draw_p(t, t0 + dur, dur)), color, width, 255)


def strike(canvas, t, t0, x0, x1, y, color=RED, width=16, dur=0.35):
    """Marker strike-through, slightly uphill like a real hand."""
    marker(canvas, partial([(x0, y + 6), ((x0 + x1) / 2, y - 4), (x1, y + 4)], draw_p(t, t0, dur)), color, width)


def underline(canvas, t, t0, x0, x1, y, color=RED, width=14, dur=0.3, double=False):
    marker(canvas, partial([(x0, y), (x1, y - 6)], draw_p(t, t0, dur)), color, width)
    if double and t >= t0 + dur:
        marker(canvas, partial([(x0 + 10, y + 18), (x1 - 10, y + 12)], draw_p(t, t0 + dur, dur)), color, width)


# ---------- the speaker: a sticker cut-out of real footage ----------

def keep_largest(mask01, dilate=25):
    """Keep the largest connected component of a 0-1 mask (drops audience heads, stray specks)."""
    n, lab, st, _ = cv2.connectedComponentsWithStats((mask01 > 0.5).astype(np.uint8))
    if n > 1:
        keep = 1 + np.argmax(st[1:, 4])
        mask01 = mask01 * cv2.dilate((lab == keep).astype(np.uint8), np.ones((dilate, dilate), np.uint8))
    return mask01


def fill_holes(mask01, max_area=6000):
    """Fill enclosed holes smaller than max_area px (Vision drops bits of ear, hand, glasses)."""
    inv = (mask01 <= 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv)
    out = mask01.copy()
    hh, ww = mask01.shape
    for k in range(1, n):
        x, y, w, h, area = st[k]
        if area < max_area and x > 0 and y > 0 and x + w < ww and y + h < hh:
            out[lab == k] = 1.0
    return out


def smooth_track(xs, sigma=6.0, radius=15):
    """Gaussian-smooth a per-frame x track (speaker centroid) so the reframe never jitters."""
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    return np.convolve(np.pad(np.asarray(xs, np.float64), radius, mode="edge"), k, mode="valid")


def mask_centroid_x(mask01, max_row=None):
    col = (mask01 if max_row is None else mask01[:max_row]).sum(0)
    return float((col * np.arange(mask01.shape[1])).sum() / max(col.sum(), 1))


def warp_speaker(src_rgb01, mask01, scale, head_src_y, head_dst_y, cx_src, follow=0.7, w=W, h=H):
    """Scale and place the source frame and its mask on the canvas.

    head_src_y -> head_dst_y fixes the head height on the canvas; the x offset re-centres the
    speaker by `follow` of their distance from the centre (0.7 keeps a little natural drift).
    Returns (rgb, alpha) on the canvas.
    """
    sw = src_rgb01.shape[1]
    ox = follow * (sw / 2 - cx_src) * scale
    M = np.float32([[scale, 0, w / 2 - scale * sw / 2 + ox], [0, scale, head_dst_y - scale * head_src_y]])
    rgb = cv2.warpAffine(src_rgb01, M, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT)
    a = np.clip((cv2.warpAffine(mask01, M, (w, h), flags=cv2.INTER_LINEAR) - 0.5) * 3 + 0.5, 0, 1)
    return rgb, a


def blend_masks(masks, weights=(0.25, 0.5, 0.25)):
    """Temporal smoothing of the matte over neighbouring frames (kills edge flicker)."""
    ws = weights[: len(masks)]
    return sum(wt * m for wt, m in zip(ws, masks)) / sum(ws)


def bust_cut(alpha, y_cut, seed, amp=22):
    """Cut the speaker off with a torn bottom edge at canvas row y_cut (scalar or per-column).

    Used to keep burned-in caption tape, lecterns and audience heads off the canvas: choose y_cut so
    that it maps ABOVE the tape top (with margin) in every shot. Measure, never guess.
    """
    h, w = alpha.shape
    tear = (smooth_noise(8, w, 40, seed)[4] - 0.5) * amp + (smooth_noise(8, w, 7, seed + 50)[4] - 0.5) * amp / 3
    rows = np.arange(h, dtype=np.float32)[:, None]
    return alpha * np.clip(np.asarray(y_cut, np.float32) + tear[None, :] - rows, 0, 1)


def grade(rgb):
    """The light print grade every build used: +8% contrast, a touch warm."""
    return np.clip((rgb - 0.5) * 1.08 + 0.5, 0, 1) * np.array([1.03, 1.0, 0.96], np.float32)


_STICKER_NOISE = {}


def sticker_composite(canvas, rgb, a, ink=INK, edge_px=15, shadow=0.4):
    """Composite the speaker as a sticker: paper drop shadow, thin ink line, white paper edge, footage.

    The face and body are the real footage, never redrawn.
    """
    h, w = a.shape
    if (h, w) not in _STICKER_NOISE:
        _STICKER_NOISE[(h, w)] = smooth_noise(h, w, 14, 77)
    inside = (a > 0.5).astype(np.uint8)
    dist = cv2.distanceTransform(1 - inside, cv2.DIST_L2, 5)
    edge = edge_px + (_STICKER_NOISE[(h, w)] - 0.5) * 9
    white = np.clip(edge - dist, 0, 1)
    inkl = np.clip(edge + 3.5 - dist, 0, 1) - white
    sh = cv2.GaussianBlur(np.maximum(a, white), (0, 0), 9)
    sh = cv2.warpAffine(sh, np.float32([[1, 0, 9], [0, 1, 12]]), (w, h)) * shadow
    canvas = canvas * (1 - sh[..., None])
    canvas = canvas * (1 - inkl[..., None]) + np.array(ink, np.float32) / 255 * inkl[..., None]
    canvas = canvas * (1 - white[..., None]) + np.array(PAPER_W, np.float32) / 255 * white[..., None]
    return canvas * (1 - a[..., None]) + rgb * a[..., None]


# ---------- context cards: real footage as live photo cards ----------

def photo_card(src_rgb01, crop, width, seed, margin=18, radius=14, tag=None, tag_font=F_TYPE, tape=True):
    """A real-footage photo card: the crop (x0, y0, x1, y1) of the SOURCE frame, white margin,
    rounded corners, optional typewriter tag strip under the photo, tape on a corner. RGBA.

    Rebuild it every frame from the live source frame so the card plays as video, never a still.
    Never recreate or redraw the room: if the footage does not show it, there is no card.
    """
    x0, y0, x1, y1 = crop
    ph = src_rgb01[y0:y1, x0:x1]
    pw = width - 2 * margin
    phh = int(round(ph.shape[0] * pw / ph.shape[1]))
    ph = cv2.resize(ph, (pw, phh), interpolation=cv2.INTER_AREA)
    tag_h = 0
    if tag:
        f = font(tag_font, 30)
        tag_h = 54
    hh = phh + 2 * margin + tag_h
    card = (paper(hh, width, PAPER_W, seed, 0.03) * 255).astype(np.uint8)
    card[margin:margin + phh, margin:margin + pw] = (grade(ph) * 255).astype(np.uint8)
    img = Image.fromarray(card).convert("RGBA")
    if tag:
        ImageDraw.Draw(img).text((margin + 4, margin + phh + 12), tag, font=f, fill=INK + (255,))
    al = Image.new("L", img.size, 0)
    ImageDraw.Draw(al).rounded_rectangle([0, 0, width - 1, hh - 1], radius=radius, fill=255)
    img.putalpha(al)
    if tape:
        add_tape(img, seed, width - 120, -6)
    return img


def card_handoff(t, t0, dur=0.42, kind="slide", direction=-1):
    """Exit motion for the opening card as the sticker slaps in, on the stop-motion grid.

    Returns (dx, dy, rot_extra, visible). kind "slide": the card slides off sideways with a tilt;
    kind "lift": it rises and shrinks away. Hand-off should finish by about 1.3-1.5 s.
    """
    if t < t0:
        return 0.0, 0.0, 0.0, True
    k = (step_t(t) - t0) / dur
    if k >= 1:
        return 0.0, 0.0, 0.0, False
    e = ease_out(k) ** 1.4
    if kind == "lift":
        return 0.0, -1200 * e, 6 * e * direction, True
    return direction * 1300 * e, -80 * e, 12 * e * direction, True


def torn_reveal(img, p, seed):
    """Tear an RGBA prop away from the bottom up: p = 0 intact, p = 1 gone (a card torn off)."""
    if p <= 0:
        return img
    w, h = img.size
    yy = h * (1 - min(1.0, p)) + tear_line(seed, w, 9)[:w] * 2
    rows = np.arange(h)[:, None]
    keep = (rows < yy[None, :]).astype(np.uint8) * 255
    al = np.minimum(np.asarray(img.split()[-1]), keep)
    out = img.copy()
    out.putalpha(Image.fromarray(al.astype(np.uint8)))
    return out


def logo_from_footage(src_rgb01, crop, height, seed, key_white=False):
    """Crop the real logo out of a source frame (banner, lectern, slide) and make it a paper clipping.

    key_white=True drops near-white background so a printed logo reads as cut out.
    """
    x0, y0, x1, y1 = crop
    lg = src_rgb01[y0:y1, x0:x1]
    w = int(round(lg.shape[1] * height / lg.shape[0]))
    lg = cv2.resize(lg, (w, height), interpolation=cv2.INTER_AREA)
    m = 14
    img = Image.new("RGBA", (w + 2 * m, height + 2 * m), (0, 0, 0, 0))
    base = (paper(height + 2 * m, w + 2 * m, PAPER_W, seed) * 255).astype(np.uint8)
    base[m:m + height, m:m + w] = (lg * 255).astype(np.uint8)
    al = Image.new("L", img.size, 0)
    ImageDraw.Draw(al).polygon(torn_polygon(w + 2 * m, height + 2 * m, seed, 5), fill=255)
    img = Image.fromarray(base).convert("RGBA")
    img.putalpha(al)
    if key_white:
        a = np.asarray(img).copy()
        inner = a[m:m + height, m:m + w]
        white = inner[..., :3].min(2) > 235
        inner[..., 3] = np.where(white, 0, inner[..., 3])
        img = Image.fromarray(a)
    return img


# ---------- beats ----------

def act_at(acts, t):
    """acts: list of tuples whose first item is the start time, sorted. Returns the current one."""
    cur = acts[0]
    for a in acts:
        if t >= a[0]:
            cur = a
    return cur


def caption_at(captions, t):
    """captions: [(start, end, text)]. Returns the text showing at t, or None."""
    for s, e, txt in captions:
        if s <= t < e:
            return txt
    return None
