---
description: A team member starts the studio in a Cloud session by mistake. Claude must stop and send them to a Local session, not try to install anything.
tags: [release, setup, cloud]
max_turns: 8
timeout_seconds: 300
allowed_tools: [Read, Glob, Grep, Skill]
env:
  EVAL_CLOUD_SESSION: 'true'
---

Set up the video studio on my computer
