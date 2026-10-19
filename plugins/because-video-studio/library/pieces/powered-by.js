// library/pieces/powered-by.js · piece "powered-by-card" (from a 20 s festive reel that went to production, 12-10-2026).
// A co-brand end card on the event partner's own palette: the partner's mark springs in, "POWERED BY" lands, then the brand's
// logo rises in. A logo on a white background is drawn with multiply so its colours stay true and the white drops out.
// Needs core.js and the engine's motion.js (spring). Text through any line() helper, or P.plain from type.js.
//   P.poweredBy(c, t, {
//     ground: '#hex',                    // partner's palette, sampled from the partner's own site
//     partner: { img, crop: [sx, sy, sw, sh] | null, size: W * 0.66, y: H * 0.34, at: 17.15 },
//     label: { text: 'POWERED BY', at: 17.5, draw: (y, t) => {...} },  // the caller draws the line in its own type
//     brand: { img, box: [sx, sy, sw, sh], width: W * 0.64, at: 17.75, multiply: true },
//   }) -> { partner: [x, y, w, h], brand: [x, y, w, h] } for audit rects

P.poweredBy = (c, t, o) => {
  const W = c.canvas.width, H = c.canvas.height, out = {};
  c.fillStyle = o.ground; c.fillRect(0, 0, W, H);
  const p = o.partner, D = p.size, ga = P.clamp((t - p.at) / 0.2), gs = spring(t - p.at, 'heavy');
  if (ga > 0) {
    c.save(); c.globalAlpha = ga; c.translate(W / 2, p.y); c.scale(0.92 + 0.08 * gs, 0.92 + 0.08 * gs);
    if (p.crop) c.drawImage(p.img, ...p.crop, -D / 2, -D / 2, D, D); else c.drawImage(p.img, -D / 2, -D / 2, D, D);
    c.restore(); out.partner = [W / 2 - D / 2, p.y - D / 2, D, D];
  }
  const by = p.y + D / 2 + H * 0.085;
  if (o.label && o.label.draw) o.label.draw(by, t);
  const b = o.brand, [bx, byy, bw, bh] = b.box, lw = b.width, lh = lw * bh / bw, ly = by + H * 0.035;
  const la = P.clamp((t - b.at) / 0.25), ls = spring(t - b.at, 'heavy');
  if (la > 0) {
    c.save(); c.globalAlpha = la; if (b.multiply !== false) c.globalCompositeOperation = 'multiply';
    c.drawImage(b.img, bx, byy, bw, bh, W / 2 - lw / 2, ly + (1 - ls) * lh * 0.4, lw, lh); c.restore();
    out.brand = [W / 2 - lw / 2, ly, lw, lh];
  }
  return out;
};
