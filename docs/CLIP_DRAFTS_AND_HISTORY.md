# Clip selection, drafts and undo

Implemented 2026-11-01.

## Selection playback

The selection is the playback boundary for both video and independent audio. Seeking with the timeline, keyboard or transport clamps to the selected start/end. Playing at the endpoint starts again at the selection start; scrubbing beyond the endpoint stops there. Changing trim bounds immediately reconciles the media position and playhead. End checks run on the video events, animation frames and a rate-aware boundary timer. Buffering, seeking, speed changes, pausing and unmount clear/reschedule the timer. The transport shows elapsed/total time for the selection; the ruler retains absolute source times.

## Drafts

`ClipEditDraft` stores the current title, start/end and the two audio gains, plus the original title, source duration, schema version and server save timestamp. Drafts live with the clip's metadata in `clips_metadata.json` under Electron user data. The video and audio originals remain unchanged. The existing atomic JSON writer preserves the previous file if a write fails.

Edits save after 500 ms of inactivity; title blur, closing, hiding the document and page exit flush pending work. Writes are serialized per clip across editor instances, so closing/reopening and discarding cannot reorder stale saves over newer edits. Saves update the gallery optimistically; actual failures remain visible with retry. Returning to the original state removes the draft. The gallery marks edited clips and offers an Entwürfe/Drafts filter next to its count.

Exporting from either the editor or the gallery applies the saved selection and both gains. The copy action is labelled Copy original / Original kopieren for clips with drafts, because it still copies the untouched source file.

Analysis merges only media facts into fresh metadata, preserving drafts saved while waveform extraction is running. Cached analysis overlays the latest title/tags/draft. IPC checks managed clip existence, clip IDs and bounded finite editing values; no supplied file paths are accepted by the draft endpoint. Deleting a clip removes its draft with its metadata.

## Undo/redo

The active editor holds up to 100 undo steps. A complete trim drag, focused text/number edit or volume gesture becomes one step. Buttons and Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y operate on title, trim and both gains. A new edit clears redo; cancelled trim gestures retain it. Changing measured duration clamps all history states without creating a fake user edit. Resetting selection and discarding a draft can also be undone/redone.

The current draft survives application restart. The undo stack belongs to the current editor session and is not stored on disk. After reopening, the saved draft is the starting point; discarding it restores the original title, full range and default gains without modifying the media.

## Verification

- TypeScript, 190 passing unit tests and the production renderer/main/preload build.
- Pure model tests cover selection bounds, gesture grouping, field isolation, redo invalidation, cancellation, bounded memory, duration changes, schema checks and ordered writes/retry.
- Native IPC tests cover persistent readback, original-title restoration, malformed input, deletion, failed atomic writes and saves concurrent with cached/in-progress analysis.
- Native Electron playback checks seek bounds, 2× selection playback and playhead limits, shrinking a playing selection, one undo per drag, keyboard shortcuts, autosave/readback after renderer reload, draft filtering, discard undo/redo, and real exported duration from the restored draft in both editor and gallery. The normal audio-continuity, capture, fullscreen, legacy-media and cleanup checks also run.
- Artifacts: `.cache/clip-studio/verification.json`, `draft-verification.json`, `editor-en.png`; `tests/clip-edits-unit.log`, `tests/clip-edits-all-tests.log`, `tests/clip-edits-build.log`, `tests/clip-edits-electron.log`.

Restart the complete launcher to activate the new preload/IPC endpoint.
