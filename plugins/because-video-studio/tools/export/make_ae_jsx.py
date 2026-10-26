#!/usr/bin/env python3
"""Layer manifest -> After Effects ExtendScript (.jsx) that rebuilds the comp natively.

    python3 make_ae_jsx.py <package>/manifest.json [-o <package>/<slug>_AfterEffects.jsx]

The .jsx lives in the package root (next to video/, audio/, fonts/, images/) and resolves every
path relative to itself, so the folder can be moved or zipped. In AE: File > Scripts > Run Script File...

What it builds (bottom -> top, in manifest order):
  footage / image  -> imported footage layers (ProRes 4444 alpha stays alpha)
  text             -> LIVE text layers: font (PostScript name), size, fill, stroke, tracking, leading,
                      justification, box text, in/out
  solid            -> solid layers
  shape            -> shape layers (rect / rounded rect / ellipse, or the film's own paths; fill + stroke)
  null             -> null objects (for parenting / camera-like moves)
  audio            -> audio layers with gain
plus transform (anchor, position, scale, rotation, opacity), sampled keyframes (linear / ease / hold),
parenting, blend modes, track mattes, simple effects, comp markers, and the EDITABLE switch
(live layers on, baked duplicates off; or the reverse). Reports missing files and fonts at the end
and saves <slug>.aep next to the script.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import manifest as M  # noqa: E402

RUNTIME = r"""
(function () {
  var base = File($.fileName).parent.fsName;
  var D = DATA;
  var missing = [], fontMiss = [], made = 0;
  app.beginUndoGroup("Build " + D.name);
  var proj = app.project || app.newProject();
  var comp = proj.items.addComp(D.name, D.width, D.height, D.pixelAspect, D.duration, D.fps);
  comp.bgColor = D.bgColor;
  var fFoot = proj.items.addFolder(D.name + " - footage");
  var fAud = proj.items.addFolder(D.name + " - audio");
  var cache = {};

  function imp(rel, isAudio) {
    if (cache[rel]) return cache[rel];
    var f = File(base + "/" + rel);
    if (!f.exists) { missing.push(rel); return null; }
    var it = proj.importFile(new ImportOptions(f));
    it.parentFolder = isAudio ? fAud : fFoot;
    cache[rel] = it; return it;
  }
  function setColor(prop, c) { try { prop.setValue([c[0], c[1], c[2], 1]); } catch (e) { prop.setValue([c[0], c[1], c[2]]); } }
  function blend(name) {
    var map = { normal: BlendingMode.NORMAL, multiply: BlendingMode.MULTIPLY, screen: BlendingMode.SCREEN,
      add: BlendingMode.ADD, overlay: BlendingMode.OVERLAY, "soft-light": BlendingMode.SOFT_LIGHT,
      "hard-light": BlendingMode.HARD_LIGHT, darken: BlendingMode.DARKEN, lighten: BlendingMode.LIGHTEN,
      difference: BlendingMode.DIFFERENCE, color: BlendingMode.COLOR, luminosity: BlendingMode.LUMINOSITY,
      "color-dodge": BlendingMode.COLOR_DODGE, "color-burn": BlendingMode.COLOR_BURN };
    return map[name] || BlendingMode.NORMAL;
  }
  function keys(prop, list, ease) {
    if (!list || !list.length) return;
    var ts = [], vs = [], i;
    for (i = 0; i < list.length; i++) { ts.push(list[i][0]); vs.push(list[i][1]); }
    prop.setValuesAtTimes(ts, vs);
    for (i = 1; i <= prop.numKeys; i++) {
      try {
        if (ease === "hold") prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.HOLD);
        else if (ease === "ease") {
          var dims = prop.value instanceof Array ? (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL ? 1 : prop.value.length) : 1;
          var e = [], k; for (k = 0; k < dims; k++) e.push(new KeyframeEase(0, 33.33));
          prop.setTemporalEaseAtKey(i, e, e);
        } else prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.LINEAR);
        if (prop.isSpatial) { prop.setSpatialAutoBezierAtKey(i, false); prop.setSpatialContinuousAtKey(i, false); }
      } catch (e2) {}
    }
  }
  function transform(ly, L) {
    var T = L.transform || {}, K = L.keyframes || {}, tg = ly.transform;
    if (T.anchor) tg.anchorPoint.setValue(T.anchor);
    if (T.position) tg.position.setValue(T.position);
    if (T.scale) tg.scale.setValue(T.scale);
    if (T.rotation !== undefined) tg.rotation.setValue(T.rotation);
    if (T.opacity !== undefined) tg.opacity.setValue(T.opacity);
    var ease = L.ease || D.ease || "linear";
    keys(tg.anchorPoint, K.anchor, ease); keys(tg.position, K.position, ease); keys(tg.scale, K.scale, ease);
    keys(tg.rotation, K.rotation, ease); keys(tg.opacity, K.opacity, ease);
  }
  function timing(ly, L, isStill) {
    if (!isStill) ly.startTime = L["in"] - (L.srcIn || 0);
    ly.inPoint = L["in"]; ly.outPoint = L.out;
  }
  function effects(ly, L) {
    if (!L.effects) return;
    for (var i = 0; i < L.effects.length; i++) {
      var E = L.effects[i];
      try {
        var fx = ly.property("ADBE Effect Parade").addProperty(E.matchName);
        if (E.name) fx.name = E.name;
        for (var p in E.props) if (E.props.hasOwnProperty(p)) { try { fx.property(p).setValue(E.props[p]); } catch (e1) {} }
      } catch (e) { missing.push("effect " + E.matchName + " on " + L.name); }
    }
  }
  function textLayer(L) {
    var ly = L.box ? comp.layers.addBoxText(L.box, L.text) : comp.layers.addText(L.text);
    var st = ly.property("ADBE Text Properties").property("ADBE Text Document");
    var td = st.value;
    if (L.font) { try { td.font = L.font; } catch (e) {} }
    td.fontSize = L.fontSize || 72;
    td.applyFill = true; td.fillColor = L.color || [1, 1, 1];
    if (L.strokeColor) { td.applyStroke = true; td.strokeColor = L.strokeColor; td.strokeWidth = L.strokeWidth || 2; td.strokeOverFill = false; }
    else td.applyStroke = false;
    if (L.tracking !== undefined) td.tracking = L.tracking;
    if (L.leading) { try { td.autoLeading = false; td.leading = L.leading; } catch (e3) {} }
    if (L.allCaps) { try { td.allCaps = true; } catch (e4) {} }
    td.justification = L.justify === "center" ? ParagraphJustification.CENTER_JUSTIFY :
      (L.justify === "right" ? ParagraphJustification.RIGHT_JUSTIFY : ParagraphJustification.LEFT_JUSTIFY);
    st.setValue(td);
    if (L.font && st.value.font !== L.font) fontMiss.push(L.font + " (" + L.name + ")");
    if ((L.anchorMode || "center") === "center") {
      var r = ly.sourceRectAtTime(L["in"], false);
      ly.transform.anchorPoint.setValue([r.left + r.width / 2, r.top + r.height / 2]);
    }
    return ly;
  }
  function shapeLayer(L) {
    var ly = comp.layers.addShape();
    var g = ly.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");
    g.name = L.shape || "rect";
    var c = g.property("ADBE Vectors Group"), s;
    if (L.shape === "path") {
      // one path per sub-path, as the film drew it; pathKeys animate a path that changes form
      for (var pi = 0; pi < L.paths.length; pi++) {
        var pp = c.addProperty("ADBE Vector Shape - Group").property("ADBE Vector Shape");
        pp.setValue(mkShape(L.paths[pi]));
        if (L.pathKeys) {
          var ts = [], vs = [];
          for (var q = 0; q < L.pathKeys.length; q++) { ts.push(L.pathKeys[q][0]); vs.push(mkShape(L.pathKeys[q][1][pi])); }
          pp.setValuesAtTimes(ts, vs);
          for (q = 1; q <= pp.numKeys; q++) { try { pp.setInterpolationTypeAtKey(q, KeyframeInterpolationType.LINEAR); } catch (e10) {} }
        }
      }
    } else if (L.shape === "ellipse") { s = c.addProperty("ADBE Vector Shape - Ellipse"); s.property("ADBE Vector Ellipse Size").setValue(L.size); }
    else { s = c.addProperty("ADBE Vector Shape - Rect"); s.property("ADBE Vector Rect Size").setValue(L.size);
      if (L.roundness) s.property("ADBE Vector Rect Roundness").setValue(L.roundness); }
    if (L.stroke) { var k = c.addProperty("ADBE Vector Graphic - Stroke"); setColor(k.property("ADBE Vector Stroke Color"), L.stroke.color); k.property("ADBE Vector Stroke Width").setValue(L.stroke.width || 2);
      var CAP = { butt: 1, round: 2, square: 3 }, JOIN = { miter: 1, round: 2, bevel: 3 };
      if (CAP[L.stroke.cap]) { try { k.property("ADBE Vector Stroke Line Cap").setValue(CAP[L.stroke.cap]); } catch (e11) {} }
      if (JOIN[L.stroke.join]) { try { k.property("ADBE Vector Stroke Line Join").setValue(JOIN[L.stroke.join]); } catch (e12) {} } }
    if (L.fill !== null) { var f = c.addProperty("ADBE Vector Graphic - Fill"); setColor(f.property("ADBE Vector Fill Color"), L.fill || [1, 1, 1]); }
    return ly;
  }
  function mkShape(P) {
    var sh = new Shape(); sh.vertices = P.v; sh.inTangents = P.i; sh.outTangents = P.o; sh.closed = P.closed; return sh;
  }

  var byId = {}, i, L, ly;
  for (i = 0; i < D.layers.length; i++) {
    L = D.layers[i]; ly = null;
    var isStill = false;
    if (L.type === "footage" || L.type === "image" || L.type === "audio") {
      var it = imp(L.src, L.type === "audio");
      if (!it) {
        if (L.type === "audio") continue;
        ly = comp.layers.addSolid([1, 0, 1], "MISSING " + L.src, D.width, D.height, 1, D.duration);
      } else {
        isStill = it.mainSource && it.mainSource.isStill;
        ly = isStill ? comp.layers.add(it, L.out - L["in"]) : comp.layers.add(it);
      }
      if (L.type === "audio" && L.gainDb !== undefined) {
        try { ly.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([L.gainDb, L.gainDb]); } catch (e5) {}
      }
    } else if (L.type === "text") ly = textLayer(L);
    else if (L.type === "solid") ly = comp.layers.addSolid(L.color || [0, 0, 0], L.name, L.size ? L.size[0] : D.width, L.size ? L.size[1] : D.height, 1, D.duration);
    else if (L.type === "shape") ly = shapeLayer(L);
    else if (L.type === "null") ly = comp.layers.addNull(D.duration);
    if (!ly) continue;
    ly.name = L.name;
    timing(ly, L, isStill);
    if (L.type !== "audio") { transform(ly, L); if (L.blend) ly.blendingMode = blend(L.blend); effects(ly, L); }
    if (L.comment) ly.comment = L.comment;
    if (L.label !== undefined) ly.label = L.label;
    var on = L.enabled;
    if (L.role === "baked") on = !EDITABLE;
    if (L.role === "live") on = EDITABLE;
    if (L.type === "audio") ly.audioEnabled = on; else ly.enabled = on;
    if (L.role === "live") ly.label = 9;
    if (L.role === "baked") ly.label = 0;
    byId[L.id] = ly; made++;
  }
  for (i = 0; i < D.layers.length; i++) {
    L = D.layers[i]; ly = byId[L.id];
    if (!ly) continue;
    if (L.parent && byId[L.parent]) { try { ly.setParentWithJump(byId[L.parent]); } catch (e6) { ly.parent = byId[L.parent]; } }
    if (L.matte && byId[L.matte.layer]) {
      try {
        var mt = { alpha: TrackMatteType.ALPHA, alphaInverted: TrackMatteType.ALPHA_INVERTED, luma: TrackMatteType.LUMA, lumaInverted: TrackMatteType.LUMA_INVERTED };
        ly.setTrackMatte(byId[L.matte.layer], mt[L.matte.type || "alpha"]);
        byId[L.matte.layer].enabled = false;
      } catch (e7) { missing.push("track matte on " + L.name + " (needs AE 2023+)"); }
    }
  }
  for (i = 0; i < D.markers.length; i++) {
    try { comp.markerProperty.setValueAtTime(D.markers[i].t, new MarkerValue(D.markers[i].name)); } catch (e8) {}
  }
  comp.openInViewer();
  app.endUndoGroup();
  if (SAVE_AEP) { try { proj.save(File(base + "/" + D.slug + ".aep")); } catch (e9) {} }
  var msg = "Built '" + D.name + "': " + made + " layers (" + (EDITABLE ? "live text/shapes ON, baked layers OFF" : "baked layers ON, live layers OFF") + ").";
  if (missing.length) msg += "\n\nMissing (" + missing.length + "):\n- " + missing.join("\n- ");
  if (fontMiss.length) msg += "\n\nFonts not found (install from fonts/ then re-run, or change the font in the Character panel):\n- " + fontMiss.join("\n- ");
  alert(msg);
})();
"""


def build(m, editable=None, save_aep=True):
    W, H = m["width"], m["height"]
    layers = []
    for L in m["layers"]:
        if "ae" not in L["targets"]:
            continue
        o = {k: v for k, v in L.items() if not k.startswith("_") and k not in ("targets", "from")}
        for ck in ("color", "strokeColor", "fill"):
            if ck in o and o[ck] is not None:
                o[ck] = M.hex_to_rgb01(o[ck])
        if isinstance(o.get("text"), str):
            o["text"] = o["text"].replace("\r\n", "\r").replace("\n", "\r")   # AE line breaks are \r
        if o.get("stroke"):
            o["stroke"] = dict(o["stroke"], color=M.hex_to_rgb01(o["stroke"].get("color", "#000")))
        layers.append(o)
    data = {
        "name": m["name"], "slug": m["slug"], "width": W, "height": H,
        "pixelAspect": m["pixelAspect"], "duration": m["duration"], "fps": float(m["fps"]),
        "bgColor": M.hex_to_rgb01(m["bgColor"]), "ease": m.get("ease", "linear"),
        "markers": m["markers"], "layers": layers,
    }
    ed = m["editableDefault"] if editable is None else editable
    head = (
        "// %s: rebuilds the comp natively in After Effects (generated by editable-export/make_ae_jsx.py).\n"
        "// Run: File > Scripts > Run Script File... (keep this file in the package root, next to video/ audio/ fonts/).\n"
        "// Install the fonts in fonts/ first. EDITABLE = true: live text/shape layers on, baked duplicates off.\n"
        "// SAVE_AEP = true also saves %s.aep next to this script.\n"
        "var EDITABLE = %s;\nvar SAVE_AEP = %s;\n"
        % (m["name"], m["slug"], "true" if ed else "false", "true" if save_aep else "false")
    )
    # ensure_ascii: ExtendScript reads \\uXXXX escapes reliably whatever the file encoding.
    data_js = "var DATA = " + json.dumps(data, ensure_ascii=True, indent=1) + ";\n"
    return head + data_js + RUNTIME


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifest")
    ap.add_argument("-o", "--out")
    ap.add_argument("--baked", action="store_true", help="default EDITABLE=false (baked layers on)")
    ap.add_argument("--no-save", action="store_true", help="don't save an .aep after building")
    a = ap.parse_args()
    m = M.load(a.manifest)
    out = a.out or os.path.join(m["_root"], m["slug"] + "_AfterEffects.jsx")
    js = build(m, editable=False if a.baked else None, save_aep=not a.no_save)
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)
    n = sum(1 for L in m["layers"] if "ae" in L["targets"])
    print("wrote %s (%d layers)" % (out, n))


if __name__ == "__main__":
    main()
