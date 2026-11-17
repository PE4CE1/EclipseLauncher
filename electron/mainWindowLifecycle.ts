import type { BrowserWindow } from 'electron'
import type { MainWindowState } from '../src/types/system'

export function mainWindowState(window: BrowserWindow | null): MainWindowState {
  if (!window || window.isDestroyed()) return { visible: false, minimized: true, focused: false }
  return { visible: window.isVisible(), minimized: window.isMinimized(), focused: window.isFocused() }
}

export function bindMainWindowLifecycle(window: BrowserWindow, startHidden: boolean, beforeRecovery?: (reason: 'oom' | 'unresponsive' | 'crashed') => Promise<boolean>) {
  let shownOrDismissed = startHidden, disposed = false
  let recoveryAt = 0, recoveries = 0
  let recovering = false, unresponsiveTimer: NodeJS.Timeout | undefined
  const live = () => !disposed && !window.isDestroyed() && !window.webContents.isDestroyed()
  const publish = () => {
    if (!live()) return
    const state = mainWindowState(window)
    window.webContents.send(state.visible && !state.minimized ? 'app:restored' : 'app:minimized')
    if (state.visible && !state.minimized) window.webContents.invalidate()
  }
  const reveal = () => {
    if (!live()) return
    shownOrDismissed = true
    if (window.isMinimized()) window.restore()
    if (window.webContents.isCrashed()) { recoveries = 0; recover({}, { reason: 'crashed' }) }
    window.setSkipTaskbar(false)
    if (!window.isVisible()) window.show()
    window.focus()
    publish()
  }
  const autoShow = () => { if (!shownOrDismissed) reveal(); else publish() }
  const hide = () => { shownOrDismissed = true; publish() }
  const focus = () => publish()
  const recover = (_event: unknown, details: { reason: string }) => {
    if (!live() || recovering || details.reason === 'clean-exit') return
    const now = Date.now()
    if (now - recoveryAt > 60_000) recoveries = 0
    if (recoveries >= 2) return
    recoveryAt = now; recoveries++
    if (!beforeRecovery) { window.reload(); return }
    recovering = true
    void beforeRecovery(details.reason === 'oom' ? 'oom' : details.reason === 'unresponsive' ? 'unresponsive' : 'crashed').then(released => {
      if (live() && (released || details.reason !== 'unresponsive')) window.reload()
    }).catch(error => { console.error('[MainWindow] Recovery failed:', error) }).finally(() => { recovering = false })
  }
  const responsive = () => { clearTimeout(unresponsiveTimer); unresponsiveTimer = undefined }
  const unresponsive = () => {
    if (!beforeRecovery || unresponsiveTimer) return
    unresponsiveTimer = setTimeout(() => { unresponsiveTimer = undefined; recover({}, { reason: 'unresponsive' }) }, 3000)
    unresponsiveTimer.unref()
  }
  window.on('minimize', hide); window.on('hide', hide)
  window.on('restore', publish); window.on('show', publish); window.on('focus', focus)
  window.on('unresponsive', unresponsive); window.on('responsive', responsive)
  window.once('ready-to-show', autoShow)
  window.webContents.on('did-finish-load', autoShow)
  window.webContents.on('render-process-gone', recover)
  const fallback = setTimeout(autoShow, 2500)
  fallback.unref()
  function dispose() {
    disposed = true; clearTimeout(fallback); responsive()
    window.removeListener('minimize', hide); window.removeListener('hide', hide)
    window.removeListener('restore', publish); window.removeListener('show', publish); window.removeListener('focus', focus)
    window.removeListener('unresponsive', unresponsive); window.removeListener('responsive', responsive)
    window.removeListener('ready-to-show', autoShow)
    window.webContents.removeListener('did-finish-load', autoShow); window.webContents.removeListener('render-process-gone', recover)
  }
  window.once('closed', dispose)
  return { reveal, publish }
}
