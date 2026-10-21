"""Shared helpers for the editable-export layer manifest (see ../reference/manifest.md).

Loads a manifest, fills defaults, validates it and offers small colour/time helpers.
Standard library only, so the scripts run on any Mac without pip installs.
"""
import json
import os
import sys

LAYER_TYPES = {"footage", "image", "text", "solid", "shape", "audio", "null"}
VISUAL = LAYER_TYPES - {"audio"}
KF_PROPS = ("position", "scale", "rotation", "opacity", "anchor")


def die(msg):
    sys.stderr.write("manifest error: " + msg + "\n")
    sys.exit(2)


def hex_to_rgb01(c, default=(1.0, 1.0, 1.0)):
    """'#RRGGBB' / '#RGB' / [r,g,b] (0-1 or 0-255) -> [r,g,b] floats 0-1."""
    if c is None:
        return list(default)
    if isinstance(c, (list, tuple)):
        v = [float(x) for x in c[:3]]
        return [x / 255.0 for x in v] if max(v) > 1.0 else v
    s = str(c).strip().lstrip("#")
    if s.startswith("rgb"):
        nums = [float(x) for x in s[s.index("(") + 1:s.index(")")].split(",")[:3]]
        return [x / 255.0 for x in nums]
    if len(s) == 3:
        s = "".join(ch * 2 for ch in s)
    if len(s) < 6:
        return list(default)
    return [int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def load(path):
    with open(path, encoding="utf-8") as f:
        m = json.load(f)
    m["_path"] = os.path.abspath(path)
    m.setdefault("root", ".")
    m["_root"] = os.path.abspath(os.path.join(os.path.dirname(m["_path"]), m["root"]))
    return normalize(m)


def normalize(m):
    for k in ("name", "width", "height", "fps"):
        if k not in m:
            die("missing top-level '%s'" % k)
    fps = float(m["fps"])
    if "duration" not in m and "frames" not in m:
        die("need 'duration' (seconds) or 'frames'")
    if "frames" not in m:
        m["frames"] = int(round(float(m["duration"]) * fps))
    m["duration"] = m["frames"] / fps
    m.setdefault("slug", "".join(ch if ch.isalnum() else "_" for ch in m["name"]).strip("_"))
    m.setdefault("pixelAspect", 1)
    m.setdefault("bgColor", "#000000")
    m.setdefault("markers", [])
    m.setdefault("fonts", [])
    m.setdefault("editableDefault", True)
    ids = set()
    layers = m.get("layers") or die("no 'layers'")
    for i, L in enumerate(layers):
        t = L.get("type")
        if t not in LAYER_TYPES:
            die("layer %d: type '%s' not in %s" % (i, t, sorted(LAYER_TYPES)))
        L.setdefault("id", "L%02d" % (i + 1))
        if L["id"] in ids:
            die("duplicate layer id " + L["id"])
        ids.add(L["id"])
        L.setdefault("name", L["id"])
        L.setdefault("in", 0.0)
        L.setdefault("out", m["duration"])
        L.setdefault("srcIn", 0.0)
        L.setdefault("enabled", True)
        L.setdefault("role", "main")          # main | baked | live | reference
        L.setdefault("targets", default_targets(L))
        if L["out"] <= L["in"]:
            die("layer %s: out (%s) must be after in (%s)" % (L["id"], L["out"], L["in"]))
        if t in ("footage", "image", "audio") and not L.get("src"):
            die("layer %s (%s) needs 'src'" % (L["id"], t))
        if t == "text" and "text" not in L:
            die("layer %s: text layer needs 'text'" % L["id"])
        tr = L.setdefault("transform", {})
        if t in VISUAL:
            tr.setdefault("position", [m["width"] / 2.0, m["height"] / 2.0])
            tr.setdefault("scale", [100, 100])
            tr.setdefault("rotation", 0)
            tr.setdefault("opacity", 100)
        kf = L.setdefault("keyframes", {})
        for p in list(kf):
            if p not in KF_PROPS:
                die("layer %s: keyframes for unknown property '%s'" % (L["id"], p))
            kf[p] = sorted(([float(a), b] for a, b in kf[p]), key=lambda x: x[0])
    for L in layers:
        if L.get("parent") and L["parent"] not in ids:
            die("layer %s: parent '%s' not found" % (L["id"], L["parent"]))
    return m


def default_targets(L):
    t, role = L["type"], L.get("role", "main")
    if t in ("text", "shape", "null") or role == "live":
        return ["ae"]                      # Premiere can't rebuild these natively from XML
    if t == "solid":
        return ["ae"]
    return ["ae", "premiere"]


def rel(m, p):
    """Path of a package file, relative to the package root, with forward slashes."""
    return p.replace(os.sep, "/")


def abspath(m, p):
    return os.path.normpath(os.path.join(m["_root"], p))


def frames(m, seconds):
    return int(round(float(seconds) * float(m["fps"])))
