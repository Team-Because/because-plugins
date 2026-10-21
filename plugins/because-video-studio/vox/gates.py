"""Mechanical gates for a vox-reel build. Every one must pass before handover (references/gates.md).

  sheet  out.jpg frames/ 0,1.4,3.37,...  [--fps 25 --cols 6]   contact sheet at chosen seconds
  sbs    out.jpg old_frames/ new_frames/ 0,5,10   [--fps 25]    side-by-side vs previous version / source
  crop   frame.png out.png x y w h                               full-res crop (face, matte edge), 2x
  audit  audit/                                                  safe zones + frame edges from place() boxes
  loud   final.mp4                                               -14 LUFS +-1, true peak <= -1 dBTP
  probe  final.mp4                                               1080x1920, 25 fps, audio = video length

Exit code 1 on any failure, so a build script can chain them.
"""
import glob
import json
import os
import re
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
SAFE_TOP, SAFE_BOTTOM = 192, 1536
ALLOW_LOW = ("cap", "ledge", "desk", "floor", "sign")  # tags allowed below SAFE_BOTTOM (captions, anchors)


def _frame(d, i):
    for ext in ("png", "jpg"):
        p = os.path.join(d, f"{i:04d}.{ext}")
        if os.path.exists(p):
            return p
    raise FileNotFoundError(f"frame {i} not in {d}")


def _font(size=18):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", size)
    except OSError:
        return ImageFont.load_default()


def sheet(out, d, times, fps=25, cols=6, tw=270, th=480):
    last = max(int(os.path.splitext(os.path.basename(p))[0]) for p in glob.glob(os.path.join(d, "*.png")) + glob.glob(os.path.join(d, "*.jpg")))
    rows = (len(times) + cols - 1) // cols
    S = Image.new("RGB", (cols * tw, rows * (th + 26)), "white")
    dr = ImageDraw.Draw(S)
    for k, t in enumerate(times):
        i = min(last, round(t * fps))
        x, y = (k % cols) * tw, (k // cols) * (th + 26)
        S.paste(Image.open(_frame(d, i)).convert("RGB").resize((tw, th)), (x, y))
        dr.text((x + 6, y + th + 4), f"{t:.2f}s", fill="black", font=_font())
    S.save(out, quality=90)
    print("sheet ->", out)


def sbs(out, a, b, times, fps=25, tw=216, th=384):
    S = Image.new("RGB", (len(times) * tw, 2 * th + 30), "white")
    dr = ImageDraw.Draw(S)
    for k, t in enumerate(times):
        i = round(t * fps)
        S.paste(Image.open(_frame(a, i)).convert("RGB").resize((tw, th)), (k * tw, 30))
        S.paste(Image.open(_frame(b, i)).convert("RGB").resize((tw, th)), (k * tw, 30 + th))
        dr.text((k * tw + 4, 5), f"{t:.1f}s", fill="black", font=_font())
    S.save(out, quality=88)
    print("side-by-side (top = first dir) ->", out)


def crop(frame, out, x, y, w, h):
    im = Image.open(frame).crop((x, y, x + w, y + h))
    im.resize((w * 2, h * 2), Image.LANCZOS).save(out)
    print("crop ->", out)


def audit(d):
    """Reads audit/NNNN.json written by compose (voxkit.AUDIT = True): [[tag, x0, y0, x1, y1], ...]."""
    fails = []
    for p in sorted(glob.glob(os.path.join(d, "*.json"))):
        i = int(os.path.splitext(os.path.basename(p))[0])
        for tag, x0, y0, x1, y1 in json.load(open(p)):
            if tag.startswith("ground") or tag.startswith("speaker"):
                continue
            if y0 < SAFE_TOP:
                fails.append((i, tag, f"top {y0} < {SAFE_TOP}" + (" (FRAME 0 = thumbnail)" if i == 0 else "")))
            if y1 > SAFE_BOTTOM and not tag.startswith(ALLOW_LOW):
                fails.append((i, tag, f"bottom {y1} > {SAFE_BOTTOM}"))
            if (x0 < 0 or x1 >= W) and not tag.startswith("bleed"):
                fails.append((i, tag, f"cut by frame edge x {x0}..{x1}"))
    for f in fails[:200]:
        print("FAIL frame %4d  %-14s %s" % f)
    print(f"audit: {len(fails)} failures")
    return not fails


def loud(path):
    r = subprocess.run(["ffmpeg", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    tail = r.stderr[r.stderr.rfind("Summary:"):]
    i = float(re.search(r"I:\s+(-?[\d.]+) LUFS", tail).group(1))
    tp = float(re.search(r"Peak:\s+(-?[\d.]+) dBFS", tail).group(1))
    ok = -15.0 <= i <= -13.0 and tp <= -1.0
    print(f"loudness {i} LUFS, true peak {tp} dBFS -> {'pass' if ok else 'FAIL'} (target -14 +-1, peak <= -1)")
    return ok


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate,duration",
                        "-of", "json", path], capture_output=True, text=True)
    st = json.loads(r.stdout)["streams"]
    v = next(s for s in st if s["codec_type"] == "video")
    a = next((s for s in st if s["codec_type"] == "audio"), None)
    ok = v["width"] == W and v["height"] == H and a is not None and abs(float(v["duration"]) - float(a["duration"])) < 0.1
    print(f"video {v['width']}x{v['height']} {v['r_frame_rate']} {float(v['duration']):.2f}s, "
          f"audio {float(a['duration']):.2f}s" if a else "NO AUDIO", "->", "pass" if ok else "FAIL")
    return ok


if __name__ == "__main__":
    c, a = sys.argv[1], sys.argv[2:]
    kw = {}
    if "--fps" in a:
        kw["fps"] = int(a[a.index("--fps") + 1])
    ok = True
    if c == "sheet":
        sheet(a[0], a[1], [float(v) for v in a[2].split(",")], **kw)
    elif c == "sbs":
        sbs(a[0], a[1], a[2], [float(v) for v in a[3].split(",")], **kw)
    elif c == "crop":
        crop(a[0], a[1], *[int(v) for v in a[2:6]])
    elif c == "audit":
        ok = audit(a[0])
    elif c == "loud":
        ok = loud(a[0])
    elif c == "probe":
        ok = probe(a[0])
    else:
        print(__doc__)
        ok = False
    sys.exit(0 if ok else 1)
