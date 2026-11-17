import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

type Access = { supported: boolean; ready: boolean; pending: boolean }

export function FpsAccessPanel({ language }: { language: string }) {
  const [access, setAccess] = useState<Access | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const de = language === 'de'
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => window.electronAPI?.getFpsAccess?.().then((state: Access) => {
      if (!active) return
      setAccess(state)
      clearTimeout(timer)
      if (state.pending) timer = setTimeout(refresh, 750)
    }).catch(() => {})
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; clearTimeout(timer); window.removeEventListener('focus', refresh) }
  }, [])
  if (!access?.supported) return null
  const activate = async () => {
    if (busy || access.ready) return
    setBusy(true)
    setError('')
    try {
      const result = await window.electronAPI?.enableFpsAccess?.()
      if (!result?.success) setError(result?.error === 'cancelled'
        ? (de ? 'Windows-Freigabe abgebrochen.' : 'Windows approval cancelled.')
        : (de ? 'Der FPS-Helfer konnte nicht gestartet werden.' : 'The FPS helper could not start.'))
      const updated = await window.electronAPI?.getFpsAccess?.()
      if (updated) setAccess(updated)
    } catch { setError(de ? 'Die Freigabe ist momentan nicht verfügbar.' : 'Approval is currently unavailable.') }
    finally { setBusy(false) }
  }
  return <div className="px-4 py-3 border-t border-white/[0.06] flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p className="text-xs font-medium text-white/80">{de ? 'Echte Spiel-FPS' : 'Actual game FPS'}</p>
      <p className="text-[11px] text-white/45 leading-relaxed mt-1 max-w-lg">{de
        ? 'Windows fragt einmal nach der Freigabe für den FPS-Helfer. Sie gilt bis zum Beenden von Eclipse. Der Launcher behält normale Rechte.'
        : 'Windows asks once to approve the FPS helper, until Eclipse closes. The launcher keeps standard permissions.'}</p>
      {error && <p role="status" className="text-[11px] text-amber-200/80 mt-1">{error}</p>}
    </div>
    <button id="fps-enable-access" type="button" onClick={activate} disabled={busy || access.ready || access.pending}
      className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.05] hover:bg-white/10 text-xs text-white/85 disabled:opacity-50 disabled:cursor-default transition-colors">
      <ShieldCheck size={14} />{access.ready ? (de ? 'Bereit' : 'Ready') : busy || access.pending ? (de ? 'Windows bestätigen…' : 'Approve in Windows…') : (de ? 'FPS-Zugriff aktivieren' : 'Enable FPS access')}
    </button>
  </div>
}
