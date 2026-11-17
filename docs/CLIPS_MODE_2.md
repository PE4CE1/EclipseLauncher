# Eclipse Clips mode

The profile dropdown and General settings offer a mode switch. Switching restarts Eclipse so the running process has one consistent service set. Existing replay history is cleared on restart; saved clips, account data, library data and launcher preferences are retained. Active manual recordings, an open editor and pending clip saves must be finished first. The native operation barrier additionally prevents switching during clip writes, exports, optimization or settings writes. Active launcher downloads also block a switch.

The native process reads `appMode` at startup and passes a fixed renderer argument. The renderer does not derive its running mode from a mutable preference. `src/main.tsx` selects `ClipsApp` without importing the full `App` entry. The clips entry skips the shop/library preparation splash, catalog, downloads, themes, extra HUDs and their navigation. General settings remain translated in English and German.

Retained features:

- Replay and manual recording, clip library/editor, microphone/audio/video/shortcut/storage settings and automatic clip events.
- Existing native game detection, including custom executable registrations extracted once from the saved library.
- Friends, friend requests, profiles, account recovery and social presence.
- Discord Rich Presence; idle presence identifies Clips Studio and actual games retain their existing game presence.
- Clip notifications, app updates, tray/window behavior and memory controls.

HTTP/torrent download services, launcher plugins, storage scanner, Free Games radar, controller/battery services, media hotkeys and streaming manager are not initialized in Clips mode. Process-monitor settings mask extra overlays and download presence without overwriting saved launcher preferences. Voice capture remains available when explicitly enabled as a clip shortcut.

The clip notification uses a dedicated `ClipsToastApp` renderer, without loading the general HUD/controller/metrics components. Its native window retains click-through behavior, readiness acknowledgement and automatic dismissal.

The clips-only game store hydrates settings rather than game arrays. Writes merge its settings back into the existing persisted state, preserving games, favorites and recent history on disk. An open standalone friends window cannot overwrite the main renderer's state.

## Validation

- `npm run check`: type checking, full regression suite and production build.
- `tests/app-mode.test.cjs`: effective settings, persistence preservation and the restart/write barrier.
- `ECLIPSE_SMOKE_CLIPS_MODE=1 node tests/run-electron-smoke.cjs`: clips navigation, game events, capture/settings, friend-window trigger, notification test and mode-switch UI. The switch handler is mocked here; this does not restart the user's launcher.
- `ECLIPSE_CLIPS_TOAST=1 node tests/run-electron-smoke.cjs`: real isolated native toast window, automatic dismissal, no full HUD bundle and no metrics/controller/input services.
- `node tests/run-electron-smoke.cjs`: normal launcher and standalone window regression.

These checks do not establish a fixed RAM saving or a live-game recording benchmark. Recording cost still depends on capture settings and the encoder. Previously generated installers are not changed by a source build.
