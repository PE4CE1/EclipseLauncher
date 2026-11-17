import { useEffect, useState } from 'react'

export function observeWindowActivity(changed: (active: boolean) => void) {
  let disposed = false, revision = 0, nativeHidden = document.hidden
  const sync = () => {
    document.body.classList.toggle('app-minimized', nativeHidden || document.hidden)
    changed(!nativeHidden && !document.hidden && document.hasFocus())
  }
  const focus = () => { revision++; nativeHidden = false; sync() }
  const blur = () => { revision++; changed(false) }
  const visibility = () => { revision++; nativeHidden = document.hidden; sync() }
  const minimize = () => { revision++; nativeHidden = true; sync() }
  const restore = () => { revision++; nativeHidden = false; sync() }
  window.addEventListener('focus', focus); window.addEventListener('blur', blur)
  document.addEventListener('visibilitychange', visibility)
  const offMinimize = window.electronAPI?.onAppMinimized?.(minimize)
  const offRestore = window.electronAPI?.onAppRestored?.(restore)
  const requestedAt = revision
  void window.electronAPI?.getWindowState?.().then(state => {
    if (!disposed && revision === requestedAt) { nativeHidden = !state.visible || state.minimized; sync() }
  }).catch(() => {})
  sync()
  return () => {
    disposed = true
    window.removeEventListener('focus', focus); window.removeEventListener('blur', blur)
    document.removeEventListener('visibilitychange', visibility)
    offMinimize?.(); offRestore?.(); document.body.classList.remove('app-minimized')
  }
}

export function useWindowActivity() {
  const [active, setActive] = useState(() => !document.hidden && document.hasFocus())
  useEffect(() => observeWindowActivity(setActive), [])
  return active
}
