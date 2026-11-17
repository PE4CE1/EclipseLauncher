# Settings follow-up: layout and capture stability

6 November 2026.

## Visual changes

- Download sources have a dedicated toolbar, compact rows, formatted counts and quieter status indicators. Source URLs remain selectable; sync/remove actions have accessible labels. A source already syncing cannot be started twice from its button.
- Storage has a clear summary, selectable drive cards and a bar separating space used by games from other occupied space. Low free space is highlighted. Game rows, sizes and search controls use a more restrained hierarchy. Refresh results replace empty datasets correctly, and stale requests cannot overwrite newer results.
- Embedded clip settings have no outer border/background panel. Their left navigation and page heading remain fixed; only the right content pane scrolls. Duration choices align in a four-column grid. Responsive layouts and focus states are retained. The Electron scroll check verifies that scrolling the right pane changes neither the navigation nor heading position, and that the outer page remains at scroll offset zero.

## Unnecessary work removed

Changing replay duration previously forced a desktop-capture restart after 350 ms. It now updates video retention and the native application-audio history while keeping the live tracks and recorder. Already-discarded footage cannot be recovered; longer history fills as recording continues. Existing memory bounds remain in force.

Clip settings previously unregistered/registered the global replay hotkey after every save. Registration now runs only for enabled/hotkey changes and is itself idempotent. Auto-clip transports are refreshed only for their relevant settings. Unchanged values do not trigger persistence; saves send changed fields instead of the whole settings object.

Desktop/microphone gain, microphone threshold and mono mode update the existing Web Audio nodes. Gain transitions are smoothed. Sliders update their displayed value immediately, coalesce saves, and commit on release, key-up, blur or unmount. Capture properties such as resolution, FPS, source and bitrate still use the existing debounced restart so they actually take effect.

Settings components subscribe to the specific store fields they render. Trimming a resized audio timeline discards old chunks in one pass; queued clip snapshots keep their independent history.

## Verification

- `npm run check`: TypeScript, **435/435 tests passed**, production build succeeded. `.cache/settings-performance-check.log`.
- Targeted recorder/native tests verify no screen reacquisition or recorder replacement after duration/gain/filter changes, preserved hotkey registration, resized audio history and unaffected queued snapshots. The added FPS assertion verifies a necessary capture change still restarts. `.cache/settings-clip-live-tests.log`.
- The real-component Electron settings fixture uses a synthetic canvas/audio source, not the user's screen or microphone. Five duration changes retain **one capture session and two live tracks**. An 80-event slider burst persists one final value and does not reacquire capture. Tracks are released on stop. All eleven tabs render, with checks at 1360, 1000, 800 and 620 px. No renderer errors. `.cache/settings-ui/verification.json`.
- Populated screenshots were visually inspected: `.cache/settings-ui/sources-en.png`, `storage-en.png`, `clips-en.png`.

These checks establish the removal of unnecessary capture/hotkey work; they do not measure the user's physical mouse refresh rate or every GPU/driver combination.

## Files

- `src/components/settings/SettingsView.tsx`, `settings-surfaces.css`
- `src/components/storage/StorageManagerView.tsx`, `storage-manager.css`
- `src/components/clips/ClipSettingsPanel.tsx`, `ClipSettingsControls.tsx`
- `src/services/clipEngine.ts`, `src/store/clipStore.ts`
- `electron/clipService.ts`, `processAudioCapture.ts`, `preload.ts`, `src/types/game.ts`
- `tests/services-clips.test.cjs`, `settings-fixture.*`, `settings-ui-smoke.cjs`, `clip-capture-fixture.ts`
