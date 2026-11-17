# Clip settings and toolbar

Updated 2026-10-31.

The gallery toolbar feathers a separate glass pseudo-element along its edges. Controls and focus outlines are never masked. The scroll container has no top padding; header padding provides the initial spacing, allowing sticky controls to attach to the top without leaving a strip of artwork above them. Blur is disabled when the launcher is unfocused.

Clip settings now share the gallery's restrained typography, neutral controls and warm selection accent. All seven sections use a flat row layout rather than nested cards. Native labelled selects replace animated custom dropdowns, and toggles use actual keyboard-accessible switch buttons. Settings still save through the existing store and IPC; old preferences are retained by partial updates. There is no Save button.

Recording profiles, resolution/FPS/bitrate/container/encoder, source selection, separate microphone controls, clip confirmation colors, hotkeys, voice commands, event rules and storage actions remain accessible. Unsupported features remain described accurately. Noise-gate controls retain the backend's −60 to −10 dB range.

Screen thumbnails are requested only in the display section. Microphone enumeration runs only in audio/shortcut sections. The live microphone level test is opt-in and isolated in its own component, with a 100 ms update interval. Its tracks and audio context are released on stopping, tab changes and unmount, including late permission responses. Automatic gain control is disabled to match the recording input rather than changing the measured gain during the test. Escape cancels shortcut capture without saving Escape as the new shortcut.

## Verification

- TypeScript, 177 unit tests and the production build.
- The native gallery/settings fixture checks all seven sections, autosave IPC, quality values, microphone selection/volumes/threshold, explicit live-meter start and cleanup, shortcut capture/cancel, voice phrase, event cooldown, monitor selection, folder selection, localization and navigation back to the gallery.
- Responsive layouts at 400, 540, 800 and 1120 pixels; no horizontal overflow. Sticky controls remain visible/clickable while scrolling, their text stays unmasked, and unfocused blur is disabled.
- Test devices and file actions are synthetic/mocked inside isolated application data. No user microphone, screen, clips or folders are changed by verification.
- Evidence: `.cache/clip-gallery/verification.json`, `settings-*.png`, `toolbar-scrolled.png`, `tests/clip-settings-check.log`, `tests/clip-settings-build.log`, `tests/clip-settings-electron.log`.
