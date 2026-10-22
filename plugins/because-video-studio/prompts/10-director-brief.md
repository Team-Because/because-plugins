# Step 10 · Overnight: the director's brief

Source: @0xMovez course, step 10 (https://x.com/0xMovez/article/2104216919033192746).
Donald (@donaldjewkes) dictated for five minutes, went to sleep, and woke up to a 142-second music video ("Claude Pop",
2.1M views). His brief runs about 9,500 characters; @pradeepXkapoor's "Pip" robot film used 19,000. Both share one
skeleton: they don't describe a video, they hire a crew.

## The skeleton (what every long brief contains)
1. Film in one line: the logline and the joke, so every decision can be checked against it.
2. References: source video, song, image library, prior work. What to keep, what to push.
3. Tools and keys: skills, APIs (image, video, voice), budget. "Spend it economically."
4. Character bible: proportions, palette sampled from a sheet, expressions, an identity lock.
5. Beat sheet: acts with timestamps, a visual payoff every 3-5 s, a hook in the first 2.
6. Text on screen: when captions go huge, when they sit like subtitles.
7. Workflow gates: plan, rig, stills, animatic, full pass, polish, audio, render. No skipped gates.
8. Critique loop: stills, scores, the 3 worst problems, fix, repeat until 8+.
9. Deliverables: final MP4, loop check, poster, contact sheet, clean source with a README.

Fill it per video in `docs/director_brief.md` (new-video.mjs copies the template in).

## Generate-then-trace (route C)
Donald's key move: a video model renders base shots with characters and physics, then Opus redraws the video in code
on top, so the viewer only sees the code-drawn layer. Video models give motion that is hard to hand-code; the code
layer gives a consistent, ownable look. Pleometric re-ran the same brief with his own gallery and got a different film.
We used a version of this for an earlier product film: AI clips for the motion, code for labels, captions, timing and sound.

Models on our FAL account ("Web Because"), prices checked 07-10-2026:
| Use | Endpoint | Price | 5 s clip |
|---|---|---|---|
| Stills, style transfer | fal-ai/nano-banana-pro/edit | $0.15 / image | |
| Clips, first + last frame (used on a product teaser) | fal-ai/kling-video/v3/pro/image-to-video | $0.14 / s | $0.70 |
| Clips, the course's model | bytedance/seedance-2.5/image-to-video | $0.0214 / 1000 tokens | about $2.31 at 720p, $5.20 at 1080p (estimate*) |
| Many references locked (character, set, palette), up to 30 s | bytedance/seedance-2.5/reference-to-video | same | same |

*FAL documents tokens = height x width x fps x seconds / 1024 for Seedance v1; we assume the same for 2.5 at 24 fps.
Run estimate_cost or one short draft before budgeting a whole film on it.

## Our brief (paste into the client session with docs/director_brief.md filled in)
```
You are the director, animator, sound designer and render engineer for a [DURATION] film made in code for
[CLIENT]. Treat this as a multi-session production. Don't rush to a final render.
Read first: the client CLAUDE.md, docs/director_brief.md (film, refs, budget, character bible, beat sheet, text),
docs/style_guide.md, prompts/08-springs.md, prompts/09-sound.md.

## Workflow, with gates (show me each gate's output before the next one, unless I said "run overnight")
1. Plan: docs/shotlist.md (every shot: frames, camera, text, SFX) and docs/STORYBOARD.md.
2. Rig: characters and reusable parts as code (or route C: generate base clips through FAL MCP, log each job and
   the running total in docs/generation_log.md, stop and ask at 80% of budget).
3. Stills for every shot: tools/stills.mjs. Critique loop below.
4. Animatic: tools/render.mjs --w 540 --h 960 --fps 24 (half size) with placeholder sound. Fix pacing before polish.
5. Full pass, polish pass, sound pass (tools/beats.py or beatgrid.mjs, sfx.mjs, mux.mjs), final render at
   --fps 60 --sub 4.
6. Long films: split by chapter across subagents, at most 4 in parallel. Write docs/ANIMATION_GUIDE.md first so
   every subagent codes in the same style; each subagent owns one chapter file.

## Critique loop (every shot, at least 3 rounds)
Render 3-5 stills, score 1-10 on: hook, readability at 360 px wide, motion, composition, depth, brand, sound sync,
polish. Log scores + 3 biggest problems in docs/review_log.md. Fix. Repeat until all are 8+.

## Deliverables
out/final.mp4 (tools/mux.mjs, no WARNING) · tools/deliver.mjs --dur [DURATION] --loop gives out/poster.png,
out/contact.png, out/loop_check.mp4 and the seam score · README.md: how to re-render.
```

### "Run overnight"
The course lets the run continue if you don't answer the shot list within 10 minutes. Our rule (CLAUDE.md) is no code
before the style guide and shot list are approved. So an overnight run starts only after Aman approves the brief,
the shot list and the FAL budget; from then on every gate runs without waiting, and the review log carries the scores.
The session must stay open (laptop awake) for the run to finish.

## The course template (verbatim)
```
You are the director, animator, sound designer and render engineer for a [DURATION] film
made in code. Treat this as a multi-session production. Don't rush to a final render.

## The film in one line
[LOGLINE. What the viewer should feel at the end.]

## References and inputs
- ./refs/ : [video / frames / image library]. Take the grammar, never the content.
- ./audio/track.wav : use it unchanged. Measure beats with beats.py first.
- Skills available: [/remotion-best-practices | /hyperframes | /claude-animation].
- Connectors: [ElevenLabs for voice, Higgsfield for generated shots]. Music is made locally. Budget: [$X]. Be economical.

## Look
[3-5 lines: palette, type, texture, camera language. Banned looks.]

## Beat sheet
0:00-0:02 hook: [the single most striking image]
0:02-0:10 [act 1]
... a new visual payoff every 3-5 seconds
[END] the last frame sets up the first frame (loop)

## Workflow, with gates
1. Write docs/style_guide.md and docs/shotlist.md (every shot: frames, camera, text, SFX).
   Show me the shot list. Then continue without waiting if I don't answer in 10 minutes.
2. Build stills for every shot. Contact sheet. Critique.
3. Animatic at 960x540 with placeholder audio. Fix pacing before polish.
4. Full animation, polish pass, sound pass, final render.
5. Split work across subagents per chapter. Write docs/ANIMATION_GUIDE.md first
   so every subagent codes in the same style.

## Critique loop (every shot, at least 3 rounds)
Render 3-5 stills, score 1-10 on: hook, readability at 360px wide, motion, composition,
depth, sound sync, polish. Log scores + 3 biggest problems in docs/review_log.md. Fix. Repeat
until all are 8+.

## Deliverables
out/final.mp4 · out/loop_check.mp4 · out/poster.png · out/contact.png · README.md
```
John Heibel's PDoom repo shows the subagent pattern: Opus wrote ANIMATION_GUIDE.md to brief the subagents it ran in
parallel and STORYBOARD.md after the first generation, with nine chapters in src/ch/. Ask for both files by name.

## What we changed and why
| Course | Ours | Why |
|---|---|---|
| Everything in one prompt | The film's facts live in docs/director_brief.md; the prompt stays generic | The same prompt works for every client; the brief is the record of what was agreed |
| Continue if no answer in 10 min | Overnight only after the brief, shot list and budget are approved | Studio rule: no code before approval |
| APIs in .env | FAL MCP, account "Web Because", price checked per job, running total, stop at 80% | No keys in files; spend is visible |
| Animatic at 960x540 | --w 540 --h 960 for 9:16 (tested) | Reels are vertical |
| Subagents, no limit | At most 4 in parallel, one chapter file each | Cost control |
| Deliverables listed | tools/deliver.mjs makes poster, contact sheet, loop check and scores the seam | A first version scored a broken loop "seamless" (it compared two blank frames); now it compares the last shown frame with frame 0: 40.6 on a jump, 0.29 on a real loop |
| + | character bible, generation_log and review_log templates | Nothing restarts from zero on the next video |
