// library/pieces/texture.js · piece "grain-vignette" (from a 30 s property launch film that went to production, 12-10-2026).
// A seeded film grain and a vignette over the whole frame, so renders from different sources read as one film.
// Needs core.js. Build the grain once after window.ready; draw both last in every frame.
//   const GR = P.makeGrain(c, 99)          // 6 seeded 256 px noise tiles
//   P.vignette(c, 0.5)                     // 0.35 on end cards, 0.5 elsewhere
//   P.grain(c, GR, t, 30, 0.045)           // fps 30, strength 0.045

P.makeGrain = (c, seed = 99, n = 6) => {
  const out = [];
  for (let g = 0; g < n; g++) {
    const k = document.createElement('canvas'); k.width = k.height = 256;
    const x = k.getContext('2d'), d = x.createImageData(256, 256), r = P.mulberry32(seed + g);
    for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); out.push(c.createPattern(k, 'repeat'));
  }
  return out;
};
P.vignette = (c, a = 0.55) => {
  const W = c.canvas.width, H = c.canvas.height;
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); c.fillStyle = g; c.fillRect(0, 0, W, H);
};
P.grain = (c, tiles, t, fps = 30, a = 0.045) => {
  c.save(); c.globalAlpha = a; c.globalCompositeOperation = 'overlay';
  c.fillStyle = tiles[Math.floor(t * fps) % tiles.length]; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore();
};
