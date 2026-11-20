---
description: B1 already picked the idea and drafted the storyboard (20-11-2026). A pasted B1 brief must go straight to the footage folder question, never offer three ideas again.
tags: [release, reel, b1]
plugins: ["../../plugins/because-video-studio"]
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

Make a reel like this one for Northwind Bakery.

Reference: https://www.instagram.com/reel/EVALREF01/ (@someaccount)
Why it fits Northwind Bakery: slow morning ritual, hands at work, warm light.
Our angle: the first bake of the day, from flour to the first loaf out.

b1-storyboard v1
client: Northwind Bakery
say: Every loaf starts before sunrise.
duration: 15
reference_file: https://storage.example.com/b1/media.mp4?token=abc   (B1's copy, valid 7 days)
beats:
- t: [0, 5]
  reference_shows: POV hands unbox a roll of film
  role: sets up the ritual
  client_shows: hands dust flour on the bench, oven light behind
  client_line: ""
  make: our-footage
- t: [5, 11]
  reference_shows: the camera is loaded and wound
  role: the craft in close-up
  client_shows: dough folded and shaped, macro
  client_line: "Before sunrise"
  make: our-footage
- t: [11, 15]
  reference_shows: the first photo is taken
  role: the payoff
  client_shows: the first loaf comes out of the oven
  client_line: ""
  make: studio-decides

Keep the reference's grammar (structure, timing, the trick, the pacing), not its content.

Do not run anything yet. In a few lines: what is the first thing you will ask me?
