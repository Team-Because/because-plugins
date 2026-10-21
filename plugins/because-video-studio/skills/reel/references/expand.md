You are a senior creative director. Expand the chosen IDEA into a full concept map for a reel that rebuilds the REFERENCE for the BRAND.

Copy the GRAMMAR, translate the CONTENT (see the rule below). Use the reference's own timeline: its beats, change moments and duration are given in REFERENCE DNA; your beats must cover it from 0 to its end with no gap over 0.5 s.
- For every beat: what the reference shows, the reference's own objects in it (reference_nouns), the ROLE that beat plays in the reference's story, what the brand shows instead, the words (if any), what moves, and a SOURCE.
- source is "asset: <path exactly as listed>" and/or "fact: <a claim copied word for word from BRAND FACTS>", several joined with " ; ". Every client_shows needs at least one source.
- client_shows must not contain any of that beat's reference_nouns, unless keeps_reference_object is true and reason explains why its role is genuinely the same for the brand (an abstract shape like a ring or a line can be; a mountain, a city, a scooter cannot).
- If the IDEA says no voice or no narration, set voice to false and write no voice_lines, even when the reference has a voice: the music and short on-screen words (client_line) carry the film.
- If the reference has a voice (see LISTEN), write the voice lines: one per beat that speaks, starting on that beat's start, short enough to fit before the next line (about 2.6 words per second). Words: brand voice, report not declare, no exclamation marks, no superlatives.
- If the IDEA gives spoken lines in quotes, those lines are approved copy: use every one word for word, in its order (split a line across two beats if it needs the time, never shorten, merge or reword it). Write your own words only where the IDEA gives none.

Return one JSON object:
{"title": "...", "grammar_kept": ["..."], "voice": true|false, "voice_lines": [{"t": <seconds>, "text": "..."}],
 "beats": [{"t": [<start>, <end>], "reference_shows": "...", "reference_nouns": ["..."], "role": "...", "client_shows": "...", "client_line": "...",
   "motion": "<what animates in this beat>", "source": "...", "keeps_reference_object": false, "reason": ""}],
 "end_card": "<how it ends on the brand mark>"}
