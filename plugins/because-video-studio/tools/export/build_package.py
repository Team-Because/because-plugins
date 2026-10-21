#!/usr/bin/env python3
"""Assemble the editable hand-off package from a layer manifest.

    python3 build_package.py <manifest.json> --out <package-dir> [--pad-audio] [--zip] [--baked]
        [--font-dirs DIR ...] [--center-units frame|width]

Steps
 1. validate the manifest (scripts/manifest.py)
 2. collect: every layer/font with a "from" (absolute source path) is copied into the package
    (footage -> video/, images -> images/, audio -> audio/ as 48 kHz 24-bit WAV, fonts -> fonts/);
    fonts without "from" are searched in --font-dirs and the system font folders (Mac and Windows)
 3. --pad-audio: every audio stem is rendered to start at 0:00 and run the full length (editor-friendly)
 4. writes <slug>_AfterEffects.jsx, <slug>_premiere.xml, manifest.json and README.md (the editor's guide)
 5. --zip: <package-dir>.zip next to it
The package is self-contained and relative: zip it, send it, open it anywhere (Premiere relinks once).
"""
import argparse
import copy
import glob
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import manifest as M  # noqa: E402
import make_ae_jsx  # noqa: E402
import make_premiere_xml  # noqa: E402

STUDIO = os.path.abspath(os.path.join(HERE, "..", ".."))   # the studio folder (tools/export/ lives two levels down)
SUB = {"footage": "video", "image": "images", "audio": "audio"}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("failed: %s\n%s" % (" ".join(cmd), r.stderr[-2000:]))


def _key(n):
    return os.path.splitext(os.path.basename(n))[0].lower().replace(" ", "").replace("_", "").replace("-", "")


def find_font(f, dirs):
    """Exact matches only (file name, PostScript name, or family for variable fonts like Family[wght].ttf)."""
    want = {_key(n) for n in (f.get("file"), f.get("postscript")) if n}
    fam = _key(f.get("family") or "")
    for d in dirs:
        for p in glob.glob(os.path.join(os.path.expanduser(d), "**", "*.*"), recursive=True):
            if not p.lower().endswith((".ttf", ".otf", ".ttc", ".woff2", ".woff")):
                continue
            k = _key(p)
            if k in want or (fam and k.split("[")[0] == fam and "[" in k):
                return p
    return None


SYSTEM_FONT_DIRS = ("~/Library/Fonts", "/Library/Fonts", "/System/Library/Fonts",   # Mac
                    os.path.expandvars(r"%WINDIR%\Fonts"), os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Windows\Fonts"))   # Windows


def collect(m, out, pad_audio, font_dirs, copy_system=False):
    log = []
    for L in m["layers"]:
        src = L.get("from")
        if not src:
            continue
        sub = SUB.get(L["type"])
        if not sub:
            continue
        os.makedirs(os.path.join(out, sub), exist_ok=True)
        if L["type"] == "audio":
            dst = os.path.join(sub, os.path.splitext(os.path.basename(L.get("src") or src))[0] + ".wav")
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", src]
            if pad_audio:
                d_ms = int(round((L["in"] - L.get("srcIn", 0)) * 1000))
                af = []
                if L.get("srcIn"):
                    af.append("atrim=start=%f" % L["srcIn"])
                    af.append("asetpts=PTS-STARTPTS")
                if d_ms > 0:
                    af.append("adelay=%d:all=1" % d_ms)
                af.append("apad=whole_dur=%f" % m["duration"])
                cmd += ["-af", ",".join(af), "-t", "%f" % m["duration"]]
                L.update({"in": 0.0, "srcIn": 0.0, "out": m["duration"]})
            cmd += ["-ar", "48000", "-c:a", "pcm_s24le", os.path.join(out, dst)]
            run(cmd)
        else:
            dst = os.path.join(sub, os.path.basename(L.get("src") or src))
            if os.path.abspath(src) != os.path.abspath(os.path.join(out, dst)):
                shutil.copy2(src, os.path.join(out, dst))
        L["src"] = dst.replace(os.sep, "/")
        log.append(L["src"])
        L.pop("from", None)
    dirs = list(font_dirs) + [os.path.join(STUDIO, "library", "fonts"), os.path.join(STUDIO, "templates", "fonts")]
    for f in m.get("fonts", []):
        src = f.pop("from", None) or (f.get("file") and os.path.exists(os.path.join(out, f["file"])) and os.path.join(out, f["file"])) or find_font(f, dirs)
        if not src:
            sysf = find_font(f, SYSTEM_FONT_DIRS)
            if sysf and not copy_system:
                # installed on this Mac, licence unknown: never redistribute it silently
                f["installedAt"] = sysf
                f.setdefault("license", "system font: check the licence before sending it")
                log.append("FONT NOT COPIED (system font, licence unknown): %s -> %s" % (f.get("postscript") or f.get("family"), sysf))
                continue
            src = sysf
        if not src:
            f["missing"] = True
            log.append("FONT NOT FOUND: %s" % (f.get("postscript") or f.get("family")))
            continue
        os.makedirs(os.path.join(out, "fonts"), exist_ok=True)
        dst = os.path.join("fonts", os.path.basename(src))
        if os.path.abspath(src) != os.path.abspath(os.path.join(out, dst)):
            shutil.copy2(src, os.path.join(out, dst))
        f["file"] = dst
        lic = glob.glob(os.path.join(os.path.dirname(src), "OFL*.txt")) + glob.glob(os.path.join(os.path.dirname(src), "LICENSE*"))
        for p in lic[:1]:
            shutil.copy2(p, os.path.join(out, "fonts", "LICENSE-" + os.path.splitext(os.path.basename(src))[0] + ".txt"))
        log.append(dst)
    return log


def fmt_t(s):
    return "%d:%05.2f" % (int(s // 60), s % 60)


def readme(m, jsx, xml, prem_center):
    W, H = m["width"], m["height"]
    vis = [L for L in m["layers"] if L["type"] != "audio"]
    aud = [L for L in m["layers"] if L["type"] == "audio"]
    live = [L for L in vis if L["role"] == "live"]
    lines = [
        "# %s: editable package" % m["name"], "",
        "%d×%d · %s fps · %.2f s (%d frames)%s" % (W, H, ("%g" % float(m["fps"])), m["duration"], m["frames"],
                                                 (" · final render: `%s`" % m["source"]["final"]) if m.get("source", {}).get("final") else ""),
        "",
        "Every visual layer of the finished film is here as its own element, at the exact timing of the cut: footage/alpha",
        "renders, and (in After Effects) live text, shape and solid layers with their keyframes. `.prproj`/`.aep` files can't be",
        "written outside the apps, so the package rebuilds them: an **ExtendScript for After Effects** and an **FCP7 XML for Premiere Pro**.",
        "",
        "## Open in After Effects (most editable)",
        "1. Install the fonts in `fonts/` (double-click → Install). Restart AE if it was open.",
        "2. File ▸ Scripts ▸ Run Script File… → `%s` (keep it in this folder)." % os.path.basename(jsx),
        "3. It builds the comp `%s`, imports every file, creates %d live layers, sets keyframes, adds markers and saves `%s.aep` here."
        % (m["name"], len(live), m["slug"]),
        "4. Switch: open the script, set `EDITABLE = false` to use the baked (pixel) versions instead of live text/shapes.",
        "   Both versions are in the comp either way; the unused ones are just switched off.",
        "5. The script lists anything missing (files, fonts) in a dialog at the end. A missing font keeps the layer; pick the font in the Character panel.",
        "",
        "## Open in Premiere Pro",
        "1. File ▸ Import → `%s`. If it asks to relink, point it at `video/` and `audio/`." % os.path.basename(xml),
        "2. You get a %d×%d / %g fps sequence: V1 = bottom layer … top; one audio track per stem." % (W, H, float(m["fps"])),
        "3. Live text/shape layers can't travel in XML: Premiere gets their baked renders (or edit them in AE and Dynamic Link).",
        "4. Positions use FCP7 centre units (%s). If a layer lands in the wrong place, set Motion ▸ Position to the centre in the table below." % prem_center,
        "   Set Preferences ▸ Media ▸ Default Media Scaling to *None* before importing so nothing gets rescaled.",
        "",
        "## Layer stack (bottom → top)",
        "| # | Layer | Type | Role | In → Out | Position (centre) | Keyframes | File |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for i, L in enumerate(vis):
        k = ", ".join(sorted(L.get("keyframes", {}).keys())) or "–"
        what = L.get("src") or (("“%s”" % L["text"].replace("\n", " ")[:40]) if L["type"] == "text" else L.get("shape", ""))
        pos = L["transform"].get("position", ["", ""])
        lines.append("| %d | %s | %s | %s | %s → %s | %s, %s | %s | %s |" % (
            i + 1, L["name"], L["type"], L["role"], fmt_t(L["in"]), fmt_t(L["out"]),
            round(pos[0], 1) if pos[0] != "" else "", round(pos[1], 1) if pos[1] != "" else "", k, what))
    lines += ["", "Roles: **main** = in both apps · **live** = native AE layer (text/shape), on when `EDITABLE = true` ·",
              "**baked** = pixel version of live layers, used by Premiere and by AE when `EDITABLE = false` · **reference** = off by default.", ""]
    if aud:
        lines += ["## Audio stems", "| Track | File | In → Out | Gain |", "|---|---|---|---|"]
        for i, L in enumerate(aud):
            lines.append("| A%d %s | `%s` | %s → %s | %s |" % (i + 1, L["name"], L["src"], fmt_t(L["in"]), fmt_t(L["out"]),
                                                          ("%+.1f dB" % L["gainDb"]) if L.get("gainDb") is not None else "0 dB"))
        if m.get("mix"):
            lines += ["", "Mix: " + m["mix"]]
        lines.append("")
    if m.get("fonts"):
        lines += ["## Fonts", "| Family | PostScript name (AE) | File | Licence |", "|---|---|---|---|"]
        for f in m["fonts"]:
            lines.append("| %s | %s | %s | %s |" % (f.get("family", ""), f.get("postscript", ""),
                                                  ("`%s`" % f["file"]) if f.get("file") else "**missing: install it**", f.get("license", "see fonts/")))
        lines.append("")
    if m["markers"]:
        lines += ["## Markers (scenes)", "| Time | Name |", "|---|---|"] + ["| %s | %s |" % (fmt_t(x["t"]), x["name"]) for x in m["markers"]] + [""]
    lines += [
        "## Caveats",
        "- Keyframes were sampled from the film's timeline and simplified (linear between keys). Springs and eases look right",
        "  but are keyframe approximations: tweak the graph editor if you need a different feel.",
        "- Text metrics differ slightly between the browser and AE: check line breaks and baseline positions on the first frame.",
        "- Effects that were pixels in the film (blur, grain, glow, masks drawn on canvas) are inside the footage layers, not live.",
        "- Not tested in this exact Premiere/AE version: the layer files are standard ProRes 4444 / ProRes 422 / H.264 / WAV and open anywhere.",
    ]
    lines += ["- " + c for c in m.get("caveats", [])]
    lines += ["", "Package made with Because Video Studio (the export skill). To rebuild the script and XML after editing `manifest.json`,",
              "run `<studio python> tools/export/build_package.py <this-folder>/manifest.json --out <this-folder>` from the studio folder."]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifest")
    ap.add_argument("--out", required=True, help="package folder (created)")
    ap.add_argument("--pad-audio", action="store_true")
    ap.add_argument("--zip", action="store_true")
    ap.add_argument("--baked", action="store_true", help="AE script defaults to EDITABLE=false")
    ap.add_argument("--font-dirs", nargs="*", default=[])
    ap.add_argument("--copy-system-fonts", action="store_true", help="also copy fonts found in ~/Library/Fonts etc. (only if their licence allows it)")
    ap.add_argument("--center-units", choices=["frame", "width"], default="frame")
    a = ap.parse_args()
    m = M.load(a.manifest)
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    # resolve "from" relative to the manifest's own folder
    base = os.path.dirname(m["_path"])
    for L in m["layers"]:
        if L.get("from"):
            L["from"] = os.path.normpath(os.path.join(base, L["from"]))
            real = os.path.realpath(L["from"])
            if not (real.startswith(os.path.realpath(STUDIO) + os.sep) and os.path.isfile(real)):
                M.die("layer %s: source file must be inside the studio folder: %s" % (L.get("id"), L["from"]))
        elif L["type"] in SUB and L.get("src") and not os.path.exists(os.path.join(out, L["src"])) and os.path.exists(M.abspath(m, L["src"])):
            L["from"] = M.abspath(m, L["src"])
    for f in m.get("fonts", []):
        if f.get("from"):
            f["from"] = os.path.normpath(os.path.join(base, f["from"]))
    log = collect(m, out, a.pad_audio, a.font_dirs, a.copy_system_fonts)
    m["root"] = "."
    m["_root"] = out
    clean = {k: v for k, v in copy.deepcopy(m).items() if not k.startswith("_")}
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(clean, f, ensure_ascii=False, indent=1)
    jsx = os.path.join(out, m["slug"] + "_AfterEffects.jsx")
    with open(jsx, "w", encoding="utf-8") as f:
        f.write(make_ae_jsx.build(m, editable=False if a.baked else None))
    w = make_premiere_xml.Writer(m, a.center_units)
    xml_s, nv, na, _ = w.build()
    xml = os.path.join(out, m["slug"] + "_premiere.xml")
    with open(xml, "w", encoding="utf-8") as f:
        f.write(xml_s)
    with open(os.path.join(out, "README.md"), "w", encoding="utf-8") as f:
        f.write(readme(m, jsx, xml, "offset ÷ sequence width/height" if a.center_units == "frame" else "offset ÷ sequence width"))
    print("package: %s\n  collected %d files\n  AE script: %s\n  Premiere XML: %s (V%d/A%d)" % (out, len(log), os.path.basename(jsx), os.path.basename(xml), nv, na))
    for x in log:
        if x.startswith("FONT NOT"):
            print("  ! " + x)
    for x in dict.fromkeys(w.warn):
        print("  ! " + x)
    if a.zip:
        z = shutil.make_archive(out, "zip", os.path.dirname(out), os.path.basename(out))
        print("  zip: " + z)


if __name__ == "__main__":
    main()
