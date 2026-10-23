---
name: setup
description: One-time setup of the Because Video Studio on this computer (Mac or Windows) - installs the free tools, builds the studio folder, asks which optional extras they want (real-instrument music on this computer, ElevenLabs voiceovers, Higgsfield generated shots) and connects them, then renders a 3 second test clip. Use when someone types setup, says "set up the video studio", "set up the video studio on my computer", "get my computer ready for videos", "install the video studio", "set up because video studio", "it says setup has not run", "the video tools are not working", "repair my studio", "add ElevenLabs to my video studio", "add Higgsfield", "add the music engine", or when the session note says setup is missing or out of date. Also use before the first video on a new computer.
---

# Setup

The person may never have used a terminal. Speak like a calm colleague: plain words, one idea per sentence, never paste raw
error output. Explain any problem in one line and say what you are doing about it.

Plugin folder: `${CLAUDE_PLUGIN_ROOT}`. The setup record lives in `~/.because-video-studio/config.json`
(Windows: `%USERPROFILE%\.because-video-studio\config.json`).

## 0. Check this is their computer
If the session note says this is a Cloud session, or `echo $CLAUDE_CODE_REMOTE` prints `true`, stop: the studio only works
on their own computer. Say: "This session is running in the cloud. Start a new session in Code, choose Local (not Cloud) and
your Documents folder, then ask me again." Do not try workarounds such as another browser.

## 1. Say what is about to happen
"I'm setting up your video studio. It installs a few free tools, takes about 10 minutes, and happens once. Your computer may
ask for permission to install things; say yes."

## 2. Make sure Node.js 22 or newer is there
Run `node --version`. If it is missing or older than 22:
- Mac: `brew install node` if Homebrew exists; otherwise ask them to install the LTS version from https://nodejs.org and come back.
- Windows: `winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements`.
Then ask them to close and reopen Claude if `node` is still not found (the new PATH only reaches new windows).

## 3. Two questions, in one AskUserQuestion call
1. **Where should your studio folder live?** Options: `Documents/Because Studio` (Recommended), Desktop, somewhere else (they
   type it).
2. **Which extras do you want?** (multiSelect; every one is optional, and a video works with none of them)
   - **Real-instrument music on this computer** (Recommended): free piano, strings and harp music made by Claude, about 220 MB
     once. Without it, videos still get music from the simpler built-in score.
   - **ElevenLabs voiceovers**: for people who have an ElevenLabs login (the video content team). Without it, videos carry
     their words on screen.
   - **Higgsfield generated shots**: AI images and clips, for people with a Higgsfield login. Without it, Claude builds every
     shot in code.
Skip a question whose answer is already in the config (`workspace`, `music`, `connectors`) unless they ask to change it.
Never ask for passwords or API keys; nobody needs one.

## 4. Run it
Run in the background and keep them posted every minute or two in plain words ("installing the render engine..."):
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" --workspace "<their folder>" --music|--no-music --connectors elevenlabs,higgsfield|none
```
Pass `--music` or `--no-music` and `--connectors` from their answers; the script remembers them for every later run.
Lines starting `OK` are done, `WARN` are optional, `FAIL` need action. The script is safe to repeat.
- Mac without Homebrew, or Windows without winget: say the one thing to install (Homebrew from https://brew.sh, or Windows
  "App Installer" from the Microsoft Store), offer to wait, then run again.
- A FAIL about ffmpeg or uv right after it installed them usually means the window needs restarting: ask them to reopen Claude
  and type `/because-video-studio:setup` again.
- Never ask for passwords. If the computer asks for one, say that is normal when installing software.
- `--check` reports without installing anything, for "is my studio OK?".

## 5. Connectors they picked (skip any they did not pick)
Look through your available tools for each one they chose.
- **ElevenLabs** picked but no ElevenLabs tools: "To finish voiceovers: in Claude, open Settings, then Connectors, find
  ElevenLabs, click Connect and sign in with your ElevenLabs login. Then start a new session." Until then videos use on-screen text.
- **Higgsfield** picked but no Higgsfield tools: the same steps with Higgsfield. Until then Claude builds every shot in code.
- Already connected: say so in one line. Not picked: say nothing about it.
They can add any extra later by saying "add ElevenLabs to my video studio" or "add the music engine": run setup again with
the new choice.

## 6. Finish
Show the test clip path from the script and tell them they are ready, with three things they can say:
"Set up a new client called <name>, website <url>", "Make a 15 second launch reel for <client>",
"Make a festive wish for <client> for Diwali". Then stop.
