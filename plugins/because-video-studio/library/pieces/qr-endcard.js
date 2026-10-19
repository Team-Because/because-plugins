// library/pieces/qr-endcard.js · piece "qr-endcard" (from a 30 s property launch film that went to production, 12-10-2026).
// An enquiry end card: wordmarks wipe on behind an accent bar (with an optional sheen), a CTA pill grows, a QR builds module
// by module and gets an accent trace, then everything holds; phone, address and the compliance line wipe on.
// Needs core.js and type.js. Make the QR grid with: .venv/bin/python tools/qr.py "<url>" <video>/qr.js  (sets window.QR).
//   P.logoWipe(c, img, x, y, w, t, t0, { accent, sheenAt: [t1, t2] }) -> height
//   P.ctaPill(c, 'SCHEDULE A SITE VISIT', x, y, t, t0, size, { f, fill: accent, ink: '#151515' }) -> pill height
//   P.qrBuild(c, QR, x, y, size, t, t0, { ink: '#121212', paper: '#fff', accent, traceAt: t2 })

P.logoWipe = (c, img, x, y, w, t, t0, o = {}) => {
  if (!img.width) return 0;
  const U = Math.min(c.canvas.width, c.canvas.height) / 1080, h = w * img.height / img.width;
  const p = P.outExpo(P.prog(t, t0, t0 + 0.6)); if (p <= 0) return h;
  c.save(); c.beginPath(); c.rect(x - 2, y - 2, (w + 4) * p, h + 4); c.clip(); c.drawImage(img, x, y, w, h); c.restore();
  if (p < 0.99 && o.accent) { c.fillStyle = o.accent; c.fillRect(x + w * p, y - 8 * U, 4 * U, h + 16 * U); }
  for (const s of o.sheenAt || []) {
    const q = P.prog(t, s, s + 0.8); if (q <= 0 || q >= 1) continue;
    const k = P._sheen || (P._sheen = document.createElement('canvas')); k.width = c.canvas.width; k.height = c.canvas.height;
    const x2 = k.getContext('2d'); x2.clearRect(0, 0, k.width, k.height); x2.drawImage(img, x, y, w, h); x2.globalCompositeOperation = 'source-atop';
    const bx = P.lerp(x - w * 0.3, x + w * 1.3, P.inOutSine(q)), g = x2.createLinearGradient(bx - 120 * U, 0, bx + 120 * U, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, o.accent || '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x2.fillStyle = g; x2.fillRect(x, y, w, h); c.drawImage(k, 0, 0);
  }
  return h;
};
P.ctaPill = (c, label, x, y, t, t0, sz, o) => {
  const tw = P.textW(c, label, o.f, sz, sz * 0.16), pw = tw + sz * 2.2, ph = sz * 2.5;
  const p = P.outExpo(P.prog(t, t0, t0 + 0.5)); if (p <= 0) return ph;
  c.beginPath(); c.roundRect(x, y, pw * p, ph, ph / 2); c.fillStyle = o.fill; c.fill();
  c.save(); c.beginPath(); c.rect(x, y, pw * p, ph); c.clip();
  P.plain(c, label, x + sz * 1.1, y + ph / 2 + sz * 0.36, o.f, sz, o.ink || '#151515', { ls: sz * 0.16 });
  c.restore();
  return ph;
};
P.qrBuild = (c, QR, x, y, size, t, t0, o = {}) => {
  const U = Math.min(c.canvas.width, c.canvas.height) / 1080, n = QR.length, quiet = 4, mod = size / (n + quiet * 2);
  const pin = P.outExpo(P.prog(t, t0, t0 + 0.35)), r = 18 * U;
  c.save(); c.translate(x + size / 2, y + size / 2); c.scale(P.lerp(0.92, 1, pin), P.lerp(0.92, 1, pin)); c.translate(-x - size / 2, -y - size / 2);
  c.beginPath(); c.roundRect(x, y + size * (1 - pin), size, size * pin, r); c.fillStyle = o.paper || '#ffffff'; c.fill();
  c.fillStyle = o.ink || '#121212'; const rr = P.mulberry32(5);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const delay = rr() * 0.4; if (!QR[j][i] || t < t0 + 0.1 + delay) continue;
    c.fillRect(Math.floor(x + (quiet + i) * mod), Math.floor(y + (quiet + j) * mod), Math.ceil(mod), Math.ceil(mod));
  }
  c.restore();
  if (o.traceAt != null && o.accent) {
    const pt = P.outExpo(P.prog(t, o.traceAt, o.traceAt + 0.9));
    if (pt > 0) { c.save(); c.strokeStyle = o.accent; c.lineWidth = 3 * U; const per = 4 * (size + 24 * U); c.setLineDash([per * pt, per]); c.beginPath(); c.roundRect(x - 12 * U, y - 12 * U, size + 24 * U, size + 24 * U, r + 10 * U); c.stroke(); c.restore(); }
  }
};
