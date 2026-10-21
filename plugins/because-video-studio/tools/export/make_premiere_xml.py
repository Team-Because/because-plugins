#!/usr/bin/env python3
"""Layer manifest -> FCP7 XML (xmeml v4) that Premiere Pro imports as a multi-track sequence.

    python3 make_premiere_xml.py <package>/manifest.json [-o <package>/<slug>_premiere.xml]
        [--center-units frame|width] [--rotation-sign 1|-1]

Every footage/image layer whose targets include "premiere" becomes one clip on its own video track
(V1 = bottom of the manifest stack), every audio layer one clip on its own audio track.
Basic Motion (center, scale, rotation) and Opacity are written as static values or keyframes.
Text/shape/solid layers can't be rebuilt natively from xmeml: give Premiere their baked render instead
(a footage layer with role "baked"), and use the After Effects script for live text.

Paths are absolute (Premiere needs that) and point at the package's current location: re-run this
script after moving the package, or relink in Premiere (it asks).

Untested conventions, switchable by flag (see reference/premiere-ae-notes.md):
  --center-units frame   horiz = dx / seq width, vert = dy / seq height   (default; Kesariyo package)
  --center-units width   both offsets divided by the sequence width
  --rotation-sign        1 = same direction as AE (default), -1 to flip
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from urllib.parse import quote
from xml.sax.saxutils import escape

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import manifest as M  # noqa: E402


def probe(path):
    """Duration (s), width, height, channels, sample rate via ffprobe; {} if unavailable."""
    if not shutil.which("ffprobe") or not os.path.exists(path):
        return {}
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                              "format=duration:stream=codec_type,width,height,channels,sample_rate",
                              "-of", "json", path], capture_output=True, text=True, timeout=30).stdout
        j = json.loads(out)
    except Exception:
        return {}
    r = {"duration": float(j.get("format", {}).get("duration", 0) or 0)}
    for s in j.get("streams", []):
        if s.get("codec_type") == "video" and "width" not in r:
            r.update(width=s.get("width"), height=s.get("height"))
        if s.get("codec_type") == "audio" and "channels" not in r:
            r.update(channels=s.get("channels"), sample_rate=int(s.get("sample_rate", 48000)))
    return r


def rate(fps):
    fr = float(fps)
    ntsc = abs(fr - round(fr)) > 0.01
    tb = int(round(fr)) if not ntsc else int(round(fr * 1.001))
    return "<rate><timebase>%d</timebase><ntsc>%s</ntsc></rate>" % (tb, "TRUE" if ntsc else "FALSE")


def pathurl(p):
    return "file://localhost" + quote(os.path.abspath(p), safe="/")


class Writer:
    def __init__(self, m, center_units="frame", rot_sign=1):
        self.m, self.cu, self.rs = m, center_units, rot_sign
        self.W, self.H, self.fps = m["width"], m["height"], float(m["fps"])
        self.R = rate(self.fps)
        self.files = {}
        self.warn = []

    def f(self, s):
        return M.frames(self.m, s)

    def center(self, xy):
        x, y = float(xy[0]), float(xy[1])
        dy_div = self.W if self.cu == "width" else self.H
        return "<horiz>%.5f</horiz><vert>%.5f</vert>" % ((x - self.W / 2.0) / self.W, (y - self.H / 2.0) / dy_div)

    def file_el(self, L, kind):
        src = M.abspath(self.m, L["src"])
        if src in self.files:
            return '<file id="%s"/>' % self.files[src]
        fid = "file-%d" % (len(self.files) + 1)
        self.files[src] = fid
        info = probe(src)
        if not info and not os.path.exists(src):
            self.warn.append("missing: " + L["src"])
        dur_s = info.get("duration") or L.get("srcDuration") or (L["out"] - L["in"] + L["srcIn"])
        if L["type"] == "image":
            dur_s = max(dur_s, L["out"] - L["in"] + L["srcIn"], 3600 / self.fps)
        dur = self.f(dur_s)
        if kind == "video":
            w = info.get("width") or L.get("width") or self.W
            h = info.get("height") or L.get("height") or self.H
            media = ("<media><video><samplecharacteristics>%s<width>%d</width><height>%d</height><anamorphic>FALSE</anamorphic>"
                     "<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video></media>"
                     % (self.R, w, h))
        else:
            ch = info.get("channels") or L.get("channels") or 2
            sr = info.get("sample_rate") or L.get("sampleRate") or 48000
            media = ("<media><audio><samplecharacteristics><depth>24</depth><samplerate>%d</samplerate></samplecharacteristics>"
                     "<channelcount>%d</channelcount></audio></media>" % (sr, ch))
        return ('<file id="%s"><name>%s</name><pathurl>%s</pathurl>%s<duration>%d</duration>%s</file>'
                % (fid, escape(os.path.basename(src)), escape(pathurl(src)), self.R, dur, media)), dur

    def when(self, L, t):
        return self.f(t - L["in"] + L["srcIn"])

    def param(self, pid, name, static, kfs, fmt, lo=None, hi=None):
        rng = "" if lo is None else "<valuemin>%s</valuemin><valuemax>%s</valuemax>" % (lo, hi)
        x = "<parameter><parameterid>%s</parameterid><name>%s</name>%s<value>%s</value>" % (pid, name, rng, fmt(static))
        for t, v in kfs:
            x += "<keyframe><when>%d</when><value>%s</value></keyframe>" % (t, fmt(v))
        return x + "</parameter>"

    def motion(self, L):
        T, K = L["transform"], L["keyframes"]
        sc = lambda v: "%.3f" % (float(v[0]) if isinstance(v, (list, tuple)) else float(v))
        for v in [T["scale"]] + [b for _, b in K.get("scale", [])]:
            if isinstance(v, (list, tuple)) and abs(float(v[0]) - float(v[1])) > 0.01:
                self.warn.append("%s: non-uniform scale, Premiere gets the X value" % L["name"])
                break
        if K.get("anchor") or (T.get("anchor") and L["type"] != "image"):
            self.warn.append("%s: anchor point not exported to Premiere (positions are clip centres)" % L["name"])
        kf = lambda p: [(self.when(L, t), v) for t, v in K.get(p, [])]
        rot = lambda v: "%.3f" % (self.rs * float(v))
        x = ("<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory>"
             "<effecttype>motion</effecttype><mediatype>video</mediatype>")
        x += self.param("scale", "Scale", T["scale"], kf("scale"), sc, 0, 1000)
        x += self.param("rotation", "Rotation", T["rotation"], kf("rotation"), rot, -8640, 8640)
        x += self.param("center", "Center", T["position"], kf("position"), self.center)
        x += "</effect></filter>"
        if K.get("opacity") or float(T["opacity"]) != 100:
            x += ("<filter><effect><name>Opacity</name><effectid>opacity</effectid><effectcategory>motion</effectcategory>"
                  "<effecttype>motion</effecttype><mediatype>video</mediatype>")
            x += self.param("opacity", "opacity", T["opacity"], kf("opacity"), lambda v: "%.2f" % float(v), 0, 100)
            x += "</effect></filter>"
        return x

    def clip(self, L, n, kind):
        fe = self.file_el(L, kind)
        file_xml, src_dur = (fe if isinstance(fe, tuple) else (fe, None))
        if src_dur is None:
            src_dur = self.f(L.get("srcDuration") or (L["out"] - L["in"] + L["srcIn"]))
        start, end = self.f(L["in"]), self.f(L["out"])
        cin = self.f(L["srcIn"])
        x = ('<clipitem id="%s-%d"><name>%s</name><enabled>%s</enabled><duration>%d</duration>%s'
             "<start>%d</start><end>%d</end><in>%d</in><out>%d</out>%s"
             % (kind[0], n, escape(L["name"]), "TRUE" if L["enabled"] else "FALSE", src_dur, self.R,
                start, end, cin, cin + (end - start), file_xml))
        if kind == "video":
            x += self.motion(L)
        else:
            x += "<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>"
            if L.get("gainDb") is not None:
                lvl = 10 ** (float(L["gainDb"]) / 20.0)
                x += ("<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory>"
                      "<effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid>"
                      "<name>Level</name><valuemin>0</valuemin><valuemax>3.98109</valuemax><value>%.5f</value></parameter></effect></filter>" % lvl)
        return x + "</clipitem>"

    def build(self):
        m = self.m
        vids = [L for L in m["layers"] if "premiere" in L["targets"] and L["type"] in ("footage", "image")]
        auds = [L for L in m["layers"] if "premiere" in L["targets"] and L["type"] == "audio"]
        skipped = [L["name"] for L in m["layers"] if "premiere" not in L["targets"] or L["type"] not in ("footage", "image", "audio")]
        vt = "".join("<track>%s</track>" % self.clip(L, i + 1, "video") for i, L in enumerate(vids))
        at = "".join("<track>%s</track>" % self.clip(L, i + 1, "audio") for i, L in enumerate(auds))
        markers = "".join("<marker><name>%s</name><comment></comment><in>%d</in><out>-1</out></marker>"
                          % (escape(mk["name"]), self.f(mk["t"])) for mk in m["markers"])
        fmt = ("<format><samplecharacteristics>%s<width>%d</width><height>%d</height><anamorphic>FALSE</anamorphic>"
               "<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>"
               % (self.R, self.W, self.H))
        xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">'
               '<sequence id="sequence-1"><name>%s</name><duration>%d</duration>%s%s'
               "<media><video>%s%s</video><audio><numOutputChannels>2</numOutputChannels>"
               "<format><samplecharacteristics><depth>24</depth><samplerate>48000</samplerate></samplecharacteristics></format>"
               "%s</audio></media></sequence></xmeml>\n"
               % (escape(m["name"]), m["frames"], self.R, markers, fmt, vt, at))
        return xml, len(vids), len(auds), skipped


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifest")
    ap.add_argument("-o", "--out")
    ap.add_argument("--center-units", choices=["frame", "width"], default="frame")
    ap.add_argument("--rotation-sign", type=int, choices=[1, -1], default=1)
    a = ap.parse_args()
    m = M.load(a.manifest)
    w = Writer(m, a.center_units, a.rotation_sign)
    xml, nv, na, skipped = w.build()
    out = a.out or os.path.join(m["_root"], m["slug"] + "_premiere.xml")
    with open(out, "w", encoding="utf-8") as f:
        f.write(xml)
    print("wrote %s (V%d / A%d)" % (out, nv, na))
    if skipped:
        print("  not in Premiere (AE-only / live layers): " + ", ".join(skipped))
    for x in dict.fromkeys(w.warn):
        print("  ! " + x)


if __name__ == "__main__":
    main()
