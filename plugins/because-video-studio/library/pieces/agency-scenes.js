// library/pieces/agency-scenes.js · scenes from a 103 s agency brand film everyone liked (12-10-2026).
// Needs core.js, type.js and collage.js. Colours and fonts are passed in; no brand values here.
//
// piece "bubble-implode": opinions pile up as chat bubbles, jitter, then implode into the centre on an impact.
//   const LAYOUT = P.bubbleLayout(texts, { cols: 4, rows: 5, seed: 11, x0, y0, dx, dy, t0: -2.1, every: 0.32 })
//   P.bubbleImplode(c, t, LAYOUT, { jitterFrom: 5.8, implode: [7.35, 8.0], bubble: { f, bg, ink } })   -> true while showing
// piece "step-rail": N steps, each a slide that pushes the last one out, under a progress rail.
//   P.stepRail(c, t, { x, y, w, n: 6, t0, step: 3.5, track, fill, title, f })
//   P.pushSlides(c, t, { t0, step, n, draw: (k, u) => {...} })   // draw(k, u): step k at local time u
// piece "work-wall": real work thumbnails drop into a tilted collage, a name pill under each, tape on some, camera pans.
//   P.workWall(c, t, items, { t0, every: 0.25, cols: 3 rows, x0, y0, dx, dy, w: 250, pan: [from, to, px], f, pill: {bg, ink, stroke}, tape })
// piece "word-roller": a fixed lead line, a list rolling past one item per beat, the current item in the accent colour.
//   P.wordRoller(c, t, items, { t0, every: 0.5, x, y, gap: 150, f, size, ink, accent, clip: [x, y, w, h] })
// piece "strike-replace": a claim is struck through by a marker, then the replacement line with one highlighted keyword,
//   then reasons cycle in a slot. Build it from P.riseWords, P.marker and P.reasonSlot:
//   P.reasonSlot(c, t, reasons, { t0, every: 1.5, x, y, f, size, ink, clip: [x, y, w, h], prefix: '…' })

P.bubbleLayout = (texts, o) => {
  const r = P.mulberry32(o.seed || 11), cells = [];
  for (let row = 0; row < o.rows; row++) for (let col = 0; col < o.cols; col++) cells.push({ col, row });
  for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
  return texts.map((s, i) => { const cl = cells[i % cells.length];
    return { s, x: o.x0 + cl.col * o.dx + (r() - 0.5) * o.dx * 0.26 + (cl.row % 2) * o.dx * 0.2, y: o.y0 + cl.row * o.dy + (r() - 0.5) * o.dy * 0.3,
      rot: (r() - 0.5) * 0.12, t0: (o.t0 ?? 0) + i * (o.every ?? 0.32) }; });
};
P.bubbleImplode = (c, t, L, o) => {
  const W = c.canvas.width, H = c.canvas.height;
  if (t >= o.implode[1]) return false;
  const imp = P.inExpo(P.prog(t, o.implode[0], o.implode[1])), jit = 7 * P.prog(t, o.jitterFrom, o.implode[0]);
  L.forEach((b, i) => {
    if (t < b.t0) return;
    const sc = P.outBack(P.prog(t, b.t0, b.t0 + 0.32), 2.2) * (1 - imp);
    const x = P.lerp(b.x + Math.sin(t * 53 + i) * jit, W / 2, imp), y = P.lerp(b.y + Math.cos(t * 47 + i * 2) * jit, H / 2, imp);
    P.chatBubble(c, b.s, x, y, sc * (1.25 + (i % 3) * 0.15), b.rot + imp * (i % 2 ? 1 : -1), o.bubble);
  });
  return true;
};
P.stepRail = (c, t, o) => {
  const gap = 14, sw = (o.w - gap * (o.n - 1)) / o.n;
  for (let i = 0; i < o.n; i++) {
    const p = P.clamp((t - (o.t0 + i * o.step)) / o.step);
    c.fillStyle = o.track || 'rgba(11,18,32,0.1)'; c.beginPath(); c.roundRect(o.x + i * (sw + gap), o.y, sw, 10, 5); c.fill();
    if (p > 0) { c.fillStyle = o.fill; c.beginPath(); c.roundRect(o.x + i * (sw + gap), o.y, sw * p, 10, 5); c.fill(); }
  }
  if (o.title) P.plain(c, o.title, o.x, o.y - 20, o.f, 22, o.ink || '#0B1220', { ls: 3 });
};
P.pushSlides = (c, t, o) => {
  const W = c.canvas.width, k = Math.min(o.n - 1, Math.max(0, Math.floor((t - o.t0) / o.step))), u = t - (o.t0 + k * o.step);
  const inOutExpo = (p) => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
  const push = k > 0 ? inOutExpo(P.prog(u, 0, 0.45)) : 1;
  if (k > 0 && push < 1) { c.save(); c.translate(-W * push, 0); o.draw(k - 1, o.step + u); c.restore(); }
  c.save(); c.translate(W * (1 - push), 0); o.draw(k, u); c.restore();
  return k;
};
P.workWall = (c, t, items, o) => {
  const pan = o.pan ? -o.pan[2] * P.inOutCubic(P.prog(t, o.pan[0], o.pan[1])) : 0, r = P.mulberry32(o.seed || 21), rows = o.rows || 3;
  c.save(); c.translate(pan, 0);
  items.forEach(([im, name], i) => {
    const col = Math.floor(i / rows), row = i % rows;
    const x = o.x0 + col * o.dx + (row === 1 ? o.dx * 0.13 : 0), y = o.y0 + row * o.dy, rot = (r() - 0.5) * 0.1;
    const a = o.t0 + i * (o.every || 0.25); if (t < a) return;
    const s = P.lerp(1.3, 1, P.outExpo(P.prog(t, a, a + 0.3)));
    P.sticker(c, im, x, y, o.w, rot, s, { blur: 22, oy: 12, sa: 0.24 });
    if (name && t > a + 0.12) {
      c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
      const ps = P.outBack(P.prog(t, a + 0.12, a + 0.35), 2), sz = 19, tw = P.textW(c, name, o.f, sz) + sz * 1.2, ph = sz * 1.75;
      c.translate(0, o.w * 0.51); c.scale(ps, ps);
      c.fillStyle = o.pill.bg; c.beginPath(); c.roundRect(-tw / 2, -ph / 2, tw, ph, ph / 2); c.fill();
      if (o.pill.stroke) { c.strokeStyle = o.pill.stroke; c.lineWidth = 3; c.stroke(); }
      P.plain(c, name, 0, sz * 0.36, o.f, sz, o.pill.ink, { align: 'center' }); c.restore();
    }
    if (o.tape && i % 4 === 0) { c.save(); c.translate(x, y); c.rotate(rot); P.tape(c, 0, -o.w * 0.51, 110, rot * 3 - 0.05, o.tape); c.restore(); }
  });
  c.restore();
  return pan;
};
P.wordRoller = (c, t, items, o) => {
  const every = o.every || 0.5, idx = Math.min(items.length - 1, Math.max(0, Math.floor((t - o.t0) / every)));
  const sub = P.outExpo(P.prog(t - o.t0 - idx * every, 0, 0.25)), pos = idx - 1 + sub;
  c.save(); if (o.clip) { c.beginPath(); c.rect(...o.clip); c.clip(); }
  items.forEach((s, i) => {
    if (t < o.t0 + i * every - every) return;
    const y = o.y + (i - pos - (t < o.t0 ? 1 : 0)) * (o.gap || 150), cur = i === idx;
    c.globalAlpha = cur ? 1 : 0.18; P.plain(c, s, o.x, y, o.f, o.size, cur ? o.accent : o.ink);
  });
  c.restore(); c.globalAlpha = 1;
  return idx;
};
P.reasonSlot = (c, t, reasons, o) => {
  c.save(); if (o.clip) { c.beginPath(); c.rect(...o.clip); c.clip(); }
  reasons.forEach((r, i) => {
    const a = o.t0 + i * (o.every || 1.5), b = a + (o.every || 1.5); if (t < a) return;
    const pin = P.outExpo(P.prog(t, a, a + 0.35)), pout = i < reasons.length - 1 ? P.inExpo(P.prog(t, b - 0.25, b)) : 0;
    P.plain(c, (o.prefix ?? '…') + r, o.x, o.y + (1 - pin) * o.size * 1.4 - pout * o.size * 1.4, o.f, o.size, o.ink);
  });
  c.restore();
};
