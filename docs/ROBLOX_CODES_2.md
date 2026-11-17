# Roblox preview and fullscreen media — 2.0

Updated 2026-11-04.

## Codes and game discovery

- `electron/robloxCodesService.ts`: public Roblox search, canonical universe/place resolution, source directory discovery, shared in-flight requests, at most four network requests at once, bounded responses/timeouts/redirects, persisted cache and stale results during refresh.
- `electron/robloxCodesParser.ts`: parses actual code tables/lists and developer descriptions. Explicit expiry overrides examples repeated elsewhere. Tutorial text, scripts, unrelated game rows and uncertain source entries do not become active codes. Source article titles must match the canonical game name. Case variants are grouped without discarding their original spelling.
- `src/services/robloxGames.ts`: exact identity comparison. Digits are preserved, so sequels are distinct; Rivals is not confused with Blue Lock Rivals.
- `src/components/roblox/RobloxCodesHub.tsx`: search suggestions with pictures and keyboard selection, game links/place IDs, live-game following that respects manual selection, source links, copy/copy all, alternate spellings, per-game used markers, expired codes, optional new-code notifications and English/German interface text.
- `src/components/roblox/RobloxPopularGames.tsx`: simpler experience cards, shared image/data requests and genuine live player numbers when available. No fabricated code counts, ratings or player-count fallbacks.

The previous hardcoded example codes and the “Verified Database” claim have been removed. Codes are attributed to the developer or community source that lists them. Only the game itself can confirm redemption/expiry; private Discord announcements and games without a public codes source cannot be exhaustively covered.

Clipboard follow-up: code copying now uses the sender-checked native `clipboard:write-text` IPC in `electron/clipboardService.ts`, with input bounds, awaited writes and brief retries for Windows clipboard locks. Browser clipboard permissions remain restricted. Browser previews/older preloads have a selection-copy fallback. Individual codes, alternate spellings and Copy all share `src/services/clipboard.ts`.

Code cards are more compact. Active and expired lists initially render eight cards and expand by eight with **Load more** (**Mehr anzeigen** in German). Selecting another game resets both lists. Copy all still includes all codes in the current filter, including entries not yet expanded. The follow-up passed 40 targeted regression tests, the extended Electron UI test with browser clipboard denied, and the production build/type check.

Sources currently used:

- Roblox public game metadata and search: `games.roblox.com`, `apis.roblox.com`, `thumbnails.roblox.com`.
- [Pocket Tactics Roblox codes directory](https://www.pockettactics.com/roblox/game-codes).
- [Roblox Den game codes](https://robloxden.com/game-codes).
- Relevant code articles on [Beebom](https://beebom.com/).

The live directory check found 1,509 linked game-code articles. The isolated real Electron main-process check retrieved 24 source-attributed Blox Fruits codes in 514 ms and read the warm result in under 1 ms. These are measurements from this machine/network, not guaranteed load times or a guarantee that every Roblox experience publishes discoverable codes.

## Fullscreen images

`DecodedMediaImage.tsx` holds the previous decoded image until its replacement is ready. Screenshot thumbnails use the actual smaller thumbnail URL. The fullscreen overlay uses an opaque surface instead of blurring/recompositing the entire launcher behind it. Its global open state no longer briefly resets during effect cleanup, and the covered TopBar remains visually stable.

The existing video pause/fullscreen behavior and single-audio-player handling are preserved.

## Validation

- 324 project tests passed, including 11 new parser/service tests: source matching, expiry, name/ID precedence, case variants, request sharing, offline behavior, concurrency and persisted cache after restart.
- Isolated Roblox Electron UI test passed: keyboard search for a non-seeded game, copying, copy all, used markers, late-response protection, live/manual selection and language changes.
- Extended media Electron test passed: stable header/open state, decoded-image retention during a delayed replacement, video pause/fullscreen and no overlapping audio.
- Real Electron main-process network check passed with public data only; no Roblox login, game injection, memory access or game launch was involved.
- Type check and production build: `npm run build:app`. No installer/release was published.

Logs: `tests/roblox-*.log`. Local test snapshots/reports: `.cache/roblox/` and `.cache/game-media/`.
