# Step 08 · Springs (make motion feel expensive)

Source: @0xMovez course, step 08 (https://x.com/0xMovez/article/2104216919033192746).
Cheap motion eases from A to B on a fixed curve. Expensive motion has mass: it accelerates, overshoots a hair, settles.
Closed-form springs stay a pure function of time, so seek(t) stays deterministic.

The trick most people miss: when a value changes target several times (a cursor, a container's width), don't
restart the spring. Add one spring per change, each from its own start time. Motion stays continuous, and frame
812 renders without simulating frames 0 to 811.

## What we have
| Piece | File |
|---|---|
| Helpers: spring, track, indicator, swapAlpha, loopT, rng, SPRINGS presets | `templates/engine/motion.js`, copied into every video as `motion.js` |
| Checks against the course figure + no-jump / no-restart tests | `node tools/test-motion.mjs [video/motion.js]` |
| The course figure (step response of the 4 presets) | `refs/article/03-spring-curves.png` |

Every video gets its own frozen copy of motion.js, so changing a preset later never changes an approved video.

## Presets (read from the course figure, checked by tools/test-motion.mjs)
| Name | k, d | Use for | Measured |
|---|---|---|---|
| `snappy` | 320, 30 | buttons, toggles, leading edges | 0.8% overshoot, settled 0.24 s |
| `default` | 170, 26 | cards, containers, camera | no overshoot, settled 0.51 s |
| `heavy` | 90, 20 | big type, 3D objects, logo lockups | no overshoot, settled 0.78 s |
| `playful` | 220, 14 | mascots, stickers | 18.6% overshoot at 0.24 s, settled 0.59 s |

Use: `spring(t - start, 'snappy')`, `track(t, keys, ...SPRINGS.default)`.

## The refactor prompt (course, verbatim)
```
Replace every easing curve with closed-form springs from lib/motion.js. Tiny overshoot on UI, none on type.
Any value with more than one target uses track().
```
In our studio the file is `motion.js` next to index.html (not lib/), so paste:
```
Replace every easing curve with closed-form springs from motion.js (presets in SPRINGS: snappy for UI,
heavy for type and logos, default for cards and camera, playful only for mascots). Tiny overshoot on UI,
none on type. Any value with more than one target uses track(). Then run node tools/test-motion.mjs on
this video's motion.js and show me a stills sheet of the moments that changed.
```
Opus refactors the whole file in one pass.

## The course original (verbatim)
```js
// keys: [[time, value], ...] sorted by time. Returns the value at t.
export function track(t, keys, k = 170, d = 26) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++)
    v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], k, d);
  return v;
}

// A tab indicator that stretches: leading edge is stiffer than trailing edge
export function indicator(t, stops) {              // stops: [[time, x], ...]
  const lead  = track(t, stops, 320, 30);
  const trail = track(t, stops, 140, 22);
  return { left: Math.min(lead, trail), right: Math.max(lead, trail) + 120 };
}

// Text inside a morphing box: in after the morph starts, out before the next one
export function swapAlpha(t, tIn, tOut) {
  return Math.min(clamp((t - tIn - 0.08) / 0.12), clamp((tOut - 0.1 - t) / 0.1));
}

// Seamless loop: pin the last frame to the first
export const loopT = (t, dur) => ((t % dur) + dur) % dur;
```
- Snappy UI: buttons, toggles, leading edges
- Default: cards, containers, camera
- Heavy: big type, 3D objects, logo lockups
- Playful: mascots, stickers (visible overshoot)

## What we changed and why
| Course | Ours | Why |
|---|---|---|
| `lib/motion.js` as an ES module (`export`) | `motion.js` as a classic script next to index.html | ES modules are blocked from file://, so opening the page to preview would break |
| One shared lib | One frozen copy per video | An approved video re-renders identically even after presets change |
| Presets only in a figure | `SPRINGS` object + `spring(t, 'heavy')` | Names in code, not numbers copied by hand |
| d/2√k ≥ 1 treated as critical | True overdamped branch | `heavy` (ratio 1.05) follows the real curve |
| `indicator` width fixed at 120 | `indicator(t, stops, width = 120)` | Tabs of any width |
| No tests | `tools/test-motion.mjs` (16 checks) | Tested against the figure; a deliberately broken copy (restart bug) fails 2 checks |
