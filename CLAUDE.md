# CLAUDE.md

Team Because's Claude Code plugins. This repo is a plugin marketplace (`.claude-plugin/marketplace.json`) holding one plugin today: `plugins/because-video-studio`, which makes on-brand motion videos for any Team Because client.

Plan and decisions: `~/.claude/plans/virtual-drifting-puzzle.md`. Architecture board: https://miro.com/app/board/uXjVEYOA1-E=/

## Rules

1. **Copy, never move.** The engine, tools and library come from `../because-project-b1/motion-studio/`. Copy what is needed into the plugin and change only the copy. Never edit `motion-studio/`, B1 or the skills in that repo from here.
2. **For every client.** No client name, product, number or rule in plugin code, skills, prompts or examples. Client facts live in each user's workspace (`clients/<client>/`). `tests/client-leak.test.mjs` fails on a leak.
3. **Mac and Windows alike.** No `brew`-only, `/opt/homebrew`, `~/Library`, `osascript`, `open`, `cp`/`rm` shell calls or `.venv/bin` paths without the Windows twin. Use `tools/paths.mjs` and `tools/paths.py`.
4. **Our engine by default.** The seek(t) engine builds every video unless the user names HyperFrames. Remotion is left out (company licence needed above 3 employees).
5. **Paid calls ask first.** ElevenLabs and Higgsfield calls name the price and wait for a yes.
6. **Before a release:** `claude plugin validate plugins/because-video-studio --strict` and `node --test "tests/*.test.mjs"` pass, and the version in `plugin.json` is bumped.
8. **Evals on every change, here before the push.** `.githooks/pre-push` runs the evals in `evals/` (repo root, outside the plugin, so nothing reaches team members) with `claude plugin eval` on this computer's Claude login, no token, nothing on GitHub) before any push that changes the plugin, and a failure stops the push. After a fresh clone, turn it on once with `git config core.hooksPath .githooks`. Every problem the team reports becomes a case there first: it must fail before the fix and pass after it. Team members never run evals.
7. **Remote:** private repo https://github.com/Team-Because/because-plugins (moved from Aman's account on 21-10-2026; share only this address with the team). Owner: the Team-Because GitHub account (because.subscription@gmail.com). qa-aman is a collaborator with write access and pushes from here. Keep it private: Claude Team org sync needs a private repo, and tests/client-names.yaml lists the clients.

## Layout on a user's machine

`setup` copies the studio files into a workspace (default `Documents/Because Studio/`) that keeps the tree the tools expect:
`tools/ templates/ library/ prompts/ recipes/ studio/ .venv/ node_modules/ .env clients/<client>/videos/<video>/out/`.
Updates re-sync the studio files and never touch `clients/`.

Parked ideas live in `docs/future.md`; read it before adding a feature.

Dates are DD-MM-YYYY.
