# Step 06 · Spec prompt (state list, not vibe)

Source: @0xMovez course, step 06 (https://x.com/0xMovez/article/2104216919033192746). Pattern from @twoclipping's UI
morph film and @verbove's MakerMap film: inputs to ask for, direction, a beat-by-beat state list, build rules, gotchas.
Concept: one shape that never cuts. A single element changes size, radius and colour from state to state, a cursor
drives each change with real clicks, and the last frame equals the first so it loops.

## Before you prompt
1. `node tools/new-video.mjs <client> <video>` and fill in brief.md.
2. Make the beat grid: `node tools/beatgrid.mjs --bpm 120 --bars 8 --out clients/<client>/videos/<video>/docs`
   It writes beats.json and state_list.md (one row per beat). Fill a state into every row.
3. States must be real: take each one from brand/assets screenshots of the client's product. Never invent a screen.

## The template (fill the brackets, paste into the client session)

```
<inputs>
Ask me for: the product + URL, 8 to 12 UI states that tell its story (use docs/state_list.md if filled),
the real data shown in each state, brand colours + fonts + one accent (brand/brand.json),
a track near [BPM] BPM or "synthesize", and the formats.
</inputs>

<direction>
Product-film UI motion. One container never cuts: every state is the same element changing size, radius
and fill while its content swaps behind a short blur. A cursor drives every change.
[Ground colour] canvas, one accent. Springs with at most a tiny overshoot.
Banned: bouncy easing, glows, gradients on UI chrome, particle bursts, dead time.
</direction>

<structure>
[BPM] BPM, [BARS] bars, something happens on every beat.
[state 1] -> [state 2] -> ... -> [state N] -> [state 1]   (from docs/state_list.md)
</structure>

<build>
1. One HTML file, one canvas, window.seek(t). No CSS transitions, no timers, no carried state.
2. Closed-form springs. A value with many targets = sum of one spring per change.
3. Text inside a morphing container enters after the morph starts, leaves before the next one.
4. Tab indicators: leading and trailing edges on different springs so they stretch.
5. Beat grid from docs/beats.json. Start on a downbeat. UI sounds on the beats.
6. Render with tools/render.mjs at 60 fps, --sub 4 (motion blur from 4 blended subframes).
</build>

<gotchas>
Never use will-change on anything the camera scales (blurry text).
The last frame must equal the first, cursor position and velocity included.
</gotchas>

<start>
Ask for the inputs, then show me the state list on the beat grid before writing code.
</start>
```

## The course original (verbatim, for comparison)

```
<inputs>
Ask me for: my product + URL, 8 to 12 UI states that tell its story, the real data shown in
each state, brand colors + fonts + one accent, a royalty-free track near 120 BPM, formats.
</inputs>

<direction>
Product-film UI motion. One container never cuts: every state is the same element changing
size, radius and fill while its content swaps behind a short blur. A cursor drives every change.
Warm neutral canvas, one accent. Springs with at most a tiny overshoot.
Banned: bouncy easing, glows, gradients on UI chrome, particle bursts, dead time.
</direction>

<structure>
120 BPM, 8 bars, something happens on every beat.
logo → CTA button → email field (typed) → loader → success check → dashboard card
→ chart draws itself → tooltip on hover → ⌘K palette → toast → logo.
</structure>

<build>
1. One HTML file, one canvas, window.seek(t). No CSS transitions, no timers, no carried state.
2. Closed-form springs. A value with many targets = sum of one spring per change.
3. Text inside a morphing container enters after the morph starts, leaves before the next one.
4. Tab indicators: leading and trailing edges on different springs so they stretch.
5. Beat grid from the track (numpy/librosa). Start on a downbeat. UI sounds on measured peaks.
6. Render in headless Chrome at 60 fps, 4 subframes per frame, blended for motion blur.
</build>

<gotchas>
Never use will-change on anything the camera scales (blurry text).
The last frame must equal the first, cursor position and velocity included.
</gotchas>

<start>
Ask for the inputs, then show me the state list on the beat grid before writing code.
</start>
```

What we changed and why: the fixed parts (warm neutral canvas, 120 BPM, 8 bars, the logo → CTA → ... chain) became
fill-in fields so it works for any client; the structure reads from docs/state_list.md made by tools/beatgrid.mjs;
build step 5 reads docs/beats.json (from a grid now, measured from the track once step 09's beats tool exists);
step 6 names our renderer (tools/render.mjs --fps 60 --sub 4). The example chain above is a good default state list
for a SaaS product: copy it into state_list.md and swap in the client's real screens.

## When to use a spec instead of a shot list
- Shot list (step 05): many shots, cuts, a reference look. Best for brand reels and story films.
- Spec (step 06): one continuous object, states on a beat grid, a loop. Best for product UI films.
