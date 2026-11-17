# Clip save latency

Clip creation now inserts a separate preparation card as soon as a healthy replay snapshot is requested. It has no playback, editing or sharing controls. A successful, durable native save replaces it with the actual clip; failures remove it. Pending cards follow the current game/search filters and do not count as saved files or storage. No placeholder file paths, sizes, resolutions or FPS are invented.

Saving no longer reloads the entire clip library and its thumbnails. The native response supplies the finished clip directly. Store insertion removes duplicate IDs, and a library refresh that began earlier preserves clips saved while it was in flight.

Thumbnail capture starts alongside recorder finalization, waits for an actual video frame, and has a 600 ms timeout instead of the former 2 seconds. Video and microphone blobs are read concurrently. Native temporary-file writes are asynchronous, and cleanup waits for every write to settle. Buffer views avoid additional full snapshot copies in the main process.

For a complete single H.264 segment already within the requested resolution, FPS and bitrate bounds, FFmpeg copies the existing video packets instead of encoding them again. Audio mixing, offsets, separate tracks, media validation and atomic finalization still run. Partial segments, joins, resolution/FPS changes and incompatible formats use the existing precise encoding path. Failed or mismatched copy results retry that path. GPU encoder detection runs only if an actual video encoder is needed.

Recent measured video facts are reused when opening a just-saved clip. The cache is limited to 24 files and verifies file size and modification time. Waveforms remain real analyses of the saved audio tracks.

A variable-frame-rate export edge case was also fixed: when the selected start falls inside a capture stall, the first retained image is presented at the start of the edit. Subsequent frame timestamps and audio timing stay intact, so the export does not fail validation merely because no new frame was captured at that instant. No extra frames are generated or reported as captured FPS.

## Verification

- Real FFmpeg tests compare decoded frame hashes, frame counts, durations and separate audio. Trim and FPS-cap cases must retain video encoding.
- Store tests cover pending-to-ready replacement, late thumbnail responses, duplicate insertion and a save during an outstanding library refresh.
- The isolated Electron studio fixture measures preparation-card visibility and editor readiness, verifies no library reload, and retains the audio continuity, seek, trim, draft, export and clipboard checks. It uses synthetic video/audio and does not capture the user's screen or microphone.
- Logs: `tests/clip-save-speed-*.log`. Native measurements: `.cache/clip-studio/verification.json` under `saveLatency`.

## Local comparison

The same synthetic 10-second 1280×720 / 30 FPS H.264 source, game audio and independent microphone were saved twice per implementation with CPU encoding selected. Before: 3,038 / 2,955 ms. After the video-copy change: 1,971 / 1,919 ms. This is roughly 35% less native preparation time in this small, warm-cache comparison. Both outputs contain 300 frames and 10 seconds of video. Data and fixtures are in `.cache/clip-save-benchmark`.

These timings are not guarantees for other hardware, longer recordings or clips that require encoding. Visible preparation feedback is immediate; the file becomes usable only after processing and validation finish.

The final isolated Electron run observed the preparation card after 156 ms and the short synthetic clip ready in the editor with audio waveforms after 1,721 ms. The latter includes processing, validation and editor analysis. Both native suites completed without renderer errors; 36 targeted unit/media checks passed, including the capture-stall export case.
