# Automatic HTTP downloads

Updated 4 November 2026.

The follow-up [download experience update](DOWNLOAD_EXPERIENCE_2.md) dated 6 November supersedes the same-host candidate restriction, the Gofile resolver and the error presentation described below.

## Behavior

Download hoster pages no longer open a visible, always-on-top browser or automatically open the system browser. The selected release supplies its other HTTP mirrors to the native downloader. It tries the selected mirror first, then at most seven other hosts from that same entry. It never silently changes to a different release or to BitTorrent. Repeated links on the same host are excluded from automatic fallback because they may represent different parts of a multipart archive.

The resolver reads public download forms, including DataNodes' current download-countdown component and JSON-link response. Cookies, form nonces, filenames and ordinary server countdowns are preserved. Captcha, password and premium gates are skipped in favor of another mirror. No challenge solver, fingerprint-spoofing preload or private third-party unlock API is used.

Ordinary forms use bounded native Chromium requests without creating a browser. Electron's `Session.fetch` does not expose manual redirects reliably ([upstream issue](https://github.com/electron/electron/issues/43715)), so `hosterRequest.ts` uses the documented [ClientRequest redirect event](https://www.electronjs.org/docs/latest/api/client-request) to return redirects to the resolver for validation. POST tokens are not replayed on cross-origin redirects. Metadata is limited to 2 MiB and binary responses stop at their headers.

When a page needs ordinary JavaScript, a sandboxed, non-visible browser can run briefly. Popups and permission requests are denied. Only validated archive responses with successful HTTP status codes are intercepted; redirects whose URL happens to end in `.zip` no longer count as files. The browser, polling timer and interception hooks are removed when resolution completes, times out or is cancelled.

Before transferring, the download engine verifies the actual file response. Hosts that reject HEAD or return their landing page for HEAD receive a one-byte GET probe, cancelled at headers if Range is ignored. HTML/JSON/images are rejected instead of being saved as an archive. A failure before any bytes are saved can switch mirrors after the old destination closes. An existing partial file is never combined with another mirror.

Pause during resolution is reflected in the UI and prevents the subsequent transfer until resumed. Cancellation aborts native resolution and verification; late results cannot recreate a cancelled job. Failed jobs can be retried. The Downloads page displays the current mirror attempt and actual error, rather than showing a P2P peer search for HTTP downloads. Remaining time now uses milliseconds consistently with the torrent engine. Adding cover metadata no longer resets a newer native progress update.

## Validation

- `npm run check`: TypeScript passed, **393/393 tests passed**, production app build succeeded. Evidence: `.cache/download-final-check.log`.
- `node --test tests/download-automatic.test.cjs tests/download-hoster-request.test.cjs tests/download-resolver.test.cjs tests/download-http.test.cjs`: targeted form, redirect, response-validation, fallback, pause/resume, cancellation, retry and partial-file tests.
- `$env:ECLIPSE_DOWNLOAD_AUTO='1'; node tests/run-electron-smoke.cjs`: isolated Electron test with a local synthetic archive, 302 and POST-preserving 307 redirects, session cookies, an expired first mirror, filename preservation and a hidden JavaScript fallback. All 524,292 bytes matched; **zero visible windows**. Evidence: `.cache/download-automatic-smoke.json`.
- Optional `$env:ECLIPSE_HOSTER_AUDIT='1'` additionally checks public metadata for the example's four hosts. It obtains and verifies links, without transferring or extracting the game archive. Evidence: `.cache/download-hoster-audit.json`.

## Observed example: Potato Please

The public SteamGG entry provides DataNodes, VikingFile, Filekeeper and Akirabox mirrors. In the live Electron audit:

| Mirror | Observed result |
| --- | --- |
| DataNodes | Public form reachable. The next step explicitly requires a captcha, so automatic resolution skips it. |
| VikingFile | `ERR_SSL_PROTOCOL_ERROR` in this environment. |
| Filekeeper | Hidden resolution produced a distinct `fs2.filekeeper.net` file URL; the download engine successfully verified it. |
| Akirabox | `ERR_SSL_PROTOCOL_ERROR` in this environment. |

Thus this entry has a verified automatic alternate route through Filekeeper. This is link/header validation, not a completed installation test. Availability, rate limits and challenges remain controlled by the hosts. If every mirror is unavailable or requires interaction, Eclipse reports the failure instead of leaving a browser open or claiming the download succeeded.

## Files

- `electron/automaticHosterResolver.ts`: public forms and bounded hidden JavaScript fallback.
- `electron/hosterRequest.ts`: native metadata requests and controlled redirects.
- `electron/downloadMirrors.ts`: candidate selection and file verification.
- `electron/httpDownloadService.ts`: cancellable jobs, fallback and streaming transfer.
- `electron/preload.ts`, `src/types/game.ts`, download dialog/game preview: mirror propagation.
- `src/components/downloads/DownloadsView.tsx`, `src/store/downloadStore.ts`: progress, retry and errors.
- The unused `electron/resolverPreload.ts` and its Vite build entry were removed.
