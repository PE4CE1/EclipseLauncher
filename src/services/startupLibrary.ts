import { warmLibraryArtwork, type CoverProgress } from './libraryArtwork'
import type { InstalledGame, LibraryGame } from '../types/game'

export interface StartupLibraryProgress extends CoverProgress { stage: 'scan' | 'covers' }
interface Options {
  scan?: (options: { signal: AbortSignal; awaitEnrichment: boolean; onInitialGames: () => void }) => Promise<unknown>
  getGames: () => Array<InstalledGame | LibraryGame>
  signal: AbortSignal
  onProgress: (progress: StartupLibraryProgress) => void
  timeoutMs?: number
}

export async function prepareStartupLibrary(options: Options): Promise<CoverProgress & { timedOut: boolean }> {
  const controller = new AbortController()
  let timedOut = false
  let progress: CoverProgress = { completed: 0, total: 0, loaded: 0, failed: 0 }
  const abort = () => controller.abort()
  const deadline = setTimeout(() => { timedOut = true; abort() }, options.timeoutMs ?? 25000)
  options.signal.addEventListener('abort', abort, { once: true })
  if (options.signal.aborted) abort()
  let resolveAborted!: () => void
  const aborted = new Promise<void>(resolve => { resolveAborted = resolve })
  controller.signal.addEventListener('abort', resolveAborted, { once: true })
  if (controller.signal.aborted) resolveAborted()
  try {
    let earlyArtwork: Promise<CoverProgress> | undefined
    const warm = () => warmLibraryArtwork(options.getGames(), controller.signal, update => {
      progress = update
      if (!controller.signal.aborted) options.onProgress({ stage: 'covers', ...progress })
    })
    const startArtwork = () => {
      if (!earlyArtwork && !controller.signal.aborted) earlyArtwork = warm().catch(error => {
        console.warn('[StartupLibrary] Early artwork preparation failed:', error)
        return { ...progress }
      })
    }
    options.onProgress({ stage: 'scan', ...progress })
    if (options.scan && !controller.signal.aborted) {
      await Promise.race([options.scan({ signal: controller.signal, awaitEnrichment: true, onInitialGames: startArtwork }).catch(error => {
        console.warn('[StartupLibrary] Using cached library after scan failure:', error)
      }), aborted])
    }
    if (!controller.signal.aborted) {
      if (earlyArtwork) await Promise.race([earlyArtwork, aborted])
      // The second pass only prepares additions or newly resolved non-Steam IDs.
      if (!controller.signal.aborted) await Promise.race([warm(), aborted])
    }
    return { ...progress, timedOut }
  } finally {
    clearTimeout(deadline)
    options.signal.removeEventListener('abort', abort)
    controller.abort()
  }
}

export function waitForStartupMinimum(startedAt: number, signal: AbortSignal, minimumMs = 3500): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise(resolve => {
    const done = () => { clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
    const timer = setTimeout(done, Math.max(0, minimumMs - (Date.now() - startedAt)))
    signal.addEventListener('abort', done, { once: true })
  })
}
