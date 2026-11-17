import { useSyncExternalStore } from 'react'
import type { MetricsData } from './widgets/Performance'

let snapshot: MetricsData = { idleTime: 0 }
const listeners = new Set<() => void>()
let unsubscribe: (() => void) | undefined

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!unsubscribe) unsubscribe = window.electronAPI?.onMetricsUpdate?.(data => {
    const next = data as MetricsData
    const keys = new Set([...Object.keys(snapshot), ...Object.keys(next)])
    if ([...keys].every(key => Object.is((snapshot as any)[key], (next as any)[key]))) return
    snapshot = next
    listeners.forEach(notify => notify())
  })
  return () => {
    listeners.delete(listener)
    if (!listeners.size) { unsubscribe?.(); unsubscribe = undefined }
  }
}

// Hardware ticks update only widgets that consume them, not the full transparent
// window, controller iframe, crosshair, media controls and edit layout.
export function useOverlayMetrics<T>(select: (data: MetricsData) => T): T {
  return useSyncExternalStore(subscribe, () => select(snapshot), () => select(snapshot))
}
