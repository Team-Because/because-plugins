---
name: image
description: Make on-brand images for a Team Because client with the person's own ChatGPT subscription (through Codex, no extra cost) - social posts, carousel slides, stories, banners, festive creatives, ad creatives, thumbnails and backgrounds, in the right size, with the client's real logo and exact words on top. Use whenever someone asks for an image, picture, post, creative, poster, carousel, story, banner, thumbnail, cover, festive wish image, ad creative or "something for Instagram/LinkedIn/Facebook" for a client, says "make a post for <client>", "create an image", "design a creative", "make the carousel", or wants changes to an image made earlier, even if they never say "image".
---

# Image · one ask, a few options, one pick

The person gives a client and what the image is for. Claude writes the picture prompt from the brand, Codex draws 2-3
options on their ChatGPT plan, and the real logo and exact words go on top in code. They pick one, give notes, and get the
final file in every size they need.

## Find the studio
Read `~/.because-video-studio/config.json` (Windows: `%USERPROFILE%\.because-video-studio\config.json`) for `workspace`.
Run every command from the workspace. If `codex` is not `true` in the config, or `codex login status` does not say
"Logged in", say in one line that images need a one-time ChatGPT sign-in and run the setup skill's images step first.

## 1 · Understand the ask (at most one round of questions)
Work out from their words, and ask only what is missing, in one AskUserQuestion call:
- **Client** (a folder in `clients/`; if new, the client skill sets it up first).
- **Where it goes**, which sets the size: Instagram or Facebook post 4x5, square post 1x1, story or reel cover 9x16,
  LinkedIn or YouTube banner and thumbnail 16x9. A carousel is several 4x5 or 1x1 slides with one look.
- **The words on it**: the headline (and an optional line under it). Take them from their message, or offer 2-3 short
  options written from the client's facts. Never invent prices, dates, offers or claims: only what they said or what the
  client files state.

## 2 · Read the brand before writing the prompt
From `clients/<client>/`: `CLAUDE.md` (rules, never-say list), `brand/brand.json` (colours, fonts, logos),
`brand/assets/` (logo files), `products/*/facts.md` if a product is involved, and `library.yaml`. Pick:
- the logo file (prefer a transparent PNG or SVG; check it by looking at it),
- the headline colour and font from brand.json (a font file under `brand/assets/` or `library/fonts/` if one matches;
  otherwise pass the font name),
- a look that fits the brand and the audience (premium, warm, playful...).

## 3 · Make 2-3 options
Write one picture prompt: the scene, light, mood, colours from the brand, camera or style, and where the calm space for the
words sits (lower third for a headline at the bottom). Describe a picture, never text: the tool already tells Codex to leave
out letters and logos, because image models bend them.
```
node tools/image.mjs make --out clients/<client>/images/<DD-MM-YYYY>-<slug> --size 4x5 --n 3 --prompt "<prompt>"
```
About a minute; the options run in parallel. `--ref <file>` passes a reference picture (a product photo, a style they like).
Real products: pass the client's real product photo as `--ref` and say "keep the product exactly as in the reference";
check the result closely and say plainly if the product changed.

## 4 · Put the logo and words on, then show them
For each option:
```
node tools/image.mjs finish <dir>/option-1.png --size 4x5 --out <dir>/option-1-final.png --logo <logo> --corner tr
  --headline "<headline>" [--sub "<line>"] [--font-file <ttf> | --font "<name>"] [--color <hex>] [--plate <hex with alpha>]
```
Look at every final yourself before showing: words readable at phone size, nothing important under the words or the logo,
logo crisp and on brand, no stray letters drawn by the model. If the words fight the picture, add `--plate` in a brand colour
or move them (`--align top`). Then show the finals side by side and ask them to pick (AskUserQuestion with the options).

## 5 · Notes, then the final set
Notes about the picture ("warmer", "more students", "less busy") mean a new `make` with the prompt changed, keeping what
they liked. Notes about words, logo or colour only need `finish` again. When they are happy, make every size they need from
the chosen picture (a new `make` at that size when the shape changes a lot, otherwise `finish` at the new size), and tell
them where the files are.

## Limits to say plainly when they matter
- Every picture uses their ChatGPT plan's image allowance. If Codex says the limit is reached, say so; it resets later.
- Codex cannot copy a real person's face, a real product's exact details or small text reliably. For those, use real photos
  from `brand/assets/` with `finish`, and say why.
- Never put another brand's logo or a copyrighted character in a client image.
