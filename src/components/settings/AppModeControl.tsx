import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Loader2, X } from 'lucide-react'
import { runtimeMode } from '../../services/runtimeMode'
import { useGameStore } from '../../store/gameStore'
import { useClipStore } from '../../store/clipStore'
import { stopReplayBuffer } from '../../services/clipEngineLifecycle'
import { useDialogFocus } from '../../hooks/useDialogFocus'

export function AppModeControl({ menu = false }: { menu?: boolean }) {
  const de = useGameStore(state => state.settings.language === 'de'), clips = runtimeMode === 'clips'
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null), pending = useRef(false)
  const label = clips ? (de ? 'Zum vollständigen Launcher wechseln' : 'Switch to full launcher') : (de ? 'Clips-Modus aktivieren' : 'Enable Clips mode')
  useDialogFocus(dialog, () => { if (!pending.current) setOpen(false) }, open)
  useEffect(() => { if (open) setError('') }, [open])
  async function switchMode() {
    if (pending.current) return
    const state = useClipStore.getState()
    if (state.isSavingClip || state.pendingClips.length || state.isRecording || state.isTrimmerOpen) {
      setError(de ? 'Bitte Aufnahme oder Clip-Bearbeitung zuerst beenden und das Speichern abwarten.' : 'Finish recording or editing and wait for clips to save first.'); return
    }
    pending.current = true; setBusy(true); setError('')
    
    try {
      if (!window.electronAPI?.switchAppMode) throw new Error(de ? 'Bitte Eclipse vollständig neu starten, um den Moduswechsel zu laden.' : 'Restart Eclipse to load mode switching.')
      const result = await window.electronAPI.switchAppMode(clips ? 'launcher' : 'clips')
      if (!result.success) throw new Error(result.error)
      stopReplayBuffer()
      useGameStore.getState().updateSettings({ appMode: clips ? 'launcher' : 'clips' })
    } catch (reason) {
      setError(de ? 'Wechsel nicht möglich. Bitte laufende Downloads oder Clip-Aufgaben beenden und erneut versuchen.' : reason instanceof Error ? reason.message : 'Unable to switch mode')
      pending.current = false; setBusy(false)
    }
  }
  return <>
    {menu ? <button type="button" data-app-mode-switch onClick={() => setOpen(true)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs text-white/75 hover:text-white hover:bg-white/[0.06]"><ArrowLeftRight size={15}/><span>{label}</span></button> : <section className="settings-glass-card p-5 rounded-xl border border-white/10" data-app-mode-setting><div className="flex items-center justify-between gap-5"><div><h3 className="text-sm font-semibold">{de ? 'App-Modus' : 'App mode'}</h3><p className="mt-1 text-xs text-white/45">{clips ? 'Eclipse Clips' : (de ? 'Vollständiger Launcher' : 'Full launcher')}</p></div><button type="button" data-app-mode-switch className="px-3 py-2 rounded-lg bg-white/[0.06] border border-white/10 text-xs hover:bg-white/10" onClick={() => setOpen(true)}>{label}</button></div><p className="text-xs text-white/40 mt-3 leading-relaxed">{de ? 'Clips, Freunde und Discord bleiben aktiv. Shop, Bibliothek, Downloads und zusätzliche Launcher-Dienste werden im Clips-Modus nicht gestartet.' : 'Clips, friends and Discord stay active. The store, library, downloads and extra launcher services do not start in Clips mode.'}</p></section>}
    {open && createPortal(<div data-app-mode-dialog className="fixed inset-0 z-[10000] bg-black/65 flex items-center justify-center p-5" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOpen(false) }}><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="app-mode-title" className="w-full max-w-md bg-[#121214] border border-white/10 rounded-2xl p-6 shadow-2xl"><div className="flex justify-between gap-3"><h2 id="app-mode-title" className="text-lg font-semibold">{label}</h2><button data-dialog-close type="button" disabled={busy} onClick={() => setOpen(false)} aria-label={de ? 'Schließen' : 'Close'}><X size={18}/></button></div><p className="text-sm text-white/55 mt-4 leading-relaxed">{de ? 'Eclipse startet für den Wechsel neu. Gespeicherte Clips und deine Launcher-Einstellungen bleiben erhalten. Der aktuelle Replay-Puffer wird beim Neustart geleert.' : 'Eclipse restarts to switch modes. Saved clips and your launcher settings are kept. The current replay buffer is cleared on restart.'}</p>{error && <p role="alert" className="text-xs text-orange-200 mt-4">{error}</p>}<div className="flex justify-end gap-2 mt-6"><button type="button" disabled={busy} className="px-3 py-2 text-sm text-white/60" onClick={() => setOpen(false)}>{de ? 'Abbrechen' : 'Cancel'}</button><button type="button" disabled={busy} onClick={() => void switchMode()} className="px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold flex items-center gap-2 disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin"/>}{de ? 'Wechseln & neu starten' : 'Switch & restart'}</button></div></div></div>, document.body)}
  </>
}

