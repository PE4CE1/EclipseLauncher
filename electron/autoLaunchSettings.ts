import type { App } from 'electron'
import type { AutoLaunchStatus } from '../src/types/system'

export function isAutoStart(argv: string[]): boolean { return argv.includes('--autostart') || argv.includes('--hidden') }
export function shouldStartHidden(packaged: boolean, argv: string[], minimized: boolean): boolean {
  return packaged && isAutoStart(argv) && (minimized || argv.includes('--hidden'))
}

export function createAutoLaunchSettings(application: Pick<App, 'isPackaged' | 'setLoginItemSettings' | 'getLoginItemSettings'>, executable: string, platform = process.platform, entryName = 'com.eclipse.launcher') {
  const supported = platform === 'win32' && application.isPackaged
  const options = (minimized: boolean) => ({ name: entryName, path: executable, args: ['--autostart', ...(minimized ? ['--hidden'] : [])] })
  function read(minimized: boolean): AutoLaunchStatus {
    if (!supported) return { supported: false, registered: false, enabled: false, blocked: false, minimized }
    const current = application.getLoginItemSettings(options(minimized))
    // The entry name must match the app's AppUserModelID. openAtLogin checks the
    // exact command line; launchItems.args drops --switches on Windows.
    const own = current.launchItems?.filter(item => item.name === entryName && item.scope !== 'machine' && item.path?.toLowerCase() === executable.toLowerCase())
    const registered = current.openAtLogin
    const blocked = !!own?.some(item => !item.enabled) || registered && current.executableWillLaunchAtLogin === false
    return { supported, registered, enabled: registered && !blocked, blocked, minimized }
  }
  function apply(enabled: boolean, minimized: boolean, approved = true): AutoLaunchStatus {
    if (!supported) return read(minimized)
    application.setLoginItemSettings({ ...options(minimized), openAtLogin: enabled, enabled: approved })
    const result = read(minimized)
    if (result.registered !== enabled) throw new Error('Windows did not save the Eclipse startup setting.')
    if (enabled && result.enabled !== approved) throw new Error('Windows did not save the Eclipse startup approval. Check Windows Startup Apps.')
    return result
  }
  function reconcile(enabled: boolean, minimized: boolean): AutoLaunchStatus {
    const current = read(minimized)
    if (!supported || enabled && (current.blocked || current.enabled)) return current
    return apply(enabled, minimized)
  }
  return { read, apply, reconcile }
}

export function commitStartupSettings<T extends Record<string, unknown>>(current: T, patch: Record<string, unknown>, write: (next: T) => void, apply: (enabled: boolean, minimized: boolean) => unknown, rollback?: () => void): T {
  const changed = ['startOnBoot', 'startMinimized'].some(key => Object.prototype.hasOwnProperty.call(patch, key))
  for (const key of ['startOnBoot', 'startMinimized']) if (Object.prototype.hasOwnProperty.call(patch, key) && typeof patch[key] !== 'boolean') throw new Error('Invalid startup setting')
  const next = { ...current, ...patch }
  try {
    if (changed) apply(next.startOnBoot !== false, next.startMinimized === true)
    write(next)
    return next
  } catch (error) {
    if (changed) { try { if (rollback) rollback(); else apply(current.startOnBoot !== false, current.startMinimized === true) } catch {} }
    throw error
  }
}
