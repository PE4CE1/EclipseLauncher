# Clip audio, cuts and sharing

## Application audio

Clip settings → Audio & microphone → Application audio enables Windows process-loopback capture. The helper uses `ActivateAudioInterfaceAsync` with `PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE`. It captures the selected game's process tree and Discord's process tree independently; microphone capture remains independent. It does not inject into or read game memory. Requires Windows build 20348+; unsupported systems retain the original desktop-audio mode with an explicit disabled application-audio option.

The game defaults to the detected running game; a currently running audio application can be chosen explicitly. Discord is detected automatically. Polling every five seconds attaches applications launched later and handles restarts. Missing sources do not fall back to whole-desktop audio. The capture helper sends timestamped 48 kHz stereo PCM packets. Bounded in-memory timelines retain the selected replay interval plus headroom, rather than accumulating an entire session. The default 30-second setting uses about 7 MB per native audio channel. Snapshots use wall-clock alignment, silent gaps, and separate final AAC sidecars. Recording volume applies to the captured game audio. All three tracks have independent waveforms, playback levels, mute and export mixing in the editor. Older mixed clips are not presented as separable audio.

Source: `electron/native/ProcessAudioCapture.cpp`; compiled x64 helper included alongside the existing native executables. Rebuild on Windows with `npm run build:native-audio`; requires Visual Studio C++ tools and Windows SDK. The helper uses the static C++ runtime. The app build includes the executable and excludes native source files.

Actual Windows isolation was verified with two separate very quiet test-tone processes. The chosen 440 Hz signal was captured, the unrelated 880 Hz signal was excluded, and closing the selected process did not capture the other process instead. Evidence: `.cache/process-audio-verification.json` and `tests/process-audio-native.log`. This is a synthetic native test, not a compatibility certification for every game, device and Windows build.

## Editing and export

In the editor's right panel, mark the start of a section, seek to its end, then choose “Remove up to here”. Removed sections appear hatched on the timeline and can be restored individually. Playback and seeking skip removed sections; the transport shows the duration and time of the final edit. Start/end trimming remains available. Cuts, crop position, output format and all three gains persist in drafts and participate in Undo/Redo. Discard resets all of them and remains undoable.

Export offers original ratio, 9:16 Shorts and 1:1 square. The preview shows the crop; the position slider moves it horizontally. FFmpeg performs the actual crop and joins retained sections, including their matching audio. It preserves source cadence and never invents a higher source resolution. Low-resolution sources therefore produce correspondingly smaller portrait/square files.

“Discord file copy” renders the current edit to MP4 with an actual 20,000,000-byte ceiling and copies a real file to Windows' clipboard. Pasting into Discord attaches that edited file. A one-click “Copy for Discord” action is available directly on each library card and in the editor header, with preparation/copy feedback. Library copies use the saved draft; editor copies use the current edit. “Copy original” remains a separate menu action. The original remains untouched. The separate export checkbox uses the same byte-limited encoder for a saved file. Up to three bounded encoding attempts lower the video budget; a file that still exceeds the limit is rejected rather than misreported. Long clips may lose quality or need a shorter selection. Clipboard exports persist in the launcher's private export cache for pasting and are pruned after 24 hours on a later export.

## Links

The complete local service and native client are prepared, with no deployment and no automatic upload. See `worker/clips/README.md`. Default UI explicitly says hosting is not configured. After configuration, the Share panel creates an unlisted link with expiry, copies it, lists this clip's links and supports revocation. It exports the saved/current cut, crop and audio mix before upload, with a 100 MB cap. Original paths and Firebase tokens are not sent in public links. The local history stores links separately from media metadata.

## Steam event covers

The news reader now separately requests Steam's event metadata. Events are matched by announcement ID to the official news feed for the requested app, rather than by title. Localized title/capsule image hashes resolve against the event's Steam clan CDN. Major updates use the matching Steam event label. A missing or failed event request leaves normal article images/game-artwork fallbacks available. Event artwork never blocks the primary news request, and article images retain their context even when the event has a different cover.

## Verification

- Unit and real FFmpeg tests cover multi-cut normalization/history, draft validation, PCM timing/memory bounds, event-cover matching, three-channel audio, mute isolation, portrait/square dimensions, duration and actual byte limits.
- The clip Electron fixture tests removed-section playback/seek, Undo/Redo, persistent cuts/output, real portrait export, Discord file rendering and honest hosting status, alongside the existing capture, audio-continuity, drafts, gallery exports, fullscreen and legacy playback checks. Its clipboard action is mocked so it does not replace the user's clipboard.
- The media Electron fixture tests Steam event covers and retains the existing article parsing, safe images, search, layout, trailer/fullscreen, and storage artwork checks.
- Test files and evidence are under `tests/clips-next-*.log`, `.cache/clip-studio`, and `.cache/game-media`.
