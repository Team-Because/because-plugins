// library/pieces/floor-build.js · piece "floor-build" (from a 30 s property launch film that went to production, 12-10-2026).
// A building assembles floor by floor on its real render: a ghosted copy underneath, the real render revealed from the
// ground up one floor band at a time, faint floor lines above the scan line, then the city floods out from the tower.
// Needs core.js. Build `ghost` once after window.ready: P.ghostPlate(img).
//   P.floorBuild(c, t, {
//     img, ghost,                       // the real render and its ghost plate
//     box: [x, y, w, h],                // where the whole render is drawn (canvas px)
//     tower: { x0, x1, top, ground },   // the tower's bounds inside the render, normalised 0-1
//     floors: 34, t0: 3.15, t1: 5.9,    // floor count and the build window (seconds)
//     flood: [5.9, 6.3],                // the rest of the render floods in after the crown lands
//     line: 'rgba(...)', scan: '#hex',  // floor-line colour and scan-bar colour (brand accent)
//   }) -> number of floors built so far (drive a counter with it)

P.ghostPlate = (img, filter = 'grayscale(1) brightness(0.5) contrast(1.35) sepia(0.25) hue-rotate(180deg) saturate(1.4)') => {
  const k = document.createElement('canvas'); k.width = img.width; k.height = img.height;
  const x = k.getContext('2d'); x.filter = filter; x.drawImage(img, 0, 0); return k;
};
P.floorBuild = (c, t, o) => {
  const [x, y, dw, dh] = o.box, T = o.tower, N = o.floors || 34, U = Math.min(c.canvas.width, c.canvas.height) / 1080;
  const pf = P.clamp((t - o.t0) / (o.t1 - o.t0));
  const floors = Math.min(N, Math.floor(pf * N + (pf > 0 ? 1 : 0)));
  const yG = y + T.ground * dh, yT = y + T.top * dh, scanY = P.lerp(yG, yT, floors / N);
  const tx0 = x + T.x0 * dw, tx1 = x + T.x1 * dw;
  c.drawImage(o.ghost, x, y, dw, dh);
  c.save(); c.beginPath(); c.rect(tx0, scanY, tx1 - tx0, dh); c.clip(); c.drawImage(o.img, x, y, dw, dh); c.restore();
  const fl = o.flood ? P.outExpo(P.prog(t, o.flood[0], o.flood[1])) : 0;
  if (fl > 0) { const mid = (tx0 + tx1) / 2, half = P.lerp((tx1 - tx0) / 2, dw, fl); c.save(); c.beginPath(); c.rect(mid - half, y, half * 2, dh); c.clip(); c.drawImage(o.img, x, y, dw, dh); c.restore(); }
  if (!o.flood || t < o.flood[0]) {
    for (let f = floors; f <= N; f++) { c.fillStyle = f === floors ? 'rgba(0,0,0,0)' : (o.line || 'rgba(255,255,255,0.16)'); c.fillRect(tx0, P.lerp(yG, yT, f / N), tx1 - tx0, 1.2); }
    if (pf > 0 && pf < 1) { c.fillStyle = o.scan || '#ffffff'; c.fillRect(tx0 - 30 * U, scanY - 1.5, tx1 - tx0 + 60 * U, 3 * U); }
  }
  return floors;
};
