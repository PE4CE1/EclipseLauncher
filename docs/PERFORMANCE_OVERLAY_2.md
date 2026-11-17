# Performance overlay: lower input and sampling overhead

6 November 2026.

The performance HUD now defaults to a subtle translucent panel. Settings → Gameplay overlays → Performance overlay → Background offers **Subtle**, **Transparent** (text only) and **Dark**. Existing layout, scale and metric choices are preserved. The background uses plain alpha; there is no backdrop blur, appearance animation or live texture.

## Runtime changes

- Passive HUDs use native mouse click-through without forwarding mouse-move events into Chromium. Only the interactive media widget enables forwarding; edit mode temporarily accepts input. Repeated process-monitor updates do not reset an active media hover state. This removes unnecessary mouse-event work for high-polling-rate mice. Electron documents the `forward` behavior in [BrowserWindow.setIgnoreMouseEvents](https://www.electronjs.org/docs/latest/api/browser-window#winsetignoremouseeventsignore-options).
- GPU sampling keeps one `nvidia-smi` connection open, sampling adapter 0 every two seconds at below-normal process priority. It replaces repeated cold process launches every three seconds. Disabling/hiding the HUD stops it. Missing tools, errors, stalled processes and stale values are bounded; an unsupported GPU is shown as unknown rather than invented utilization.
- The native FPS helper buffers the unchanged original PresentMon frame records for up to 250 ms (with a 64 KiB early-flush limit). The launcher dispatches received CSV batches together. Capture source, target PID, permissions and trace-session ownership are unchanged. No game injection or new input hook is introduced.
- Identical metrics selections no longer trigger an extra immediate CPU sample or sensor publish. Hardware polling remains once per second and runs only for enabled sensors.
- The performance widget selects only visible rounded readings. Changes in frame-time decimals, disabled GPU readings and AFK idle time do not repaint it. The clock continues to update once a minute.
- Metric toggles correctly treat an omitted flag as enabled, including older settings that only contain scale/layout values.

## Verification

- `npm run check`: **453/453 tests passed**, type check and production build passed. `.cache/overlay-latency/check.log`.
- Unit tests cover GPU process reuse/cleanup, stale results, retry limits, unsupported tools, idempotent selection, stable visible snapshots, PID changes, passive mouse forwarding and media/edit policies.
- A compiled native batching probe sent 240 frames plus the CSV header. Every original record was preserved; pipe writes dropped from **241 to 1** for that batch. `.cache/overlay-latency/native-batching.json`.
- The native helper handshake/owned-pipe checks passed without requesting elevation. A non-elevated collector correctly reported that FPS permission was required. `.cache/overlay-latency/native-probe.log`.
- The persistent GPU reader returned actual local GPU utilization and shut down after the probe. `.cache/overlay-latency/gpu-native.json`.
- Real Electron overlay tests checked layout, scaling, state changes, media controls, controller skins, clipping positions and all background modes. **300 updates with unchanged visible values produced zero DOM mutations in the displayed metrics.** `.cache/overlay-runtime/verification.json`.
- Screenshot alpha was checked directly: subtle background alpha 143/255, transparent 0/255, dark 240/255. `.cache/overlay-runtime/performance-{glass,clear,solid}.png`.

These tests verify the identified sources of overhead and behavior, not an in-game end-to-end mouse-latency or frame-pacing guarantee. Driver and Windows composition behavior still need comparison in the user's actual game. No user settings, Windows permissions or running game were modified by the isolated tests.

Rebuild the native helper with `npm run build:native-fps`. The source is `electron/native/PresentMon/FpsBroker.cs`; the packaged executable is rebuilt in place.
