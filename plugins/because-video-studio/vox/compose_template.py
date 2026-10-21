"""<TITLE>: Vox-style paper-collage reel (<DURATION> s), built locally with the vox-reel skill.

Copy this file into the video folder as compose.py, fill CONFIG and the BEATS section, then:
    <venv>/bin/python compose.py --only 0,35,100 --audit   # test frames + safe-zone audit boxes
    <venv>/bin/python compose.py                           # every frame -> out/frames/NNNN.jpg
Every frame is a pure function of its index: speaker matte from Apple Vision (masks/), paper world,
props, context cards and captions drawn in code, all randomness seeded.

Folder layout expected (all made by the method in references/method.md):
    frames/NNNN.jpg   source frames of the chosen segment (1-based names, ffmpeg default)
    masks/NNNN.png    Vision mattes (personmask), or cleaned mattes from matte.py
    docs/transcript.json  Whisper words (or a hand-made CAPTIONS list for non-English speech)
"""
import json
import math
import os
import sys
from multiprocessing import Pool

import cv2
import numpy as np
from PIL import Image

def _studio_vox():
    """The studio's vox tools: walk up from this file to the folder holding vox/voxkit.py."""
    d = os.path.dirname(os.path.abspath(__file__))
    while d != os.path.dirname(d):
        if os.path.exists(os.path.join(d, "vox", "voxkit.py")): return os.path.join(d, "vox")
        d = os.path.dirname(d)
    sys.exit("vox tools not found: build vox videos inside the studio folder (clients/<client>/videos/<name>/)")


SKILL = _studio_vox()
sys.path.insert(0, SKILL)
import voxkit as vk  # noqa: E402
from voxkit import *  # noqa: E402,F401,F403
from captions import chunk_words, hide, lint, load_words  # noqa: E402

# ======================= CONFIG =======================
FRAMES_DIR, MASKS_DIR = "frames", "masks"
FRAMES = sorted(f for f in os.listdir(FRAMES_DIR) if f.endswith((".jpg", ".png"))) if os.path.isdir(FRAMES_DIR) else []
N = len(FRAMES)
POOL = 2  # render CPU is shared with other builds: never more than 2-3 workers
vk.AUDIT = bool(os.environ.get("VOX_AUDIT"))  # set by --audit; env so the spawned workers see it too

HEAD_SRC, HEAD_DST = 450, 720   # speaker head-top row in the source -> on the canvas
CUT_SRC = None                  # source row for a torn bust cut (caption tape, lectern, audience); None = no cut
CAP_Y = 1440                    # caption tape centre row (on the bust edge or ledge, never across the chest)
FOLLOW = 0.7                    # how much of the speaker's sideways drift to cancel (0 = none, 1 = locked centre)

# Body copy for the newsprint ground: WRITE IT FOR THIS VIDEO (its story, its nouns). Never paste
# another video's paragraph (learnings.md).
BODY_TEXT = "<write 2-3 sentences of period-plausible copy about THIS story>"

GROUNDS = {  # one flat ground per beat; add notebook/chalk/paper colours as the story needs
    "news": newsprint_ground(BODY_TEXT),
    "red": flat_ground(RED, 21, (140, 24, 22)),
    "mustard": flat_ground(MUSTARD, 31, (205, 145, 40)),
    "ink": flat_ground((38, 35, 32), 41, (64, 60, 55), 14, 3.4),
    "cream": flat_ground(CREAM, 51, (214, 202, 178), 16, 3.0),
}
GRAIN = make_grain()

# Context cards (references/context-cards.md). Only for event/stage footage; None for a seated interview.
OPEN_CARD = None  # e.g. dict(crop=(0, 0, 1920, 1080), tag="LIVE ON STAGE, <EVENT>, <CITY>", t_out=1.0, kind="slide")
INSERTS = []      # e.g. [dict(t0=24.95, t1=27.0, crop=(0, 700, 1920, 1080), x=760, y=470, w=520, rot=-3, tag="THE ROOM")]

# ======================= BEATS =======================
# Times in seconds from docs/transcript.json word starts (or caption change frames).
# ACTS: (start, ground, speaker scale). A new act = a new ground = a new idea. An EVENT every 2-4 s.
ACTS = [
    (0.0, "cream", 1.0),
    # (T_..., "red", 1.62),   # punch-in on a story turn
]

L = {  # labels: torn clippings. Text written from the speaker's own words.
    # "key": label("WORD", F_HEAD, 150, INK, MUSTARD, 101, tape=True),
}


def behind(c, t):
    """Props drawn UNDER the speaker (behind the shoulders). One branch per act."""
    start = act_at(ACTS, t)[0]
    if start == 0.0:
        pass
    # elif start == T_...:
    #     prop(c, L["key"], t, T_WORD, 540, 380, -3, 1, tag="key")
    #     marker(c, partial(ring(540, 380, 220, 90, 9), draw_p(t, T_RING, 0.45)), RED, 12)


def front(c, t):
    """Props drawn OVER the speaker. Never over the face or hands. Then the caption."""
    start = act_at(ACTS, t)[0]
    if start == 0.0:
        pass
    txt = caption_at(CAPTIONS, t)
    if txt:
        dx, dy, dr = jitter(t, 30, 1.5, 0.4)
        place(c, cap_img(txt), 540 + dx, CAP_Y + dy, 1.0, -1.5 + dr, shadow=0.35, tag="caption")


# ======================= CAPTIONS =======================
CAPTION_HIDE = []  # [(t0, t1)] windows where a label already shows the same words


def build_captions():
    if not os.path.exists("docs/transcript.json"):
        return []
    ch = chunk_words(load_words("docs/transcript.json"))
    problems = lint(ch)
    if problems and __name__ == "__main__":
        print("caption lint (fix by hand before the full render):\n  " + "\n  ".join(problems))
    return hide(ch, CAPTION_HIDE)


CAPTIONS = build_captions()
_CAPS = {}


def cap_img(txt):
    if txt not in _CAPS:
        _CAPS[txt] = fit_label(txt, F_CAP, 76, CREAM, INK, 400 + sum(map(ord, txt)) % 1000, pad=(26, 14))
    return _CAPS[txt]


# ======================= SPEAKER =======================

def load_mask(j):
    m = cv2.imread(os.path.join(MASKS_DIR, os.path.splitext(FRAMES[j])[0] + ".png"), 0).astype(np.float32) / 255
    return fill_holes(keep_largest(m))


def centroids():
    if os.path.exists("cx.npy"):
        return np.load("cx.npy")
    cx = smooth_track([mask_centroid_x(load_mask(j), CUT_SRC) for j in range(N)])
    np.save("cx.npy", cx)
    return cx


CX = centroids() if N else []


def src_rgb(i):
    return cv2.cvtColor(cv2.imread(os.path.join(FRAMES_DIR, FRAMES[i])), cv2.COLOR_BGR2RGB).astype(np.float32) / 255


def speaker(c, i, scale):
    src = src_rgb(i)
    m = blend_masks([load_mask(j) for j in (max(0, i - 1), i, min(N - 1, i + 1))])
    rgb, a = warp_speaker(src, m, scale, HEAD_SRC, HEAD_DST, CX[i], FOLLOW)
    if CUT_SRC is not None:
        a = bust_cut(a, HEAD_DST + (CUT_SRC - HEAD_SRC) * scale, seed=int(act_at(ACTS, i / FPS)[0] * 100))
    return sticker_composite(c, grade(rgb), a)


def context_cards(c, i, t):
    """Opening live card (hand-off by ~1.3-1.5 s) and mid-reel live inserts, from the real footage."""
    if OPEN_CARD and t < OPEN_CARD["t_out"] + 0.6:
        dx, dy, dr, vis = card_handoff(t, OPEN_CARD["t_out"], kind=OPEN_CARD.get("kind", "slide"))
        if vis:
            card = photo_card(src_rgb(i), OPEN_CARD["crop"], 980, 700, tag=OPEN_CARD["tag"])
            jx, jy, jr = jitter(t, 701, 1.5, 0.3)
            tag = "bleed-card-open" if dx or dy else "card-open"  # leaving the frame is the point of the hand-off
            place(c, card, 540 + dx + jx, 860 + dy + jy, 1.0, -2 + dr + jr, shadow=0.45, tag=tag)
    for k, ins in enumerate(INSERTS):
        if ins["t0"] <= t < ins["t1"]:
            card = photo_card(src_rgb(i), ins["crop"], ins["w"], 710 + k, tag=ins.get("tag"))
            prop(c, card, t, ins["t0"], ins["x"], ins["y"], ins.get("rot", -3), 720 + k, 0.45, tag=f"card-{k}")


# ======================= RENDER =======================

def render(i):
    t = i / FPS
    start, ground, scale = act_at(ACTS, t)
    vk.PLACED.clear()
    c = GROUNDS[ground].copy()
    prev = [a for a in ACTS if a[0] < start]
    if prev and prev[-1][1] != ground:
        c = ground_rip(c, GROUNDS[prev[-1][1]], t, start, int(start * 100) + 5)
    behind(c, t)
    context_cards(c, i, t)  # under the sticker: it slaps in OVER the leaving card, inserts never cover him
    if OPEN_CARD and t < OPEN_CARD["t_out"]:
        pass  # the room card owns the opening; the sticker is not on the page yet
    else:
        t_in = OPEN_CARD["t_out"] if OPEN_CARD else -1.0
        c = speaker(c, i, scale * slap(t, t_in))  # the cut-out slaps in as the card leaves
    front(c, t)
    c = np.clip(c * GRAIN, 0, 1)
    Image.fromarray((c * 255).astype(np.uint8)).save(f"out/frames/{i:04d}.jpg", quality=95)
    if vk.AUDIT:
        json.dump(vk.PLACED, open(f"out/audit/{i:04d}.json", "w"))
    return i


if __name__ == "__main__":
    os.makedirs("out/frames", exist_ok=True)
    if "--audit" in sys.argv:
        os.environ["VOX_AUDIT"] = "1"
        vk.AUDIT = True
        os.makedirs("out/audit", exist_ok=True)
    idx = list(range(N))
    if "--only" in sys.argv:
        idx = [int(v) for v in sys.argv[sys.argv.index("--only") + 1].split(",")]
    with Pool(POOL) as pool:
        done = pool.map(render, idx, chunksize=4)
    print("rendered", len(done))
