# Automatic clip game audio and Eclipse cinema

The original cinema described below has since been replaced by the compact [eclipse countdown](SOURCES_AND_ECLIPSE_COUNTDOWN_2.md). The clip audio changes remain in place.

## Clip audio selection

`src/services/clipAudioSelection.ts` resolves the configured application against the native game session. Automatic selection is the default in both clip settings stores. It follows the detected game's PID even before the game has an active Windows audio session; it never guesses a browser or unrelated desktop application.

When a saved executable such as `RocketLeague.exe` is no longer present in the application list, capture falls back to the current game and stays automatic for the recording session. Opening the audio settings also repairs that inactive saved selection to `auto`. Explicit selection of an available application and `No game audio` remain available.

The settings show `Automatic · VALORANT`, another detected game, or `Automatic · Waiting for a game`. They refresh on native game start/stop, window focus and every five seconds while visible. A game event arriving during an earlier request queues another refresh. Enumeration errors do not erase the current source or change a saved manual choice.

`electron/processAudioCapture.ts` now reconciles live sources every three seconds. A missing source stops its old helper and reports unavailable status. Old helpers cannot append late packets after retirement. Per-channel timelines remain intact across source changes so previously captured replay audio is preserved; the next game is captured into the same bounded timeline. Discord stays on its independent channel. No desktop audio fallback is introduced.

The automatic target is checked against the native session and OS process existence. A source whose game changed while Windows was activating capture is retired and replaced before returning the initial result. Cancellation and owner destruction stop the helpers and polling. Existing native game detection polling and exit grace periods remain in effect.

## Logo and animation

The title bar logo now opens the compact eclipse countdown with one click. The old three-click counter and reset timer have been removed. The tooltip and accessible label describe the countdown in English/German. Idle logo styling remains unchanged.

The cinematic sequence uses a continuous moon transit, a restrained orange corona, softened rays, a short diamond-ring highlight and the Eclipse wordmark. CSS animates transforms and opacity; stars and gradients are static artwork. No animation exists in the idle title bar. The full sequence lasts about 10.5 seconds before its exit fade.

The dialog renders through a portal and remains mounted during its exit transition. Click, close button and Escape dismiss it. Focus returns to the previous control. Motion pauses on window blur; reduced-motion mode shows a shorter static composition rather than the transit.

## Verification

- `npm test`: **356 passed**, no failures or skipped tests.
- `npm run build:app`: TypeScript and production build passed.
- Native orchestration tests use isolated synthetic processes/PCM packets. They cover stale Rocket League selection, PID changes, missing sources, retained replay audio, rejected late packets, delayed activation, enumeration failure and owner cleanup.
- Electron UI verification covers automatic selection, game changes, waiting without a game, idle logo styles, single-click opening and reopening, modal exit, pause on blur and reduced motion. Screenshots were visually inspected. The updated check passed; evidence: `.cache/clip-experience/verification.json`.
- Test logs: `tests/clip-experience-full-suite.log`, `tests/clip-experience-ui.log`, `tests/clip-experience-build.log`.
- Screenshots: `.cache/clip-experience/audio-auto-valorant.png`, `.cache/clip-experience/cinema-totality.png`, `.cache/clip-experience/cinema-reduced-motion.png`.

No live game recording or user microphone capture was performed for this change. A full Eclipse restart loads the updated native audio controller.
