---
name: setup
description: One-time setup of the Because Video Studio on this computer (Mac or Windows) - installs the free tools, builds the studio folder, adds the ElevenLabs key and checks Higgsfield, then renders a 3 second test clip. Use when someone types setup, says "install the video studio", "set up because video studio", "it says setup has not run", "the video tools are not working", "repair my studio", or when the session note says setup is missing or out of date. Also use before the first video on a new computer.
---

# Setup

The person may never have used a terminal. Speak like a calm colleague: plain words, one idea per sentence, never paste raw
error output. Explain any problem in one line and say what you are doing about it.

Plugin folder: `${CLAUDE_PLUGIN_ROOT}`. The setup record lives in `~/.because-video-studio/config.json`
(Windows: `%USERPROFILE%\.because-video-studio\config.json`).

## 1. Say what is about to happen
"I'm setting up your video studio. It installs a few free tools, takes about 10 minutes, and happens once. Your computer may
ask for permission to install things; say yes."

## 2. Make sure Node.js 22 or newer is there
Run `node --version`. If it is missing or older than 22:
- Mac: `brew install node` if Homebrew exists; otherwise ask them to install the LTS version from https://nodejs.org and come back.
- Windows: `winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements`.
Then ask them to close and reopen Claude if `node` is still not found (the new PATH only reaches new windows).

## 3. One question
Use AskUserQuestion once: **Where should your studio folder live?** Options: `Documents/Because Studio` (Recommended),
Desktop, somewhere else (they type it). Skip the question when the config already has a workspace and they did not ask to move it.

## 4. Run it
Run in the background and keep them posted every minute or two in plain words ("installing the render engine..."):
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --workspace "<their folder>"
```
Lines starting `OK` are done, `WARN` are optional, `FAIL` need action. The script is safe to repeat.
- Mac without Homebrew, or Windows without winget: say the one thing to install (Homebrew from https://brew.sh, or Windows
  "App Installer" from the Microsoft Store), offer to wait, then run again.
- A FAIL about ffmpeg or uv right after it installed them usually means the window needs restarting: ask them to reopen Claude
  and type `/because-video-studio:setup` again.
- Never ask for passwords. If the computer asks for one, say that is normal when installing software.
- `--check` reports without installing anything, for "is my studio OK?".

## 5. Accounts
- **ElevenLabs** (voiceover and music): if the script warned the key is missing, ask them to open `/plugin`, pick
  because-video-studio, choose Configure and paste their key there. It is stored securely and reaches the studio at the next session.
  Never ask them to paste a key into the chat.
- **Higgsfield** (generated stills and clips): look through your available tools for Higgsfield. If none, say: "Connect
  Higgsfield in Claude settings, Connectors. Until then I build everything in code."

## 6. Finish
Show the test clip path from the script and tell them they are ready, with three things they can say:
"Set up a new client called <name>, website <url>", "Make a 15 second launch reel for <client>",
"Make a festive wish for <client> for Diwali". Then stop.
