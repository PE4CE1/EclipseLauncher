# Rocket League session overlay

Updated 2026-11-02. The user selected official game data only.

## Data source and limits

- Uses the documented local Rocket League StatsAPI at `ws://127.0.0.1:49124`. The client sends no application commands and does not inject into the game, read game memory, install mods or change anti-cheat settings.
- The published schema contains player/team identifiers, playlist IDs and match results, but no MMR or rank points. The HUD displays an unavailable MMR field. Tracker scraping, the unsupported Tracker API-key path and stale BakkesMod RocketStats files are no longer data sources. Existing saved API-key preferences are left untouched and are not used by this service.
- Sources: [Rocket League StatsAPI](https://www.rocketleague.com/developer/stats-api) and [Tracker Network's February 2026 statement about Rocket League API access](https://feedback.tracker.gg/t/regarding-on-development-api/65636).

## Setup

1. Enable **Settings → Gameplay Overlay → Rocket League → Ranked session · W/L & streak**.
2. Start an online match. The own Epic account is resolved from the game's own launch parameters. If automatic identification is unavailable, select your own name in the player list; identification uses the exact platform ID, never the camera target or another player's display name.
3. Choose the displayed ranked playlist: 1v1, 2v2 or 3v3. Each playlist retains separate counters. Changing the player resets that player's session; changing the displayed playlist does not create a match result.
4. If data is missing, the settings panel has the official setup instructions. Before launching the game, enable `PacketSendRate` and `WebPort` in the game's documented StatsAPI configuration. Existing higher packet rates should be preserved. No real user game/configuration files were modified during implementation.

## Counting rules

- Observe the selected player on a valid team in an unfinished ranked match before accepting its result.
- Count `MatchEnded.WinnerTeamNum`, or the explicit winner from the corresponding final `UpdateState`. Match GUIDs deduplicate both paths, repeated packets and reconnects.
- Replays, spectators, unsupported playlists, ambiguous winners and games first observed after completion do not create a result. Matches left before their result is received cannot be counted. This is a session of observed match outcomes, not a reconstructed account history.
- Winning streaks are positive, losing streaks negative; the HUD displays `2 W` or `2 L`. Best winning streak is tracked separately. Reset clears the counters while retaining completed-match deduplication.
- Sessions last for the current Eclipse process and survive HUD toggles/recreation. Counters are not imported from old mod files or inferred from MMR changes.

## Lifecycle and implementation

- `electron/rlSession.ts`: bounded match state and per-playlist session counters.
- `electron/rlService.ts`: identity, service lifecycle, state snapshots and deduplicated publication.
- `electron/rocketLeagueClient.ts`: one shared local connection for both clips and the session HUD, released after the last consumer exits.
- `electron/processMonitor.ts`: starts/stops the service during game detection and immediate live-setting changes. Turning the HUD on after Rocket League has already started now works.
- `electron/preload.ts` and `OverlayApp.tsx`: replay current state after widget/window creation so initial events are not lost.
- `RocketLeagueStatsPanel.tsx` / `RocketLeagueHUD.tsx`: player selection, playlist selection, reset, status and compact session display.

## Verification

- `tests/rl-session-unit.log`: 86 passing related tests, including real local WebSocket transport, session deduplication, positive/negative streaks, account and playlist changes, replay/invalid data, mid-game service toggles and preserving the clip connection.
- `tests/rl-session-build.log`: TypeScript and production build.
- `tests/rl-session-native.log`: isolated Electron HUD driven by documented-format packets from a local fixture server, with production IPC security. Covers initial snapshots, duplicate results, two wins/two losses and a two-loss streak, playlist isolation, HUD recreation, reset, absent MMR and one shared clip connection with zero commands sent.
- `tests/rl-session-settings.log`: native mouse/selection checks for player selection, playlist changes, reset and responsive settings.
- `tests/rl-session-app-smoke.log`: full native launcher navigation, FPS/widget/position-editor checks, controller rendering and cleanup passed with no renderer errors.
- Reports/screenshots: `.cache/rl-session/verification.json`, `.cache/rl-session/ranked-session.png`, `.cache/overlay-settings/verification.json`, `.cache/overlay-settings/rocket-league-settings.png`.

Actual live ranked matches were not played during validation. No installer was published.
