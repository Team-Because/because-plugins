// library/pieces/core.js · shared by every generic piece. Pure functions of time; no brand values in here.
// Load first: <script src="../../library/pieces/core.js"></script> (path from a video folder: ../../../../library/pieces/).
// Every piece takes the 2D context `c` and an options object; colours, fonts and logos come from the client's brand.json.

const P = {};
P.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
P.prog = (t, a, b) => P.clamp((t - a) / (b - a));
P.lerp = (a, b, p) => a + (b - a) * p;
P.outExpo = (p) => p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
P.inExpo = (p) => p <= 0 ? 0 : Math.pow(2, 10 * p - 10);
P.inOutCubic = (p) => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
P.inOutSine = (p) => -(Math.cos(Math.PI * p) - 1) / 2;
P.outCubic = (p) => 1 - Math.pow(1 - p, 3);
P.outQuart = (p) => 1 - Math.pow(1 - P.clamp(p), 4);
P.mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// Cover a rect with an image; (fx, fy) = the image point placed at the rect centre, clamped so no gap shows.
P.cover = (c, img, fx = .5, fy = .5, zoom = 1, ox = 0, oy = 0, r = null, alpha = 1) => {
  r = r || [0, 0, c.canvas.width, c.canvas.height];
  const iw = img.width, ih = img.height; if (!iw) return null;
  const s = Math.max(r[2] / iw, r[3] / ih) * zoom, dw = iw * s, dh = ih * s;
  let x = r[0] + r[2] / 2 - fx * dw + ox, y = r[1] + r[3] / 2 - fy * dh + oy;
  x = P.clamp(x, r[0] + r[2] - dw, r[0]); y = P.clamp(y, r[1] + r[3] - dh, r[1]);
  c.globalAlpha = alpha; c.drawImage(img, x, y, dw, dh); c.globalAlpha = 1;
  return { x, y, s };
};
P.vgrad = (c, y0, y1, c0, c1) => { const W = c.canvas.width, g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0)); };
P.hgrad = (c, x0, x1, c0, c1) => { const H = c.canvas.height, g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, c0); g.addColorStop(1, c1); c.fillStyle = g; c.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), H); };
