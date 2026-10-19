// Blocks · proven pieces from past films, so a new film assembles instead of rewriting.
// Copied into every video next to motion.js by tools/new-video.mjs (an approved video keeps its exact code).
// Classic script, loaded after motion.js. Uses the page's globals at call time: g (2D context), W, H.
// Source of each block is noted; read that film before changing a block's behaviour.

const TAU = Math.PI * 2;

// ---------- audit contract (read by tools/check.mjs) ----------
// Every drawn thing that must stay in frame calls rec(name, x, y, w, h) in its local coordinates.
// Name prefixes: 'text ' for anything readable (checked against caption plates), 'plate' for caption plates,
// '_' for probes (never checked for edges). The page exposes window.audit(t) -> { W, H, items }.
let AUDIT = [];
function rec(name, x, y, w, h) {
  const m = g.getTransform(), pts = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [m.a * a + m.c * b + m.e, m.b * a + m.d * b + m.f]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  AUDIT.push({ name, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) });
}

// ---------- timing (a mascot explainer) ----------
// Smooth on/off window: 0 before a, 1 between, 0 after b, r seconds of ramp each side.
const smooth01 = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const win = (t, a, b, r = 0.18) => smooth01((t - a) / r) * (1 - smooth01((t - b) / r));
// Spring whose target eases in over w seconds: same settle as the preset, no kick on frame 1 (camera, big moves).
function softSpring(t, preset, w = 0.25) { let s = 0; for (let i = 0; i < 32; i++) s += spring(t - (i / 31) * w, preset); return s / 32; }
function softTrack(t, keys, preset, w = 0.25) { let v = keys[0][1]; for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * softSpring(t - keys[i][0], preset, w); return v; }
// Hop with weight: crouch before take-off, gravity arc, playful squash on landing. Returns height (0 = rest).
// Take-off t0 and air time d must come from the film's TIMELINE so the landing sound reads the same numbers.
function hop(t, t0, d = 0.42, h = 1) {
  const pre = 0.12, k = (t - t0) / d, land = t0 + d;
  let y = 0;
  if (t > t0 - pre && t < t0) y -= 0.18 * h * Math.sin(Math.PI * (t - (t0 - pre)) / pre);
  if (k > 0 && k < 1) y += h * 4 * k * (1 - k);
  if (t >= land) y -= 0.22 * h * (1 - spring(t - land, 'playful'));
  return y;
}
// Squash (+) and stretch (-) for the same hops: [[t0, d], ...]. Scale x by 1 + q, y by 1 - q.
function squash(t, hops) {
  let q = 0;
  for (const [t0, d] of hops) {
    if (t > t0 - 0.14 && t < t0) q += 0.16 * Math.sin(Math.PI * (t - (t0 - 0.14)) / 0.14);
    const k = (t - t0) / d; if (k > 0 && k < 0.6) q -= 0.13 * Math.sin(Math.PI * k / 0.6);
    if (t >= t0 + d) q += 0.2 * (1 - spring(t - t0 - d, 'playful'));
  }
  return q;
}
// Decaying flash after an event (impact, plug seats, light switches on). 1 at t0, falls with rate k.
const flash = (t, t0, k = 16) => t < t0 ? 0 : Math.exp(-(t - t0) * k);

// ---------- drawing ----------
// Image covering the frame width, zoomed by z around (cx, cy). a product teaser plate().
function cover(im, { z = 1, cx = W / 2, cy = H / 2, y = 0, alpha = 1 } = {}) {
  const s = W / im.width;
  g.save(); g.globalAlpha = alpha;
  g.translate(cx, cy); g.scale(z, z); g.translate(-cx, -cy);
  g.drawImage(im, 0, y, W, im.height * s);
  g.restore();
}
// Image anchored bottom-centre at (cx, by), h px tall, pop scale s, soft contact shadow.
function prop(name, im, cx, by, h, { s = 1, alpha = 1, shadow = true, rot = 0 } = {}) {
  if (!im || s <= 0.001 || alpha <= 0) return;
  const hh = h * s, ww = hh * im.width / im.height;
  g.save(); g.globalAlpha = alpha;
  if (shadow) { g.save(); g.globalAlpha = alpha * 0.5 * s; const r = g.createRadialGradient(cx, by, 0, cx, by, ww * 0.5);
    r.addColorStop(0, 'rgba(0,0,0,0.28)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.beginPath(); g.ellipse(cx, by, ww * 0.5, ww * 0.09, 0, 0, TAU); g.fill(); g.restore(); }
  g.translate(cx, by); if (rot) g.rotate(rot);
  g.drawImage(im, -ww / 2, -hh, ww, hh); if (s > 0.9) rec(name, -ww / 2, -hh, ww, hh);
  g.restore();
}
// One line of text that springs up into place. tIn/tOut in film seconds. a product teaser caption().
function line(text, x, y, t, tIn, { tOut = 1e9, size = W * 0.06, weight = 600, font = 'sans-serif', color = '#fff', spacing = 0, align = 'center', preset = 'snappy' } = {}) {
  const a = Math.min(clamp((t - tIn) / 0.18), clamp((tOut - t) / 0.12));
  if (a <= 0) return;
  const s = spring(t - tIn, preset);
  g.save(); g.globalAlpha = a; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
  g.font = `${weight} ${Math.round(size)}px ${font}`; g.letterSpacing = `${(size * spacing).toFixed(1)}px`;
  const yy = y + (1 - s) * size * 0.35;
  g.fillText(text, x, yy);
  if (a > 0.9) { const w = g.measureText(text).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; rec('text ' + text, x0, yy - size * 0.8, w, size); }
  g.restore();
}
// Rounded pill label with optional outline.
function pill(text, cx, cy, s, { size = W * 0.037, fill = '#fff', ink = '#111', stroke = null, weight = 600, font = 'sans-serif' } = {}) {
  if (s <= 0.001) return; g.save(); g.translate(cx, cy); g.scale(s, s);
  g.font = `${weight} ${Math.round(size)}px ${font}`; const tw = g.measureText(text).width, ph = size * 1.7, pw = tw + size * 1.4;
  g.shadowColor = 'rgba(0,0,0,0.10)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  g.fillStyle = fill; g.beginPath(); g.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); g.fill(); g.shadowColor = 'transparent';
  if (stroke) { g.lineWidth = 4; g.strokeStyle = stroke; g.stroke(); }
  if (s > 0.9) rec('text ' + text, -pw / 2, -ph / 2, pw, ph);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, size * 0.06); g.restore();
}
// Word-by-word captions on a soft plate, 2 lines max, key words highlighted.
// words: [[word, start, end], ...] in film seconds; chunks: [[firstIndex, lastIndex], ...];
// opts.y: plate centre; opts.key: Set of word indexes to highlight in opts.accent.
function wordCaptions(t, words, chunks, { y = H * 0.73, maxW = W * 0.87, size = W * 0.057, font = 'sans-serif', ink = '#111', plate = '#fff', accent = '#00D746', key = new Set() } = {}) {
  let ci = -1; for (let k = 0; k < chunks.length; k++) if (t >= words[chunks[k][0]][1] - 0.02) ci = k;
  if (ci < 0) return;
  const [a, b] = chunks[ci], next = chunks[ci + 1];
  const endT = next ? Math.min(words[next[0]][1] - 0.02, words[b][2] + 0.9) : words[b][2] + 1.2;
  if (t > endT) return;
  const items = []; for (let i = a; i <= b; i++) items.push({ i, d: words[i][0] });
  let sz = size, lines;
  for (;;) {
    g.font = `700 ${Math.round(sz)}px ${font}`; const sp = g.measureText(' ').width; lines = [[]]; let lw = 0;
    for (const it of items) { it.w = g.measureText(it.d).width; if (lw && lw + sp + it.w > maxW) { lines.push([]); lw = 0; } lines.at(-1).push(it); lw += (lw ? sp : 0) + it.w; }
    if (lines.length <= 2 || sz < size * 0.65) break; sz -= 4;
  }
  g.save(); g.font = `700 ${Math.round(sz)}px ${font}`; g.textBaseline = 'middle'; const sp = g.measureText(' ').width;
  const lh = sz * 1.3, y0 = y - (lines.length - 1) * lh / 2;
  const widest = Math.max(...lines.map((ln) => ln.reduce((s, it) => s + it.w, 0) + sp * (ln.length - 1)));
  const pw = widest + sz * 1.2, ph = lines.length * lh + sz * 0.65, k = smooth01((t - words[a][1] + 0.02) / 0.12);
  g.save(); g.globalAlpha = 0.93 * k; g.shadowColor = 'rgba(0,0,0,0.08)'; g.shadowBlur = 30; g.shadowOffsetY = 8; g.fillStyle = plate;
  g.beginPath(); g.roundRect(W / 2 - pw / 2, y - ph / 2, pw, ph, ph * 0.3); g.fill(); g.restore();
  if (k > 0.9) rec('plate captions', W / 2 - pw / 2, y - ph / 2, pw, ph);
  lines.forEach((ln, li) => {
    const total = ln.reduce((s, it) => s + it.w, 0) + sp * (ln.length - 1); let x = W / 2 - total / 2; const yy = y0 + li * lh;
    for (const it of ln) {
      const ws = words[it.i][1];
      if (t >= ws - 0.02) {
        const sc = 0.8 + 0.2 * spring(t - ws + 0.02, 'snappy');
        g.save(); g.translate(x + it.w / 2, yy); g.scale(sc, sc);
        if (key.has(it.i)) { const hk = clamp((t - ws) / 0.12); g.fillStyle = accent; g.beginPath(); g.roundRect(-it.w / 2 - 10, -sz * 0.58, (it.w + 20) * hk, sz * 1.16, 14); g.fill(); }
        g.fillStyle = ink; g.textAlign = 'center'; g.fillText(it.d, 0, sz * 0.04); g.restore();
      }
      x += it.w + sp;
    }
  });
  g.restore();
}
// Dark band behind top captions that melts into the picture (Reels UI covers the bottom). a product teaser topBand().
function band({ top = true, h = H * 0.21, color = [2, 2, 2] } = {}) {
  const [r, gg, b] = color, gr = top ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, H, 0, H - h);
  gr.addColorStop(0, `rgb(${r},${gg},${b})`); gr.addColorStop(0.55, `rgb(${r},${gg},${b})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr; g.fillRect(0, top ? 0 : H - h, W, h);
}
// Glow that blooms from a point and clears (light switching on, lockup flare). a product teaser shot 5.
function bloom(t, t0, x, y, r, rgb = [212, 20, 28], { clear = 0.3, k = 1 } = {}) {
  const f = k * Math.pow(clamp(1 - (t - t0) / clear), 2);
  if (t < t0 || f <= 0) return;
  const [R, G, B] = rgb, rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, `rgba(255,236,230,${f})`); rg.addColorStop(0.2, `rgba(${R},${G},${B},${0.85 * f})`); rg.addColorStop(1, `rgba(${R},${G},${B},0)`);
  g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = rg; g.fillRect(0, 0, W, H); g.restore();
}
// Logo lockup: heavy spring (no overshoot on a logo), real logo file only, optional line under it.
function lockup(t, t0, im, { cx = W / 2, cy = H * 0.42, w = W * 0.48, tagline = '', tagT = 0.5, font = 'sans-serif', color = '#fff' } = {}) {
  const L = spring(t - t0, 'heavy');
  if (L <= 0) return;
  const h = w * im.height / im.width, sc = 0.92 + 0.08 * L;
  g.save(); g.globalAlpha = clamp((t - t0) / 0.25); g.translate(cx, cy); g.scale(sc, sc);
  g.drawImage(im, -w / 2, -h / 2, w, h); rec('logo', -w / 2, -h / 2, w, h); g.restore();
  if (tagline) line(tagline, cx, cy + h / 2 + W * 0.09, t, t0 + tagT, { size: W * 0.034, font, color, spacing: 0.18 });
}

// ---------- AI clip frames (route C, two product teasers) ----------
// clips: { name: { dir: 'gen/frames-x', n: 151 } }, frames saved as 0001.jpg... by ffmpeg.
// In seek(t): FRAME = await clipFrame(CLIPS, 'macro', index). Keeps only the last few decoded frames.
const _frames = new Map();
function clipFrame(clips, name, i) {
  const c = clips[name], n = Math.max(1, Math.min(c.n, Math.round(i))), k = name + n;
  if (_frames.size > 6) _frames.delete(_frames.keys().next().value);
  if (!_frames.has(k)) _frames.set(k, new Promise((ok, fail) => {
    const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('missing frame ' + k));
    im.src = `${c.dir}/${String(n).padStart(4, '0')}.jpg`;
  }));
  return _frames.get(k);
}
