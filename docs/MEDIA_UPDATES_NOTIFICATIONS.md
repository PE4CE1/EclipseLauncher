# Media, game updates, storage artwork and Windows alerts

Implemented for the Eclipse 2.0 interface work on 2026-10-31.

## Video controls

- Decorative control gradients no longer intercept clicks. Image clicks toggle playback, while actual controls handle their own clicks.
- Controls use an inactivity timer that resets during pointer movement and remain accessible while a control has keyboard focus.
- Native fullscreen is granted only to trusted application main frames. Remote frames and automatic fullscreen remain denied. Fullscreen state follows `fullscreenchange`; failed requests produce a readable message.
- Retry actually restarts source setup, including when the failed source was already the first candidate. HLS stays dynamically imported and cancels late setup after unmount.
- The inline trailer pauses while its expanded copy or the game-update reader is open. It waits for the expanded player's exit animation before resuming and preserves a pause requested by the user.

## Game updates

The **News & Updates / Neuigkeiten & Updates** button appears in Steam game previews. It opens an in-app reader with the latest twelve official Steam community announcements, dates, an article list, full article content and a link to the original on Steam.

News loads only when opened, uses the cancellable desktop HTTP bridge, and is cached for five minutes. Non-Steam titles are excluded; games without announcements have an explicit empty state. Publisher content stays in the language supplied by Steam.

Upstream bodies are untrusted. The reader converts common Steam BBCode, sanitizes an allowlist of HTML elements, removes event handlers/iframes/scripts/style, restricts links to HTTPS and images to Steam image hosts, and loads article images lazily. A malformed or mismatched app response cannot populate another game's reader.

API reference: [Valve ISteamNews/GetNewsForApp v2](https://partner.steamgames.com/doc/webapi/ISteamNews).

## Storage pictures

Storage rows and the uninstall confirmation use the shared artwork resolver with a separate landscape cache. It tries landscape headers, current hash-addressed Steam assets, verified demo parent artwork, existing custom icons and posters. Portrait library artwork keeps its original cache and priority. Thumbnails retain their fixed 104 × 58 outer size; portrait-only art is contained rather than cut into a landscape crop.

Games whose publishers supply no usable artwork still receive a named fallback. The resolver can retry after a failed image decode or a restored connection.

## Native notifications

Free Games uses Electron's native Windows notification API. A click restores Eclipse and opens **Free Games**. Settings and notification text support German and English. The installed app uses the builder's `com.eclipse.launcher` AppUserModelID; development retains Electron's executable identity.

Manual refresh only alerts for newly discovered offers, respects the Free Games notification setting, and does not repeat already delivered offers. A failed or unsupported Windows delivery is not marked as delivered. The generic native-notification IPC uses the same bounded notification service; the duplicate PowerShell toast subprocess has been removed.

Checks run while Eclipse is open, including its tray/background state. Windows notification settings and Do Not Disturb control whether Windows displays a toast. An installed Start Menu identity is needed for reliable packaged-app delivery; a development launch alone does not prove a toast will appear on every Windows setup. [Electron Windows notification requirements](https://www.electronjs.org/docs/latest/tutorial/notifications#windows).

## Verification

- `npm run check`: typecheck, **161 passing unit tests**, production renderer/main/preload build.
- `npx vite build --config tests/game-media-fixture.vite.mts`, followed by `ECLIPSE_GAME_MEDIA=1 npm run test:electron`: real generated WebM video, trusted image clicks above controls, native fullscreen at 1920 × 1080, preserved playback state, expanded-player audio exclusivity, reader navigation/Escape/cache/localization/sanitization, and landscape fallback for both Invokyr Demo and Screen Stocks Demo. No renderer errors.
- The video fixture records only a synthetic canvas, without screen capture, microphone or user media. Notification delivery/failure/deduplication is tested with mocked OS notifications; no real desktop notifications are emitted by the tests.
- Live public Steam request through the news service returned twelve CS2 announcements, including a current Counter-Strike 2 Update.
- Full application regression suite passed for page transitions, profile menu, library, settings, translations, sticky blur, native cleanup and notification activation into Free Games; `tests/electron-smoke-result.json` reports no renderer errors.
- Evidence: `.cache/game-media/verification.json`, `game-updates-de.png`, `storage-artwork.png`; logs under `tests/game-media-*.log` and `tests/media-updates-*.log`.

Restart the complete Electron app after updating main-process or preload code; a renderer-only reload does not apply the fullscreen permission or native-notification changes.
