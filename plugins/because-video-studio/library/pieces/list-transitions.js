// library/pieces/list-transitions.js · piece "address-transitions" (from a 30 s property launch film that went to production, 12-10-2026).
// A list of 3-5 places (zones, floors, amenities) in sequence, each entering with its own transition, while a level
// gauge shows where in the whole the current item sits.
// Needs core.js.
//   P.listTransition(c, type, p, drawPrev, drawNext, accent)   // type: 'doors' | 'slats' | 'tiles' | 'iris'; p 0-1 over ~0.5 s
//   P.levelGauge(c, t, { x, top, bottom, levels: 34, items: [[lo, hi], ...], t0, step, labels: [...], f, accent, tIn, tOut })

P.transitionMask = (c, type, p) => {
  const W = c.canvas.width, H = c.canvas.height, portrait = H > W;
  c.beginPath();
  if (type === 'slats') {
    const n = 7, h = H / n;
    for (let i = 0; i < n; i++) { const q = P.outExpo(P.clamp(p * 1.6 - (n - 1 - i) * 0.09)); c.rect(0, (i + 1) * h - h * q, W, h * q + 1); }
  } else if (type === 'tiles') {
    const cols = W > H ? 6 : 4, rows = portrait ? 7 : 4, cw = W / cols, ch = H / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const dist = Math.hypot(k + 0.5 - cols / 2, r + 0.5 - rows / 2) / Math.hypot(cols / 2, rows / 2);
      const q = P.outExpo(P.clamp(p * 1.7 - dist * 0.7)); if (q <= 0) continue;
      const w = cw * q, h = ch * q; c.rect(k * cw + (cw - w) / 2, r * ch + (ch - h) / 2, w + 1, h + 1);
    }
  } else if (type === 'iris') {
    c.arc(W / 2, H * 0.45, Math.hypot(W, H) * 0.6 * P.inOutCubic(p), 0, Math.PI * 2);
  }
};
// drawPrev() and drawNext() paint the outgoing and incoming plates (each a full frame)
P.listTransition = (c, type, p, drawPrev, drawNext, accent = '#ffffff') => {
  const W = c.canvas.width, H = c.canvas.height, U = Math.min(W, H) / 1080;
  if (p >= 1) { drawNext(); return; }
  drawPrev();
  if (type === 'doors') {
    const q = P.outQuart(p);
    for (const half of [0, 1]) {
      c.save(); c.beginPath(); c.rect(0, half * H / 2, W, H / 2 + 1); c.clip(); c.translate((half ? 1 : -1) * (1 - q) * W, 0); drawNext(); c.restore();
      if (q < 0.98) { c.fillStyle = accent; c.fillRect((half ? W : 0) + (half ? 1 : -1) * (1 - q) * W - (half ? 0 : 6 * U), half * H / 2, 6 * U, H / 2); }
    }
  } else {
    c.save(); P.transitionMask(c, type, p); c.clip(); drawNext(); c.restore();
    if (type === 'iris') { c.strokeStyle = accent; c.lineWidth = 5 * U; c.beginPath(); c.arc(W / 2, H * 0.45, Math.hypot(W, H) * 0.6 * P.inOutCubic(p), 0, Math.PI * 2); c.stroke(); }
  }
};
// A vertical gauge of `levels` ticks; the active band glides from item to item (needs type.js for labels)
P.levelGauge = (c, t, o) => {
  const U = Math.min(c.canvas.width, c.canvas.height) / 1080, N = o.levels;
  const pin = P.outExpo(P.prog(t, o.tIn, o.tIn + 0.6)), pout = P.inExpo(P.prog(t, o.tOut - 0.3, o.tOut));
  const k = P.clamp(Math.floor((t - o.t0) / o.step), 0, o.items.length - 1), a = t - (o.t0 + k * o.step);
  const prev = k ? o.items[k - 1] : [0, 0], cur = o.items[k], m = P.outExpo(P.prog(a, 0.15, 0.7));
  const lo = P.lerp(prev[0], cur[0], m), hi = P.lerp(prev[1], cur[1], m), gap = (o.bottom - o.top) / (N - 1);
  for (let f = 1; f <= N; f++) {
    const show = P.prog(pin * N, f - 1, f) * (1 - pout); if (show <= 0) continue;
    const y = o.bottom - (f - 1) * gap, on = f >= lo - 0.5 && f <= hi + 0.5, len = (on ? 46 : 20) * U * show;
    c.fillStyle = on ? o.accent : 'rgba(255,255,255,0.45)'; c.fillRect(o.x - len, y - 1.5 * U, len, 3 * U);
  }
  if (o.labels && P.plain && pin > 0.5 && pout < 0.5) {
    const ly = o.bottom - ((lo + hi) / 2 - 1) * gap;
    c.save(); c.beginPath(); c.rect(0, ly - 30 * U, o.x - 60 * U, 40 * U); c.clip();
    P.plain(c, o.labels[k], o.x - 62 * U, ly + 9 * U + (1 - m) * 40 * U, o.f, 24 * U, '#ffffff', { ls: 24 * U * 0.22, align: 'right' });
    c.restore();
  }
};
