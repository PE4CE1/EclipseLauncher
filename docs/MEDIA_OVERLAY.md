# Media overlay

The Windows media bridge is `electron/native/MediaSessionHost.exe`, compiled from
`MediaSessionHost.cpp` with `npm run build:native-media` (Visual Studio C++ build
tools and Windows SDK required). The binary is included by the existing native
asset packaging rules and runs from `app.asar.unpacked` in installed builds.
It uses Windows SMTC sessions directly, without a PowerShell runtime, injected
media keys, network artwork searches, game hooks or audio analysis.

The helper starts on demand and exits when there are no visible subscribers.
There is one serialized request queue. Concurrent status reads share a request
and a 250 ms startup cache; controls invalidate that cache. Default polling is
2 seconds during playback, 4 seconds while paused and 6 seconds without a session.
Repeated failures back off to 30 seconds. Unchanged snapshots cause no renderer
IPC update. Artwork is bounded and cached; playback bars animate only during
interaction, so a settled media widget has no continuous animation.

Local verification:

- `npm run check`: TypeScript, regression tests and application bundles.
- `node tests/media-native-smoke.cjs`: read-only Windows queries and a command
  aimed at a nonexistent session; does not change real playback.
- In PowerShell: `$env:ECLIPSE_OVERLAY_RUNTIME='1'; $env:ECLIPSE_MEDIA_WIDGET='1';
  node tests/run-electron-smoke.cjs` tests the real widget with isolated media IPC.

On this development PC, a 10-second read-only sample at the new 2-second interval
measured about 3 MiB private memory and 19 MiB working set for the native helper,
versus about 89 MiB private and 115 MiB working set for the former PowerShell
helper. CPU time rounded to zero at the Windows process-counter resolution in
that short native sample; this is not a zero-cost guarantee or a measurement of
the entire Electron application. Build/startup and other overlay widgets have
their own costs.
