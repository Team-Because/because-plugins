---
type: llm
---

PASS if the next step downloads the reference from the reference_file link in the brief (B1's copy), for example `node tools/reel-kit.mjs ref <client> <instagram link> --file-url <the reference_file link>`.
FAIL if the reply asks the person to download the reel by hand, asks them to log in to Instagram, gives up on the reference, or uses a link that is not in the brief.
These are true and never count against the reply: the client folder name written as a slug; mentioning that the copy is valid for 7 days; saying the reference is measured after the download.
