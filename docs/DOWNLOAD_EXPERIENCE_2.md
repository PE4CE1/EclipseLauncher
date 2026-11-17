# Download experience and source reliability

Updated 6 November 2026.

## Interface

The release picker, setup dialog and Downloads page were redesigned together. A single release now uses a compact dialog instead of an almost empty fixed-height panel. Release metadata is separated from the game title, with source/search filters and a clear two-step flow. Setup offers automatic mirror selection, groups duplicate host names, uses restrained status labels and keeps its start button visible in small windows. Step transitions change height without scaling text. Escape, focus trapping, reduced motion and keyboard radio/checkbox controls are supported.

The Downloads page separates in-progress, completed and failed tasks. Failed tasks no longer count as active transfers or show a meaningless 0% bar. Error summaries use readable English/German descriptions; expandable details group failures by host and reason. Original provider pages open only when the user explicitly clicks their link button. Partial transfers and local storage errors have their own explanations.

Snapshots from an isolated fixture with test data:

- `.cache/download-ui/release-list.png`
- `.cache/download-ui/download-setup.png`
- `.cache/download-ui/download-error.png`
- `.cache/download-ui/host-details.png`
- `.cache/download-ui/download-error-de.png`
- `.cache/download-ui/download-active.png`
- `.cache/download-ui/download-setup-small.png`

## Download behavior

- A lightweight HEAD probe reports **Reachable**, not a promise that an archive is downloadable. HTTP 401/403 means access was denied; it is not treated as proof of a CAPTCHA. Explicit challenge evidence is reported separately. Checks share in-flight work, use a 7-second deadline and cache at most 256 results for 30 seconds. The status tooltip explains a failed check in English/German.
- Automatic selection prefers reachable candidates and supported hosts. The selected link is tried first; native fallback can try up to twelve distinct HTTP links from the same release, including another link on the same host. It never silently changes release or switches to P2P.
- Gofile's old hardcoded website token and handcrafted guest-account API request were removed. Its regular isolated page handles public access. Gofile attempts are serialized and share an in-memory anonymous session to avoid repeatedly creating guest sessions. Public download anchors are recognized; duplicate anchors for the same file do not count as multiple files.
- Resolution, file verification and the actual streaming transfer now retain the same anonymous Chromium session. There is no switch to a different TLS/proxy/cookie stack after resolving a public page. Cookies set during preflight remain available during the transfer. The native response streams directly into the disk pipeline with backpressure; whole archives are not buffered in memory. Timeouts and cancellation destroy the response as well as the request. Transient native connection errors can resume a partial file from the same mirror.
- Buzzheavier no longer receives a fabricated URL which discarded `/f/` from the original path. Public download actions are read from the supplied page, including same-origin `hx-get` actions and server-provided `HX-Redirect` headers. The general flow is regression-tested with a local fixture; the current remote example remains unavailable and is not claimed to work. MediaFire and Qiwi also use bounded native page resolution instead of unbounded `fetch().text()` on potentially binary URLs.
- Multiple archive parts in a folder, and filenames such as `game.zip.001` or `game.part1.rar`, are explicitly rejected as incomplete single-file downloads. Another complete mirror can be tried. Multipart assembly is not implemented; the application does not pretend that one part is a full game.
- Per-host failures are structured data, not concatenated exception strings. The UI distinguishes confirmation, access denied, unavailable files, no downloadable file, timeout, network failure, request limits, multipart archives, permissions and disk space.
- A retry after a zero-byte transfer failure resolves a fresh file link rather than reusing an expired signed URL. Starting an exhausted job again can apply a new destination. Concurrent starts of an active job remain deduplicated.
- Where supported, free space is checked from the actual file size before writing. Local storage/permission errors do not cause pointless attempts against every mirror. Empty transfers cannot report success. Partial files are never spliced together across mirrors.
- Downloading an archive without a detected executable no longer marks a game as installed or emits a false “ready to play” notification. The file remains available through its destination folder.

The downloader still streams files with disk backpressure, preserves its verified range/resume behavior, validates redirects and removes sensitive headers across origins. No visible resolver window is opened. Hoster authentication, CAPTCHA and premium restrictions are respected; the implementation does not disable TLS validation or use a third party's private unlock service. Gofile's public [API documentation](https://gofile.io/api) also distinguishes free access from premium API capabilities; no premium API entitlement is assumed.

## Verification

Final full check: `npm run check` passed: TypeScript, **427/427 tests**, production app build. Log: `.cache/download-free-check.log`. This includes cancellation before native headers, so a paused/cancelled request cannot leave a suspended header promise. The final native integration test also passed; log: `.cache/download-free-native-final.log`.

Targeted tests cover repeated links on one host, response validation, split archives, retry with a fresh URL, a full disk, expired jobs restarted with a new destination, status caching/classification and honest installation state.

The native local test (`ECLIPSE_DOWNLOAD_AUTO=1`) transferred all 524,292 synthetic bytes exactly, exercised 302/307 redirects, public HTMX actions, resolver/preflight cookies, pause/resume and automatic continuation after an intentionally disconnected stream. It resolved a Gofile-like public file page, ignored duplicate download anchors and refused multipart-only content. No resolver window became visible. Evidence: `.cache/download-automatic-smoke.json`. Unit tests additionally cover idle response cancellation, native stream failure propagation and explicit redirect handling.

The native UI test (`ECLIPSE_DOWNLOAD_UI=1`) verified one and many releases, searching, duplicate host grouping, automatic selection, dependent switches, structured error details, English/German, Escape and an 850×650 window. Screenshots were visually inspected. The single-release dialog measured about 376 px high. No renderer errors were observed.

## Cyberpunk entry from the screenshots

Only public source metadata and file headers were checked. No game archive was downloaded or extracted.

For `Cyberpunk 2077 Free Download [v.2.5/Build-26161058+DLCs]`, the live check encountered confirmation gates on both DataNodes links, network/TLS errors for VikingFile/Akirabox and unresolved/time-limited Gofile/Filekeeper flows. No complete file link for this entry was verified in that check. Evidence: `.cache/download-cyberpunk-validation.json`.

These provider conditions cannot be repaired inside Eclipse. The new UI identifies them accurately, tries other eligible links and makes recovery choices visible. A different release/source may be needed when every provider is unavailable. Link/header checks do not establish the integrity of an entire 75-GB archive or verify an installation.

## Main implementation

- `src/components/downloads/DownloadDialog.tsx`, `DownloadWorkspace.tsx`, `downloads.css`
- `src/services/downloadPresentation.ts`, `src/types/downloads.ts`
- `electron/downloadLinkStatus.ts`, `downloadErrors.ts`, `downloadMirrors.ts`
- `electron/automaticHosterResolver.ts`, `linkResolverService.ts`, `httpDownloadService.ts`, `downloadTransport.ts`
- `electron/preload.ts`, `src/store/downloadStore.ts`, `src/types/game.ts`
- `tests/download-reliability.test.cjs`, expanded native/HTTP/UI download tests

## Free-provider follow-up: SteamWorld Heist II and Potato Please

The user chose to keep downloads free. No paid service was added or used in validation. The public source entries and host pages were checked again on 6 November; the checks did not download game archives or test installation.

| Provider | Current observation in this environment |
| --- | --- |
| Buzzheavier, original SteamWorld Heist II URL | Chromium returned HTTP 521; Node returned HTTP 403. Neither proves a CAPTCHA. No automatic file URL was verified. |
| VikingFile / Akirabox | Chromium TLS protocol errors. These checks cannot determine whether the root cause is the provider, network path or local filtering. |
| DataNodes, Potato Please | Public page reachable; submitting the ordinary free form explicitly produced `has-captcha=true`. Automatic resolution stops at that gate. |
| Filekeeper, Potato Please | Public page reachable, but the subsequent download flow encountered DNS/TLS failures. No complete file URL was verified in this run. |

Evidence: `.cache/hoster-transport-audit.json`, `.cache/download-hoster-audit.json` and `.cache/download-free-native-audit.log`. The earlier Filekeeper success described in `AUTOMATIC_DOWNLOADS_2.md` was a historical link/header check, not a permanent availability guarantee.

The engine fixes remove avoidable client errors. They cannot make an expired file, failed CDN or required interactive challenge turn into an unattended free download. Higher reliability requires maintained sources with working, complete mirrors; selecting a different release remains explicit. This implementation does not promise that these particular remote games now download successfully.
