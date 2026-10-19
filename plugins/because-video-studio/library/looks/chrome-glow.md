# Look · Chrome objects with one brand-colour glow

Proven on: abstract feature objects (switch column, dial, plug + socket), 12-10-2026 harvest. Reference grammar: premium 3D
asset carousels (polished chrome, satin brushed aluminium, one warm glow bleeding from inside, macro, grey gradient).

## Pipeline (route C)
1. Stills: fal-ai/nano-banana-pro/edit, 2K, 9:16, style refs as images 2-3. One still per object.
2. Light states: make the "off" plate first, then EDIT it to add the glow ("light up..., change nothing else").
   Off and on plates align to 0 px, so code can switch the light per beat with a feathered mask.
3. Motion: Kling v3 Pro only where an object must physically move (push-in; plug into socket with first + last frame).
4. Code: glow per beat, ring segments, captions in the top band, bloom into the lockup, sound.

## Prompt core
"Images 2 and 3 are the style reference only: premium 3D product renders of polished chrome and brushed aluminium
objects, soft studio light, very shallow depth of field, a warm glow bleeding from inside the objects. Make <object>...
Replace the reference's colour with <brand glow colour>. Soft grey-to-white studio gradient with a dark falloff at the
top edge. Photoreal, high-end product render. No text, no letters, no logos."

## Cost
About 10 stills x $0.15 + 2 clips x $0.70 = $2.90 for a 10 s film.

## Known failures
- The model adds or removes light in an edit but will NOT move parts (asked twice to move knobs: unchanged).
  Design the motion so nothing has to move between plates.
- First/last-frame clips can break near the end (pins passed through the socket after 3.3 s): use the clean part, cut on
  the impact under a click and a short flash.
- Never use the reference's colour: the glow is the brand's.
