// Step 08 · Springs. Motion helpers for seek(t) films, all pure functions of time.
// Copied into every video next to index.html by tools/new-video.mjs, so a finished video keeps the exact
// curves it was approved with. Loaded as a classic <script> (works from file:// in a normal browser).

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;

// Presets from the course figure "spring step response" (stiffness k, damping d, mass 1)
const SPRINGS = {
  snappy:  [320, 30],  // buttons, toggles, leading edges (tiny overshoot)
  default: [170, 26],  // cards, containers, camera (no overshoot)
  heavy:   [90, 20],   // big type, 3D objects, logo lockups (slow, no overshoot)
  playful: [220, 14],  // mascots, stickers (visible overshoot, about 18%)
};

// Closed-form damped spring from 0 to 1, started at t = 0. Accepts k, d or a preset name.
function spring(t, k = 170, d = 26) {
  if (typeof k === 'string') [k, d] = SPRINGS[k];
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k), z = d / (2 * w0);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
  }
  if (z === 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  const s = w0 * Math.sqrt(z * z - 1), r1 = -z * w0 + s, r2 = -z * w0 - s;  // overdamped
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

// A value that changes target several times: one spring per change, each from its own start time.
// keys: [[time, value], ...] sorted by time. Frame 812 never needs frames 0 to 811.
function track(t, keys, k = 170, d = 26) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}

// A tab indicator that stretches: leading edge stiffer than trailing edge. width = indicator width in px.
function indicator(t, stops, width = 120) {
  const lead = track(t, stops, ...SPRINGS.snappy);
  const trail = track(t, stops, 140, 22);
  return { left: Math.min(lead, trail), right: Math.max(lead, trail) + width };
}

// Text inside a morphing box: in after the morph starts, out before the next one
function swapAlpha(t, tIn, tOut) {
  return Math.min(clamp((t - tIn - 0.08) / 0.12), clamp((tOut - 0.1 - t) / 0.1));
}

// Seamless loop: pin the last frame to the first
const loopT = (t, dur) => ((t % dur) + dur) % dur;

// Seeded noise (mulberry32), never Math.random: every render must be identical
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
