# Clip library interface

Updated 2026-10-31. Recording, independent audio and export formats remain unchanged.

The gallery uses flat thumbnail entries with a separate title, game and date/size line. It removes the repeated Studio badge, green game-status badges, heavy image gradients, full-card borders and permanent rows of icon-only actions. Copy remains a quick action on the thumbnail; a keyboard-accessible action menu labels export, compression, folder and deletion explicitly. Measured dimensions and FPS remain available in its facts row and the editor.

Newest clips are grouped by local calendar day. Search also matches tags, game filtering uses one counted selector, and duration/size sorting is now available in the toolbar. Loading, an empty collection and no search matches have distinct states. Existing clips, titles and recordings are not modified by the interface update.

The responsive grid uses the actual view width, with one to four columns. Hover changes opacity and color without moving artwork or text. Memoized cards, stable clip IDs, lazy image decoding and fixed-aspect artwork culling replace per-card Framer layout measurement and unused hover state. The gallery does not autoplay thumbnail videos or add recording timers. Only the sticky toolbar uses backdrop blur.

## Verification

- TypeScript, the complete unit suite (177 tests) and production renderer/main/preload build.
- An isolated native Electron fixture with 151 sample clips checks search by tag, game filters, duration/size sorting, copy/export/folder IPC, empty and no-match states, localization, keyboard navigation and menu bounds.
- Window widths of 400, 540, 800, 1120 and 1560 pixels have no horizontal overflow. Hover leaves card/text geometry unchanged. No renderer errors were reported.
- The complete native Clip Studio regression also passed after the gallery update: replay saving, both audio tracks, seeking, trim, fullscreen, export, live recording changes and cleanup. PCM continuity is measured with the synthetic recorder sources stopped; subsequent checks run capture and playback together. This separates playback verification from contention between headless synthetic audio/canvas clocks and is not a recording stress benchmark.
- Fixture thumbnails are existing project images, not replacements for user thumbnails. Capture is not initialized in gallery-only verification; user audio and screen are not accessed.
- Evidence: `.cache/clip-gallery/verification.json`, `gallery-de.png`, `gallery-en.png`, `gallery-menu.png`, `gallery-400.png`; `tests/clip-gallery-final-check.log`, `tests/clip-gallery-electron.log`, `tests/clip-gallery-studio-regression.log`.

Reproduce with `npx vite build --config tests/clip-studio-fixture.vite.mts`, then set `ECLIPSE_CLIP_GALLERY=1` and run `npm run test:electron`. The fixture uses isolated application data and mocked file actions; no existing clips are deleted or exported.
