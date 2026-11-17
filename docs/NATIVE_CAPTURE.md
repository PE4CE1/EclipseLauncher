# Native capture

Recording uses the native Windows engine exclusively. The previous Chromium
recorder, engine selector, display-capture grants and renderer replay writer are
removed. Old `captureEngine` preferences are discarded when settings load/save.
Saved clips, drafts, audio tracks, friends and Discord remain available.

`NativeVideoCapture.wgc.exe` captures monitors and individual windows with Windows
Graphics Capture. D3D11 scales/letterboxes textures on the GPU, converts to NV12,
and feeds GPU surfaces directly to the Windows Media Foundation H.264 encoder.
An eight-sample GPU allocator bounds queued frames. Hardware mode verifies that
the selected encoder is an actual hardware MFT. Explicit software mode uses the
Windows software encoder; scaling still runs on the GPU. The former FFmpeg
`ddagrab` / `hwdownload` scaling path is removed.

HDR displays use FP16 scRGB capture. A GPU shader normalizes the Windows SDR white
level and compresses bright colors into SDR; BT.709 metadata is applied to the
H.264 stream and MP4 container. These are compatible SDR clips, not HDR10 exports.
Monitor mapping uses DXGI output coordinates and Electron's Windows DIP mapping.
Window handles must match a freshly enumerated source. Resizing a window retains
the clip dimensions and aspect ratio; closing it stops capture, including if the
handle is later reused by another process. There is no silent source substitution.

Before starting, capture requests `IsBorderRequired(false)` when the Windows
interface is available, following the approach used by
[Microsoft PowerToys](https://github.com/microsoft/PowerToys/blob/main/src/modules/MeasureTool/MeasureToolCore/ScreenCapturing.cpp).
This is a border preference, not confirmation that Windows has removed the border:
system policy, consent requirements or another capture session can override it.
An unsupported or rejected border preference never prevents recording. No system
privacy settings or registry entries are changed.

The recorder and the FFmpeg fragment remuxer each run through
`NativeCaptureHost.exe`. Windows job objects terminate their child if its host
crashes; closing the Electron pipe also ends capture. If Windows refuses the lifetime guard, native startup fails
and recording reports an explicit error. The guard does not impose a memory limit.

Video is held as short, closed MP4 files on disk. Clip requests pin the required
history, include frames up to the hotkey time, and snapshot without stopping the
live recorder. Only compressed fMP4 data crosses the bounded process pipes;
FFmpeg remuxes without decoding/scaling the video. Existing clip processing then
measures the real video, trims and muxes it into the normal clip library/editor
flow. Native timers keep frame timestamps on the requested cadence; real stalls
remain gaps rather than being disguised by speeding up the clip. Unchanged
sources hold their last frame. No claim is made that recording uses zero resources.

Microphone and desktop loopback are captured through a separate build of the
existing WASAPI helper. The helper timestamps consecutive packets from their
converted output sample counts, anchored once to the wall clock. Endpoint
positions can use another sample rate, so those are not treated as 48 kHz offsets.
This avoids tiny holes
and overlaps caused by jitter in per-packet QPC timestamps. Genuine device
discontinuities re-anchor the clock. PCM files and snapshots use one absolute
48 kHz sample grid, including bucket boundaries. It preserves the microphone APO path (no RAW or exclusive
mode). Two-second PCM disk buckets preserve timestamps and missing-device gaps;
audio is not accumulated as a large renderer replay buffer. Raw desktop and
microphone WAV tracks go directly to the final mix/export; gate, volume, mono and
AAC sidecars are produced there in one pass. Desktop audio is not pre-encoded and
then re-encoded for the final mix. Isolated
game/Discord audio reuses the existing process-audio service. Microphone device
failures retry, and the existing reconnect control is wired to the native reader.
In **Default** mode, MMDevice endpoint notifications automatically follow changes
to the Windows console playback/input device. The old helper closes before its
replacement starts, with a short 150 ms debounce instead of failure backoff.
Audio timestamps keep their common clock; device-change gaps stay silent. A
specifically selected microphone remains pinned to that endpoint. No polling,
RAW mode, audio-device reconfiguration or administrator access is needed.

Known preview boundaries:

- Windows Graphics Capture requires a compatible Windows version and driver.
  Windows must be visible when recording starts. Protected content and some
  exclusive-fullscreen applications can be unavailable to Windows capture.
- HDR tone mapping is verified with synthetic FP16 GPU textures. An actual HDR
  monitor and AMD/Intel hardware still need real-device validation.
- Unsupported hardware/device selections or native startup errors stop capture
  with a clear message. Interrupted native sessions retry up to three times;
  stopping replay cancels recovery. There is no browser fallback.
- Native video currently uses H.264. The requested file container still goes
  through the existing export pipeline.
- Startup waits for an actual closed segment. Saving may wait for the segment
  containing the hotkey moment; the saving notification starts immediately.

Build helpers with `npm run build:native-capture`. Existing packaging rules include
`NativeVideoCapture.wgc.exe`, `NativeDisplayInfo.exe`, `NativeCaptureHost.exe` and the
`ProcessAudioCapture.pcm.<hash>.exe` selected by `audio-capture.json` as unpacked native
assets. No extra downloads or administrator rights are required at runtime.
The audio helper is built under a content-addressed name and published only when
compilation succeeds. Existing replay processes are not killed to replace their
locked executable; obsolete, unlocked hashed helpers are cleaned on later builds.

Clip requests independently ask for a 480×270 JPEG from the latest closed video
segment. This request is bounded, uses one decoder thread, pins its segment and
caches one result. It supplies the pending library card and active toast before
audio assembly completes. There is no continuous thumbnail recorder or periodic
decoding. A late preview cannot replace a completed clip or resurrect a toast.

Verification:

- `npm run check`: application typecheck, regression tests and bundles.
- `node --test tests/native-replay.test.cjs tests/native-engine-switching.test.cjs tests/native-audio-switching.test.cjs`:
  disk PCM, timestamped history, source validation, audio reconnection, cleanup and recovery.
- `$env:ECLIPSE_NATIVE_CAPTURE='1'; node tests/run-electron-smoke.cjs`:
  isolated, real Windows recording/save tests with native microphone and desktop
  loopback, a real window (resize/close), metadata, thumbnail, owner isolation,
  document cleanup and persistence.
  Temporary recordings are removed after the test; no audio is played.
- `node tests/native-replay-recording.cjs`: video-only native recording probe.
- `$env:ECLIPSE_NATIVE_PROBE_720='1'; node tests/native-replay-recording.cjs`:
  real 1280×720 / 60 FPS recording including clip export and clock alignment.
- `node tests/native-gpu-recording.cjs`: synthetic SDR/HDR FP16 textures through
  the actual GPU scaler, NV12 conversion, hardware/software encoders and FFmpeg
  remux. Decoded pixels verify color range and BT.709 output; actual FPS is measured.
- `node tests/native-audio-timing.cjs`: temporary microphone/desktop packet timing
  diagnostics; audio is neither retained nor played. Desktop packet counts can
  be zero while no application is rendering audio.

Real-device tests passed with this PC's NVIDIA Media Foundation hardware encoder.
Audio switching tests exercise the helper reconnection protocol; they do not
physically unplug a headset or change the user's Windows default devices.
