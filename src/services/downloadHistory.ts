export interface DownloadSpeedSample { at: number; speed: number }
export const DOWNLOAD_HISTORY_MS = 120_000
export function sampleDownloadSpeed(history: DownloadSpeedSample[], at: number, speed: number): DownloadSpeedSample[] {
  if (!Number.isFinite(at)) return history
  const last = history.at(-1)
  if (last && at < last.at) return history
  const point = { at, speed: Number.isFinite(speed) ? Math.max(0, speed) : 0 }
  const result = history.filter(sample => sample.at >= at - DOWNLOAD_HISTORY_MS)
  if (last && at - last.at < 500) result[result.length - 1] = point
  else result.push(point)
  return result.slice(-121)
}
