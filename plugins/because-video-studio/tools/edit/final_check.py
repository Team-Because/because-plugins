#!/usr/bin/env python3
"""Final quality gate for every finished video. Run it before showing anything.

  <studio python> tools/edit/final_check.py <video> [--duration S] [--fps N] [--size WxH] [--lufs -14] [--json]

Checks: file plays, length, frame rate, size, audio present, loudness (LUFS) and true peak, black frames, frozen frames.
Prints PASS / WARN / FAIL per check, then a one-line verdict. Exit code 0 = no FAIL.
"""
import argparse, json, re, subprocess, sys
from pathlib import Path


def sh(*a):
    return subprocess.run(list(map(str, a)), capture_output=True, text=True)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("video")
    ap.add_argument("--duration", type=float); ap.add_argument("--fps", type=float); ap.add_argument("--size")
    ap.add_argument("--lufs", type=float, default=-14.0, help="target loudness (default -14 for social)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    p = Path(a.video)
    res = []
    def add(level, name, detail): res.append({"level": level, "check": name, "detail": detail})
    if not p.exists() or p.stat().st_size == 0: sys.exit(f"FAIL file missing or empty: {p}")
    r = sh("ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", p)
    if r.returncode != 0: sys.exit("FAIL ffprobe cannot read this file (corrupt or unfinished render)")
    d = json.loads(r.stdout); v = next((s for s in d["streams"] if s["codec_type"] == "video"), None)
    au = next((s for s in d["streams"] if s["codec_type"] == "audio"), None)
    if not v: sys.exit("FAIL no video stream")
    dur = float(d["format"].get("duration", 0)); n, m = v["avg_frame_rate"].split("/"); fps = int(n) / max(int(m), 1)
    add("PASS", "plays", f"{v['codec_name']} {v['width']}x{v['height']} {fps:.2f}fps {dur:.2f}s")
    if a.duration is not None:
        add("PASS" if abs(dur - a.duration) <= max(0.3, a.duration * 0.02) else "FAIL", "length", f"{dur:.2f}s vs wanted {a.duration}s")
    if a.fps is not None:
        add("PASS" if abs(fps - a.fps) < 0.1 else "FAIL", "frame rate", f"{fps:.2f} vs wanted {a.fps}")
    if a.size:
        add("PASS" if a.size == f"{v['width']}x{v['height']}" else "FAIL", "size", f"{v['width']}x{v['height']} vs wanted {a.size}")
    if not au:
        add("WARN", "audio", "no audio track (fine for silent loops, wrong for everything else)")
    else:
        e = sh("ffmpeg", "-nostats", "-i", p, "-vn", "-af", "ebur128=peak=true", "-f", "null", "-").stderr
        i = re.findall(r"I:\s+(-?\d+\.\d+) LUFS", e); pk = re.findall(r"Peak:\s+(-?\d+\.\d+) dBFS", e)
        if not i or float(i[-1]) < -60:
            add("FAIL", "audio", "track is silent")
        else:
            L = float(i[-1]); add("PASS" if abs(L - a.lufs) <= 2 else "WARN", "loudness", f"{L:.1f} LUFS (target {a.lufs} +-2)")
            if pk: add("PASS" if float(pk[-1]) <= -0.9 else "WARN", "peak", f"{pk[-1]} dBFS (keep under -1)")
    b = sh("ffmpeg", "-nostats", "-i", p, "-an", "-vf", "blackdetect=d=0.3:pic_th=0.98", "-f", "null", "-").stderr
    blk = re.findall(r"black_start:(\S+) black_end:(\S+)", b)
    add("PASS" if not blk else "WARN", "black frames", "none" if not blk else "; ".join(f"{float(s):.1f}-{float(e):.1f}s" for s, e in blk[:6]))
    f = sh("ffmpeg", "-nostats", "-i", p, "-an", "-vf", "freezedetect=n=0.003:d=1.0", "-f", "null", "-").stderr
    fs = re.findall(r"freeze_start: (\S+)", f); fd = re.findall(r"freeze_duration: (\S+)", f)
    add("PASS" if not fs else "WARN", "frozen frames", "none" if not fs else "; ".join(f"{float(s):.1f}s for {float(x):.1f}s" for s, x in zip(fs, fd)) + " (ok only if a hold was intended)")
    if a.json: print(json.dumps(res, indent=1))
    else:
        for x in res: print(f"{x['level']:4}  {x['check']:14} {x['detail']}")
    fails = [x for x in res if x["level"] == "FAIL"]; warns = [x for x in res if x["level"] == "WARN"]
    print(f"\n{'FAIL' if fails else 'OK'}: {len(fails)} fail, {len(warns)} warn")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
