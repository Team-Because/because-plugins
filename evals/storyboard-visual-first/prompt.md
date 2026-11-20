---
description: Video editors look, they do not read (20-11-2026). At the storyboard stop of a B1-brief reel, the storyboard page is the stop; the chat says one or two lines and asks for approval, it does not list every beat in text.
tags: [release, reel, footage]
plugins: ["../../plugins/because-video-studio"]
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
---

We are making a reel for Northwind Bakery from a B1 brief, cut from the editor's own footage. You matched a take to each of the 5 beats; beat 4 has no matching take (it needs a wide shot of the bakery at dawn). `node tools/reel-kit.mjs storyboard clients/northwind-bakery/videos/first-bake` just finished and opened the storyboard page.

Write exactly what you say to the editor now. Do not run anything.
