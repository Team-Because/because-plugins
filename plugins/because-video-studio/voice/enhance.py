"""studio-voice: make recorded speech sound like a close microphone. Local, free, one command.

  enhance.py <in.(wav|mp3|m4a|mp4|mov|...)> <out.wav> [--video <out.mp4>] [--lufs -16]
             [--blend 0.1] [--tp -1.5] [--no-sync-fix] [--light]

Steps: extract audio (48 kHz mono) -> Sidon v0.1 restoration -> close-mic chain -> sync check
against the input (windowed; constant offset corrected, warning above 20 ms) -> optional blend of
the original -> loudness to target (default -16 LUFS, true peak <= -1.5 dBTP) -> 24-bit wav.
--video remuxes the enhanced voice onto the input's video stream (video copied, not re-encoded),
then re-checks sync on the finished file.

Runs in <studio>/.venv-voice (made by `setup.mjs --voice`). Any python can launch it: it
re-executes itself in that venv, on Mac and Windows.
"""
import os
import subprocess as _sp
import sys

_VENV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".venv-voice")
VENV_PY = os.path.join(_VENV, "Scripts", "python.exe") if os.name == "nt" else os.path.join(_VENV, "bin", "python")
if os.path.realpath(sys.prefix) != os.path.realpath(_VENV):
    if not os.path.exists(VENV_PY):
        sys.exit("The voice tools are not installed yet: run the setup skill's voice step (setup.mjs --voice).")
    if os.name == "nt":   # os.execv does not replace the process on Windows; run and pass the exit code on
        sys.exit(_sp.call([VENV_PY, os.path.abspath(__file__)] + sys.argv[1:]))
    os.execv(VENV_PY, [VENV_PY, os.path.abspath(__file__)] + sys.argv[1:])

import argparse  # noqa: E402
import json  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402
import tempfile  # noqa: E402
import time  # noqa: E402

import numpy as np  # noqa: E402
import pyloudnorm as pyln  # noqa: E402
import soundfile as sf  # noqa: E402
from pedalboard import Limiter, Pedalboard  # noqa: E402
from scipy.signal import resample_poly  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import closemic  # noqa: E402
import sidon  # noqa: E402
import sync  # noqa: E402

SR = 48000
WARN_MS = 20
sys.stdout.reconfigure(line_buffering=True)  # progress shows even when piped


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path],
                       capture_output=True, text=True, check=True)
    j = json.loads(r.stdout)
    st = j.get("streams", [])
    a = [s for s in st if s.get("codec_type") == "audio"]
    v = [s for s in st if s.get("codec_type") == "video" and s.get("disposition", {}).get("attached_pic", 0) == 0]
    return a, v, float(j.get("format", {}).get("duration", 0) or 0)


def extract(path, out):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", path, "-map", "0:a:0", "-vn", "-ac", "1",
                    "-ar", str(SR), "-c:a", "pcm_f32le", out], check=True)
    x, sr = sf.read(out, always_2d=True)
    assert sr == SR
    return x.mean(1)


def tp_db(y):
    return 20 * np.log10(np.abs(resample_poly(y, 4, 1)).max() + 1e-12)


def loudness(y, target, tp_max):
    """Same loop as the shootout's listen files: gain to target, limit if the true peak is over."""
    meter = pyln.Meter(SR)
    y = np.asarray(y, dtype=np.float64)
    for _ in range(6):
        y = y * 10 ** ((target - meter.integrated_loudness(y)) / 20)
        if tp_db(y) <= tp_max:
            break
        y = Pedalboard([Limiter(threshold_db=tp_max - 0.7, release_ms=60)])(
            y.astype(np.float32)[None], SR)[0].astype(np.float64)
    if tp_db(y) > tp_max:  # final safety trim
        y *= 10 ** ((tp_max - tp_db(y) - 0.05) / 20)
    return y, round(meter.integrated_loudness(y), 2), round(tp_db(y), 2)


def window_report(r):
    w = [v for v in r["windows_ms"] if v is not None]
    worst = max((abs(v) for v in w), default=0)
    return w, worst


def main():
    ap = argparse.ArgumentParser(description="Make recorded speech sound like a close mic (Sidon + close-mic chain).")
    ap.add_argument("input", help="audio or video file")
    ap.add_argument("output", help="enhanced voice, .wav (48 kHz mono 24-bit)")
    ap.add_argument("--video", help="also write this video: the input's video stream + the enhanced voice")
    ap.add_argument("--lufs", type=float, default=-16.0, help="-16 for a voice stem (default), -14 for a final social mix")
    ap.add_argument("--tp", type=float, default=-1.5, help="true-peak ceiling dBTP (default -1.5)")
    ap.add_argument("--blend", type=float, default=0.0, help="mix this share of the original back in, e.g. 0.1")
    ap.add_argument("--light", action="store_true", help="skip the warmth / de-box EQ (input already warm)")
    ap.add_argument("--no-sync-fix", action="store_true", help="measure the offset but do not correct it")
    ap.add_argument("--json", help="write the run report here as JSON")
    a = ap.parse_args()

    src = os.path.abspath(a.input)
    aud, vid, dur = probe(src)
    if not aud:
        sys.exit("no audio stream in input")
    if a.video and not vid:
        sys.exit("--video needs an input with a video stream")
    os.makedirs(os.path.dirname(os.path.abspath(a.output)) or ".", exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="studio-voice-")
    rep = {"input": src, "duration_s": round(dur, 2)}
    try:
        t0 = time.time()
        orig = extract(src, os.path.join(tmp, "orig48.wav"))
        print(f"[1/5] extracted {len(orig) / SR:.1f} s at 48 kHz mono")

        t = time.time()
        y = sidon.restore(orig, SR)
        rep["sidon_s"] = round(time.time() - t, 1)
        rep["sidon_seams_s"] = list(sidon.SEAMS)
        print(f"[2/5] Sidon restoration {rep['sidon_s']} s" + (f", {len(rep['sidon_seams_s'])} chunk seams" if rep["sidon_seams_s"] else ""))

        t = time.time()
        y, info = closemic.process(y, light=a.light)
        y = np.asarray(y, dtype=np.float64)[:len(orig)]
        rep["chain"] = info
        print(f"[3/5] close-mic chain {time.time() - t:.1f} s {info}")

        r = sync.check(orig, y)
        rep["sync_before"] = r
        g = r["global_ms"]
        if not a.no_sync_fix and abs(g) >= 3 and r["global_r"] >= 0.5:
            y = sync.shift(y, -g)
            r = sync.check(orig, y)
            rep["sync_corrected_ms"] = -g
        rep["sync_after"] = r
        w, worst = window_report(r)
        rep["sync_worst_window_ms"] = worst
        msg = f"[4/5] sync: constant offset {g} ms" + (f" corrected by {-g} ms" if "sync_corrected_ms" in rep else " (left)")
        msg += f", windows {min(w, default=0)} to {max(w, default=0)} ms ({len(w)} of {len(r['windows_ms'])} with speech)"
        print(msg)
        if worst > WARN_MS:
            print(f"WARNING: a window drifts {worst} ms from the input (limit {WARN_MS} ms). Check lip sync at "
                  + ", ".join(f"{i * r['window_s']:.0f}s" for i, v in enumerate(r["windows_ms"]) if v is not None and abs(v) > WARN_MS))
            rep["sync_warning"] = True

        if a.blend > 0:
            o = orig * (np.sqrt(np.mean(y ** 2)) / max(1e-9, np.sqrt(np.mean(orig ** 2))))
            y = (1 - a.blend) * y + a.blend * o
            rep["blend"] = a.blend

        y, lufs, tp = loudness(y, a.lufs, a.tp)
        sf.write(a.output, y.astype(np.float32), SR, subtype="PCM_24")
        rep.update(output=os.path.abspath(a.output), lufs=lufs, true_peak_dbtp=tp)
        print(f"[5/5] {lufs} LUFS, true peak {tp} dBTP -> {a.output}")

        if a.video:
            a_start = float(aud[0].get("start_time", 0) or 0)
            v_start = float(vid[0].get("start_time", 0) or 0)
            off = a_start - min(a_start, v_start)
            ext = os.path.splitext(a.video)[1].lower()
            acodec = ["-c:a", "aac", "-b:a", "256k"] if ext in (".mp4", ".m4v", ".mov") else ["-c:a", "pcm_s24le"] if ext == ".mkv" else ["-c:a", "aac", "-b:a", "256k"]
            cmd = ["ffmpeg", "-v", "error", "-y", "-i", src]
            if off > 0:
                cmd += ["-itsoffset", f"{off:.6f}"]
            cmd += ["-i", os.path.abspath(a.output), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", *acodec,
                    "-ar", str(SR), "-ac", "2"]  # dual mono: safest for every player
            if ext in (".mp4", ".m4v", ".mov"):
                cmd += ["-movflags", "+faststart"]
            subprocess.run(cmd + [a.video], check=True)
            mux = extract(a.video, os.path.join(tmp, "mux.wav"))
            rv = sync.check(orig, mux)
            wv, worstv = window_report(rv)
            rep.update(video=os.path.abspath(a.video), video_sync=rv, video_sync_worst_window_ms=worstv)
            print(f"video: {a.video} (video stream copied), voice vs input on the finished file: offset "
                  f"{rv['global_ms']} ms, worst window {worstv} ms" + ("  WARNING" if worstv > WARN_MS else ""))
        rep["total_s"] = round(time.time() - t0, 1)
        print(f"done in {rep['total_s']} s")
        if a.json:
            json.dump(rep, open(a.json, "w"), indent=1)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
