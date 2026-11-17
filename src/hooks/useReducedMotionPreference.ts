import { useSyncExternalStore } from 'react'

let media: MediaQueryList | undefined
function query(): MediaQueryList | undefined {
  if (!media && typeof window !== 'undefined' && typeof window.matchMedia === 'function') media = window.matchMedia('(prefers-reduced-motion: reduce)')
  return media
}
function subscribe(listener: () => void): () => void {
  const target = query()
  target?.addEventListener('change', listener)
  return () => target?.removeEventListener('change', listener)
}

// Framer Motion 11 snapshots this preference only on mount. Store transitions
// must also react when the Windows accessibility setting changes while open.
export function useReducedMotionPreference(): boolean {
  return useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => true)
}
