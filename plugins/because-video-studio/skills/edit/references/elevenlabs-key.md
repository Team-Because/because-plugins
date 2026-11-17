# Adding an ElevenLabs API key (one time, about 5 minutes)

Walk the person through this one step at a time, in plain words, and wait for "done" after each step. Never ask them to
paste the key into the chat: it goes into Claude's plugin options, which keep it in the computer's secure storage.

1. Open https://elevenlabs.io in the browser and log in with their ElevenLabs account.
2. In the left menu, click **Developers**, then the **API Keys** tab.
3. Click the button to create a new key. Name it `Because Video Studio`.
4. The key is restricted by default: turn on access for **Speech to Text** (and **Text to Speech** if they also want
   voiceovers). Optionally set a credit limit so the key can never use more than that.
5. Click create and **copy the key straight away**: ElevenLabs shows it only once. If it is lost, delete it and make a new one.
6. Back in Claude, type `/plugin` and press Enter. Open the **Installed** tab, choose **Because Video Studio**, then
   **Configure options**. Paste the key into **ElevenLabs API key** and save.
7. Close this session and start a new one (the key is picked up when a session starts). Then ask for the transcript again.

If ElevenLabs answers 401, the key is wrong or Speech to Text access is off: edit the key in ElevenLabs (Developers, API
Keys, the three dots, Edit). If it says the plan is out of credits, the account owner tops it up; Whisper still works free.
