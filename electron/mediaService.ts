import { app, BrowserWindow, globalShortcut } from 'electron'
import { initMediaCoordinator, stopMediaCoordinator, setPreferredMediaFilter, mediaToggle, mediaNext, mediaPrev } from './mediaCoordinator'
export { detectActiveMedia, mediaToggle, mediaNext, mediaPrev } from './mediaCoordinator'
export type { MediaStatus } from './mediaCoordinator'

export function initMediaIPC(windows:()=>BrowserWindow[]){initMediaCoordinator(windows,registerMediaGlobalHotkeys)}
export function stopMediaService(){stopMediaCoordinator();unregisterAllMediaHotkeys()}
app.once('before-quit',stopMediaService)

let activeMediaHotkeys = {
  playPause: null as string | null,
  next: null as string | null,
  prev: null as string | null,
}

export function registerMediaGlobalHotkeys(
  keybinds: { playPause?: string; next?: string; prev?: string } | undefined,
  getWindows?: () => BrowserWindow[],
  source?: 'all' | 'spotify' | 'youtube'
) {
  if (source) setPreferredMediaFilter(source)
  // 1. Unregister existing hotkeys safely
  if (activeMediaHotkeys.playPause) {
    try { globalShortcut.unregister(activeMediaHotkeys.playPause) } catch {}
    activeMediaHotkeys.playPause = null
  }
  if (activeMediaHotkeys.next) {
    try { globalShortcut.unregister(activeMediaHotkeys.next) } catch {}
    activeMediaHotkeys.next = null
  }
  if (activeMediaHotkeys.prev) {
    try { globalShortcut.unregister(activeMediaHotkeys.prev) } catch {}
    activeMediaHotkeys.prev = null
  }

  if (!keybinds) return

  const normalizeAccelerator = (str: string) => {
    return str.split('+').map(part=>/^(ctrl|control|commandorcontrol)$/i.test(part.trim())?'CommandOrControl':part.trim()).filter(Boolean).join('+')
  }

  // Register playPause
  if (keybinds.playPause && keybinds.playPause.trim()) {
    const raw = keybinds.playPause.trim()
    const hk = normalizeAccelerator(raw)
    try {
      const ok = globalShortcut.register(hk, () => {
        mediaToggle(getWindows).catch(() => {})
      })
      if (ok) activeMediaHotkeys.playPause = hk
    } catch (e) {
      console.warn('[MediaHotkeys] Failed to register playPause hotkey:', raw, e)
    }
  }

  // Register next
  if (keybinds.next && keybinds.next.trim()) {
    const raw = keybinds.next.trim()
    const hk = normalizeAccelerator(raw)
    try {
      const ok = globalShortcut.register(hk, () => {
        mediaNext(getWindows).catch(() => {})
      })
      if (ok) activeMediaHotkeys.next = hk
    } catch (e) {
      console.warn('[MediaHotkeys] Failed to register next hotkey:', raw, e)
    }
  }

  // Register prev
  if (keybinds.prev && keybinds.prev.trim()) {
    const raw = keybinds.prev.trim()
    const hk = normalizeAccelerator(raw)
    try {
      const ok = globalShortcut.register(hk, () => {
        mediaPrev(getWindows).catch(() => {})
      })
      if (ok) activeMediaHotkeys.prev = hk
    } catch (e) {
      console.warn('[MediaHotkeys] Failed to register prev hotkey:', raw, e)
    }
  }
}

export function unregisterAllMediaHotkeys() {
  if (activeMediaHotkeys.playPause) {
    try { globalShortcut.unregister(activeMediaHotkeys.playPause) } catch {}
    activeMediaHotkeys.playPause = null
  }
  if (activeMediaHotkeys.next) {
    try { globalShortcut.unregister(activeMediaHotkeys.next) } catch {}
    activeMediaHotkeys.next = null
  }
  if (activeMediaHotkeys.prev) {
    try { globalShortcut.unregister(activeMediaHotkeys.prev) } catch {}
    activeMediaHotkeys.prev = null
  }
}
