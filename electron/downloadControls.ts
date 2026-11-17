export type DownloadAction = 'pause' | 'resume' | 'cancel'
export type DownloadControlResult = { handled: boolean; success?: boolean; error?: string }

/** Only the owning engine acts on a job. IPC failures must reach the UI. */
export async function controlDownload(invoke: (channel: string, id: string) => Promise<DownloadControlResult>, action: DownloadAction, id: string): Promise<void> {
  for (const engine of ['http-download', 'torrent']) {
    const result = await invoke(`${engine}:${action}`, id)
    if (!result?.handled) continue
    if (result.success === false) throw new Error(result.error || 'Download action failed')
    return
  }
  if (action === 'cancel') return // Cancellation is idempotent if completion won the race.
  throw new Error('Download is no longer available')
}
