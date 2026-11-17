import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, Check, Film, FolderOpen, Keyboard, Mic, Monitor, Play, RefreshCw, Scissors, SlidersHorizontal } from 'lucide-react'
import { SceneTransition } from '../shared/SceneTransition'
import { useClipStore } from '../../store/clipStore'
import { useGameStore } from '../../store/gameStore'
import { useTranslation } from '../../hooks/useTranslation'
import { sendAppNotification } from '../../services/notificationService'
import { clipBitrateMbps } from '../../services/clipQuality'
import { clipBytes } from './ClipLibraryCard'
import { SettingsGroup as Group, SettingsRow as Row, SettingsToggle as Toggle, SettingsSelect as Select, SettingsRange as Range, SettingsChoices as Choices } from './ClipSettingsControls'
import { ClipApplicationAudio } from './ClipApplicationAudio'
import { ClipCaptureSources, type CaptureSource } from './ClipCaptureSources'
import { ClipMicMeter } from './ClipMicMeter'
import { ClipMicrophoneStatus } from './ClipMicrophoneStatus'
import { ClipAutoSettings } from './ClipAutoSettings'
import { useMicrophoneInputs } from '../../hooks/useMicrophoneInputs'
import { microphoneError } from '../../services/microphoneDevices'
import type { ClipSettings } from '../../types/game'
import {captureErrorMessage} from '../../services/captureErrors'
import './clip-settings.css'

type Tab = 'capture' | 'autoclip' | 'screen' | 'video' | 'audio' | 'hotkeys' | 'storage'

export function ClipSettingsPanel({ onBack }: { onBack?: () => void }) {
  const { language, locale } = useTranslation()
  const de = language === 'de'
  const settings = useClipStore(state => state.settings)
  const setSettings = useClipStore(state => state.setSettings)
  const clips = useClipStore(state => state.clips)
  const refreshClips = useClipStore(state => state.refreshClips)
  const captureStatus = useClipStore(state => state.captureStatus)
  const isReplayBufferActive = useClipStore(state => state.isReplayBufferActive)
  const toastColor = useGameStore(state => state.settings.overlayClipToastColor || '#ff6600')
  const [activeTab, setActiveTab] = useState<Tab>('capture')
  const [sources, setSources] = useState<CaptureSource[]>([])
  const [hardwareVersion, setHardwareVersion] = useState(0)
  const [loadingScreens, setLoadingScreens] = useState(false)
  const [deviceError, setDeviceError] = useState('')
  const [recordingKey, setRecordingKey] = useState(false)
  const [choosingFolder, setChoosingFolder] = useState(false)
  const contentScroll = useRef<HTMLDivElement>(null)
  const keyButton = useRef<HTMLButtonElement>(null)
  const microphones = useMicrophoneInputs(activeTab === 'audio' || activeTab === 'hotkeys', hardwareVersion)
  const loadingDevices = loadingScreens || microphones.loading
  const diskUsage = useMemo(() => clipBytes(clips.reduce((sum, clip) => sum + (clip.fileSize || 0), 0), locale), [clips, locale])
  const notifyError = useCallback((reason: unknown) => {
    sendAppNotification({ title: de ? 'Aktion fehlgeschlagen' : 'Action failed', body: reason instanceof Error ? reason.message : String(reason), type: 'error' })
  }, [de])

  useLayoutEffect(() => {
    contentScroll.current?.scrollTo({ top: 0 })
    setRecordingKey(false)
  }, [activeTab])

  useEffect(() => {
    let active = true
    setDeviceError(''); setLoadingScreens(false)
    if (activeTab !== 'screen') { setSources([]); return }
    setLoadingScreens(true)
    void (async () => {
      try {
        const result = await window.electronAPI?.clips?.getSources?.() || []
        const screens = result.filter(source => /^(screen|window):/.test(source.id))
        if (active) setSources(screens)
      } catch (reason) { if (active) setDeviceError(reason instanceof Error ? reason.message : String(reason)) }
      finally { if (active) setLoadingScreens(false) }
    })()
    return () => { active = false }
  }, [activeTab, hardwareVersion])

  useEffect(() => {
    if (!recordingKey || activeTab !== 'hotkeys') return
    const listener = (event: KeyboardEvent) => {
      event.preventDefault(); event.stopPropagation()
      if (event.key === 'Escape') { setRecordingKey(false); keyButton.current?.focus(); return }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key) || event.repeat || event.metaKey) return
      const keys = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean)
      const key = event.key === ' ' ? 'Space' : event.key === '+' ? 'Plus' : event.key.startsWith('Arrow') ? event.key.slice(5) : event.key.length === 1 ? event.key.toUpperCase() : event.key
      setSettings({ hotkey: [...keys, key].join('+') }); setRecordingKey(false); keyButton.current?.focus()
    }
    window.addEventListener('keydown', listener, true)
    return () => window.removeEventListener('keydown', listener, true)
  }, [recordingKey, activeTab, setSettings])

  const tabs = [
    { id: 'capture' as const, label: de ? 'Aufnahme' : 'Capture', title: de ? 'Aufnahme & Replay' : 'Capture & replay', description: de ? 'Lege fest, wann Eclipse aufnimmt und wie lang deine Clips werden.' : 'Choose when Eclipse records and how much gameplay to keep.', icon: Scissors },
    { id: 'video' as const, label: de ? 'Videoqualität' : 'Video quality', title: de ? 'Videoqualität' : 'Video quality', description: de ? 'Bildqualität, Bildrate und Dateiformat deiner Aufnahmen.' : 'Image quality, frame rate and file format for your recordings.', icon: Film },
    { id: 'audio' as const, label: de ? 'Audio & Mikrofon' : 'Audio & microphone', title: de ? 'Audio & Mikrofon' : 'Audio & microphone', description: de ? 'Passe Desktop-Ton und Mikrofon getrennt an.' : 'Adjust desktop sound and microphone separately.', icon: Mic },
    { id: 'screen' as const, label: de ? 'Bildschirm' : 'Display', title: de ? 'Aufnahmequelle' : 'Capture source', description: de ? 'Wähle einen Monitor oder ein einzelnes Fenster.' : 'Choose a monitor or an individual window.', icon: Monitor },
    { id: 'hotkeys' as const, label: de ? 'Tastenkürzel' : 'Shortcuts', title: de ? 'Tastenkürzel & Sprache' : 'Shortcuts & voice', description: de ? 'Speichere Momente per Tastendruck oder Sprachbefehl.' : 'Save moments with a key combination or voice command.', icon: Keyboard },
    { id: 'autoclip' as const, label: de ? 'Automatische Clips' : 'Automatic clips', title: de ? 'Automatische Clips' : 'Automatic clips', description: de ? 'Eigene Highlights über lokale Spielschnittstellen speichern. Klappe ein Spiel auf, um Ereignisse und Verbindung einzustellen.' : 'Save your highlights through local game interfaces. Expand a game to configure events and its connection.', icon: SlidersHorizontal },
    { id: 'storage' as const, label: de ? 'Speicher' : 'Storage', title: de ? 'Speicher & Dateien' : 'Storage & files', description: de ? 'Verwalte den Speicherort deiner Clips.' : 'Manage where your clips are saved.', icon: FolderOpen },
  ]
  const current = tabs.find(tab => tab.id === activeTab)!
  const micOptions = [{ value: 'auto', label: (de ? 'Standard' : 'Default') + (microphones.defaultLabel ? ' · ' + microphones.defaultLabel : (de ? '-Mikrofon' : ' microphone')) }, ...microphones.inputs.map((device, index) => ({ value: device.deviceId, label: device.label || (de ? 'Mikrofon ' : 'Microphone ') + (index + 1) }))]
  const micId = settings.micDeviceId || 'auto'
  if (!micOptions.some(option => option.value === micId)) micOptions.push({ value: micId, label: de ? 'Gespeichertes Mikrofon (nicht verfügbar)' : 'Saved microphone (unavailable)' })
  const preset = settings.qualityPreset || 'standard'
  const qualityPatch = (patch: Partial<ClipSettings>) => setSettings({ ...patch, qualityPreset: 'custom' })
  const qualityPresets = {
    low: { quality: '480p', fps: 30, bitrate: '1.5M', format: 'mp4', videoEncoder: 'gpu' },
    standard: { quality: '720p', fps: 60, bitrate: '6M', format: 'mp4', videoEncoder: 'gpu' },
    high: { quality: '1080p', fps: 60, bitrate: '10M', format: 'mp4', videoEncoder: 'gpu' },
  } satisfies Record<string, Partial<ClipSettings>>
  const bitrateOptions = [{ value: 'auto', label: de ? 'Automatisch' : 'Automatic' }, ...['30M', '20M', '15M', '10M', '6M', '4M', '2.5M', '1.5M'].map(value => ({ value, label: parseFloat(value).toLocaleString(locale) + ' Mbit/s' }))]
  if (!bitrateOptions.some(option => option.value === (settings.bitrate || '6M'))) bitrateOptions.push({ value: settings.bitrate!, label: clipBitrateMbps(settings.bitrate, settings.quality).toLocaleString(locale) + ' Mbit/s' })
  const voiceOptions = ['clip that', 'eclipse that', 'clip it', 'save clip', 'clip das', 'clip das mal'].map(value => ({ value, label: value }))
  if (settings.voiceCapturePhrase && !voiceOptions.some(option => option.value === settings.voiceCapturePhrase)) voiceOptions.push({ value: settings.voiceCapturePhrase, label: settings.voiceCapturePhrase })
  const setToast = (patch: { overlayClipToastColor?: string; overlayClipNotification?: boolean }) => {
    useGameStore.getState().updateSettings(patch)
    void window.electronAPI?.setSettings?.(patch).catch(notifyError)
  }

  return <div className="clip-settings" data-clip-settings>
    <header className="clip-settings-header">
      <div>
        {onBack && <button type="button" className="clip-settings-back" onClick={onBack}><ArrowLeft size={14} /><span>{de ? 'Zurück zu Clips' : 'Back to Clips'}</span></button>}
        <h1>{de ? 'Clip-Einstellungen' : 'Clip settings'}</h1>
      </div>
      <p>{de ? 'Änderungen werden automatisch gespeichert.' : 'Changes are saved automatically.'}</p>
    </header>
    <div className="clip-settings-body">
      <nav className="clip-settings-nav" aria-label={de ? 'Clip-Einstellungen' : 'Clip settings'}>
        <div>{tabs.map(tab => <button type="button" id={'clip-settings-tab-' + tab.id} key={tab.id} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => setActiveTab(tab.id)}><tab.icon size={15} strokeWidth={1.7} /><span>{tab.label}</span></button>)}</div>
        <p>{clips.length.toLocaleString(locale)} {clips.length === 1 ? 'Clip' : 'Clips'}<span>{diskUsage}</span></p>
      </nav>
      <div ref={contentScroll} className="clip-settings-content view-scroll">
        <SceneTransition sceneKey={activeTab} data-clip-settings-scene={activeTab} className="clip-settings-scene">
          <div className="clip-settings-page-heading">
            <div><h2>{current.title}</h2><p>{current.description}</p></div>
            {['screen', 'audio', 'hotkeys'].includes(activeTab) && <button type="button" className="clip-settings-icon-button" disabled={loadingDevices} onClick={() => setHardwareVersion(value => value + 1)} aria-label={de ? 'Geräte aktualisieren' : 'Refresh devices'} title={de ? 'Geräte aktualisieren' : 'Refresh devices'}><RefreshCw size={14} className={loadingDevices ? 'animate-spin' : ''} /></button>}
          </div>
          {captureStatus.error && <p className="clip-settings-note" role="alert">{captureErrorMessage(captureStatus.errorCode||captureStatus.error,de)}</p>}
          {deviceError && <p className="clip-settings-note" role="alert">{deviceError}</p>}
          {['audio', 'hotkeys'].includes(activeTab) && microphones.error !== undefined && <p className="clip-settings-note" role="alert">{microphoneError(microphones.error, de)}</p>}

          {activeTab === 'capture' && <>
            <Group title={de ? 'Replay-Buffer' : 'Replay buffer'}>
              <Row title={de?'Aufnahme':'Recording'}><span className="clip-settings-readout" data-native-recording>{de?'Windows · Nativ':'Windows · Native'}{captureStatus.encoder?` · ${{'media-foundation-hardware':'GPU','media-foundation-software':'CPU',h264_nvenc:'NVIDIA NVENC',h264_amf:'AMD AMF',h264_qsv:'Intel Quick Sync',libx264:'CPU'}[captureStatus.encoder]||captureStatus.encoder}`:''}</span></Row>
              <Toggle id="clip-setting-enabled" title={de ? 'Replay-Buffer aktivieren' : 'Enable replay buffer'} description={de ? 'Hält die letzten Sekunden zum Clippen bereit.' : 'Keeps recent gameplay ready to clip.'} checked={settings.enabled} onChange={() => setSettings({ enabled: !settings.enabled })} />
              <Row title={de ? 'Cliplänge' : 'Clip length'} description={de ? 'So viel Gameplay wird rückwirkend gespeichert.' : 'How much recent gameplay to save.'}>
                <Choices id="clip-setting-duration" label={de ? 'Cliplänge' : 'Clip length'} value={String(settings.replayDurationSeconds)} options={[15, 30, 45, 60, 90, 120, 180, 300].map(seconds => ({ value: String(seconds), label: seconds < 60 ? seconds + 's' : (seconds / 60).toLocaleString(locale) + 'm' }))} onChange={value => setSettings({ replayDurationSeconds: Number(value) })} />
              </Row>
              <Toggle title={de ? 'Bei Spielstart aufnehmen' : 'Start with a game'} description={de ? 'Startet den Replay-Buffer, sobald Eclipse ein laufendes Spiel erkennt.' : 'Starts the replay buffer when Eclipse detects a running game.'} checked={settings.autoStartOnGame !== false} onChange={() => setSettings({ autoStartOnGame: settings.autoStartOnGame === false })} />
              <Toggle title={de ? 'Beim Start von Eclipse aufnehmen' : 'Start with Eclipse'} description={de ? 'Startet den Replay-Buffer direkt mit dem Launcher.' : 'Starts the replay buffer together with the launcher.'} checked={!!settings.screenRecordingOnAppStart} onChange={() => setSettings({ screenRecordingOnAppStart: !settings.screenRecordingOnAppStart })} />
            </Group>
            <Group title={de ? 'Clip-Bestätigung' : 'Clip confirmation'}>
              <Toggle id="clip-setting-toast" title={de ? 'Benachrichtigung im Spiel' : 'In-game notification'} description={de ? 'Zeigt kurz an, wenn ein Clip gespeichert wurde.' : 'Briefly confirms when a clip has been saved.'} checked={settings.notifyOnClip !== false} onChange={() => { const enabled = settings.notifyOnClip === false; setSettings({ notifyOnClip: enabled }); setToast({ overlayClipNotification: enabled }) }} />
              <Toggle title={de ? 'Bestätigungston' : 'Confirmation sound'} checked={settings.playSoundOnClip !== false} onChange={() => setSettings({ playSoundOnClip: settings.playSoundOnClip === false })} />
              {settings.notifyOnClip !== false && <>
                <Row title={de ? 'Akzentfarbe' : 'Accent color'}>
                  <div className="clip-settings-swatches">{[['#ff6600', 'Orange'], ['#76b900', de ? 'Grün' : 'Green'], ['#00d2ff', 'Cyan'], ['#a855f7', de ? 'Lila' : 'Purple'], ['#ef4444', de ? 'Rot' : 'Red'], ['#ec4899', 'Pink'], ['#f59e0b', 'Gold'], ['#ffffff', de ? 'Weiß' : 'White']].map(([color, label]) => <button type="button" key={color} style={{ '--swatch': color } as CSSProperties} aria-label={label} title={label} aria-pressed={toastColor.toLowerCase() === color} onClick={() => setToast({ overlayClipToastColor: color })}>{toastColor.toLowerCase() === color && <Check size={11} />}</button>)}</div>
                </Row>
                <Row title={de ? 'Vorschau' : 'Preview'}><button type="button" className="clip-settings-button" id="clip-setting-preview-toast" onClick={() => void window.electronAPI?.showClipToast?.({ id: Date.now(), title: de ? 'Highlight' : 'Highlight', gameTitle: 'Eclipse', duration: 30, timestamp: Date.now(), language, color: toastColor })}><Play size={12} />{de ? 'Auf Bildschirm testen' : 'Test on screen'}</button></Row>
              </>}
            </Group>
          </>}

          {activeTab === 'video' && <>
            <Group title={de ? 'Qualitätsprofil' : 'Quality profile'}>
              <div className="clip-settings-profile-options">
                <Choices id="clip-setting-preset" label={de ? 'Qualitätsprofil' : 'Quality profile'} value={preset} options={[{ value: 'low', label: de ? 'Sparsam' : 'Light', detail: '480p · 30 FPS' }, { value: 'standard', label: 'Standard', detail: '720p · 60 FPS' }, { value: 'high', label: de ? 'Hoch' : 'High', detail: '1080p · 60 FPS' }, { value: 'custom', label: de ? 'Eigene Werte' : 'Custom', detail: settings.quality + ' · ' + settings.fps + ' FPS' }]} onChange={value => setSettings({ ...(value === 'custom' ? {} : qualityPresets[value as keyof typeof qualityPresets]), qualityPreset: value as ClipSettings['qualityPreset'] })} />
              </div>
            </Group>
            <Group title={de ? 'Bild & Datei' : 'Picture & file'}>
              <Select id="clip-setting-resolution" title={de ? 'Maximale Auflösung' : 'Maximum resolution'} value={settings.quality} options={['360p', '480p', '720p', '1080p', '1440p', '4k'].map(value => ({ value, label: value === '4k' ? '2160p · 4K' : value }))} onChange={value => qualityPatch({ quality: value as ClipSettings['quality'] })} />
              <Select id="clip-setting-fps" title={de ? 'Maximale Bildrate' : 'Maximum frame rate'} value={String(settings.fps)} options={[24, 30, 60, 120].map(value => ({ value: String(value), label: value + ' FPS' }))} onChange={value => qualityPatch({ fps: Number(value) as ClipSettings['fps'] })} />
              <Select id="clip-setting-bitrate" title={de ? 'Ziel-Bitrate' : 'Target bitrate'} description={de ? 'Eine höhere Bitrate benötigt mehr Speicherplatz.' : 'Higher bitrates use more disk space.'} value={settings.bitrate || '6M'} options={bitrateOptions} onChange={value => qualityPatch({ bitrate: value })} />
              <Select id="clip-setting-encoder" title={de ? 'Video-Encoder' : 'Video encoder'} description={de ? 'GPU-Aufnahme benötigt einen kompatiblen Grafiktreiber. Software verwendet die CPU zum Encodieren.' : 'GPU recording requires a compatible graphics driver. Software uses the CPU for encoding.'} value={settings.videoEncoder || 'gpu'} options={[{ value: 'gpu', label: de ? 'Hardware automatisch' : 'Automatic hardware' }, { value: 'cpu', label: 'Software · CPU' }]} onChange={value => qualityPatch({ videoEncoder: value as ClipSettings['videoEncoder'] })} />
              <Select id="clip-setting-format" title={de ? 'Dateiformat' : 'File format'} description={de ? 'Das Format bestimmt den Export-Codec.' : 'The format determines the export codec.'} value={settings.format || 'mp4'} options={[{ value: 'mp4', label: 'MP4 · H.264' }, { value: 'webm', label: 'WebM · VP9' }, { value: 'mkv', label: 'MKV · H.264' }]} onChange={value => qualityPatch({ format: value as ClipSettings['format'] })} />
            </Group>
            <p className="clip-settings-note">{de ? 'Kleinere Quellen werden nicht vergrößert. Bei unverändertem Bild hält die Aufnahme das letzte Bild. Tatsächliche FPS und Dateigröße werden nach dem Speichern gemessen. Mbit/s ist die Ziel-Bitrate; MB ist die Dateigröße.' : 'Smaller sources are not upscaled. When the source is unchanged, recording holds the last frame. Actual FPS and file size are measured after saving. Mbps is target bitrate; MB is file size.'}</p>
            {captureStatus.gpuScaling && <p className="clip-settings-note">{de ? 'Skalierung auf der GPU' : 'GPU scaling'}{captureStatus.hdrTonemapped ? (de ? ' · HDR wird für kompatible Clips in SDR umgewandelt.' : ' · HDR is tone-mapped to SDR for compatible clips.') : ''}</p>}
            {isReplayBufferActive && <Group title={de ? 'Aktuelle Quelle' : 'Current source'}><Row title={captureStatus.width && captureStatus.height ? captureStatus.width + ' × ' + captureStatus.height : '—'} description={de ? 'Quellauflösung und angeforderte Quell-Bildrate' : 'Source dimensions and requested source frame rate'}><span className="clip-settings-readout">{captureStatus.fps ? captureStatus.fps + ' FPS' : '—'} · {de ? 'Replay bis ' : 'Replay up to '}{captureStatus.historyLimitSeconds || settings.replayDurationSeconds}s</span></Row></Group>}
            {!!captureStatus.historyLimitSeconds && captureStatus.historyLimitSeconds < settings.replayDurationSeconds && <p className="clip-settings-note">{de ? 'Das Speicherbudget begrenzt die Replay-Länge bei dieser Bitrate. Eine niedrigere Bitrate ermöglicht längere Replays.' : 'The memory budget limits replay history at this bitrate. Lower bitrates allow longer replays.'}</p>}
          </>}

          {activeTab === 'audio' && <>
            <Group title={de ? 'Desktop-Ton' : 'Desktop sound'}>
              <Row title={de ? 'Aufnahmequelle' : 'Recording source'} description={de ? 'Nimmt den PC-Ton inklusive Browser und Musik als eigene, vom Mikrofon getrennte Spur auf. Mit Anwendungs-Audio kannst du Spiel und Discord zusätzlich einzeln aufnehmen.' : 'Records PC audio, including your browser and music, on its own track separate from the microphone. Application audio can also capture game and Discord individually.'}><span className="clip-settings-readout">{settings.separateApplications?(de?'Anwendungsaufnahme':'Application capture'):(de ? 'System-Loopback' : 'System loopback')}</span></Row>
              <Range id="clip-setting-desktop-volume" title={de ? 'Aufnahme-Lautstärke' : 'Recording volume'} value={settings.audioOutputVolume ?? 100} onChange={value => setSettings({ audioOutputVolume: value })} />
              {!settings.separateApplications && settings.audioRecordingOption !== 'all' && <Row title={de ? 'Gespeicherte Audio-Auswahl' : 'Saved audio preference'} description={de ? 'Aktuell wird der gesamte PC-Ton aufgenommen. Aktiviere Anwendungs-Audio, um Spiel und Discord getrennt aufzunehmen.' : 'The full PC mix is currently recorded. Enable application audio to capture game and Discord separately.'}><button type="button" className="clip-settings-button" onClick={() => setSettings({ audioRecordingOption: 'all' })}>{de ? 'Desktop-Audio verwenden' : 'Use desktop audio'}</button></Row>}
            </Group>
            <Group title={de?'Anwendungs-Audio':'Application audio'}><ClipApplicationAudio settings={settings} onChange={setSettings} de={de}/></Group>
            <Group title={de ? 'Mikrofon' : 'Microphone'} description={de ? 'Eigene Tonspur. Unter Windows verwendet Eclipse die normale Geräteverarbeitung für Effekte wie Equalizer APO.' : 'Separate audio track. On Windows, Eclipse preserves device processing for effects such as Equalizer APO.'}>
              <Toggle id="clip-setting-microphone" title={de ? 'Mikrofon aufnehmen' : 'Record microphone'} checked={settings.captureMic} onChange={() => setSettings({ captureMic: !settings.captureMic })} />
              {settings.captureMic && <>
                {isReplayBufferActive && <ClipMicrophoneStatus status={captureStatus} de={de} />}
                <Select id="clip-setting-mic-device" title={de ? 'Eingabegerät' : 'Input device'} value={micId} options={micOptions} onChange={value => setSettings({ micDeviceId: value })} />
                <Range id="clip-setting-mic-volume" title={de ? 'Mikrofon-Lautstärke' : 'Microphone volume'} value={settings.micVolume ?? 80} onChange={value => setSettings({ micVolume: value })} />
                <Toggle id="clip-setting-mono" title={de ? 'Mono-Eingang' : 'Mono input'} description={de ? 'Gibt einseitigen Mikrofonton auf beiden Kanälen aus.' : 'Plays a one-sided microphone signal on both channels.'} checked={!!settings.monoAudioInput} onChange={() => setSettings({ monoAudioInput: !settings.monoAudioInput })} />
                <ClipMicMeter deviceId={settings.micDeviceId} threshold={settings.micSensitivity ?? -40} onChange={value => setSettings({ micSensitivity: value })} de={de} />
              </>}
            </Group>
          </>}

          {activeTab === 'screen' && <>
            <ClipCaptureSources sources={sources} selectedId={settings.selectedMonitorId} loading={loadingScreens} de={de} onChange={value => setSettings({ selectedMonitorId: value })} />
            <p className="clip-settings-note">{de ? 'HDR wird automatisch in SDR umgewandelt. Fenster müssen zum Start sichtbar sein. Geschützte Inhalte können von Windows gesperrt werden. Eclipse wechselt nicht unbemerkt zu einem anderen Fenster.' : 'HDR is automatically tone-mapped to SDR. Windows must be visible when recording starts. Windows may block protected content. Eclipse never silently switches to a different window.'}</p>
            <Group title={de ? 'Automatischer Start' : 'Automatic start'}><Toggle title={de ? 'Beim Start von Eclipse aufnehmen' : 'Start with Eclipse'} checked={!!settings.screenRecordingOnAppStart} onChange={() => setSettings({ screenRecordingOnAppStart: !settings.screenRecordingOnAppStart })} /></Group>
          </>}

          {activeTab === 'hotkeys' && <>
            <Group title={de ? 'Clip speichern' : 'Save clip'}>
              <Row title={de ? 'Aktuelles Tastenkürzel' : 'Current shortcut'} description={de ? 'Speichert den Replay-Buffer auch außerhalb von Eclipse.' : 'Saves the replay buffer even when Eclipse is not in focus.'}><kbd className="clip-settings-hotkey">{settings.hotkey || 'F8'}</kbd></Row>
              <Row title={de ? 'Schnellauswahl' : 'Quick selection'}><Choices id="clip-setting-hotkey-presets" label={de ? 'Tastenkürzel' : 'Shortcut'} value={settings.hotkey || 'F8'} options={['F8', 'F9', 'F10', 'Alt+C'].map(value => ({ value, label: value }))} onChange={value => { setRecordingKey(false); setSettings({ hotkey: value }) }} /></Row>
              <Row title={de ? 'Eigene Kombination' : 'Custom combination'} description={recordingKey ? (de ? 'Drücke die gewünschte Kombination. Escape bricht ab.' : 'Press your combination. Escape cancels.') : undefined}><button ref={keyButton} type="button" id="clip-setting-custom-hotkey" className="clip-settings-button" aria-pressed={recordingKey} onClick={() => setRecordingKey(value => !value)}><Keyboard size={14} />{recordingKey ? (de ? 'Warte auf Eingabe…' : 'Waiting for input…') : (de ? 'Tastenkürzel ändern' : 'Change shortcut')}</button></Row>
            </Group>
            <Group title={de ? 'Sprachbefehl' : 'Voice command'} description={de ? 'Experimentell. Benötigt Mikrofonzugriff und einen aktiven Replay-Buffer.' : 'Experimental. Requires microphone access and an active replay buffer.'}>
              <Toggle id="clip-setting-voice" title={de ? 'Clips per Sprache speichern' : 'Save clips by voice'} checked={!!settings.voiceCaptureEnabled} onChange={() => setSettings({ voiceCaptureEnabled: !settings.voiceCaptureEnabled })} />
              {settings.voiceCaptureEnabled && <><Select title={de ? 'Befehl' : 'Command'} id="clip-setting-voice-phrase" value={settings.voiceCapturePhrase || 'clip that'} options={voiceOptions} onChange={value => setSettings({ voiceCapturePhrase: value })} /><Select title={de ? 'Mikrofon' : 'Microphone'} value={micId} options={micOptions} onChange={value => setSettings({ micDeviceId: value })} /></>}
            </Group>
          </>}

          {activeTab === 'autoclip' && <ClipAutoSettings settings={settings} setSettings={setSettings} de={de} onHotkeys={()=>setActiveTab('hotkeys')}/>}

          {activeTab === 'storage' && <>
            <Group title={de ? 'Speicherort' : 'Save location'}>
              <Row title={de ? 'Clip-Ordner' : 'Clips folder'} description={settings.savePath || 'Videos / Eclipse Clips'}>
                <button type="button" id="clip-setting-pick-folder" className="clip-settings-button" disabled={choosingFolder} onClick={async () => {
                  if (!window.electronAPI?.clips?.pickFolder) return
                  setChoosingFolder(true)
                  try { const folder = await window.electronAPI.clips.pickFolder(); if (folder) { setSettings({ savePath: folder }); await refreshClips() } } catch (reason) { notifyError(reason) } finally { setChoosingFolder(false) }
                }}><FolderOpen size={14} />{de ? 'Ordner ändern' : 'Change folder'}</button>
              </Row>
              <Row title={de ? 'Dateien anzeigen' : 'View files'}><button type="button" className="clip-settings-button" onClick={() => void window.electronAPI?.clips?.openFolder(settings.savePath || '').catch(notifyError)}><FolderOpen size={14} />{de ? 'Im Explorer öffnen' : 'Open in Explorer'}</button></Row>
            </Group>
            <Group title={de ? 'Belegter Speicher' : 'Disk usage'}>
              <Row title={de ? 'Gespeicherte Clips' : 'Saved clips'}><span className="clip-settings-readout">{clips.length.toLocaleString(locale)}</span></Row>
              <Row title={de ? 'Gesamtgröße' : 'Total size'} description={de ? 'Inklusive separat gespeicherter Tonspuren.' : 'Includes separately saved audio tracks.'}><span className="clip-settings-readout">{diskUsage}</span></Row>
            </Group>
            <p className="clip-settings-note">{de ? 'Clips bleiben gespeichert, bis du sie selbst löschst. Ein automatisches Speicherlimit ist noch nicht verfügbar.' : 'Clips remain saved until you delete them. An automatic storage limit is not available yet.'}</p>
          </>}
        </SceneTransition>
      </div>
    </div>
  </div>
}
