#!/usr/bin/env python3
# .venv/bin/python tools/reel/board-frames.py <jobs.json>
# Storyboard frames for reel.mjs board: each job is {out, w, h, asset|null, line_art, words, font}. A photo is cover-cropped to
# the reference's aspect; line art is drawn white on black with a soft glow; no asset = type on black. Words sit in the lower
# third in the brand font. These are stills of real assets, not sketches: the board shows what the film would show.
import sys, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

for j in json.load(open(sys.argv[1])):
    W, H = j['w'], j['h']
    canvas = Image.new('RGB', (W, H), (0, 0, 0))
    if j.get('asset'):
        im = Image.open(j['asset'])
        if j.get('line_art'):
            im = im.convert('RGBA'); im.thumbnail((int(W * 0.86), int(H * 0.5)))
            glow = Image.new('RGBA', im.size, (0, 0, 0, 0)); glow.paste(im, (0, 0), im)
            glow = glow.filter(ImageFilter.GaussianBlur(3))
            x, y = (W - im.width) // 2, int(H * 0.42 - im.height / 2)
            canvas.paste(glow, (x, y), glow); canvas.paste(im, (x, y), im)
        else:
            im = im.convert('RGB'); s = max(W / im.width, H / im.height)
            im = im.resize((int(im.width * s + 1), int(im.height * s + 1)))
            canvas.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    if j.get('words'):
        d = ImageDraw.Draw(canvas)
        size = max(12, int(W * 0.065))
        try: f = ImageFont.truetype(j['font'], size)
        except Exception: f = ImageFont.load_default()
        words, lines, cur = j['words'].split(), [], ''
        for w in words:
            t = (cur + ' ' + w).strip()
            if d.textlength(t, font=f) > W * 0.84 and cur: lines.append(cur); cur = w
            else: cur = t
        lines.append(cur)
        y = int(H * 0.78) - len(lines) * size // 2
        for ln in lines:
            tw = d.textlength(ln, font=f)
            d.text(((W - tw) / 2 + 1, y + 1), ln, font=f, fill=(0, 0, 0))
            d.text(((W - tw) / 2, y), ln, font=f, fill=(255, 255, 255))
            y += int(size * 1.25)
    canvas.save(j['out'], quality=82)
