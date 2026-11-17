# Download graph and reliable controls

6 November 2026.

## Interface

Running downloads now take priority on the Downloads page. Each transfer has a restrained network chart with current speed, peak, progress, received bytes and ETA. The time axis follows available measurements, up to two minutes. Paused tasks retain their chart and show zero current transfer speed. Extraction has its own progress display instead of a fake network graph.

The chart is SVG with at most 121 actual progress samples per task. It has no rendering loop, synthetic speed data or invented disk-activity series. Samples are coalesced when progress messages arrive in a burst. Removing a task clears its history. The existing responsive layout, focus styles and reduced-motion rules are retained.

## Control fixes

- Preload asks the HTTP service whether it owns a job before invoking the torrent service. IPC and engine failures reach the UI instead of being swallowed.
- A synchronous click guard prevents duplicate commands before React commits a disabled button. Failed actions show a localized error and keep the task available for retry.
- Pausing HTTP resolution aborts the in-flight request. Resuming starts a fresh attempt on the same mirror. A generation guard discards late results from previous attempts; repeated pause/resume cannot start parallel transfers or skip mirrors.
- Active HTTP pause closes the request and disk stream; resume uses the actual flushed file offset. Cancel stops the job before removing its entry. Completed transfers can be removed idempotently, including when completion wins a cancel race.
- WebTorrent's `pause()` alone does not close existing wires in the installed library. Pause now closes them, retaining TCP endpoints for resume. Resume reconnects those endpoints, restores web seeds and refreshes tracker discovery. Cancel awaits destruction, aborts extraction and retains torrent files (`destroyStore: false`).
- Removed task IDs ignore late progress events until an explicit new registration. The guard is bounded. Metadata registration cannot reset newer native progress.

## Verification

- `npm run check`: TypeScript, 431 tests and production build passed. `.cache/download-graph-check.log`.
- The final complete suite including the additional rapid-resolution race test passed **432/432**: `.cache/download-graph-final-tests.log`.
- Native HTTP smoke: exact 524,292-byte result, mirror fallback, session cookies, pause/resume, intentionally interrupted transfer, no visible resolver windows. `.cache/download-automatic-smoke.json`.
- Real UI + production preload + real native HTTP service + local range server: rapid double-click issues one pause; disk bytes and chart stay unchanged while paused; resume requests the flushed byte offset; an intentionally rejected cancel keeps the job and shows an error; successful cancel removes the partial file; a late event cannot resurrect it. `.cache/download-transfer-ui/verification.json`.
- Existing download-dialog UI smoke passed (release selection, grouped errors, German/English and an 850×650 window). The graph screenshots were visually inspected. `.cache/download-transfer-ui/downloading.png`, `paused.png`.

Tests use local synthetic files and isolated app data. Torrent connection lifecycle is unit-tested with controlled peers; no public torrent or game installation was downloaded for this change.

## Implementation

- `src/components/downloads/DownloadGraph.tsx`, `DownloadWorkspace.tsx`, `downloads.css`
- `src/services/downloadHistory.ts`, `src/store/downloadStore.ts`
- `electron/downloadControls.ts`, `preload.ts`, `httpDownloadService.ts`
- `electron/torrentTransferControl.ts`, `torrentService.ts`
- `tests/download-controls.test.cjs`, `download-automatic.test.cjs`, `download-transfer-ui-smoke.cjs`
