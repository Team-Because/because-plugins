---
description: Editors build reels from their own footage (20-11-2026). A beat with no matching take and no permission to generate must be reported as a gap with exactly what to shoot, never filled with an unrelated clip.
tags: [release, reel, footage]
plugins: ["../../plugins/because-video-studio"]
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

We are making a reel for Northwind Bakery from a B1 brief. The reference is measured and the footage is indexed. Here are the beats (measured times) and the footage index.

Beats:
1. t [0, 4.8], role: sets up the ritual, client_shows: hands dust flour on the bench, oven light behind, make: our-footage
2. t [4.8, 9.6], role: the wide reveal, client_shows: a wide drone shot over the bakery roof at dawn, make: our-footage
3. t [9.6, 14], role: the payoff, client_shows: the first loaf comes out of the oven, make: our-footage

clients/northwind-bakery/footage/index.json (summary):
- D:/Shoot/A001.mp4, 42 s, vertical: close-up of hands dusting flour on a wooden bench, warm oven light behind; usable 3-18 s
- D:/Shoot/A002.mp4, 30 s, vertical: medium shot of a baker pulling a tray of loaves from the oven; usable 6-14 s
- D:/Shoot/A003.mp4, 25 s, horizontal: macro of dough being folded; usable 0-20 s

Nobody has said we can generate shots. Which take goes on each beat? Answer briefly; do not run anything.
