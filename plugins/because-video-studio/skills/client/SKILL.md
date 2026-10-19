---
name: client
description: Set up a Team Because client in the video studio - creates the client's folder, pulls brand colours, fonts, logos and screenshots from their website, and traces product images into line art, so every later video is on-brand without asking again. Use when someone says "add a new client", "set up <brand> for videos", "onboard <company>", "grab the brand from <url>", "update <client>'s brand", or asks for a video for a client the studio does not know yet.
---

# Client

Every video reads the client's folder, so a good folder means fewer questions later. Do the work; ask only what you cannot find.

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`. No file: run the
setup skill first. Run every command below from the workspace folder. Python is `.venv/bin/python` on Mac and
`.venv\Scripts\python.exe` on Windows.

## Steps
1. **Name and slug.** The slug is lowercase letters, numbers and dashes (`green-valley-school`). If `clients/<slug>/` already
   exists, this is an update: skip to step 3.
2. **Create it:** `node tools/new-client.mjs <slug> "<Client Name>" <website-url>`. With a URL it also runs the brand grab.
3. **Brand grab again** (update, or a better page than the homepage): `node tools/grab-brand.mjs <url> <slug>`.
4. **Trace product images** once there are product photos in `clients/<slug>/brand/assets/product/`:
   `<python> tools/trace-assets.py <slug>`.
5. **Fill the client's `CLAUDE.md`** from the site and anything the person gave you: what they sell, to whom, brand colours
   (from `brand/brand.json`), voice, never-say words, the real product names. Only facts you can point to; leave a field
   empty rather than guess, and tell the person which ones are empty.
6. **Check:** `<python> library/check_index.py` must say `library ok`.

## Tell the person
Two or three lines: what was found (logo, colours, fonts, products), what is missing, and one example of what to ask next
("Make a 15 second launch reel for <Client Name>").

## Keep in mind
- One client per folder. Never copy another client's files, colours or words into this one.
- Real logos and product images only; never redraw or generate a logo.
