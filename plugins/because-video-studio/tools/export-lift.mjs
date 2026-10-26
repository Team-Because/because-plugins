// Fully layered export (used by tools/export.mjs): every drawing call on the film's canvas becomes part of a layer.
//   shapes and lines with a plain colour -> live After Effects shape layers (path, fill or stroke, motion as keyframes)
//   whole image files                    -> image layers (position, scale, rotation, opacity keyframes)
//   everything else (glows, gradients, shadows, blend modes, Lottie, clips, masked or cropped drawing) -> pixel layers, one
//   for each run of such drawing between two live layers, rendered alone with transparency
// recorder() runs inside the film page; the rest turns what it logged into tracks, a stacking order and manifest layers.

// In the page. LIFT on: live calls are logged and not drawn; pixel calls are drawn only when ONLY names their group
// ('__none__' draws nothing). Groups are named after the live item drawn just before them, so they keep their place.
export function recorder() {
  const P = CanvasRenderingContext2D.prototype, main = document.querySelector('canvas'), o = {};
  for (const k of ['beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    'closePath', 'fill', 'stroke', 'fillRect', 'strokeRect', 'drawImage', 'putImageData', 'strokeText', 'clip', 'save', 'restore']) o[k] = P[k];
  const on = (c) => window.LIFT && c.canvas === main;
  const st = (c) => c.__lift || (c.__lift = { clip: [false], subs: [], cur: null, pend: null, ok: true });
  const colour = (s) => {
    if (typeof s !== 'string') return null;
    let m = s.match(/^#([0-9a-f]{6})$/i); if (m) return ['#' + m[1].toLowerCase(), 1];
    m = s.match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/);
    return m ? ['#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join(''), m[4] === undefined ? 1 : +m[4]] : null;
  };
  const tf = (c) => { const m = c.getTransform(); return [m.a, m.b, m.c, m.d, m.e, m.f]; };
  const at = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  const sub = (S, pt) => { const s = { v: [pt], i: [[0, 0]], o: [[0, 0]], closed: false }; S.subs.push(s); S.cur = s; return s; };
  const ensure = (S, pt) => S.cur || sub(S, S.pend ?? pt);
  // cubic segment from the current point: c1, c2 and end already in canvas pixels
  const curve = (S, c1, c2, p) => { const s = S.cur, last = s.v.length - 1, q = s.v[last];
    s.o[last] = [c1[0] - q[0], c1[1] - q[1]]; s.v.push(p); s.i.push([c2[0] - p[0], c2[1] - p[1]]); s.o.push([0, 0]); };
  const line = (S, p) => { const s = S.cur; s.v.push(p); s.i.push([0, 0]); s.o.push([0, 0]); };
  // an elliptical arc in user space, split into quarter turns of cubic curves, then mapped through the transform
  function arcPath(S, M, cx, cy, rx, ry, rot, a0, sweep) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const E = (a) => [cx + cr * rx * Math.cos(a) - sr * ry * Math.sin(a), cy + sr * rx * Math.cos(a) + cr * ry * Math.sin(a)];
    const D = (a) => [-cr * rx * Math.sin(a) - sr * ry * Math.cos(a), -sr * rx * Math.sin(a) + cr * ry * Math.cos(a)];
    const s0 = at(M, ...E(a0));
    if (S.cur) line(S, s0); else sub(S, s0);
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9)), th = sweep / n, k = 4 / 3 * Math.tan(th / 4);
    for (let j = 0; j < n; j++) {
      const a = a0 + j * th, b = a + th, p0 = E(a), p3 = E(b), d0 = D(a), d3 = D(b);
      curve(S, at(M, p0[0] + k * d0[0], p0[1] + k * d0[1]), at(M, p3[0] - k * d3[0], p3[1] - k * d3[1]), at(M, ...p3));
    }
  }
  const sweepOf = (a0, a1, ccw) => {
    const T = 2 * Math.PI, md = (x) => ((x % T) + T) % T;
    if (!ccw) return a1 - a0 >= T ? T : md(a1 - a0);
    return a0 - a1 >= T ? -T : -md(a0 - a1);
  };
  P.beginPath = function () { if (this.canvas === main) { const S = st(this); S.subs = []; S.cur = null; S.pend = null; S.ok = true; } return o.beginPath.call(this); };
  P.moveTo = function (x, y) { if (this.canvas === main) { const S = st(this); sub(S, at(tf(this), x, y)); S.pend = null; } return o.moveTo.call(this, x, y); };
  P.lineTo = function (x, y) { if (this.canvas === main) { const S = st(this), p = at(tf(this), x, y); if (!S.cur && !S.pend) sub(S, p); else { ensure(S, p); line(S, p); } } return o.lineTo.call(this, x, y); };
  P.bezierCurveTo = function (a, b, c, d, x, y) {
    if (this.canvas === main) { const S = st(this), M = tf(this); ensure(S, at(M, a, b)); curve(S, at(M, a, b), at(M, c, d), at(M, x, y)); }
    return o.bezierCurveTo.call(this, a, b, c, d, x, y);
  };
  P.quadraticCurveTo = function (a, b, x, y) {
    if (this.canvas === main) { const S = st(this), M = tf(this), c = at(M, a, b), p = at(M, x, y); ensure(S, c); const q = S.cur.v.at(-1);
      curve(S, [q[0] + 2 / 3 * (c[0] - q[0]), q[1] + 2 / 3 * (c[1] - q[1])], [p[0] + 2 / 3 * (c[0] - p[0]), p[1] + 2 / 3 * (c[1] - p[1])], p); }
    return o.quadraticCurveTo.call(this, a, b, x, y);
  };
  P.arc = function (x, y, r, a0, a1, ccw = false) { if (this.canvas === main) arcPath(st(this), tf(this), x, y, r, r, 0, a0, sweepOf(a0, a1, ccw)); return o.arc.call(this, x, y, r, a0, a1, ccw); };
  P.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw = false) { if (this.canvas === main) arcPath(st(this), tf(this), x, y, rx, ry, rot, a0, sweepOf(a0, a1, ccw)); return o.ellipse.call(this, x, y, rx, ry, rot, a0, a1, ccw); };
  P.arcTo = function (...a) { if (this.canvas === main) st(this).ok = false; return o.arcTo.apply(this, a); };
  const rectPath = (S, M, x, y, w, h) => { sub(S, at(M, x, y)); line(S, at(M, x + w, y)); line(S, at(M, x + w, y + h)); line(S, at(M, x, y + h)); S.cur.closed = true; S.pend = S.cur.v[0]; S.cur = null; };
  P.rect = function (x, y, w, h) { if (this.canvas === main) rectPath(st(this), tf(this), x, y, w, h); return o.rect.call(this, x, y, w, h); };
  P.roundRect = function (x, y, w, h, r = 0) {
    if (this.canvas === main) {
      const S = st(this), M = tf(this), list = (Array.isArray(r) ? r : [r]).map((v) => (typeof v === 'number' ? [v, v] : [v?.x ?? 0, v?.y ?? v?.x ?? 0]));
      if (w < 0 || h < 0 || !list.length || list.length > 4 || list.flat().some((v) => !(v >= 0))) S.ok = false;
      else {
        const [tl, tr, br, bl] = list.length === 1 ? [list[0], list[0], list[0], list[0]] : list.length === 2 ? [list[0], list[1], list[0], list[1]]
          : list.length === 3 ? [list[0], list[1], list[2], list[1]] : list;
        const f = Math.min(1, w / (tl[0] + tr[0] || 1), w / (bl[0] + br[0] || 1), h / (tl[1] + bl[1] || 1), h / (tr[1] + br[1] || 1));
        const c = [tl, tr, br, bl].map(([a, b]) => [a * f, b * f]), H = Math.PI / 2;
        sub(S, at(M, x + c[0][0], y)); line(S, at(M, x + w - c[1][0], y));
        if (c[1][0] && c[1][1]) arcPath(S, M, x + w - c[1][0], y + c[1][1], c[1][0], c[1][1], 0, -H, H);
        line(S, at(M, x + w, y + h - c[2][1]));
        if (c[2][0] && c[2][1]) arcPath(S, M, x + w - c[2][0], y + h - c[2][1], c[2][0], c[2][1], 0, 0, H);
        line(S, at(M, x + c[3][0], y + h));
        if (c[3][0] && c[3][1]) arcPath(S, M, x + c[3][0], y + h - c[3][1], c[3][0], c[3][1], 0, H, H);
        line(S, at(M, x, y + c[0][1]));
        if (c[0][0] && c[0][1]) arcPath(S, M, x + c[0][0], y + c[0][1], c[0][0], c[0][1], 0, Math.PI, H);
        S.cur.closed = true; S.pend = S.cur.v[0]; S.cur = null;
      }
    }
    return o.roundRect.call(this, x, y, w, h, r);
  };
  P.closePath = function () { if (this.canvas === main) { const S = st(this); if (S.cur) { S.cur.closed = true; S.pend = S.cur.v[0]; S.cur = null; } } return o.closePath.call(this); };
  P.save = function () { if (this.canvas === main) { const S = st(this); S.clip.push(S.clip.at(-1)); } return o.save.call(this); };
  P.restore = function () { if (this.canvas === main) { const S = st(this); if (S.clip.length > 1) S.clip.pop(); } return o.restore.call(this); };
  P.clip = function (...a) { if (this.canvas === main) { const S = st(this); S.clip[S.clip.length - 1] = true; } return o.clip.apply(this, a); };

  const shadow = (c) => { const k = colour(c.shadowColor); return !!k && k[1] > 0 && (c.shadowBlur > 0 || c.shadowOffsetX || c.shadowOffsetY); };
  const plain = (c) => !st(c).clip.at(-1) && c.globalCompositeOperation === 'source-over' && (!c.filter || c.filter === 'none') && !shadow(c) && c.globalAlpha > 0.01;
  const keyOf = (base) => { const n = (window.__occ[base] = (window.__occ[base] ?? 0) + 1); return `${base}#${n}`; };
  const live = (rec) => { rec.key = keyOf(rec.base); window.DRAWLOG.push(rec); window.__prev = rec.key; };
  // a pixel call: log its group (once in a row) with what it is, draw it only in its group's pass
  // a run of pixel calls with one blend mode is one group; a new blend mode starts the next group, so each pixel layer
  // can carry its drawing's blend mode in After Effects
  function pixel(c, tag, draw) {
    const op = c.globalCompositeOperation, last = window.DRAWLOG.at(-1);
    if (!(last && last.kind === 'px' && last.prev === window.__prev && last.ops[0] === op)) {
      const base = `~${window.__prev}~${op}`, n = (window.__occ[base] = (window.__occ[base] ?? 0) + 1);
      window.DRAWLOG.push({ kind: 'px', key: `px:${window.__prev}~${op}#${n}`, prev: window.__prev, tags: [], ops: [op] });
    }
    const cur = window.DRAWLOG.at(-1); if (!cur.tags.includes(tag)) cur.tags.push(tag);
    if (window.ONLY === cur.key) return draw();
  }
  const pathsNow = (S) => S.subs.filter((s) => s.v.length > 1).map((s) => ({ v: s.v, i: s.i, o: s.o, closed: s.closed }));
  function shapeCall(c, mode, args, draw) {
    if (!on(c)) return draw();
    const S = st(c), style = colour(mode === 'fill' ? c.fillStyle : c.strokeStyle), paths = pathsNow(S);
    const rule = args.length === 0 || (args.length === 1 && args[0] === 'nonzero');
    const ok = S.ok && rule && style && plain(c) && paths.length && (mode === 'fill' || c.getLineDash().length === 0);
    if (!ok) return pixel(c, typeof (mode === 'fill' ? c.fillStyle : c.strokeStyle) !== 'string' ? 'gradient or glow' : !plain(c) ? 'effect' : 'shape', draw);
    live({ kind: 'shape', base: `shape:${mode}:${style[0]}`, mode, color: style[0], alpha: c.globalAlpha * style[1], m: tf(c), paths,
      width: c.lineWidth, cap: c.lineCap, join: c.lineJoin });
  }
  P.fill = function (...a) { return shapeCall(this, 'fill', a, () => o.fill.apply(this, a)); };
  P.stroke = function (...a) { return shapeCall(this, 'stroke', a, () => o.stroke.apply(this, a)); };
  const rectCall = (c, mode, x, y, w, h, draw) => {
    if (!on(c)) return draw();
    const S = st(c), keep = { subs: S.subs, cur: S.cur, pend: S.pend, ok: S.ok };
    S.subs = []; S.cur = null; S.pend = null; S.ok = true; rectPath(S, tf(c), x, y, w, h);
    try { return shapeCall(c, mode, [], draw); } finally { Object.assign(S, keep); }
  };
  P.fillRect = function (x, y, w, h) { return rectCall(this, 'fill', x, y, w, h, () => o.fillRect.call(this, x, y, w, h)); };
  P.strokeRect = function (x, y, w, h) { return rectCall(this, 'stroke', x, y, w, h, () => o.strokeRect.call(this, x, y, w, h)); };
  P.drawImage = function (im, ...a) {
    if (!on(this)) return o.drawImage.call(this, im, ...a);
    const nw = im?.naturalWidth, nh = im?.naturalHeight;
    const whole = a.length === 2 || a.length === 4 || (a.length === 8 && a[0] === 0 && a[1] === 0 && a[2] === nw && a[3] === nh);
    if (im instanceof HTMLImageElement && nw > 0 && nh > 0 && whole && !/\/\d{3,}\.(jpe?g|png|webp)$/i.test(im.src) && plain(this)) {
      const d = a.length === 8 ? a.slice(4) : a.length === 4 ? a : [a[0], a[1], nw, nh];
      window.IMGEL[im.src] = im;
      return live({ kind: 'image', base: `img:${im.src}`, src: im.src, nw, nh, d: d.map(Number), alpha: this.globalAlpha, m: tf(this) });
    }
    return pixel(this, im instanceof HTMLImageElement && !/\/\d{3,}\.(jpe?g|png|webp)$/i.test(im.src) ? 'image (cropped or blended)' : 'animation or clip', () => o.drawImage.call(this, im, ...a));
  };
  P.putImageData = function (...a) { return on(this) ? pixel(this, 'pixels', () => o.putImageData.apply(this, a)) : o.putImageData.apply(this, a); };
  P.strokeText = function (...a) { return on(this) ? pixel(this, 'outlined text', () => o.strokeText.apply(this, a)) : o.strokeText.apply(this, a); };
}

// ---------- in Node: tracks, order, layers ----------
const inv = ([a, b, c, d, e, f]) => { const k = a * d - b * c; return [d / k, -b / k, -c / k, a / k, (c * f - d * e) / k, (b * e - a * f) / k]; };
const apply = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const lin = (M, [x, y]) => [M[0] * x + M[2] * y, M[1] * x + M[3] * y];
const mapPaths = (paths, M) => paths.map((s) => ({ v: s.v.map((p) => apply(M, p)), i: s.i.map((p) => lin(M, p)), o: s.o.map((p) => lin(M, p)), closed: s.closed }));
const sig = (paths) => paths.map((s) => `${s.v.length}${s.closed ? 'c' : 'o'}`).join(',');
const far = (A, B, tol) => A.some((s, j) => ['v', 'i', 'o'].some((k) => s[k].some((p, q) => Math.abs(p[0] - B[j][k][q][0]) > tol || Math.abs(p[1] - B[j][k][q][1]) > tol)));
const r2 = (paths) => paths.map((s) => ({ v: s.v.map((p) => p.map((x) => +x.toFixed(2))), i: s.i.map((p) => p.map((x) => +x.toFixed(2))), o: s.o.map((p) => p.map((x) => +x.toFixed(2))), closed: s.closed }));
// rotation and scale (with a flip) and no skew: then the shape moves as one piece and its path stays as drawn
const rigid = (M) => Math.abs(M[0] * M[2] + M[1] * M[3]) < 1e-6 * Math.max(1, Math.hypot(M[0], M[1]) * Math.hypot(M[2], M[3]));
export function trs(M) { const sx = Math.hypot(M[0], M[1]), det = M[0] * M[3] - M[1] * M[2]; return { pos: [M[4], M[5]], sx, sy: det / (sx || 1), rot: Math.atan2(M[1], M[0]) * 180 / Math.PI }; }

// frames: one DRAWLOG per frame. Returns tracks for live items, the pixel groups and a bottom-to-top order of both,
// or { fail } when no single stacking order fits every frame or the scene is too busy to layer.
export function liftScene(frames, { maxTracks = 150, maxGroups = 16 } = {}) {
  const open = new Map(), tracks = [], groups = new Map(), edges = new Map(), nodes = new Set();
  frames.forEach((log, k) => {
    let prev = null;
    for (const r of log) {
      const node = r.key;
      nodes.add(node);
      if (prev && prev !== node) { if (!edges.has(prev)) edges.set(prev, new Set()); edges.get(prev).add(node); }
      prev = node;
      if (r.kind === 'px') { const gr = groups.get(r.key) ?? { key: r.key, frames: [], tags: new Set(), ops: new Set() }; gr.frames.push(k); r.tags.forEach((t) => gr.tags.add(t)); r.ops.forEach((o) => gr.ops.add(o)); groups.set(r.key, gr); continue; }
      let tr = open.get(r.key);
      const shapeSig = r.kind === 'shape' ? sig(r.paths) : '';
      if (tr && (k - tr.last > 2 || tr.sig !== shapeSig)) { tracks.push(tr); tr = null; }
      if (!tr) { tr = { key: r.key, kind: r.kind, sig: shapeSig, keys: [] }; open.set(r.key, tr); }
      tr.keys.push([k, r]); tr.last = k;
    }
  });
  tracks.push(...open.values());
  if (tracks.length > maxTracks) return { fail: `${tracks.length} live items (over ${maxTracks})` };
  if (groups.size > maxGroups) return { fail: `${groups.size} pixel layers (over ${maxGroups})` };
  // one stacking order for the whole scene (Kahn's sort; ties keep first-drawn order)
  const first = new Map(); frames.forEach((log, k) => log.forEach((r, j) => { if (!first.has(r.key)) first.set(r.key, k * 1e4 + j); }));
  const indeg = new Map([...nodes].map((n) => [n, 0]));
  for (const [, to] of edges) for (const n of to) indeg.set(n, indeg.get(n) + 1);
  const ready = [...nodes].filter((n) => !indeg.get(n)), order = [];
  while (ready.length) {
    ready.sort((a, z) => first.get(a) - first.get(z));
    const n = ready.shift(); order.push(n);
    for (const m of edges.get(n) ?? []) { indeg.set(m, indeg.get(m) - 1); if (!indeg.get(m)) ready.push(m); }
  }
  if (order.length !== nodes.size) return { fail: 'the drawing order changes during the scene' };
  return { tracks, groups: [...groups.values()], order };
}

// The fewest keyframes whose straight-line motion (After Effects' linear interpolation) stays within tol of every frame.
// vals: [[t, value], ...]; get picks a number or [x, y] from a value.
export function keepKeys(vals, get, tol) {
  const n = vals.length; if (n <= 2) return vals.slice();
  const at = (i) => [get(vals[i][1])].flat(), ks = [vals[0]];
  let a = 0;
  for (let j = 2; j < n; j++) {
    const va = at(a), vj = at(j), ta = vals[a][0], tj = vals[j][0];
    for (let i = a + 1; i < j; i++) {
      const f = (vals[i][0] - ta) / (tj - ta || 1), vi = at(i);
      if (vi.some((v, q) => Math.abs(v - (va[q] + (vj[q] - va[q]) * f)) > tol)) { ks.push(vals[j - 1]); a = j - 1; break; }
    }
  }
  ks.push(vals[n - 1]);
  return ks;
}
const keep = keepKeys;
function keyframes(vals, props) {
  const kf = {};
  for (const [prop, get, tol] of props) {
    const ks = keep(vals, get, tol);
    if (ks.length > 2 || (ks.length === 2 && JSON.stringify(get(ks[0][1])) !== JSON.stringify(get(ks[1][1])))) kf[prop] = ks.map(([t, v]) => [+t.toFixed(3), get(v)]);
  }
  return kf;
}

// A live shape: a path that only moves, turns, scales or fades keeps its drawn path, with the motion as transform
// keyframes; a path that changes form is drawn in frame coordinates with path keyframes. Both are what the check stacks.
export function shapeLayer(tr, id, from, FPS) {
  const r0 = tr.keys[0][1], t = (k) => from + k / FPS;
  const locals = tr.keys.map(([, r]) => mapPaths(r.paths, inv(r.m)));
  const moves = tr.keys.every(([, r]) => rigid(r.m)) && locals.every((L) => !far(L, locals[0], 0.05));
  const fill = r0.mode === 'fill' ? r0.color : null;
  const base = { id, name: `${r0.mode === 'fill' ? 'Shape' : 'Line'} ${r0.color}`, type: 'shape', shape: 'path', role: 'live', targets: ['ae'],
    in: +t(tr.keys[0][0]).toFixed(3), out: +t(tr.keys.at(-1)[0] + 1).toFixed(3), fill };
  const stroke = (w) => (r0.mode === 'stroke' ? { stroke: { color: r0.color, width: +w.toFixed(2), cap: r0.cap, join: r0.join } } : {});
  if (moves) {
    const vals = tr.keys.map(([k, r]) => { const d = trs(r.m); return [t(k), { pos: d.pos.map((x) => +x.toFixed(2)), sc: [+(d.sx * 100).toFixed(3), +(d.sy * 100).toFixed(3)], rot: +d.rot.toFixed(3), op: +(r.alpha * 100).toFixed(2) }]; });
    const v0 = vals[0][1];
    return { ...base, ...stroke(r0.width), mode: 'moves', paths: r2(locals[0]),
      transform: { anchor: [0, 0], position: v0.pos, scale: v0.sc, rotation: v0.rot, opacity: v0.op },
      keyframes: keyframes(vals, [['position', (v) => v.pos, 0.5], ['scale', (v) => v.sc, 0.1], ['rotation', (v) => v.rot, 0.1], ['opacity', (v) => v.op, 0.5]]) };
  }
  const det = Math.sqrt(Math.abs(r0.m[0] * r0.m[3] - r0.m[1] * r0.m[2]));
  const pk = [[t(tr.keys[0][0]), tr.keys[0][1].paths]];
  tr.keys.forEach(([k, r], i) => { if (i && (far(r.paths, pk.at(-1)[1], 0.25) || i === tr.keys.length - 1)) pk.push([t(k), r.paths]); });
  const vals = tr.keys.map(([k, r]) => [t(k), { op: +(r.alpha * 100).toFixed(2) }]);
  return { ...base, ...stroke(r0.width * det), mode: 'reshapes', paths: r2(pk[0][1]), ...(pk.length > 1 ? { pathKeys: pk.map(([tt, ps]) => [+tt.toFixed(3), r2(ps)]) } : {}),
    transform: { anchor: [0, 0], position: [0, 0], scale: [100, 100], rotation: 0, opacity: vals[0][1].op },
    keyframes: keyframes(vals, [['opacity', (v) => v.op, 0.5]]) };
}

// The shape exactly as After Effects will draw it at frame k of its track, for the check (canvas pixels).
export function shapeAt(L, tSec) {
  // linear between keyframes, as the AE script sets them
  const val = (prop, d) => {
    const ks = L.keyframes?.[prop]; if (!ks) return d;
    if (tSec <= ks[0][0]) return ks[0][1]; if (tSec >= ks.at(-1)[0]) return ks.at(-1)[1];
    const j = ks.findIndex(([tt]) => tt > tSec), [t0, a] = ks[j - 1], [t1, b] = ks[j], f = (tSec - t0) / (t1 - t0);
    return Array.isArray(a) ? a.map((x, q) => x + (b[q] - x) * f) : a + (b - a) * f;
  };
  let paths = L.paths;
  if (L.pathKeys) { const j = L.pathKeys.findLastIndex(([tt]) => tt <= tSec + 1e-6); paths = L.pathKeys[Math.max(0, j)][1]; }
  const T = L.transform, pos = val('position', T.position), sc = val('scale', T.scale), rot = val('rotation', T.rotation), op = val('opacity', T.opacity);
  return { paths, pos, sc, rot, op, fill: L.fill, stroke: L.stroke ?? null };
}

export const GROUP_BLEND = { screen: 'screen', lighter: 'add', multiply: 'multiply', overlay: 'overlay', darken: 'darken', lighten: 'lighten',
  'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'hard-light': 'hard-light', 'soft-light': 'soft-light', difference: 'difference',
  color: 'color', luminosity: 'luminosity', 'source-over': 'normal' };
// a pixel layer takes its drawing's blend mode when all of it shares one that After Effects has
export function groupBlend(gr) { const ops = [...gr.ops]; return ops.length === 1 && GROUP_BLEND[ops[0]] ? GROUP_BLEND[ops[0]] : ops.every((o) => o === 'source-over') ? 'normal' : null; }
