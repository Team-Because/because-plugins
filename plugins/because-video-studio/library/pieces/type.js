// library/pieces/type.js · piece "type-rise-wipe" (from a 30 s property launch film that went to production, 12-10-2026).
// A headline rises letter by letter out of a clip just above its baseline, or wipes in; a rule line draws under it.
// Needs core.js. `f` is a font spec: { family: 'Display', weight: 400 } using a family the video registers with @font-face.
//   P.rise(c, 'SKYLINE', x, y, f, size, '#fff', t, t0, { stagger, dur, out, lsFrom, ls, align, colors })
//   P.wipe(c, 'LOCATION LINE', x, y, f, size, color, t, t0, { dur, ls, align })
//   P.rule(c, x, y, w, t, t0, color, thickness, dur)
//   P.fitSize(c, 'LONGEST WORD', f, maxWidth, maxSize)   -> font size that fits

P.font = (f, size) => `${f.weight || 400} ${size}px "${f.family}"`;
P.setText = (c, f, size, ls = 0) => { c.font = P.font(f, size); c.letterSpacing = ls + 'px'; };
P.textW = (c, str, f, size, ls = 0) => { P.setText(c, f, size, ls); return c.measureText(str).width; };
P.fitSize = (c, str, f, maxW, maxSize, lsEm = 0) => Math.min(maxSize, maxW / P.textW(c, str, f, 100, lsEm * 100) * 100);
P.plain = (c, str, x, y, f, size, color, { ls = 0, align = 'left', alpha = 1 } = {}) => {
  P.setText(c, f, size, ls); c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillStyle = color; c.globalAlpha = alpha;
  c.fillText(str, x, y); c.globalAlpha = 1; c.textAlign = 'left';
};
P.rise = (c, str, x, y, f, size, color, t, t0, { ls = 0, stagger = 0.028, dur = 0.5, align = 'left', out = null, colors = null, lsFrom = null } = {}) => {
  const lsNow = lsFrom == null ? ls : P.lerp(lsFrom, ls, P.outExpo(P.prog(t, t0, t0 + 0.6)));
  P.setText(c, f, size, lsNow);
  const total = c.measureText(str).width - lsNow;
  const x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  c.save(); c.beginPath(); c.rect(x0 - size, y - size * 1.05, total + size * 2, size * 1.27); c.clip();
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  for (let i = 0; i < str.length; i++) {
    if (str[i] === ' ') continue;
    const cx = x0 + (i ? c.measureText(str.slice(0, i)).width : 0);
    const pin = P.outExpo(P.prog(t, t0 + i * stagger, t0 + i * stagger + dur));
    let dy = (1 - pin) * size * 1.1;
    if (out != null) { const po = P.inExpo(P.prog(t, out + i * stagger * 0.6, out + i * stagger * 0.6 + 0.32)); dy -= po * size * 1.15; }
    if (pin <= 0) continue;
    c.fillStyle = colors ? colors(i) : color; c.fillText(str[i], cx, y + dy);
  }
  c.restore();
  return total;
};
P.wipe = (c, str, x, y, f, size, color, t, t0, o = {}) => {
  const p = P.outExpo(P.prog(t, t0, t0 + (o.dur || 0.5))); if (p <= 0) return;
  P.setText(c, f, size, o.ls || 0);
  const w = c.measureText(str).width, x0 = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  c.save(); c.beginPath(); c.rect(x0 - 4, y - size * 1.2, (w + 8) * p, size * 1.6); c.clip();
  P.plain(c, str, x0, y, f, size, color, { ...o, align: 'left' });
  c.restore();
};
P.rule = (c, x, y, w, t, t0, color, th = 3, dur = 0.5) => { const p = P.outExpo(P.prog(t, t0, t0 + dur)); if (p > 0) { c.fillStyle = color; c.fillRect(x, y, w * p, th); } };
