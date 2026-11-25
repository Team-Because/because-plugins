---
description: Instagram often refuses the download (20-11-2026). When the reference link fails, the skill must use B1's own copy from the brief (reference_file) with one command, not ask the person to download it by hand.
tags: [release, reel, b1]
plugins: ["../../plugins/because-video-studio"]
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Make a reel like this one for Northwind Bakery.

Reference: https://www.instagram.com/reel/EVALREF02/ (@someaccount)

b1-storyboard v1
client: Northwind Bakery
say: Every loaf starts before sunrise.
duration: 12
reference_file: https://storage.example.com/b1/media.mp4?token=abc   (B1's copy, valid 7 days)
beats:
- t: [0, 6]
  reference_shows: hands unbox a roll of film
  role: sets up the ritual
  client_shows: hands dust flour on the bench
  client_line: ""
  make: our-footage
- t: [6, 12]
  reference_shows: the first photo is taken
  role: the payoff
  client_shows: the first loaf comes out of the oven
  client_line: ""
  make: our-footage

I already ran `node tools/reel-kit.mjs ref northwind-bakery https://www.instagram.com/reel/EVALREF02/` and it failed: "ERROR: [Instagram] EVALREF02: Requested content is not available, rate-limit reached or login required".

Do not run anything. In one or two lines: what exact command do you run next?
