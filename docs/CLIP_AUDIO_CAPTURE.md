# Clip audio capture

## Microphone processing on Windows

Clips use the content-addressed `ProcessAudioCapture.pcm.<hash>.exe` selected by `audio-capture.json`; the input-level/microphone test uses `ProcessAudioCapture.apo.exe`. Both builds share the same shared-mode WASAPI source. It explicitly selects `AUDCLNT_STREAMOPTIONS_NONE`, without RAW, exclusive capture, offload, or forced system echo cancellation. This leaves configured Windows endpoint effects, including Equalizer APO, in the input path. Effects still require a working APO installation on the selected microphone and Windows device enhancements enabled where applicable.

Replay packet times use converted output sample counts instead of independent, jittery QPC timestamps or endpoint positions at another sample rate. Genuine Windows discontinuity flags re-anchor the wall clock. Sparse PCM buckets and WAV snapshots share an absolute 48 kHz frame grid. Gate, volume and mono are applied together with the final audio mix and sidecars, without an intermediate microphone conversion or desktop AAC encoding pass.

The native device picker enumerates active Windows input endpoints and uses stable `wasapi:` endpoint IDs. Select **Default** to follow the Windows default microphone automatically; explicit endpoint selections stay pinned. The native recorder reports invalid older browser-hashed selections instead of recording a different microphone. Device-open failures are reported instead of silently switching to RAW capture or another recording engine. See [Native capture](NATIVE_CAPTURE.md) for the event-based default-device switching and recovery path.

Build with `npm run build:native-audio`. The `.apo.exe` name avoids replacing the separate helper already used by running game/Discord captures. Restart Eclipse after updating main/preload/native code. The helper is included by the native-file packaging rule and needs no administrator privileges.

## Desktop, game, Discord, and microphone tracks

New normal desktop captures store PC audio as a `.desktop.m4a` sidecar, independently from the microphone. To include desktop audio alongside isolated application audio, enable **Clips settings → Audio & microphone → Application audio → Record desktop sound separately**.

The desktop mix contains all sound from the captured output, including YouTube, music, game, and Discord. It is not a browser-only track. Game and Discord sidecars remain available, but default playback/export uses desktop plus microphone so overlapping application sound is not doubled. Enabling an application track in the editor mutes desktop; enabling desktop mutes the game and Discord tracks. Microphone volume remains independent. Drafts, undo/redo, waveform analysis, sharing, export, disk usage, and deletion include desktop audio.

Clips initially open with a single video strip and trim handles. **Open in editor** in the bottom left reveals the audio tracks and advanced editing controls. Switching views preserves the player, position, selection, volumes, and undo history. The clip name can be changed in the right sidebar and saves automatically. Video-strip thumbnails use one temporary decoder, released after eight small frames have been drawn.

The optional clip-confirmation sound starts when a live replay request is accepted, before thumbnail generation and encoding. Completion does not replay it. Sound preferences are read for each request and remain independent from the visual notification switch.

Existing mixed clips cannot acquire isolated audio retroactively. Existing game/microphone/Discord sidecars and old drafts remain supported.

## Validation

`tests/native-microphone.test.cjs` checks endpoint parsing, PCM channel order, bounded buffers/IPC, ownership, shutdown, and failed-start cleanup without capturing a real microphone. `tests/clip-media.test.cjs` uses four distinct synthetic tones to check retained sidecars, default mixing, edited export, and missing-game segments. The isolated Clip Studio Electron test exercises synthetic capture, playback, seeking, trim, drafts, undo/redo, and export. It does not verify the user's installed APO configuration acoustically.
