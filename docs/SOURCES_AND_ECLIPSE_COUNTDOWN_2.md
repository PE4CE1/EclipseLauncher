# Source reliability and eclipse countdown

## Logo interaction

A single click opens a compact card below the Eclipse logo. The logo briefly pulses and gains a restrained glow while the card is open. Idle and hover retain the plain logo. The old full-screen, timed cinema sequence and three-click counter have been replaced.

The card shows the next solar eclipse worldwide, its date, days remaining and approximate years remaining. If different, the next total solar eclipse appears below it. Visibility at the user's location is explicitly distinguished from the global event. Dates come from NASA/GSFC's [2021–2030](https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html) and [2031–2040](https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2031.html) tables.

The offline calendar includes all listed solar events through 2040, including partial and hybrid events. It advances by UTC calendar date, keeps an event visible throughout its date and does not claim minute-level accuracy from NASA's TD timestamps. An expired calendar links to NASA instead of inventing another date. A minute timer runs only while the card is open; reduced-motion mode uses a short fade. Escape, outside click and the close button dismiss the card and restore focus.

## Source import and refresh

- The settings import field accepts multiple URLs, one per line, including the website's copied source lists. The entire input is validated before adding entries. Duplicate URLs are merged, fragments stripped and GitHub blob/raw links normalized without lowercasing case-sensitive paths.
- Source work is bounded to three concurrent frontend tasks and two native network/JSON jobs. Duplicate requests for the same endpoint share work. Removing a source invalidates its pending UI updates so an old response cannot overwrite a later re-addition.
- UTF-8 BOM is accepted. Response bodies are limited to 80 MiB, with deadlines covering headers and body reading. Transient network/5xx/429 failures receive one bounded retry. Permanent HTTP/schema errors return promptly.
- Verification windows open only for actual challenge HTML. They are visible, sandboxed and queued one at a time. Ordinary errors no longer create pointless hidden browser windows or destroy another source's verification window.
- Successful remote refreshes have a fresh timestamp. A failed refresh can retain valid disk/memory data, but is marked **Cached**, with its original timestamp and an explanatory notice. A failed native request no longer repeats through the renderer's fetch fallback.
- Invalid or unusable data cannot replace a valid cached catalog. Download URIs reject unsupported schemes, embedded HTTP credentials and malformed magnet hashes.
- Clearing all source caches now removes the owned cache files as requested. A local JSON refresh reads the cache once and preserves its real synchronization timestamp.
- Mirror status requests are limited to four concurrent checks, refreshed when the mirror step opens and ignored after the dialog closes. Rejected checks show **Unverified** instead of leaving a perpetual loading indicator.

## Live endpoint audit, 4 November 2026

The public website lists 18 endpoints. Only metadata was requested; no game archives were downloaded or run.

| Group | Results |
| --- | --- |
| SteamGG, No-Intro, Shisuys, Rutor, FreeTP, Skidrow Cleaned, Iris Hub, Skidrow Merabet, Repack Igruha | HTTP 200 and usable catalog JSON in the metadata audit; HTTP 200 also confirmed through Electron |
| Eight `hydralinks.cloud/sources/*.json` endpoints | SSL protocol errors through both Node and Electron (`ERR_SSL_PROTOCOL_ERROR` in Chromium) |
| David Kazumi | HTTP 403 challenge HTML; interactive verification is required |

The actual updated native fetch/validation/cache pipeline was additionally exercised with SteamGG (6,732 usable entries, about 3.3 MB input) and Iris Hub (72,288 entries, about 53 MB input). Both returned fresh data and a readable atomic cache in an isolated Electron profile. The profile was removed by the test runner. Other endpoints were inspected for metadata validity and reachability; every downstream game file/host was not downloaded or verified.

An endpoint's SSL outage, an expired file link, a hoster's login requirement or the lack of torrent peers cannot be repaired by marking a source active. The launcher now distinguishes these failures from its own import/cache errors.

## Verification

- `npm test`: **372 passed**, zero failures or skipped tests.
- `npm run build:app`: TypeScript and production build passed.
- Electron UI verification covers the compact countdown, glow only when open, idle styling, keyboard dismissal, exit fade and reduced motion. The screenshot was visually inspected.
- Source tests cover bulk imports, concurrency, duplicate sync, GitHub URLs, malformed data, BOM, cache fallback, unchanged stale timestamps, bounded bodies, body timeouts, retry policy, verification isolation, local refresh and late-result races.
- Logs: `tests/sources-countdown-full-suite.log`, `tests/sources-countdown-ui.log`, `tests/sources-countdown-build.log`, `tests/source-native-audit.log`.
- Audit summaries: `.cache/source-audit.json`, `.cache/source-native-audit.json`, `.cache/source-native-validation.json`.
- Countdown screenshot: `.cache/clip-experience/eclipse-countdown.png`.

A full Eclipse restart loads the updated native source fetcher. The website itself was not modified or published.
