// library/pieces/circle-match-cut.js · piece "circle-match-cut" (from a 20 s festive reel that went to production, 12-10-2026).
// Round objects flash past in hard match cuts: one circle stays locked at the same centre and size while the photo behind it
// changes, 4-6 frames each, accelerating; the last circle is the product. Grammar from "Ode to Circles" (ArtCamp x Flim.ai).
// Defining rule (L-114): the circle never moves or grows. An image that cannot fill the frame at the locked size is refused
// (throws at load), never enlarged. Needs core.js.
//   const LOCK = { x: W / 2, y: H / 2, r: W / 2 };                       // centred, as wide as the frame
//   const LIST = [[imgKey, cx%, cy%, r% of image width, frames], ...];    // circle measured on each photo (?guide to check)
//   P.matchCutPrepare(LIST, img, LOCK, W, H)    -> cut times (s) per item, at window.ready; throws on a bad image
//   P.matchCut(c, t, LIST, img, LOCK, cuts, { guide: false })  -> index of the item on screen

P.lockFit = (i, [cxp, cyp, rp], LOCK, W, H) => {
  const sx = i.width * cxp / 100, sy = i.height * cyp / 100, s = LOCK.r / (i.width * rp / 100);
  const gap = Math.max(LOCK.x - sx * s, (sx - i.width) * s + W - LOCK.x, LOCK.y - sy * s, (sy - i.height) * s + H - LOCK.y);
  return { draw: [LOCK.x - sx * s, LOCK.y - sy * s, i.width * s, i.height * s], gap };
};
P.matchCutPrepare = (LIST, img, LOCK, W, H, fps = 24) => {
  const cuts = [0];
  for (const [k, cx, cy, r, frames] of LIST) {
    const { gap } = P.lockFit(img[k], [cx, cy, r], LOCK, W, H);
    if (gap > 2) throw new Error(`${k} does not fill the frame at the locked circle (gap ${gap.toFixed(0)} px): replace it`);
    cuts.push(cuts[cuts.length - 1] + frames / fps);
  }
  return cuts;
};
P.matchCut = (c, t, LIST, img, LOCK, cuts, o = {}) => {
  let n = 0; while (n < LIST.length - 1 && t + 1e-6 >= cuts[n + 1]) n++;
  const [k, cx, cy, r] = LIST[n], { draw } = P.lockFit(img[k], [cx, cy, r], LOCK, c.canvas.width, c.canvas.height);
  c.drawImage(img[k], ...draw);
  if (o.guide) { c.strokeStyle = '#00FFFF'; c.lineWidth = 4; c.beginPath(); c.arc(LOCK.x, LOCK.y, LOCK.r - 2, 0, Math.PI * 2); c.stroke(); }
  return n;
};
