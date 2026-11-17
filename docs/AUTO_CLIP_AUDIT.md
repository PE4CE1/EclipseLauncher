# Automatic clips: implementation and verification

Updated 2026-11-02. Location in Eclipse: **Clips → Settings → Automatic clips**.

## Findings corrected

- The process monitor passed general launcher settings into the detectors, although automatic-clip preferences are saved in `clip_settings.json`. The service now receives `loadClipSettings` and reloads rules when clip settings change.
- CS2 authentication previously changed when Eclipse restarted. A random 256-bit token now persists privately in user data. It is not returned by status IPC, logged, or sent over a remote connection.
- Config files are no longer installed at launcher startup while the feature is disabled. They are installed after opt-in for the running game or an explicit **Set up / check connection** action.
- Initial counters and historical events establish a baseline. Spectated players, other games, old packets and menu states do not count as personal highlights. Round/match wins require the reported winning side or an explicit win result; reaching the end of a match is insufficient.
- All automatic events share one cooldown. Disabling the feature or switching games closes transports, invalidates pending responses and cancels polling. Automatic events cannot restart a manually paused replay buffer.
- The previous Rocket League parser assumed that generic `Launch.log` messages represented the local player's goals/saves/wins. The available local log did not contain those expected event lines. It has now been replaced by the official Rocket League StatsAPI, found during the follow-up review. Epic introduced this API alongside EAC on April 28, 2026; this is not a BakkesMod or log-parser integration.

## Available game sections

| Game | Source | Events / limitations |
| --- | --- | --- |
| Counter-Strike 2 | Valve GSI, authenticated HTTP on `127.0.0.1:13371` | Local player's kills/multi-kills/aces and own round wins. First configuration requires a game restart. |
| Dota 2 | Valve GSI, authenticated HTTP on `127.0.0.1:13372` | Local player's kills, optional deaths, and explicitly reported own-team wins. Opt-in is off by default. Add `-gamestateintegration` manually in Steam launch options, then restart the game. |
| League of Legends | Riot Live Client Data API, HTTPS on `127.0.0.1:2999` | Own kills/multi-kills/pentakills, optional deaths, and wins only when `GameEnd.Result` explicitly reports `Win`. Local API is available during matches. Opt-in is off by default. End-result availability needs confirmation against live game versions. |
| Rocket League | Official StatsAPI, read-only WebSocket client on `127.0.0.1:49124` | Selected own-player goals, saves, optional demolitions and explicit own-team wins. Configure the game's built-in API, restart, then select your exact platform player ID during a match. No mods or EAC changes. Opt-in is off by default. |
| Overwatch 2 | Existing clip hotkey / voice command, game-specific clip duration | Overwolf documents live events, but Eclipse has no per-app GEP entitlement, production signing or configured runtime integration. Overwolf's approval claims cannot be extended to this standalone Electron build. No unverified automatic kill/win toggles, memory reader, OCR loop or unofficial event hook was added. |

All five sections are collapsible and keyboard accessible. Collapsed controls are inert and then unmounted. Connection badges distinguish disabled, waiting, listening, connected and setup errors; a connection badge does not claim successful recording or publisher approval.

## Technical scope and anti-cheat

The automatic-event implementation does **not** inject code, read game memory, hook graphics APIs, install a driver, change game binaries, use `-insecure`, or disable anti-cheat. Valve games send selected GSI fields to an authenticated loopback listener. League reads three local, documented data endpoints, with no API key or remote account calls.

Rocket League connects only to its built-in StatsAPI's default WebPort and sends no application commands. Connections stop when the feature is disabled or the game exits. Connection retries back off to 30 seconds; JSON packets and player lists are bounded. The UI exposes match player names and platform IDs only to the trusted launcher renderer for explicit self-selection. The camera target is never used as a player identity. Initial/reconnected counters are baselined, replay playback is suppressed, and wins require an explicit team result. The game must be configured manually while closed, under `<Install Dir>/TAGame/Config/TAStatsAPI.ini` (or `DefaultStatsAPI.ini` when absent), in `[TAGame.MatchStatsExporter_TA]`: `PacketSendRate=2`, `Port=0`, `WebPort=49124`. Preserve unrelated entries. If another app uses a custom StatsAPI configuration, coordinate its ports rather than overwriting it blindly. No actual installed Rocket League configuration was edited during this work.

Rocket League and Overwatch can override global clip duration. The effective value controls replay retention, application-audio history and final export duration; changing the current game's value restarts the active buffer, and a detected game switch applies that game's profile. Resolution, FPS and audio controls remain in the existing recording settings.

Each GSI listener rejects browser-origin requests, wrong tokens and oversized bodies. Config setup changes only Eclipse's dedicated `gamestate_integration_eclipse.cfg`, preserves foreign configuration, checks resolved paths and writes atomically. Other config files and Steam launch options are untouched. The token is reused across launcher restarts so existing game sessions retain a valid credential.

The League HTTPS client uses Riot's published certificate, fixed loopback destinations, limited response sizes, timeouts and a bounded keep-alive pool. It does not disable TLS validation globally or set `rejectUnauthorized: false`. Hostname verification is scoped to this client because Riot's legacy certificate has no IP SAN; the chain remains validated against the explicit Riot trust anchor. Certificate failures are exposed in the UI.

These choices reduce interaction with protected game internals. They **do not establish zero ban risk, anti-cheat certification, or publisher approval of Eclipse**. The scope above concerns automatic-event detection; it is not a certification of every launcher plugin or unrelated overlay feature.

Riot requires products serving players to be registered, including products using documented APIs. **Register/update Eclipse in Riot's developer portal before publicly distributing the League integration.** No registration, publication or deployment was performed as part of this local implementation.

## Sources checked

- [Riot League documentation, Live Client Data API and registration policy](https://developer.riotgames.com/docs/lol)
- [Riot's published local certificate](https://static.developer.riotgames.com/docs/lol/riotgames.pem)
- [Riot's sample live event schema](https://static.developer.riotgames.com/docs/lol/liveclientdata_events.json)
- [Dota2GSI implementation and game-state structure](https://github.com/antonpup/Dota2GSI)
- [Overwolf's Dota launch-option instructions](https://support.overwolf.com/support/solutions/articles/9000212745-how-to-enable-game-state-integration-for-dota-2)
- [Blizzard's third-party software statement](https://us.forums.blizzard.com/en/overwatch/t/unauthorized-third-party-software/213220/1)
- [Rocket League's official StatsAPI specification](https://www.rocketleague.com/developer/stats-api)
- [Epic's EAC and StatsAPI introduction](https://www.rocketleague.com/news/easy-anti-cheat-comes-to-rocket-league-on-pc-today)
- [Overwolf's Overwatch event reference](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/overwatch/)
- [Overwolf framework requirements and per-app game-event enablement](https://dev.overwolf.com/ow-electron/getting-started/onboarding-resources/frameworks-overview/)
- [Overwolf production signing requirements](https://dev.overwolf.com/ow-electron/guides/dev-tools/app-signing/)

## Validation and limits

Automated fixtures exercise event baselines, own/enemy identity, spectator states, wins/losses, delayed winner fields, repeated events, counter resets, stale events, opt-in, hot settings changes without resetting the connection, token persistence, transport teardown, async cancellation, authentication/body limits, scoped TLS, timeouts, config isolation and preservation. Clip IPC tests check persistence and validation. Native Electron UI tests exercise the five accordions, opt-in switches, setup actions, hotkey navigation, German/English labels and narrow layouts.

Final checks passed:

- Original 45 targeted Node tests: `tests/autoclip-audit-unit.log`. Rocket League follow-up tests and current counts are in `tests/rocket-league-stats-unit.log`; they include real WebSocket transport fixtures, counter/replay/player/winner cases and profile validation.
- TypeScript and production app build: `tests/autoclip-audit-build.log`.
- Native Electron gallery/settings test: `tests/autoclip-audit-electron.log`, detailed results in `.cache/clip-gallery/verification.json`.
- Native event-to-recording test: `tests/autoclip-audit-recording.log`, detailed results in `.cache/clip-studio/autoclip-verification.json`. An authenticated synthetic CS2 kill passed through HTTP, detection, preload IPC, the renderer replay engine and the real encoder, producing a measured 1280×720 H.264 clip with separate game/mic audio files. Spectated/initial data did not save clips; the cooldown prevented a duplicate; the editor stayed closed; an event after stopping capture did not restart recording. Only generated canvas frames and test tones were recorded.
- Rocket League follow-up: 54 Node tests passed in `tests/rocket-league-stats-unit.log`; the production build passed in `tests/rocket-league-stats-build.log`; the updated five-game UI passed in `tests/rocket-league-stats-electron.log`. The native recording check in `tests/rocket-league-recording.log` / `.cache/clip-studio/rocket-league-verification.json` produced a real 5.000-second 1280×720 H.264 Rocket League goal clip and a real 5.000-second Overwatch manual clip while the global duration was 15 seconds. Both included separate game and mic audio. The Rocket League input here was a StatsAPI message fixture; the WebSocket transport was independently exercised against a local fixture server, not an actual Rocket League match.

Config installation tests use disposable Steam-directory fixtures, not actual installed games. Connection badges in the UI test use explicit IPC fixtures. No live online match, VAC/Vanguard/Blizzard enforcement behavior, publisher certification, or real League TLS handshake was tested. A successful automated test therefore verifies the implementation against its inputs, not compatibility with every current game build.
