# Orange-black launcher atmosphere

The launch screen now reveals a persistent, understated orange-black background as it lifts away. The background contains no version glyphs, logo, loading indicator, or text. Home keeps the Steam storefront layout, and its hero fades into the atmosphere at the bottom.

## Rendering and lifecycle

- `LauncherAtmosphere.tsx` renders two decorative, non-interactive gradient layers. CSS animates only their transforms over 26/32-second alternating paths; there is no JavaScript frame loop, video, canvas, animated noise, live blur, or additional dependency.
- Each animated layer is bounded to 1100 × 850 CSS pixels, including in a 4K window. Device scale still affects raster memory; this is not a claim of zero GPU or memory use.
- The gradient ellipses have explicit radii and fade to transparent inside all four texture edges. The earlier off-center, farthest-corner gradients could still contain color at a texture boundary, exposing a moving rectangular seam. The new diagonal washes have transparent margins instead of adding live blur or an animated mask.
- The launch provider publishes a separate boolean context when the launch surface starts closing. Its frequent progress updates do not restart the background or notify that context's consumers.
- Focus loss, minimizing, an active game, or cinema pauses movement. State changes explicitly commit animation hold times because Chromium can defer a CSS pause in a hidden window. Both animation clocks and transforms are verified to remain unchanged. Minimizing/restoring also updates the existing window activity state.
- Outside the foreground, the entire orange atmosphere fades to 25% opacity over 350 ms; the moving layers stop immediately. On focus it returns over 700 ms and resumes the held phase. The static orange base gradients also live inside this dimmed surface. The neutral launcher base remains constant.
- The global performance rule exempts the atmosphere and its children from shortening animation duration to 0.001 ms. The one-off opacity transition can finish while the two movement clocks remain paused.
- Windows reduced-motion disables the animations entirely. Custom themes hide the built-in background and retain their own surfaces. Standalone friends, stream, and game-overlay windows do not render it.
- The moving background stays behind artwork and controls. Content uses one continuous backdrop, and settings navigation and catalogue filters share the same translucent panel palette. TopBar and the library/catalogue toolbars share a subtle dark tint. The compact TopBar uses an 18 px backdrop blur in the foreground; the shared window-focus attribute disables it when inactive even with performance mode switched off. Other toolbar/card surfaces remain unfiltered. Game details retain a stronger header scrim. The existing static matte grain remains.
- Game details, Clips Studio and its settings, profile, notifications, downloads, storage and release information use the same page/card material tokens. Custom themes retain the original fallback colors. Video areas and media dialogs retain suitable opaque backgrounds. Game hero artwork fades into the atmosphere while the underlying cached view is hidden and inert; closing removes the game layer immediately.
- Remaining views now have navigation titles, and fullscreen trimmer/lightbox flags hide the header only in their own active view.
- The old performance-mode rule forcing all headers to opaque black and fully visible was removed. Focus loss now pauses work without changing the surface palette or overriding intentionally hidden cinema controls. TopBar transitions only opacity, background color, and border color. Settings keeps paint/layout containment without forcing an extra GPU layer on its scroll pane.

## Verification

`npm run check`: typecheck, 133 passing unit tests, production build.

Integration command (isolated data, blocked remote networking, synthetic library):

```powershell
$env:ECLIPSE_SMOKE_LIBRARY='1'
$env:ECLIPSE_SMOKE_STRESS='1'
$env:ECLIPSE_SMOKE_NAVIGATION='1'
$env:ECLIPSE_SMOKE_ATMOSPHERE='1'
npm run test:electron
```

Set `ECLIPSE_SMOKE_ATMOSPHERE_GPU=1` for hardware rendering. The default smoke test disables the GPU to exercise the software fallback.

The atmosphere checks verify the startup handoff, actual animation-clock advancement, both frozen transforms/clocks on blur/minimize, 25% background opacity outside the foreground, resume, reduced motion, bounded layer dimensions at 4K, transparent page surfaces and DOM reuse across navigation. The seam regression renders each actual compiled gradient over black and samples all four texture borders, also requiring visible interior pixels. The header comparison explicitly enters performance mode and verifies that its material remains unchanged. Captures include game details, Clips Studio and settings, profile, notifications, release information and focused/unfocused settings. Existing checks cover 590 prepared posters, cache reuse, eleven preview return paths, controller content, native cleanup, and absence of renderer errors.

Software and hardware integration runs both passed. Final unit tests and typecheck also passed after the pause changes.

Logs: `tests/atmosphere-check.log`, `tests/atmosphere-build.log`, `tests/atmosphere-final-unit.log`, `tests/atmosphere-final-types.log`, `tests/atmosphere-electron-software.log`, `tests/atmosphere-electron-gpu.log`. Captures and machine-readable results are under `.cache/launcher-atmosphere/`. Capture timing waits for the initially hidden Electron window's first paint and for the actual fade completion.

Surface cleanup logs: `tests/atmosphere-surfaces-check.log`, `tests/atmosphere-surfaces-build.log`, `tests/atmosphere-surfaces-gpu.log`, `tests/atmosphere-surfaces-software.log`. Screenshot checks flush previous compositor frames in initially hidden GPU windows before inspecting the current view.

Surface cleanup verification: 133 unit tests, typecheck, production build, GPU integration and software integration passed. Both layers measured RGB 0 at their texture borders in both renderers, with visible interior color. Focused/unfocused settings screenshots were inspected. Combined results: `.cache/launcher-atmosphere/surface-cleanup-verification.json`.

Remaining-view and preview verification: 133 unit tests, production build, both renderer modes, and the delayed-detail store fixture passed. All eleven return paths removed the preview in the first restored-page commit without later reappearance; covered views were inert and retained their scroll state. Both background transforms and clocks stayed exactly unchanged while inactive. Combined results and logs: `.cache/launcher-atmosphere/material-navigation-verification.json`.

TopBar glass update: production build and GPU integration passed with an 18 px foreground backdrop blur, including game previews. Inactive windows disable that blur while retaining the tint and frozen, dimmed atmosphere. All eleven navigation cases still passed. Logs: `tests/topbar-blur-build.log`, `tests/topbar-blur-electron.log`; results: `.cache/launcher-atmosphere/topbar-blur-verification.json`.

No installer, commit, publication, or live account changes are part of this update.
