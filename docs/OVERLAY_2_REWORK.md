# Eclipse 2.0: overlay lifecycle and settings

Updated 2026-11-02.

## Changes

- Package/application SemVer is `2.0.0`. The compact display label is `2.0`. Frontend version constants now read the package metadata; the package-lock root version agrees. Sidebar, network inspector, update comparisons and current local changelog use the new version. Dependency versions and historical installer/benchmark reports are preserved.
- Gameplay Overlay settings have a separate Always / Only in game control, a direct layout-edit action, quieter widget rows, a count labelled **enabled** rather than claiming every configured widget is currently visible, and properly aligned switches. Narrow layouts wrap the controls.
- `electron/overlayState.ts` builds the same effective overlay payload for process polling, settings changes and desktop startup. It includes `overlayGeneralAlwaysOn` and `overlayControllerStreamOnly`; the old live-settings payload omitted both. Game-specific settings are gated to their game.
- The native overlay has one reconciliation path for permanent widgets, edit mode and clip toasts. It waits for the overlay renderer's `get-current-state` request after listeners have been subscribed, instead of treating BrowserWindow readiness as React readiness. The settings page's status request cannot acknowledge the overlay renderer.
- Bootstrap settings/state responses cannot overwrite newer IPC updates. Toast IDs are preserved across initial state and subsequent notification events.
- Disabling hides the window and stops metrics/input work immediately. A hidden renderer is retained for at most 500 ms to absorb rapid off/on changes, then destroyed if still idle. Re-enabling during that interval cancels teardown and reuses it. Stream Studio retains its own gamepad subscription; hidden desktop widgets do not keep a second subscription.
- Removing permanent widgets while a clip toast is shown clears their renderer state without cancelling the toast. Leaving edit mode returns to the effective runtime policy, including closing a preview-only window. Saving positions updates atomic on-disk settings and the in-memory settings source together.

## Validation

- 48 passing frontend/update, process-monitor and overlay unit tests: `tests/overlay-2-unit.log`.
- TypeScript and production build: `tests/overlay-2-build.log`.
- Isolated native lifecycle/UI test: `tests/overlay-2-electron.log`; machine-readable report in `.cache/overlay-settings/verification.json`.
- Existing native app/widget regression check also passed: `tests/overlay-2-widgets-electron.log`. This covers the FPS/permission display, rejecting old game FPS, final drag coordinates, controller rendering and normal app navigation, with no renderer errors.
- Native scenarios: Always + performance on desktop, immediate disabling, rapid renderer reuse, game-only hiding, detected-game transitions, stopping metrics, toast isolation, edit exit, switch geometry and narrow viewports. The harness uses real transparent Electron windows and production overlay rendering with simulated metric/input providers; it does not measure real game FPS, record real inputs or change actual user settings.
- UI screenshots: `.cache/overlay-settings/settings-off.png`, `settings-performance.png`, `settings-400.png`.

No installer was built or published. Restart Eclipse fully to load the updated main/preload code.

## Widget visibility and design follow-up

- Reproduced a second visibility bug with production IPC security and a real controller iframe: Electron's `did-start-loading` also fires for child frames. Loading a controller therefore hid the complete native HUD and reset its React handshake indefinitely. Invalidation now uses `did-start-navigation` and only resets readiness when the main document is replaced. Controller skins and same-document navigation leave the HUD visible; real main-document reloads still require fresh listeners.
- Hardware publishing checks main-frame loading, so loading a child frame does not interrupt metrics.
- Performance uses a compact matte panel, a prominent FPS value, restrained orange accents, stable numeric columns, and vertical/horizontal layouts. Percentage scale now matches the selected size instead of applying an extra 15% multiplier. Missing measurements and FPS permission status remain explicit; the renderer does not estimate game FPS.
- CPS, session time, Rocket League and media surfaces use the same panel styling. Permanent widgets have no entry animation. The existing clip notification retains its own requested animation; it is no longer accidentally accelerated by a global performance-mode class.
- Measured widget sizes constrain placement at the right/bottom edges, including restored positions and scaled widgets. The layout editor starts dragging from the actual displayed position. ResizeObserver runs on size changes rather than a full-window frame loop.
- Overlay widgets receive language directly, removing the launcher's game-store hydration, library normalization and settings migration from HUD startup. Clip notifications skip reading the complete local library when their preferences are already provided.
- Controller messages are deduplicated, the latest state is replayed after skin loading, and disconnects release pressed buttons. Disconnected controllers use a 500 ms fallback check rather than an animation-frame loop. Media no longer uses Framer Motion or a React interval for its optional playback indicator; it has plain controls and only a short width transition when explicitly expanded/collapsed.
- A standalone Rocket League Steam-avatar widget now acquires its own keyboard/controller input services. Its held-key state combines both sources, so releasing one source cannot hide an avatar while the other binding is still held. Native controller events are preferred over a renderer frame loop; stale avatar fetches are discarded after profile changes.

Validation: `tests/overlay-runtime-unit.log` (60 tests), `tests/overlay-runtime-build.log`, and `tests/overlay-runtime-after.log`. The isolated native report is `.cache/overlay-runtime/verification.json`; visual checks are saved beside it. The native test keeps the production trusted-window IPC boundary and bundled asset protocol, with simulated hardware/input/media providers. It verifies the original failure, skin changes, retained/released controller state, no entry animations, no library hydration or settings writes, FPS/permission display, actual scale/layout, edge placement, main-document reload, media commands and a standalone Rocket League avatar with combined keyboard/controller bindings. It does not benchmark real game performance or measure real game FPS. Existing full-app/widget and settings/editor checks passed in `tests/overlay-runtime-app-smoke.log` and `tests/overlay-runtime-settings-smoke.log`.

## Midnight Black, native window animations and switch flicker

- Fixed the skin root selector (`.controller.ps5-black`); the HTML never had the extra `ds4` class required by the old selector, leaving the body without its background or dimensions.
- Bundled the seven unchanged sprite images already referenced by this skin. All seven now load through the local asset protocol with remote networking blocked. The assembled controller is revealed after its stylesheet and sprites load, avoiding a partial button-only frame.
- Set `thickFrame: false` on the native overlay window. Electron documents that this removes Windows window animations from frameless windows; disabling CSS animations alone did not disable that native effect. Performance also explicitly suppresses inherited CSS animations/transitions.
- Unified switch appearance under its `aria-checked` state, keeping track/thumb transitions in sync. Native fallback no longer accepts disconnected browser gamepads, and a heartbeat grace period avoids alternating between native state and stale browser button states.
- Validation: `tests/overlay-controller-build.log`, 60 passing tests in `tests/overlay-controller-unit.log`, native offline skin/input tests in `tests/overlay-controller-native.log`, and rapid mouse-toggle tests in `tests/overlay-controller-switches.log`. The switch audit sampled 28 frames: each click changed state once, the same DOM node stayed mounted, and the thumb stayed visible inside its track. Native reports are in `.cache/overlay-runtime/verification.json` and `.cache/overlay-settings/verification.json`. Screenshot: `.cache/overlay-runtime/ps5-midnight-black.png`.
