# Clip Studio: recording and editor rework

The editor now preloads its primary video with the saved poster visible and a loading/buffering indicator. Timeline frame extraction starts after the primary video has its first decoded frame, uses one short-lived decoder, and shows its own loading state. Trim borders join the 12-pixel handles without an inset gap; each grip also has a 24-pixel pointer target. Dragging retains the original grab offset instead of moving the cut boundary on the initial click.

Playback keeps explicit user intent across loading, pending timeline seeks, and interrupted play promises. Play cancels obsolete queued seeks and restarts from the selection start after reaching its end. Readiness events resume the requested operation, while real pause events cancel it without letting an older queued pause revoke a newer request. Space ignores keyboard repeats and default button activation; text inputs retain their native editing shortcuts. Keyboard-listener refreshes no longer pause playback or reset focus. Loading retries reopen the actual video when needed.

The intro displays only the major/minor release line (currently **2.0**); package, update, and normal application version labels retain **2.0.3**.

Implemented 2026-10-31. Existing clip files are retained. The subsequent gallery update is documented in `CLIP_LIBRARY_REWORK.md`.

## Capture and replay

- System/desktop sound and microphone input now enter independent recorders. Microphone gain, mono processing and the noise gate are applied to the microphone path only. The chosen microphone is used exactly; an unavailable selected device is not silently replaced by another microphone.
- H.264 recording is preferred where Chromium reports support, with supported WebM codecs as alternatives. The save encoder still independently selects native H.264 hardware encoding or software fallback.
- Saving finalizes the video and microphone containers together while starting the next replay session. `requestData()` alone could yield only a fragmented-MP4 initialization segment; complete finalization avoids writing that incomplete snapshot.
- Segment rotation and snapshots have instance-scoped buffers, generation checks and bounded finalization. The previous segment is retained for clips crossing a boundary. Hardware-to-CPU fallback uses the same complete timeline and both audio sources.
- Encoded replay sessions have a 96 MiB budget each. History duration is limited at high bitrates instead of retaining unbounded multi-gigabyte buffers. UI shows the effective history limit. Snapshots and transcoding require temporary extra memory; the budget does not promise a fixed total process RAM limit.
- Capture-dependent background throttling is disabled only while replay recording is active, so background microphone gating and capture callbacks remain responsive. Normal throttling returns after stopping. Decorative app animations retain their existing unfocused/minimized behavior.
- Setting changes that require capture restart are debounced. Recording targets are snapshotted with the source, avoiding metadata that claims new settings for an older buffer. Container selection takes effect when saving.
- Encoder/source failures clear active state, release resources and produce a readable failure. Stale ended-track callbacks cannot restart a newer capture. The main process emits exactly one saved-clip toast; sound preferences are honored.

## Real media properties

`electron/clipMedia.ts` probes compressed media packets with bundled FFmpeg, without decoding every video frame. It measures dimensions, frame count and timestamp span, duration, codec, actual file bytes and effective bitrate. The editor displays average encoded FPS, rather than a saved requested value.

Resolution and FPS settings are ceilings. Low-resolution sources are not enlarged; lower-rate sources are not filled with duplicate frames. Frames above the selected FPS limit are dropped. A 640 × 360 / 24 FPS source remains 640 × 360 / 24 FPS even with a 4K / 60 FPS target. Source and achieved recording properties are displayed separately. Hardware throughput and source activity can limit achieved FPS, especially during startup or under load.

MB and GB use decimal byte units throughout Clip Studio. Mbps is bits per second, and recording bitrate is a variable-rate target. Disk usage includes the playable mixed video plus separately saved audio files. A simple scene can therefore produce a much smaller file than target-bitrate × time suggests.

## Independent audio files

Each new recording can contain:

- `clip_….mp4` / `.webm` / `.mkv`: playable video with the default combined audio.
- `clip_….game.m4a`: pure system/desktop audio, when available.
- `clip_….mic.m4a`: pure processed microphone audio, when available.

The two editor audio elements follow the video clock. Play, pause, seek, buffering and speed changes are synchronized; drift is corrected when necessary. Playback does not mix the video's default combined track on top of the independent tracks.

The initial editor synchronization had a readiness feedback loop: `canplay` forced a seek, which produced another `canplay` and another seek. The native reproduction counted 1,471 seek events per track in 1.2 seconds. This could make clocks look synchronized while continuously interrupting decoded audio. `src/services/clipAudioClock.ts` now distinguishes user seeks from readiness notifications, prevents overlapping play requests, adjusts small drift gradually within ±3% of the selected playback speed, and requires sustained large drift plus a cooldown before corrective seeking. Expected play interruptions during pause/seek are ignored; actual playback errors remain visible.

Export applies the selected time range and each track's gain/mute to a single compatible output. A complete-video audio-only edit can copy the encoded video stream. Precise cuts re-encode video without changing dimensions or synthesizing missing frames. The destination is staged and renamed after successful validation; failed exports preserve an existing destination.

Deleting a clip removes only its associated sidecars. Optimization retains them, validates duration, preserves metadata changes made during the operation, and reports actual resulting size. The source waveform is extracted from audio samples using FFmpeg `astats`; random decorative waveforms have been removed.

Older mixed clips remain playable. On-demand analysis repairs their displayed properties. The editor identifies their audio as mixed and disables the unavailable microphone control; already combined audio cannot be reconstructed into independent original sources.

## Editor

Microphone capture now reconnects independently after a temporary startup failure or an ended input track. Recovery uses the selected Windows endpoint (the Windows default when no endpoint is selected), retries with bounded backoff, and can be triggered from the recording warning or audio settings. Device changes and returning to Eclipse also retry an unavailable input. The microphone destination and recorder clock stay alive: outages are recorded as silence, while reconnecting the physical input does not restart video or clear replay history. Failures remain visible and do not silently switch away from the Windows APO capture path.

Native microphone sessions are owned by the capture document as well as its WebContents. Main-frame document replacement, renderer termination and window destruction release the owner's sessions; subframe and same-document navigations preserve them. Renderer `pagehide` also closes its bridge. Previously a reload could leave both allowed sessions occupied indefinitely, causing every subsequent request to fail with the generic `Invalid microphone capture request`. Capacity failures now have a distinct error category, with optional technical details in the recording warning. The native `ECLIPSE_MIC_RELOAD=1` diagnostic reproduces occupied slots, reloads the document without cooperative renderer cleanup, and verifies that the real selected microphone can record again.

`tests/microphone-recovery.test.cjs` covers lifecycle, retries, concurrent requests and late-result cleanup. The isolated native clip test (`ECLIPSE_CLIP_STUDIO=1 ECLIPSE_MIC_RECOVERY=1`) verifies startup failure, the retry UI, reconnection after a disconnected synthetic input, decoded microphone PCM in the saved file, preserved replay duration and release of all source tracks. The optional `ECLIPSE_NATIVE_MICROPHONE=1` diagnostic briefly opens the Windows-default microphone through the real native bridge, gate and recorder; it keeps audio only in memory and discards it. Encoded bytes verify the recording path, not whether a person spoke or whether their device was muted.

The editor is a separate portal component rather than several hundred lines inside the gallery. It follows a desktop editing workflow informed by [Medal's separate-audio editor](https://support.medal.tv/support/solutions/articles/48001220541-multi-track-recording): large preview, compact transport, properties and selection inspector, two audio lanes, one playhead and shared trim handles. Eclipse colors and assets are retained.

It supports image-click play/pause, native fullscreen, pointer scrubbing, dragging trim handles, numeric in/out points, keyboard seeking and playback speed. Reaching the selected endpoint pauses there; it does not loop back to the beginning. Paused seeking stays at the requested position. Keyboard focus is kept within the editor. The playhead animates directly while labels update less frequently, keeping the gallery out of the playback render loop.

Local video and audio use a streaming `local-media` protocol with proper `206 Partial Content`, `Content-Range`, suffix ranges and `416` handling. Allowed roots and canonical paths remain enforced. Large videos no longer need a base64 fallback for normal playback.

## Verification

- TypeScript, 177 passing unit tests and production renderer/main/preload builds.
- Unit suite, including actual FFmpeg-generated files: MP4/MKV/WebM, real dimensions, requested FPS ceilings of 24/30/60/120, no upscaling, no artificial FPS upconversion, true audio peaks, muted microphone absent from exported sound, actual silent export, CPU fallback retaining both replay segments, range handling, settings validation and associated-file deletion.
- Native Electron fixture uses a generated canvas plus inaudible synthetic audio destinations. It captures no user screen, microphone or game audio.
- The native fixture exercises the actual replay engine, native IPC save pipeline, bundled FFmpeg, file protocol and editor. It checks a short initial clip, a boundary-spanning replay, live changes to 360p/24 FPS/WebM, old mixed clips, actual MP4/MKV/WebM playback, scrubbing, trim dragging, fullscreen, separate volume and export, resource cleanup and background-throttling restoration. The full application regression suite also passed with no renderer errors.
- Six audio-clock unit tests guard against repeated readiness seeks, delayed start, small and sustained large drift, explicit paused seeking, playback speed changes and expected interrupted play requests. Native AudioWorklet probes inspect actual decoded PCM for both continuous synthetic tracks in three scenarios: normal playback; seeking and 1.5× speed; seeking, resume and volume changes. All three recorded zero silent render blocks and zero unintended seek events during their 1.2-second steady playback samples. Test audio is routed through zero-output worklets, so the test itself is inaudible. This verifies the player with synthetic media, rather than promising performance on every capture device or game.
- Audio evidence: `.cache/clip-studio/audio-continuity.json`, `tests/clip-audio-check.log`, `tests/clip-audio-studio-regression.log`. The original `audio-continuity-before.json` is useful for its event counters only: its initial PCM probe was muted/CORS-blocked and is not a valid audio-energy baseline.
- Evidence: `.cache/clip-studio/verification.json`, `editor-de.png`, `editor-en.png`, `editor-legacy.png`; `tests/clip-engine-*.log`, `tests/clip-studio-*.log`.

Restart the complete Electron process after updating main/preload code. A renderer-only refresh cannot activate the new native IPC and file-protocol handling.
