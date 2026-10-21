# Third-party material

Internal use by Team Because. Check this list before sharing the plugin outside the team.

## Bundled in the plugin
| What | Where | Licence |
|---|---|---|
| Editable-export builders (`manifest.py`, `build_package.py`, `make_ae_jsx.py`, `make_premiere_xml.py`) and their reference notes | `tools/export/`, `skills/export/references/` | From Yaksha's video-studio plugin (Team Because, 19-10-2026). Her notes list the origin as unconfirmed; confirm with her before any use outside the team |
| Footage tools (`probe.py`, `silence.py`, `transcribe.py`, `edl.py`, `final_check.py`) | `tools/edit/` | From Yaksha's video-studio plugin (Team Because, 19-10-2026) |
| YuNet face detector (vertical crops) | `tools/edit/models/` | Apache-2.0 (OpenCV Zoo) |
| Inter (caption burn-in) | `tools/edit/fonts/` | SIL Open Font License, `OFL-Inter.txt` |
| Lottie animations | `library/lottie/` | Lottie Simple License, `library/lottie/LICENSE-lottie.txt`. Organic posts only until the paid-ads licence is confirmed |
| Lucide icons | `library/icons/` | `library/icons/LICENSE-lucide.txt` |
| Fonts (Bebas Neue, Inter, Kalam, Manrope, Mukta, Playfair Display, Syne) | `library/fonts/*/` | SIL Open Font License, `OFL.txt` in each folder |
| JetBrains Mono | `templates/fonts/` | SIL Open Font License |

## Downloaded by setup, not bundled
| What | Licence | Source |
|---|---|---|
| Sidon v0.1 speech restoration (voice) | MIT (code and weights) | https://huggingface.co/sarulab-speech/sidon-v0.1 |
| BiRefNet speaker cut-out (vox, Windows), pinned revision | MIT | https://huggingface.co/ZhengPeng7/BiRefNet |
| MuseScore General soundfont (vox score) | MIT | https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/ |
| FluidSynth (vox score) | LGPL-2.1, run as a separate program | https://github.com/FluidSynth/fluidsynth |
| faster-whisper (captions, word timings) | MIT | https://pypi.org/project/faster-whisper/ |
| PySceneDetect (shot lists in probe.py) | BSD-3-Clause | https://www.scenedetect.com |
| Playwright Chromium (render engine) | Apache-2.0 | https://playwright.dev |
| HyperFrames, only when a person asks for it | Apache-2.0 | https://github.com/heygen-com/hyperframes |

## Left out on purpose
- Remotion: needs a paid company licence for a team this size.
- AudioSR weights: no licence; never used.
