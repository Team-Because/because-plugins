# Step 04 · Brand reel prompt

Source: @0xMovez course, step 04 (https://x.com/0xMovez/article/2104216919033192746).
The one-liner pointed at a real product. Three extra lines do the work: the URL, "use the real assets", "must have music".

## Before you prompt

1. Set up the client once: `node tools/new-client.mjs <client-slug> "<Name>" <url>`
   It creates `clients/<client-slug>/` and grabs the brand kit into `brand/` (screenshots, logo candidates,
   `brand.json` with colours and fonts). Fill in the brand section of the client's `CLAUDE.md`.
2. Create the video: `node tools/new-video.mjs <client-slug> <video-slug>` and fill in its `brief.md`.
   Start one Claude Code session per client, inside `clients/<client-slug>/`, and keep it.
   A second video in the same session is faster: the renderer, audio and export already exist.
3. Voice (ElevenLabs) and generated media go through the FAL MCP server, so no API key goes in a prompt.

## The template

```
Make a dynamic 20-second motion graphics video for [PRODUCT] ([URL]), with the energy
of a motion designer's showreel. Go all out.

Assets
- Start from brand/assets and brand/brand.json (grabbed from the site). If something is missing, visit
  the site and use real screenshots (Playwright), the real logo, real colors and fonts.
  List what you have before you animate.
- Never redraw the product UI from imagination. Crop and animate the real thing.

Story (one beat each, 2 to 4 seconds)
1. Hook: the problem in 5 words of huge kinetic type.
2. The product appears, the UI assembles itself piece by piece.
3. Three features, each as a UI moment with a cursor doing a real action.
4. One number that proves it works: [METRIC].
5. Logo lockup + [CTA].

Sound
- Original music, 120 BPM, synthesized in code. UI clicks and whooshes on the beat.

Format: 1080x1920 (9:16) first, then 1:1 and 16:9 from the same timeline.
Before the full render, show me a contact sheet of one frame per beat.
```

## Upgrade: voice + mascot (pattern from @achxvi)

Add to the template:
```
Add a character who explains the product in a short voiceover. Generate the voice with
ElevenLabs through the FAL MCP server (fal). Keep the character on brand: same palette, simple shapes.
```

## Proof points from the course
- Tony Dinh: TypingMind reel in under 30 minutes, replacing a video he paid ~$1,000 for a year earlier.
- Rob Hallam: asked for a product ad in the same chat after his reel, and it came out faster.
