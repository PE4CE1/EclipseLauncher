import type { QueryClient } from '@tanstack/react-query'
import { requestUnusedMediaRelease } from './mediaMemory'
import { releaseMemoryResources } from './memoryResources'
import { useUIStore } from '../store/uiStore'

export function observeMemoryPressure(client: QueryClient) {
  let disposed = false, scheduled: ReturnType<typeof setTimeout> | undefined, idle: number | undefined
  const release = () => {
    idle = undefined
    if (disposed) return
    client.removeQueries({ type: 'inactive', predicate: query => query.getObserversCount() === 0 && query.state.fetchStatus === 'idle' })
    void import('./steamService').then(service => { if (!disposed) service.releaseSteamBrowsingCaches() }).catch(() => {})
    releaseMemoryResources({ catalogueActive: useUIStore.getState().activeView === 'catalogue' })
    requestUnusedMediaRelease()
  }
  const off = window.electronAPI?.onMemoryPressure?.(() => {
    if (scheduled !== undefined || idle !== undefined) return
    scheduled = setTimeout(() => {
      scheduled = undefined
      if (document.hidden || !window.requestIdleCallback) release()
      else idle = window.requestIdleCallback(release, { timeout: 1500 })
    }, 0)
  })
  return () => { disposed = true; off?.(); clearTimeout(scheduled); if (idle !== undefined) window.cancelIdleCallback?.(idle) }
}
