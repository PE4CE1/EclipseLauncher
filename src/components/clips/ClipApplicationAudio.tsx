import { useEffect, useRef, useState } from 'react'
import { SettingsToggle, SettingsSelect, SettingsRow } from './ClipSettingsControls'
import { resolveClipAudioSelection, type AudioApplication, type AudioGame } from '../../services/clipAudioSelection'
import type { ClipSettings } from '../../types/game'

export function ClipApplicationAudio({ settings, onChange, de }: { settings: ClipSettings; onChange: (patch: Partial<ClipSettings>) => void; de: boolean }) {
  const [applications, setApplications] = useState<AudioApplication[]>([])
  const [game, setGame] = useState<AudioGame | null>(null)
  const [supported, setSupported] = useState(false)
  const [revision, setRevision] = useState(0)
  const [failed, setFailed] = useState(false)
  const current = useRef({ settings, onChange })
  current.current = { settings, onChange }

  useEffect(() => {
    let live = true, busy = false, queued = false
    const refresh = async () => {
      if (!live) return
      if (busy) { queued = true; return }
      busy = true
      try {
        const result = await window.electronAPI?.clips?.audioProcesses?.()
        if (!live || !result) return
        setSupported(result.supported); setApplications(result.processes); setGame(result.detectedGame || null); setFailed(false)
        const selected = resolveClipAudioSelection(current.current.settings.gameAudioProcess, result.processes, result.detectedGame || null)
        if (result.supported && selected.fallback) current.current.onChange({ gameAudioProcess: 'auto' })
      } catch { if (live) setFailed(true) }
      finally { busy = false; if (queued && live) { queued = false; void refresh() } }
    }
    void refresh()
    const tick = setInterval(() => { if (!document.hidden) void refresh() }, 5000)
    const focus = () => { void refresh() }
    const start = window.electronAPI?.onGameStarted?.(focus)
    const stop = window.electronAPI?.onGameStopped?.(focus)
    window.addEventListener('focus', focus)
    return () => { live = false; clearInterval(tick); start?.(); stop?.(); window.removeEventListener('focus', focus) }
  }, [revision])

  const selected = resolveClipAudioSelection(settings.gameAudioProcess, applications, game)
  const automatic = (de ? 'Automatisch' : 'Automatic') + (game?.name ? ' · ' + game.name : ' · ' + (de ? 'Warte auf ein Spiel' : 'Waiting for a game'))
  const options = [
    { value: 'auto', label: automatic },
    { value: 'none', label: de ? 'Kein Spielton' : 'No game audio' },
    ...applications.filter(item => !/^discord(?:ptb|canary)?\.exe$/i.test(item.name)).map(item => ({ value: item.name, label: item.name })),
  ].filter((item, index, all) => all.findIndex(other => other.value.toLowerCase() === item.value.toLowerCase()) === index)
  const value = selected.mode === 'manual' ? selected.name! : selected.mode === 'none' ? 'none' : 'auto'
  return <>
    <SettingsToggle id="clip-setting-app-audio" title={de ? 'Spiel und Discord getrennt' : 'Separate game and Discord'} description={supported ? (de ? 'Nimmt Spiel und Discord einzeln auf. Weiteren PC-Ton kannst du als zusätzliche Desktop-Spur einschalten.' : 'Captures game and Discord as individual tracks. You can include other PC audio with the additional desktop track.') : (de ? 'Benötigt Windows 11 oder Windows ab Build 20348 und den Eclipse-Audiohelfer.' : 'Requires Windows 11 or build 20348+ and the Eclipse audio helper.')} checked={!!settings.separateApplications&&supported} disabled={!supported} onChange={() => onChange({ separateApplications: !settings.separateApplications })} />
      <SettingsSelect id="clip-setting-game-process" title={de ? 'Spiel-Anwendung' : 'Game application'} disabled={!supported} description={!settings.separateApplications ? (de ? 'Die Auswahl bleibt gespeichert und wird bei getrennter Anwendungsaufnahme verwendet.' : 'Your selection is saved and used when separate application capture is enabled.') : selected.mode === 'auto' ? (de ? 'Folgt dem aktuellen Spiel auch bei Spielwechseln und Neustarts. Ohne Spiel wird kein fremder Ton aufgenommen.' : 'Follows the current game across game changes and restarts. No unrelated audio is captured when no game is running.') : undefined} value={value} options={options} onChange={gameAudioProcess => onChange({ gameAudioProcess })} />
      <SettingsToggle id="clip-setting-discord" title={de ? 'Discord als eigene Spur' : 'Record Discord separately'} disabled={!supported} description={!settings.separateApplications ? (de ? 'Gilt bei getrennter Anwendungsaufnahme. Discord kann weiterhin im Desktop-Ton enthalten sein.' : 'Applies to separate application capture. Discord may still be included in desktop sound.') : undefined} checked={settings.captureDiscord === true} onChange={() => onChange({ captureDiscord: !settings.captureDiscord })} />
      <SettingsToggle id="clip-setting-separate-desktop" title={de ? 'Desktop-Ton als eigene Spur' : 'Record desktop sound separately'} description={de ? 'Nimmt zusätzlich den gesamten PC-Ton auf, etwa YouTube und Musik. Der Desktop-Mix enthält auch Spiel und Discord; zur Vermeidung von doppeltem Ton werden diese beim Abspielen zunächst stummgeschaltet und bleiben einzeln verfügbar.' : 'Also records all PC audio, including YouTube and music. The desktop mix includes game and Discord; their individual tracks start muted to avoid duplicate sound and remain available for editing.'} checked={settings.captureDesktop === true} onChange={() => onChange({ captureDesktop: !settings.captureDesktop })} />
      <SettingsRow title={de ? 'Anwendungen aktualisieren' : 'Refresh applications'} description={failed ? (de ? 'Anwendungen konnten nicht aktualisiert werden. Die aktuelle Quelle bleibt erhalten.' : 'Could not refresh applications. The current source is preserved.') : (de ? 'Die Auswahl wird automatisch aktualisiert. Du kannst eine laufende Anwendung auch manuell auswählen.' : 'The selection refreshes automatically. You can also choose a running application manually.')}><button type="button" className="clip-settings-button" onClick={() => setRevision(value => value + 1)}>{de ? 'Aktualisieren' : 'Refresh'}</button></SettingsRow>
  </>
}
