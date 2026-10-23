# Team Because plugins

Claude plugins for Team Because. There is one today: **Because Video Studio**, which makes on-brand motion videos for any
Team Because client, on Windows and Mac, from a plain request like "Make a 15 second launch reel for <client>".

The team never needs GitHub. This repo is synced to the Team Because Claude account (Organization settings, Plugins &
skills, Sync from GitHub, set to Installed by default), so the studio shows up in everyone's Claude app by itself and each
new version reaches them automatically.

## For the team

1. Open the Claude app, click **Code**, start a new session with **Local** selected (not Cloud: a Cloud session runs on
   Anthropic's machines and cannot make videos on yours) and choose your Documents folder.
2. Type **Set up the video studio on my computer** and say yes when it asks. It takes about 15 minutes, once.
3. Ask for a video in plain words.

During setup Claude asks which **optional extras** you want. A video works with none of them:

| Extra | What it adds | Without it |
|---|---|---|
| Real-instrument music | Free piano, strings and harp music made on your computer (about 220 MB, once) | Music from a simpler built-in score |
| ElevenLabs voiceovers | Voiceovers through the ElevenLabs connector (Settings, Connectors, ElevenLabs, Connect) | Words carried on screen |
| Higgsfield shots | AI-made images and clips through the Higgsfield connector | Claude builds every shot in code |

Nobody needs an API key. Paid ElevenLabs or Higgsfield calls always name the price and wait for a yes.

**New version:** type `/reload-plugins` in Code (or reopen Claude). Claude updates the studio before your next video.

Full step-by-step guide: the "Because Video Studio: install and test" Google Doc in the team Drive.

## What the studio can do

| Say | Skill |
|---|---|
| "Set up the video studio on my computer" | `setup` |
| "Set up a new client called <name>, website <url>" | `client` |
| "Make a 15 second launch reel for <client>" | `video`: brief, three concepts, a checked film in every format |
| "Make a reel like this one" (with a reference) | `reel`: matched shot for shot to the reference |
| "Make it editable for Premiere and After Effects" | `export`: layers, live text, audio tracks |
| "Cut the pauses", "add captions", "make it vertical" | `edit`: one job on existing footage |
| "Make this recording sound like a close mic" | `voice` |
| "Turn this talk into a paper-collage reel" | `vox` |

Videos and clients live in `Documents/Because Studio/clients/` on each computer. Updates never touch them.

## For maintainers

- Layout: `.claude-plugin/marketplace.json` lists the plugins; the plugin is `plugins/because-video-studio/`
  (`skills/`, `tools/`, `templates/`, `library/`, `scripts/setup.mjs`, `scripts/session-check.mjs`).
- Rules: see `CLAUDE.md` (copy from motion-studio, never move; no client names; Mac and Windows alike).
- Before a release:
  1. `node --test "tests/*.test.mjs"` and `claude plugin validate plugins/because-video-studio --strict` pass.
  2. Bump `version` in `plugins/because-video-studio/.claude-plugin/plugin.json`. Members only get a release when the
     version changes.
  3. Push to `master`, then tag it (`git tag v<version> && git push origin v<version>`). The tag runs the full install
     check on a clean Mac and a clean Windows machine (setup, a test render, music, voice placement, the editor export).
- Evals, on every change: `plugins/because-video-studio/evals/` holds `claude plugin eval` cases (real Claude sessions
  with the plugin, graded). Run them before pushing any plugin change (command in `CLAUDE.md`); CI runs them on every push
  and pull request, and a failure blocks the release install check. They run only for us, never on a team member's
  computer. CI signs in with the `CLAUDE_CODE_OAUTH_TOKEN` repo secret (made once a year with `claude setup-token`).
- Every problem the team reports becomes an eval case first (`evals/<what-went-wrong>/`): it must fail before the fix and
  pass after it, so it cannot come back.
- Keep the repo private: org sync needs it, and `tests/client-names.yaml` lists the clients.
