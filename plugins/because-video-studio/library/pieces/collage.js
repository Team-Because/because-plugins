// library/pieces/collage.js · piece "collage-kit" (from a 103 s agency brand film everyone liked, 12-10-2026).
// The paper-desk language: grid paper, tape, stickers with a shadow or white border, chat bubbles, a marker highlight,
// a dashed hand-drawn arrow, a ring burst, slam-in scaling, impact shake, words rising one by one, handwriting reveal.
// Needs core.js. Colours and fonts are always passed in (from the client's brand.json). `f` = { family, weight }.
//   P.paperGrid(c, bg, line, ox, oy, step = 40)               P.tape(c, x, y, w, rot, colour)
//   P.sticker(c, img, x, y, w, rot, scale, { border, shadow, crop })
//   P.chatBubble(c, text, x, y, scale, rot, { f, bg, ink, time, timeInk })
//   P.marker(c, x, y, w, p, colour, h, rot)                    P.dashedArrow(c, x0, y0, x1, y1, bend, p, colour, width)
//   P.ringBurst(c, x, y, t, t0, colour, r0, r1, width)         P.slam(t, t0, from, dur) -> scale
//   P.withScale(c, x, y, s, rot, fn)                           P.shake(t, impacts) -> {x, y}   impacts: [[t, amplitude], ...]
//   P.riseWords(c, text, x, y, f, size, colour, t, t0, { stagger, align, colors })
//   P.handwrite(c, text, x, y, f, size, colour, t, t0, t1, rot)

P.paperGrid = (c, bg, line, ox = 0, oy = 0, s = 40) => {
  const W = c.canvas.width, H = c.canvas.height;
  c.fillStyle = bg; c.fillRect(-W, -H, W * 3, H * 3);
  c.strokeStyle = line; c.lineWidth = 1.5; c.beginPath();
  const sx = ((ox % s) + s) % s, sy = ((oy % s) + s) % s;
  for (let x = sx - s; x < W + s; x += s) { c.moveTo(x, 0); c.lineTo(x, H); }
  for (let y = sy - s; y < H + s; y += s) { c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke();
};
P.dropShadow = (c, on, blur = 26, oy = 12, a = 0.22) => {
  if (on) { c.shadowColor = `rgba(11,18,32,${a})`; c.shadowBlur = blur; c.shadowOffsetY = oy; c.shadowOffsetX = 0; }
  else { c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0; }
};
P.tape = (c, x, y, w, rot, col = 'rgba(255,255,255,0.8)') => {
  c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.fillRect(-w / 2, -16, w, 32);
  c.fillStyle = 'rgba(255,255,255,0.25)'; for (let i = -w / 2; i < w / 2; i += 14) c.fillRect(i, -16, 5, 32);
  c.restore();
};
P.sticker = (c, im, x, y, w, rot = 0, sc = 1, o = {}) => {
  if (!im || !im.width || sc <= 0) return;
  const h = o.h || w * im.height / im.width;
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc);
  if (o.border) { P.dropShadow(c, true, 30, 14, 0.25); c.fillStyle = '#ffffff'; c.fillRect(-w / 2 - o.border, -h / 2 - o.border, w + o.border * 2, h + o.border * 2); P.dropShadow(c, false); }
  else if (o.shadow !== false) P.dropShadow(c, true, o.blur || 20, o.oy || 10, o.sa || 0.22);
  if (o.crop) c.drawImage(im, ...o.crop, -w / 2, -h / 2, w, h); else c.drawImage(im, -w / 2, -h / 2, w, h);
  P.dropShadow(c, false); c.restore();
};
P.chatBubble = (c, s, x, y, sc, rot, o) => {
  if (sc <= 0.001) return;
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc);
  P.setText(c, { ...o.f, weight: 500 }, 30); const w = c.measureText(s).width + 150, h = 66;
  P.dropShadow(c, true, 22, 10, 0.25); c.fillStyle = o.bg || '#262B33'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 18); c.fill();
  c.beginPath(); c.moveTo(-w / 2 + 6, h / 2 - 20); c.lineTo(-w / 2 - 12, h / 2 + 4); c.lineTo(-w / 2 + 26, h / 2 - 2); c.fill(); P.dropShadow(c, false);
  P.plain(c, s, -w / 2 + 24, 11, { ...o.f, weight: 500 }, 30, o.ink || '#F3F4F6');
  if (o.time) P.plain(c, o.time, w / 2 - 18, 22, { ...o.f, weight: 400 }, 17, o.timeInk || '#9CA3AF', { align: 'right' });
  c.restore();
};
P.marker = (c, x0, y, w, p, col, h = 20, rot = 0) => {
  if (p <= 0) return; c.save(); c.translate(x0, y); c.rotate(rot); c.fillStyle = col;
  c.beginPath(); c.roundRect(0, -h / 2, w * p, h, h / 2); c.fill(); c.restore();
};
P.dashedArrow = (c, x0, y0, x1, y1, bend, p, col, lw = 6) => {
  if (p <= 0) return;
  const mx = (x0 + x1) / 2 - (y1 - y0) * bend, my = (y0 + y1) / 2 + (x1 - x0) * bend, N = 40, n = Math.max(2, Math.floor(N * p));
  const at = (u) => [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1];
  c.save(); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.setLineDash([2, 14]); c.beginPath();
  for (let i = 0; i <= n; i++) { const [px, py] = at(i / N); i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.stroke(); c.setLineDash([]);
  if (p >= 1) { const [qx, qy] = at(0.95), a = Math.atan2(y1 - qy, x1 - qx); c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1);
    c.lineTo(x1 - 26 * Math.cos(a - 0.45), y1 - 26 * Math.sin(a - 0.45)); c.lineTo(x1 - 26 * Math.cos(a + 0.45), y1 - 26 * Math.sin(a + 0.45)); c.fill(); }
  c.restore();
};
P.ringBurst = (c, x, y, t, t0, col, r0 = 200, r1 = 1300, lw = 40) => {
  const p = P.prog(t, t0, t0 + 0.8); if (p <= 0 || p >= 1) return;
  c.save(); c.strokeStyle = col; c.globalAlpha = 1 - p; c.lineWidth = lw * (1 - p) + 2;
  c.beginPath(); c.arc(x, y, P.lerp(r0, r1, P.outExpo(p)), 0, Math.PI * 2); c.stroke(); c.restore();
};
P.slam = (t, t0, from = 1.6, dur = 0.28) => t < t0 ? 0 : P.lerp(from, 1, P.outExpo(P.prog(t, t0, t0 + dur)));
P.outBack = (p, s = 1.7) => p <= 0 ? 0 : 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
P.withScale = (c, x, y, s, rot, fn) => { if (s <= 0) return; c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(s, s); c.translate(-x, -y); fn(); c.restore(); };
P.shake = (t, impacts) => {
  let x = 0, y = 0;
  for (const [ti, a] of impacts) { const d = t - ti; if (d < 0 || d > 0.6) continue; const k = a * Math.exp(-d * 9); x += k * Math.sin(d * 97 + ti); y += k * Math.cos(d * 71 + ti * 2); }
  return { x, y };
};
P.riseLine = (c, s, x, y, f, size, color, t, t0, o = {}) => {
  if (t < t0) return 0;
  const p = P.outExpo(P.prog(t, t0, t0 + (o.dur || 0.6))), w = P.textW(c, s, f, size, o.ls || 0);
  const left = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  c.save(); c.beginPath(); c.rect(left - 20, y - size * 1.1, w + 40, size * 1.45); c.clip();
  P.plain(c, s, left, y + (1 - p) * size * 1.3, f, size, color, { ls: o.ls || 0 }); c.restore();
  return w;
};
P.riseWords = (c, s, x, y, f, size, color, t, t0, o = {}) => {
  const words = s.split(' '), sp = P.textW(c, ' ', f, size);
  const total = words.reduce((a, w) => a + P.textW(c, w, f, size), 0) + sp * (words.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : x;
  words.forEach((wd, i) => { P.riseLine(c, wd, cx, y, f, size, (o.colors && o.colors[i]) || color, t, t0 + i * (o.stagger || 0.07)); cx += P.textW(c, wd, f, size) + sp; });
  return total;
};
P.handwrite = (c, s, x, y, f, size, color, t, t0, t1, rot = 0) => {
  if (t < t0) return;
  const w = P.textW(c, s, f, size), p = P.prog(t, t0, t1);
  c.save(); c.translate(x, y); c.rotate(rot); c.beginPath(); c.rect(-10, -size * 1.2, (w + 20) * p, size * 1.7); c.clip();
  P.plain(c, s, 0, 0, f, size, color); c.restore();
};
