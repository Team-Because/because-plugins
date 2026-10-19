# Future plans

Ideas parked for later. Nothing here is built. Read this file before adding a feature, so a parked idea is picked up
instead of reinvented. Each idea: what it is, the first cheap test, limits, and who must agree.

## Usage: how many team members use the plugin (parked 19-10-2026, Aman)
- **What:** a count of people using the plugin, by day, version and Mac/Windows.
- **First cheap test:** an Owner opens Claude admin analytics, Claude Code, "Users with skills" and "Top skills", and checks
  whether because-video-studio skills show by name. If they do, nothing needs building.
- **If not:** a once-a-day check-in from the session-start hook to a sheet (about an hour), or OpenTelemetry export with
  `OTEL_LOG_TOOL_DETAILS=1` to a monitoring account. The Analytics API plugins endpoint is Enterprise-only.
- **Limits:** Claude Code reports nothing back to a plugin's author by itself; the team must be told about any check-in.
- **Who agrees:** Aman, then the Claude Team Owner.
- **Source:** https://code.claude.com/docs/en/plugins/measure

## Feedback: a report command (parked 19-10-2026, Aman)
- **What:** `/because-video-studio:report` writes a short report from the session where something went wrong (what was
  asked, what failed, plugin version, OS, setup check), with keys and file contents removed, for the person to paste into
  WhatsApp, Slack, email or a GitHub issue. Modelled on Superpowers' diagnosing skill.
- **First cheap test:** see whether the team's own reports are clear enough without it.
- **Limits:** nothing is sent automatically; GitHub issues need repo access most of the team does not have.
- **Who agrees:** Aman.
- **Source:** https://github.com/obra/superpowers/issues (Session Diagnosis Report template)
