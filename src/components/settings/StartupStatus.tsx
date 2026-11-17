import { useEffect, useState } from 'react'
import type { AutoLaunchStatus } from '../../types/system'

export function StartupStatus({ enabled, minimized, language }: { enabled: boolean; minimized: boolean; language: string }) {
  const de = language === 'de'
  const [status, setStatus] = useState<AutoLaunchStatus | null>(null), [error, setError] = useState(false)
  useEffect(() => {
    let disposed = false
    const refresh = () => { void window.electronAPI?.getAutoLaunchStatus?.().then(value => { if (!disposed) { setStatus(value); setError(false) } }).catch(() => { if (!disposed) setError(true) }) }
    const timer = setTimeout(refresh, 150)
    window.addEventListener('focus', refresh)
    return () => { disposed = true; clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [enabled, minimized])
  if (!status && !error) return null
  return <div className="settings-startup-status flex flex-wrap items-center justify-between gap-3 text-xs text-white/50" aria-live="polite">
    <span>{error ? (de ? 'Der Windows-Autostartstatus konnte nicht geprüft werden.' : 'Could not check the Windows startup status.') : !status?.supported ? (de ? 'Autostart wird in der installierten Windows-Version angewendet.' : 'Startup settings apply to the installed Windows build.') : status.blocked ? (de ? 'Eclipse ist in den Windows-Autostart-Apps deaktiviert.' : 'Eclipse is disabled in Windows Startup Apps.') : status.enabled ? (status.minimized ? (de ? 'Windows-Autostart aktiv · Start im Infobereich' : 'Windows startup enabled · Starts in the system tray') : (de ? 'Windows-Autostart aktiv · Fenster wird geöffnet' : 'Windows startup enabled · Opens the window')) : (de ? 'Windows-Autostart deaktiviert' : 'Windows startup disabled')}</span>
    {status?.supported && <button type="button" className="px-3 py-1.5 border border-white/10 rounded-md hover:bg-white/5 hover:text-white" onClick={() => { void window.electronAPI?.openStartupSettings?.().catch(() => setError(true)) }}>{de ? 'Windows-Autostart öffnen' : 'Open Windows startup settings'}</button>}
  </div>
}
