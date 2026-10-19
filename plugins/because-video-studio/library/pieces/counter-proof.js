// library/pieces/counter-proof.js · piece "counter-proof" (from a 30 s property launch film that went to production, 12-10-2026).
// The camera tilts up a facade while a counter runs from 0 to the proof number and lands on a downbeat: on the landing the
// number turns accent colour, punches in, the unit wipes on, a short warm flash, and a ruler marker tracks the value.
// Needs core.js and type.js.
//   P.counterProof(c, t, {
//     img, fx: 0.5, tilt: [t0, tLand], zoom: [1.08, 1],   // the facade render tilts from its bottom (fy 0.97) to top (0.03)
//     value: 152, unit: 'M', caption: 'METRES TO THE TOP',
//     t0: 17.15, land: 20.0,                                // count window; land on a downbeat
//     x, y, size, f: displayFont, fu: uiFont, ink: '#fff', accent: '#hex',
//     ruler: { x, top, bottom } | null,
//   }) -> the value shown at t

P.counterProof = (c, t, o) => {
  const W = c.canvas.width, H = c.canvas.height, U = Math.min(W, H) / 1080, land = o.land;
  const tilt = P.inOutCubic(P.prog(t, o.tilt[0], o.tilt[1]));
  const z = P.lerp(o.zoom[0], o.zoom[1], P.outCubic(P.prog(t, o.tilt[0], o.tilt[1] + 2)));
  const punch = t >= land ? 1 + 0.035 * (1 - P.outExpo(P.prog(t, land, land + 0.5))) : 1;
  c.save(); c.translate(W / 2, H / 2); c.scale(punch, punch); c.translate(-W / 2, -H / 2);
  P.cover(c, o.img, o.fx ?? 0.5, P.lerp(0.97, 0.03, tilt), z);
  c.restore();
  if (o.shade !== false) { if (W >= H) P.hgrad(c, 0, W * 0.62, 'rgba(6,8,14,0.9)', 'rgba(6,8,14,0)'); else P.vgrad(c, 0, H * 0.62, 'rgba(6,8,14,0.92)', 'rgba(6,8,14,0)'); }
  const pv = P.prog(t, o.t0, land);
  const v = t >= land ? o.value : Math.floor(o.value * (1 - Math.pow(1 - pv, 1.8)));
  const sc = t >= land ? P.lerp(1.14, 1, P.outExpo(P.prog(t, land, land + 0.45))) : 1;
  c.save(); c.translate(o.x, o.y); c.scale(sc, sc);
  P.plain(c, String(v), 0, 0, o.f, o.size, t >= land ? o.accent : (o.ink || '#fff'));
  if (t >= land && o.unit) P.wipe(c, o.unit, P.textW(c, String(v), o.f, o.size) + 20 * U, 0, o.f, o.size * 0.38, o.ink || '#fff', t, land, { dur: 0.3 });
  c.restore();
  if (o.caption) P.wipe(c, o.caption, o.x, o.y + 58 * U, o.fu, 26 * U, 'rgba(255,255,255,0.8)', t, o.t0 + 0.15, { ls: 26 * U * 0.3 });
  if (t >= land) { c.fillStyle = `rgba(255,236,200,${0.35 * (1 - P.prog(t, land, land + 0.12))})`; c.fillRect(0, 0, W, H); }
  if (o.ruler) {
    const { x: rx, top, bottom } = o.ruler;
    for (let i = 0; i <= 30; i++) { const y = P.lerp(bottom, top, i / 30), long = i % 5 === 0; c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(rx - (long ? 28 : 14) * U, y, (long ? 28 : 14) * U, 2 * U); }
    c.fillStyle = o.accent; c.fillRect(rx - 60 * U, P.lerp(bottom, top, v / o.value) - 2 * U, 60 * U, 4 * U);
  }
  return v;
};
