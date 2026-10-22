# Voiceover through the ElevenLabs connector

The team adds ElevenLabs as a Claude connector (Settings, Connectors, ElevenLabs, Connect, sign in). Nobody needs an API key.
The connector's text-to-speech tool returns a short-lived download link per take, so download each one straight away.

1. Write `docs/script.json`: `{"voice": "<name>", "end": <s>, "lines": [{"t": <start s from T>, "text": "..."}]}`.
   About 2.6 words a second, one sentence or half-sentence per line, brand voice, no exclamation marks.
2. Name the cost before making anything: the characters in all lines come out of the person's ElevenLabs plan. Wait for a yes.
3. Pick one voice that fits the brand and language (ask the connector for its voices if needed) and use it for every line.
   Model: eleven_multilingual_v2 when the connector offers a choice (Hindi and Gujarati included).
4. For each line, in order: call the connector's text-to-speech tool with that line's text, then download the link at once to
   `<video>/vo-cache/line-01.mp3`, `line-02.mp3` ... (Mac and Windows both have `curl`: `curl -sL "<link>" -o "<file>"`;
   on Windows call it `curl.exe`). A link that has expired: make that line again.
5. Run `<python> tools/voice.py <video>`. It places each take on its start time, never stretches speech, and writes `vo.wav`
   and `vo.json` (word times for captions, from Whisper matched to the script). If it lists missing lines, make those.
6. Listen-check by measurement: `<python> tools/audio-check.py` on the shipped file, and say plainly the voice was judged by
   measurement, not by ear.

Changing one line later: delete that line's file in `vo-cache/`, make it again, re-run `voice.py`.
No ElevenLabs tools in the session: the film carries its words on screen; never ask for a key and never fake a voice.
