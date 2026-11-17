import type { ClipEditState, ClipExportRequest } from './clipEdits'
import type { EclipseClip } from '../types/game'

// Use decimal MB so the final file stays within the configured 20 MB budget.
export const DISCORD_FILE_LIMIT_BYTES = 20_000_000

export function clipExportRequest(clip: Pick<EclipseClip, 'filePath' | 'title' | 'editDraft'>, edit: ClipEditState | undefined = clip.editDraft?.state): ClipExportRequest {
  return {
    filePath: clip.filePath,
    suggestedName: edit?.title || clip.title,
    ...(edit ? { trimStart: edit.start, trimEnd: edit.end, gameVolume: edit.gameVolume, micVolume: edit.micVolume,
      discordVolume: edit.discordVolume, ...(edit.desktopVolume !== undefined ? { desktopVolume: edit.desktopVolume } : {}), cuts: edit.cuts, output: edit.output, cropX: edit.cropX } : {}),
  }
}
