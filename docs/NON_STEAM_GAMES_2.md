# Non-Steam detection and artwork — 2.0

Updated 2026-11-04.

## Installation discovery

`electron/nonSteamDiscovery.ts` reads Epic `.item` manifests and Riot product installation metadata. It checks that the launch executable exists, rejects incomplete Epic installations and paths escaping the installation directory, and ignores stale Riot metadata. A broken record does not hide the remaining games. Riot installations on other drives are supported.

Epic launch links retain namespace, catalog item and application identity. VALORANT and League of Legends start through the installed Riot Client with fixed product/live arguments. Riot Client remains responsible for authentication and anti-cheat startup. Riot game folders are not passed to the launcher's generic recycle-bin uninstaller.

## Running sessions

`electron/gameDetection.ts` parses the existing Windows `tasklist` snapshot, including LF/CRLF and duplicate executable names. Exact Fortnite and VALORANT shipping processes take precedence over bootstrap/launcher processes. Canonical publisher identities cannot be overwritten by incidental scanned executable names. Directory paths are registered by their executable basename.

Start transitions preserve the original session and timestamp. A startup wrapper has a bounded 90-second lifetime, with a 30-second missing-process handoff window. After gameplay has been observed, leftover launchers cannot keep that game active; the normal three successful missing snapshots (~9 seconds) end the session. Failed/malformed snapshots do not count as exits. Generic Riot Client and League lobby processes do not imply that a match is running.

The renderer reconciles the native state at startup and focus, including games started outside Eclipse. A late snapshot cannot overwrite a newer start/stop event. Discord retains the desired activity and reconnects through the existing monitor, without repeatedly writing unchanged payloads. Renderer idle/download updates cannot replace a game verified by the native monitor.

No additional background process poll, filesystem watcher, game injection, game-memory reader or driver was added.

## Images and identity

`src/services/nonSteamGames.ts` contains exact identities and official publisher assets for Fortnite, VALORANT and League of Legends. `nonSteamArtwork.ts` supplies the bundled images to library/storage posters, the sidebar and the game preview. They work offline and avoid sequential failing image requests. Discord uses the corresponding public HTTPS asset. Credits/source pages are in `src/assets/nonsteam/README.md`.

Known games exclusive to other launchers do not receive fabricated Steam IDs or name-search results. Startup repairs existing incorrect Steam associations without removing installation paths or playtime.

## Verification

- 313 project tests passed, including process transitions, launcher expiry, duplicate PIDs, malformed snapshots, custom-drive Riot installs, Epic validation, restricted Riot launch arguments, stale native responses and Discord reconnects.
- Isolated Electron test: Fortnite/VALORANT posters and heroes render with external networking blocked; no renderer errors or image HTTP requests.
- Local installation check found verified Rocket League (Epic), Fortnite (Epic) and VALORANT executables. Fortnite had been closed by the live-monitor check, so this does not claim a complete real-match validation.
- `npm run build:app` runs type checking and production bundling. No installer/release was published.

Evidence is written to `tests/non-steam-*.log` and `.cache/nonsteam/` (ignored local test artifacts).
