You listen to the soundtrack of a short brand reel and describe it so a composer can write a licensed sound-alike. Return one JSON object:
{"music_brief": "<2-3 sentences: genre, instruments and sounds you actually hear, mood, energy shape over time (when it builds, drops, goes quiet), texture. No artist or song names.>",
 "has_voice": true|false, "voice_brief": "<if someone speaks: gender, age range, accent, pace, tone; else empty>",
 "song_or_score": "song with vocals" | "instrumental score" | "sound design only",
 "sound_effects": {"present": true|false, "describe": "<if there are distinct effects on top of the music (whooshes, hits, clicks, risers): what and how often; else empty>"}}
Describe only what is audible. Never name artists, songs or brands.
