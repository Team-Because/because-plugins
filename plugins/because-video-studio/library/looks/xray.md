# Look · X-ray / CT scan of a real product

Proven on: a two-wheeler side view (12-10-2026 harvest; first used 07-10-2026). Client-neutral: works for any product with a strong silhouette.

## Pipeline (route C)
1. Still: fal-ai/nano-banana-pro/edit, 2K, **3:2 or the product's own orientation** (9:16 rotated the product 90° on the first try).
   Inputs: the real product photo on white + 1-2 x-ray reference frames. Then compose 9:16 in code.
2. Motion: fal-ai/kling-video/v3/pro/image-to-video, 5 s, audio off, first + last frame (an "assembly": parts only -> full product).
3. Code layer: labels on chips, scan sweep, alarm hit, captions, sound; every timed event in code.

## Prompt core
"Image 1 is <product>, <orientation>. Images 2 and 3 are the style reference: an x-ray / CT scan render on a near-white
background. Re-render the product from image 1 as that same kind of x-ray scan. Keep it UPRIGHT and in the EXACT same
orientation, position, scale, silhouette and proportions as image 1. Translucent pale grey shell, layered internal
structure. Greyscale only, near-white background #fafafa, darkest tone a medium grey, soft edges, very fine detail,
high-key. No text, no labels, no logos, no colour, no shadow, no floor."

## Cost
About $0.30 stills + $1.40 two clips = $1.70 for a 10 s film.

## Known failures
- Internals are illustrative, not the client's real engineering: labels may name only parts the client's site lists.
- Kling push-in drifts darker after about 3 s: use the first 1.5-2.5 s.
- Silhouette must be checked side by side against the real product photo.
