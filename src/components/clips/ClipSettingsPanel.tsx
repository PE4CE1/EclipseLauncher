import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, Film, Mic, Keyboard, FolderOpen, Volume2, ShieldCheck,
  Check, Settings, ArrowLeft, Monitor, Radio, Sliders, HardDrive,
  CheckCircle2, Sparkles, AlertCircle, Headphones, RefreshCw
} from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import { useTranslation } from '../../hooks/useTranslation'
import { sendAppNotification } from '../../services/notificationService'

interface ClipSettingsPanelProps {
  onBack?: () => void
}

interface AudioDevice {
  deviceId: string
  label: string
}

interface ScreenSource {
  id: string
  name: string
  thumbnail?: string
}

export function ClipSettingsPanel({ onBack }: ClipSettingsPanelProps) {
  const { language } = useTranslation()
  const { settings, setSettings, clips, refreshClips } = useClipStore()
  
  const [activeTab, setActiveTab] = useState<'capture' | 'screen' | 'video' | 'audio' | 'hotkeys' | 'storage'>('capture')
  const [isRecordingCustomHotkey, setIsRecordingCustomHotkey] = useState(false)
  
  // Real Audio Devices & Screen Sources
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([])
  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([])
  const [screenSources, setScreenSources] = useState<ScreenSource[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)

  // Enumerate Connected Devices & Screens
  const loadHardwareDevices = async () => {
    setIsLoadingDevices(true)
    try {
      if (navigator?.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const outputs = devices
          .filter(d => d.kind === 'audiooutput')
          .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Lautsprecher / Headset ${idx + 1}` }))
        const inputs = devices
          .filter(d => d.kind === 'audioinput')
          .map((d, idx) => ({ deviceId: d.deviceId, label: d.label || `Mikrofon ${idx + 1}` }))

        setAudioOutputs(outputs)
        setAudioInputs(inputs)
      }

      if (window.electronAPI?.clips?.getSources) {
        const sources = await window.electronAPI.clips.getSources()
        const screens = sources.filter((s: any) => s.id.startsWith('screen:') || s.name.toLowerCase().includes('screen') || s.name.toLowerCase().includes('bildschirm'))
        setScreenSources(screens.length > 0 ? screens : sources)
      }
    } catch (err) {
      console.warn('[ClipSettings] Device enumeration error:', err)
    } finally {
      setIsLoadingDevices(false)
    }
  }

  useEffect(() => {
    loadHardwareDevices()
  }, [])

  // Custom Hotkey Listener
  useEffect(() => {
    if (!isRecordingCustomHotkey) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')

      let keyName = e.key.toUpperCase()
      if (keyName.startsWith('ARROW')) keyName = keyName.replace('ARROW', '')
      if (keyName === ' ') keyName = 'Space'

      parts.push(keyName)
      const hotkeyStr = parts.join('+')

      setSettings({ hotkey: hotkeyStr })
      setIsRecordingCustomHotkey(false)

      sendAppNotification({
        title: language === 'de' ? 'Hotkey aktualisiert! ⌨️' : 'Hotkey Updated! ⌨️',
        body: language === 'de' ? `Neuer Clipping-Hotkey: ${hotkeyStr}` : `New clipping hotkey: ${hotkeyStr}`,
        type: 'info',
        duration: 3000
      })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [isRecordingCustomHotkey, language, setSettings])

  // Quality Preset Selection (Screenshot 1)
  const applyQualityPreset = (preset: 'low' | 'standard' | 'high' | 'custom') => {
    if (preset === 'low') {
      setSettings({
        qualityPreset: 'low',
        quality: '480p',
        fps: 30,
        bitrate: '5M',
        codec: 'h264',
        format: 'mp4',
        videoEncoder: 'gpu',
      })
    } else if (preset === 'standard') {
      setSettings({
        qualityPreset: 'standard',
        quality: '720p',
        fps: 60,
        bitrate: '8M',
        codec: 'h264',
        format: 'mp4',
        videoEncoder: 'gpu',
      })
    } else if (preset === 'high') {
      setSettings({
        qualityPreset: 'high',
        quality: '1080p',
        fps: 60,
        bitrate: '15M',
        codec: 'h264',
        format: 'mp4',
        videoEncoder: 'gpu',
      })
    } else {
      setSettings({ qualityPreset: 'custom' })
    }
  }

  // Handle Pick Custom Folder
  const handlePickFolder = async () => {
    if (window.electronAPI?.clips?.pickFolder) {
      const folder = await window.electronAPI.clips.pickFolder()
      if (folder) {
        setSettings({ savePath: folder })
        refreshClips()
      }
    }
  }

  // Handle Open in Explorer
  const handleOpenFolder = () => {
    if (window.electronAPI?.clips?.openFolder) {
      window.electronAPI.clips.openFolder(settings.savePath || '')
    }
  }

  // Clean Toggle Switch Component
  const SettingToggle = ({
    title,
    description,
    checked,
    onChange,
  }: {
    title: string
    description?: string
    checked: boolean
    onChange: () => void
  }) => (
    <div 
      onClick={onChange}
      className="p-4 rounded-xl bg-[#12141c] hover:bg-[#161822] border border-white/[0.06] hover:border-white/15 transition-all flex items-center justify-between gap-4 cursor-pointer"
    >
      <div className="space-y-1 min-w-0 flex-1">
        <span className="font-semibold text-white text-xs block">{title}</span>
        {description && <span className="text-white/40 text-[11px] block leading-relaxed">{description}</span>}
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span className="text-[11px] font-bold font-mono text-white/50">
          {checked ? (language === 'de' ? 'AN' : 'ON') : (language === 'de' ? 'AUS' : 'OFF')}
        </span>
        <div className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-white' : 'bg-white/10'}`}>
          <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${checked ? 'left-6 bg-black' : 'left-1 bg-white/40'}`} />
        </div>
      </div>
    </div>
  )

  const SIDEBAR_TABS = [
    { id: 'capture', label: language === 'de' ? 'Aufnahme & Replay' : 'Capture & Replay', icon: Scissors },
    { id: 'screen', label: language === 'de' ? 'Screen Recording' : 'Screen Recording', icon: Monitor },
    { id: 'video', label: language === 'de' ? 'Qualität & Video' : 'Quality & Video', icon: Film },
    { id: 'audio', label: language === 'de' ? 'Audio & Mikrofon' : 'Audio & Mic', icon: Mic },
    { id: 'hotkeys', label: language === 'de' ? 'Hotkeys & Tasten' : 'Hotkeys & Keybinds', icon: Keyboard },
    { id: 'storage', label: language === 'de' ? 'Speicherort & Dateien' : 'Storage & Files', icon: FolderOpen },
  ]

  return (
    <div className="flex flex-col md:flex-row h-full min-h-[600px] bg-black text-white rounded-2xl border border-white/[0.08] overflow-hidden">
      
      {/* ─── Left Sidebar Navigation ─── */}
      <div className="w-full md:w-64 bg-[#0a0b0f] border-b md:border-b-0 md:border-r border-white/[0.08] p-4 flex flex-col justify-between flex-shrink-0">
        <div className="space-y-4">
          
          {/* Back Button & Title */}
          <div className="space-y-2 pb-3 border-b border-white/[0.06]">
            {onBack && (
              <button
                onClick={onBack}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/80 hover:text-white transition-all cursor-pointer flex items-center gap-2 text-xs font-semibold"
              >
                <ArrowLeft size={14} />
                <span>{language === 'de' ? 'Zurück zu Clips' : 'Back to Clips'}</span>
              </button>
            )}
            
            <div className="px-1 pt-1">
              <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                <Settings size={14} className="text-white/70" />
                <span>{language === 'de' ? 'Clips Einstellungen' : 'Clips Settings'}</span>
              </h2>
              <span className="text-[10px] font-mono text-white/40 block mt-0.5">
                ECLIPSE CORE ENGINE
              </span>
            </div>
          </div>

          {/* Navigation Category Tabs */}
          <div className="space-y-1">
            {SIDEBAR_TABS.map(tab => {
              const Icon = tab.icon
              const isSelected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black font-bold shadow-md'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Sidebar Footer info */}
        <div className="pt-4 border-t border-white/[0.06] text-[11px] text-white/40 space-y-1 px-1">
          <div className="flex items-center justify-between">
            <span>{language === 'de' ? 'Gespeicherte Clips' : 'Saved Clips'}:</span>
            <span className="font-mono text-white/70 font-semibold">{clips.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{language === 'de' ? 'Speicherplatz' : 'Storage'}:</span>
            <span className="font-mono text-white/70 font-semibold">
              {clips.reduce((acc, c) => acc + (c.fileSize || 0), 0) > 0 
                ? `${(clips.reduce((acc, c) => acc + (c.fileSize || 0), 0) / (1024 * 1024)).toFixed(1)} MB` 
                : '0 MB'}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Right Content Area ─── */}
      <div className="flex-1 p-6 md:p-8 overflow-y-auto bg-[#08090d]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="max-w-3xl space-y-6"
          >
            
            {/* ════════ TAB 1: Aufnahme & Replay ════════ */}
            {activeTab === 'capture' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {language === 'de' ? 'Aufnahme- & Replay-Buffer' : 'Capture & Replay Buffer'}
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de' 
                      ? 'Nimm deine besten Highlights rückwirkend mit einem Tastendruck im Hintergrund auf.'
                      : 'Capture game highlights retroactively in the background on hotkey press.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <SettingToggle
                    title={language === 'de' ? 'Replay-Buffer im Hintergrund aktivieren' : 'Enable Background Replay Buffer'}
                    description={language === 'de' ? 'Speichert laufend die letzten Sekunden im Arbeitsspeicher für das sekundenschnelle Clipping.' : 'Keeps rolling gameplay in memory so you can capture clips instantly.'}
                    checked={settings.enabled}
                    onChange={() => setSettings({ enabled: !settings.enabled })}
                  />

                  {/* Replay Duration Selection */}
                  <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {language === 'de' ? 'Replay-Buffer Dauer (Cliplänge)' : 'Replay Buffer Duration (Clip Length)'}
                        </span>
                        <span className="text-white/40 text-[11px]">
                          {language === 'de' ? 'Wähle, wie viele Sekunden Gameplay rückwirkend gespeichert werden.' : 'Choose how many seconds of prior gameplay to save.'}
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-white/10 font-mono text-emerald-400 font-bold text-xs border border-white/10">
                        {settings.replayDurationSeconds} {language === 'de' ? 'Sekunden' : 'Seconds'}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
                      {[15, 30, 45, 60, 90, 120, 180, 300].map(sec => {
                        const isSel = settings.replayDurationSeconds === sec
                        return (
                          <button
                            key={sec}
                            onClick={() => setSettings({ replayDurationSeconds: sec })}
                            className={`py-2.5 rounded-xl text-center font-mono font-semibold text-xs border transition-all cursor-pointer ${
                              isSel
                                ? 'bg-white text-black border-white shadow-md'
                                : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                            }`}
                          >
                            {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SettingToggle
                      title={language === 'de' ? 'Auto-Start bei Spielstart' : 'Auto-Start on Game Launch'}
                      description={language === 'de' ? 'Startet den Replay-Buffer automatisch, sobald Eclipse ein aktives Spiel erkennt.' : 'Automatically starts buffer when a game is launched.'}
                      checked={settings.autoStartOnGame !== false}
                      onChange={() => setSettings({ autoStartOnGame: settings.autoStartOnGame !== false ? false : true })}
                    />

                    <SettingToggle
                      title={language === 'de' ? 'HUD-Toast nach Clip' : 'HUD Notification on Clip'}
                      description={language === 'de' ? 'Zeigt eine Benachrichtigung an, wenn der Clip erfolgreich gespeichert wurde.' : 'Displays toast alert when a clip is captured.'}
                      checked={settings.notifyOnClip !== false}
                      onChange={() => setSettings({ notifyOnClip: settings.notifyOnClip !== false ? false : true })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ════════ TAB 2: Screen Recording & Monitor ════════ */}
            {activeTab === 'screen' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {language === 'de' ? 'Screen Recording & Monitor-Auswahl' : 'Screen Recording & Monitor Selection'}
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de' 
                      ? 'Wähle deinen primären Aufnahme-Bildschirm und automatische Startoptionen.'
                      : 'Choose your recording display monitor and launcher startup preferences.'}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Screen Recording on App Start */}
                  <SettingToggle
                    title={language === 'de' ? 'Screen Recording bei App-Start aktivieren' : 'Enable Screen Recording on App Start'}
                    description={language === 'de' ? 'Startet die Bildschirmaufnahme und den Replay-Buffer direkt beim Start von Eclipse Launcher.' : 'Automatically starts screen capture when Eclipse Launcher starts.'}
                    checked={settings.screenRecordingOnAppStart ?? false}
                    onChange={() => setSettings({ screenRecordingOnAppStart: !(settings.screenRecordingOnAppStart ?? false) })}
                  />

                  {/* Monitor / Screen Selector */}
                  <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {language === 'de' ? 'Aufnahme-Bildschirm / Monitor' : 'Capture Screen / Display'}
                        </span>
                        <span className="text-white/40 text-[11px]">
                          {language === 'de' ? 'Wähle den Monitor aus, der standardmäßig gecaptured werden soll.' : 'Select the primary display monitor to capture.'}
                        </span>
                      </div>

                      <button
                        onClick={loadHardwareDevices}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
                        title={language === 'de' ? 'Bildschirme neu laden' : 'Refresh displays'}
                      >
                        <RefreshCw size={13} className={isLoadingDevices ? 'animate-spin' : ''} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {screenSources.length > 0 ? (
                        screenSources.map((source, idx) => {
                          const isSelected = settings.selectedMonitorId === source.id || (!settings.selectedMonitorId && idx === 0)
                          return (
                            <div
                              key={source.id}
                              onClick={() => setSettings({ selectedMonitorId: source.id })}
                              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                                isSelected
                                  ? 'bg-white/10 border-white text-white shadow-md'
                                  : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                              }`}
                            >
                              <div className="w-10 h-10 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                {source.thumbnail ? (
                                  <img src={source.thumbnail} alt={source.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Monitor size={18} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs font-bold block truncate">{source.name || `Monitor ${idx + 1}`}</span>
                                <span className="text-[10px] text-white/40 block">
                                  {isSelected ? (language === 'de' ? 'Aktiver Aufnahme-Monitor' : 'Selected Screen') : (language === 'de' ? 'Klicken zum Auswählen' : 'Click to select')}
                                </span>
                              </div>
                              {isSelected && <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />}
                            </div>
                          )
                        })
                      ) : (
                        <div className="col-span-2 p-4 text-center text-xs text-white/40 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                          {language === 'de' ? 'Standard-Hauptbildschirm wird verwendet' : 'Default primary display will be captured'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ════════ TAB 3: Qualität & Video (Screenshot 1) ════════ */}
            {activeTab === 'video' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {language === 'de' ? 'Aufnahme-Qualitätseinstellungen' : 'Recording Quality Settings'}
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de'
                      ? 'Passe die Qualität deiner Clips an. Höhere Einstellungen beanspruchen mehr Ressourcen. Bei Problemen niedrigere Einstellungen wählen.'
                      : 'Customize the quality of clips. Higher settings will use more resources. If you have issues, try lower settings.'}
                  </p>
                </div>

                {/* Quality Preset 4-Card Selector (Screenshot 1) */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-white block">
                    {language === 'de' ? 'Qualität' : 'Quality'}
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    
                    {/* 1. Low Quality */}
                    <div
                      onClick={() => applyQualityPreset('low')}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        settings.qualityPreset === 'low'
                          ? 'bg-[#151722] border-amber-400 text-white shadow-lg'
                          : 'bg-[#0e1017] border-white/[0.08] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs block text-white">
                          {language === 'de' ? 'Niedrige Qualität' : 'Low Quality'}
                        </span>
                        <span className="text-[11px] text-white/40 block mt-1 leading-snug">
                          {language === 'de' ? 'Für schwächere PCs & schnelles Teilen' : 'Lower end PCs & faster uploads'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-white/50 block">480p 30 FPS</span>
                    </div>

                    {/* 2. Standard */}
                    <div
                      onClick={() => applyQualityPreset('standard')}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        settings.qualityPreset === 'standard'
                          ? 'bg-[#151722] border-amber-400 text-white shadow-lg'
                          : 'bg-[#0e1017] border-white/[0.08] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs block text-white">
                          {language === 'de' ? 'Standard' : 'Standard'}
                        </span>
                        <span className="text-[11px] text-white/40 block mt-1 leading-snug">
                          {language === 'de' ? 'Performance & schnelles Teilen' : 'Performance & fast sharing'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-white/50 block">720p 60 FPS</span>
                    </div>

                    {/* 3. High Quality */}
                    <div
                      onClick={() => applyQualityPreset('high')}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-28 ${
                        (settings.qualityPreset === 'high' || !settings.qualityPreset)
                          ? 'bg-[#151722] border-amber-400 text-white shadow-lg'
                          : 'bg-[#0e1017] border-white/[0.08] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-xs block text-white">
                          {language === 'de' ? 'Hohe Qualität' : 'High Quality'}
                        </span>
                        <span className="text-[11px] text-white/40 block mt-1 leading-snug">
                          {language === 'de' ? 'Höchste Bildschärfe & Details' : 'Higher quality & crisp visuals'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-white/50 block">1080p 60 FPS</span>
                    </div>

                    {/* 4. Custom */}
                    <div
                      onClick={() => applyQualityPreset('custom')}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between h-28 relative ${
                        settings.qualityPreset === 'custom'
                          ? 'bg-[#151722] border-amber-400 text-white shadow-lg'
                          : 'bg-[#0e1017] border-white/[0.08] text-white/70 hover:border-white/20 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs block text-amber-400">
                            {language === 'de' ? 'Benutzerdefiniert' : 'Custom'}
                          </span>
                          {settings.qualityPreset === 'custom' && (
                            <CheckCircle2 size={15} className="text-amber-400" />
                          )}
                        </div>
                        <span className="text-[11px] text-white/40 block mt-1 leading-snug">
                          {language === 'de' ? 'Eigene Einstellungen anpassen' : 'Customize your own settings'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-amber-400/80 block">
                        {settings.quality} {settings.fps}FPS {settings.bitrate}
                      </span>
                    </div>

                  </div>
                </div>

                {/* Granular Quality Controls (Screenshot 1 Dropdowns) */}
                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                  {/* Row 1: Resolution, FPS, Bitrate */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Resolution */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Auflösung (Resolution)' : 'Resolution'}
                      </label>
                      <select
                        value={settings.quality || '1080p'}
                        onChange={e => {
                          setSettings({ quality: e.target.value as any, qualityPreset: 'custom' })
                        }}
                        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value="4k">4K Ultra HD (2160p)</option>
                        <option value="1440p">2K Quad HD (1440p)</option>
                        <option value="1080p">Full HD (1080p)</option>
                        <option value="720p">Standard HD (720p)</option>
                        <option value="480p">Low (480p)</option>
                        <option value="360p">Fast Share (360p)</option>
                      </select>
                    </div>

                    {/* FPS */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Bildwiederholrate (FPS)' : 'FPS'}
                      </label>
                      <select
                        value={settings.fps || 60}
                        onChange={e => {
                          setSettings({ fps: parseInt(e.target.value) as any, qualityPreset: 'custom' })
                        }}
                        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value={120}>120 FPS</option>
                        <option value={60}>60 FPS</option>
                        <option value={30}>30 FPS</option>
                        <option value={24}>24 FPS</option>
                      </select>
                    </div>

                    {/* Bitrate */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Bitrate' : 'Bitrate'}
                      </label>
                      <select
                        value={settings.bitrate || '10M'}
                        onChange={e => {
                          setSettings({ bitrate: e.target.value as any, qualityPreset: 'custom' })
                        }}
                        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value="20M">20M (Ultra)</option>
                        <option value="15M">15M (High)</option>
                        <option value="10M">10M (Standard)</option>
                        <option value="8M">8M (Medium)</option>
                        <option value="5M">5M (Low)</option>
                        <option value="auto">Auto</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 2: Video Encoder, Selected GPU, Codec */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/[0.04]">
                    {/* Video Encoder */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Video-Encoder' : 'Video Encoder'}
                      </label>
                      <select
                        value={settings.videoEncoder || 'gpu'}
                        onChange={e => setSettings({ videoEncoder: e.target.value as any, qualityPreset: 'custom' })}
                        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value="gpu">GPU (Hardware-Beschleunigt)</option>
                        <option value="cpu">Software (CPU)</option>
                      </select>
                    </div>

                    {/* Selected GPU */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Gewählte GPU' : 'Selected GPU'}
                      </label>
                      <select
                        value={settings.selectedGpu || 'auto'}
                        onChange={e => setSettings({ selectedGpu: e.target.value, qualityPreset: 'custom' })}
                        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value="auto">Auto (Primäre Grafikkarte)</option>
                        <option value="dedicated">Dedizierte GPU</option>
                        <option value="integrated">Integrierte GPU</option>
                      </select>
                    </div>

                    {/* Codec */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Codec' : 'Codec'}
                      </label>
                      <select
                        value={settings.codec || 'h264'}
                        onChange={e => setSettings({ codec: e.target.value as any, qualityPreset: 'custom' })}
                        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                      >
                        <option value="h264">H264 / AVC (Universell)</option>
                        <option value="hevc">H265 / HEVC</option>
                        <option value="av1">AV1 (Next-Gen)</option>
                        <option value="vp9">VP9</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 3: Container Format Selection (.mp4, .webm, .mkv) */}
                  <div className="pt-3 border-t border-white/[0.04] space-y-2">
                    <label className="text-[11px] font-semibold text-white/60 block">
                      {language === 'de' ? 'Video-Format / Dateityp (Container)' : 'Video Format (Container)'}
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'mp4', label: 'MP4 (.mp4)', desc: language === 'de' ? 'Standard & Empfohlen – 100% kompatibel mit Discord, WhatsApp & Premiere' : 'Recommended – 100% compatible with Discord, WhatsApp & Premiere' },
                        { id: 'webm', label: 'WebM (.webm)', desc: language === 'de' ? 'Web-optimiert & geringe CPU-Last' : 'Web-optimized & lowest CPU overhead' },
                        { id: 'mkv', label: 'MKV (.mkv)', desc: language === 'de' ? 'Crash-sicherer Container für lange Aufnahmen' : 'Crash-resistant container' },
                      ].map(fmt => (
                        <div
                          key={fmt.id}
                          onClick={() => setSettings({ format: fmt.id as any, qualityPreset: 'custom' })}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            (settings.format || 'mp4') === fmt.id
                              ? 'bg-white/10 border-white text-white shadow-md'
                              : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs">{fmt.label}</span>
                            {(settings.format || 'mp4') === fmt.id && (
                              <CheckCircle2 size={14} className="text-emerald-400" />
                            )}
                          </div>
                          <span className="text-[10px] text-white/40 mt-1 leading-snug">{fmt.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Watermark Guarantee */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                  <ShieldCheck size={20} className="text-emerald-400 flex-shrink-0" />
                  <div>
                    <span className="font-bold text-xs text-white block">
                      {language === 'de' ? '100% Kostenlos & Ohne Wasserzeichen' : '100% Free & Zero Watermarks'}
                    </span>
                    <span className="text-[11px] text-white/40">
                      {language === 'de' ? 'Alle Clips werden sauber ohne Branding exportiert.' : 'All clips exported natively with zero watermarks.'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* ════════ TAB 4: Audio & Mikrofon (Screenshots 2 & 3) ════════ */}
            {activeTab === 'audio' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {language === 'de' ? 'Audio-Aufnahme-Einstellungen' : 'Audio Recording Settings'}
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de' 
                      ? 'Wähle aus, ob alle PC- und Mikrofon-Audiospuren oder nur dein Spielsound aufgenommen werden sollen.'
                      : 'Choose whether to record all your PC and mic audio or just your game audio, with or without Discord.'}
                  </p>
                </div>

                {/* 1. Recording Options Radio List (Screenshot 2) */}
                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white block">
                      {language === 'de' ? 'Aufnahme-Optionen' : 'Recording options'}
                    </span>
                    <span className="text-[11px] text-white/40 block">
                      {language === 'de'
                        ? 'Wähle den passenden Audiomodus für deine Gameplay-Aufnahmen.'
                        : 'Choose whether to record all your PC and mic audio or just your game audio, with or without Discord.'}
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {/* Option 1: Record all PC audio */}
                    <div
                      onClick={() => setSettings({ audioRecordingOption: 'all' })}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        settings.audioRecordingOption === 'all' || !settings.audioRecordingOption
                          ? 'bg-white/[0.06] border-white/30 text-white'
                          : 'bg-white/[0.01] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="pt-0.5">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          settings.audioRecordingOption === 'all' || !settings.audioRecordingOption
                            ? 'border-white bg-white'
                            : 'border-white/30'
                        }`}>
                          {(settings.audioRecordingOption === 'all' || !settings.audioRecordingOption) && (
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {language === 'de' ? 'Alle PC-Audio aufnehmen' : 'Record all PC audio'}
                          </span>
                          <Volume2 size={13} className="text-white/60" />
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed">
                          {language === 'de'
                            ? 'Nimmt alle Audiosignale deines PCs in deinen Clips auf. Dies beinhaltet Spielsound, Voice-Chat, System-Sounds, Musik und alles, was über deine Kopfhörer oder Lautsprecher zu hören ist.'
                            : 'Include all audio coming through your PC in your clips. This includes game audio, voice calls, system notification sounds and everything else you can hear through your headphones or speakers.'}
                        </p>
                      </div>
                    </div>

                    {/* Option 2: Record game audio only */}
                    <div
                      onClick={() => setSettings({ audioRecordingOption: 'game_only' })}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        settings.audioRecordingOption === 'game_only'
                          ? 'bg-white/[0.06] border-white/30 text-white'
                          : 'bg-white/[0.01] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="pt-0.5">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          settings.audioRecordingOption === 'game_only'
                            ? 'border-white bg-white'
                            : 'border-white/30'
                        }`}>
                          {settings.audioRecordingOption === 'game_only' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {language === 'de' ? 'Nur Spiel-Audio aufnehmen' : 'Record game audio only'}
                          </span>
                          <span className="text-xs">🎮</span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed">
                          {language === 'de'
                            ? 'Keine Hintergrundmusik, keine Benachrichtigungstöne. Nur der reine, direkte Gameplay-Sound des Spiels.'
                            : 'No background music, no notifications. Just that sweet, precious gameplay audio.'}
                        </p>
                      </div>
                    </div>

                    {/* Option 3: Record Game Audio and Discord Audio Only */}
                    <div
                      onClick={() => setSettings({ audioRecordingOption: 'game_and_discord' })}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                        settings.audioRecordingOption === 'game_and_discord'
                          ? 'bg-white/[0.06] border-white/30 text-white'
                          : 'bg-white/[0.01] border-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="pt-0.5">
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          settings.audioRecordingOption === 'game_and_discord'
                            ? 'border-white bg-white'
                            : 'border-white/30'
                        }`}>
                          {settings.audioRecordingOption === 'game_and_discord' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">
                            {language === 'de' ? 'Spiel-Audio und Discord-Audio aufnehmen' : 'Record Game Audio and Discord Audio Only'}
                          </span>
                          <span className="text-xs">🎮 💬</span>
                        </div>
                        <p className="text-[11px] text-white/40 leading-relaxed">
                          {language === 'de'
                            ? 'Nimmt ausschließlich das Gameplay-Audio und die Stimmen aus deiner Discord-App auf.'
                            : 'Only your gameplay audio and all audio from your Discord app.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Output Device Settings (Screenshot 3 Top) */}
                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white block">
                      {language === 'de' ? 'Ausgabegerät-Einstellungen (Headset / Lautsprecher)' : 'Output Device Settings'}
                    </span>
                    <button
                      onClick={loadHardwareDevices}
                      className="p-1 rounded bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                      title={language === 'de' ? 'Geräte aktualisieren' : 'Refresh devices'}
                    >
                      <RefreshCw size={12} className={isLoadingDevices ? 'animate-spin' : ''} />
                    </button>
                  </div>

                  {/* Audio Output Sources Dropdown */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-white/60 block">
                      {language === 'de' ? 'Audio-Ausgabequelle' : 'Audio Output Sources'}
                    </label>
                    <select
                      value={settings.audioOutputDeviceId || 'auto'}
                      onChange={e => setSettings({ audioOutputDeviceId: e.target.value })}
                      className="w-full bg-[#161822] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                    >
                      <option value="auto">Auto (Standard-Audiogerät)</option>
                      {audioOutputs.map(dev => (
                        <option key={dev.deviceId} value={dev.deviceId}>
                          {dev.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Output Volume Slider */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[11px] font-semibold text-white/60">
                        {language === 'de' ? 'Ausgabe-Lautstärke' : 'Output Volume'}
                      </span>
                      <span className="font-mono text-amber-400 font-bold">
                        {settings.audioOutputVolume ?? 100}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.audioOutputVolume ?? 100}
                      onChange={e => setSettings({ audioOutputVolume: parseInt(e.target.value) })}
                      className="w-full accent-amber-400"
                    />
                  </div>
                </div>

                {/* 3. Input Device Settings (Screenshot 3 Bottom) */}
                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                  <span className="text-xs font-bold text-white block">
                    {language === 'de' ? 'Eingabegerät-Einstellungen (Mikrofon)' : 'Input Device Settings'}
                  </span>

                  {/* Microphone Input Toggle */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#141620] border border-white/[0.04]">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">
                        {language === 'de' ? 'Mikrofon-Eingang (Microphone Input)' : 'Microphone Input'}
                      </span>
                      <span className="text-[11px] text-white/40 block">
                        {language === 'de'
                          ? 'Nimmt dein eigenes Mikrofon in Clips auf.'
                          : 'Include your microphone input in your clips. Better watch your mouth.'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-bold font-mono text-white/50">
                        {settings.captureMic ? 'ON' : 'OFF'}
                      </span>
                      <div 
                        onClick={() => setSettings({ captureMic: !settings.captureMic })}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${settings.captureMic ? 'bg-white' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${settings.captureMic ? 'left-6 bg-black' : 'left-1 bg-white/40'}`} />
                      </div>
                    </div>
                  </div>

                  {/* Mono Audio Input Toggle */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#141620] border border-white/[0.04]">
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-white block">
                        {language === 'de' ? 'Mono-Audio-Eingang (Mono Audio Input)' : 'Mono Audio Input'}
                      </span>
                      <span className="text-[11px] text-white/40 block">
                        {language === 'de'
                          ? 'Falls dein Mikrofon nur auf einer Seite aufnimmt, überschreibt dies das Signal, damit es auf beiden Ohren wiedergegeben wird.'
                          : 'If your microphone uses a mono input and we cannot detect it, you can override your microphone input so that it plays back in both ears.'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] font-bold font-mono text-white/50">
                        {settings.monoAudioInput ? 'ON' : 'OFF'}
                      </span>
                      <div 
                        onClick={() => setSettings({ monoAudioInput: !settings.monoAudioInput })}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${settings.monoAudioInput ? 'bg-white' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${settings.monoAudioInput ? 'left-6 bg-black' : 'left-1 bg-white/40'}`} />
                      </div>
                    </div>
                  </div>

                  {/* Microphone Device Dropdown & Volume (when mic enabled) */}
                  {settings.captureMic && (
                    <div className="space-y-3 pt-2 border-t border-white/[0.04]">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-white/60 block">
                          {language === 'de' ? 'Mikrofon-Gerät' : 'Microphone Device'}
                        </label>
                        <select
                          value={settings.micDeviceId || 'auto'}
                          onChange={e => setSettings({ micDeviceId: e.target.value })}
                          className="w-full bg-[#161822] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-white/30 cursor-pointer"
                        >
                          <option value="auto">Auto (Standard-Mikrofon)</option>
                          {audioInputs.map(dev => (
                            <option key={dev.deviceId} value={dev.deviceId}>
                              {dev.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[11px] font-semibold text-white/60">
                            {language === 'de' ? 'Mikrofon-Lautstärke (Input Volume)' : 'Input Volume'}
                          </span>
                          <span className="font-mono text-amber-400 font-bold">
                            {settings.micVolume || 80}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={settings.micVolume || 80}
                          onChange={e => setSettings({ micVolume: parseInt(e.target.value) })}
                          className="w-full accent-amber-400"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════ TAB 5: Hotkeys & Tasten ════════ */}
            {activeTab === 'hotkeys' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {language === 'de' ? 'Hotkeys & Tastenkombinationen' : 'Hotkeys & Keybinds'}
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de'
                      ? 'Lege globale Tastenkombinationen fest, um im Spiel sekundenschnell Clips zu speichern.'
                      : 'Assign global key combinations to capture gameplay highlights in-game.'}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-xs text-white block">
                        {language === 'de' ? 'Replay-Clip Hotkey (Letzte Sekunden aufnehmen)' : 'Replay Clip Hotkey (Capture Buffer)'}
                      </span>
                      <span className="text-white/40 text-[11px]">
                        {language === 'de' ? 'Funktioniert global in jedem laufenden Spiel.' : 'Works globally across all running games.'}
                      </span>
                    </div>
                    <span className="px-3.5 py-1.5 rounded-xl bg-white/10 font-mono font-bold text-white border border-white/15 text-xs">
                      {settings.hotkey || 'F8'}
                    </span>
                  </div>

                  {/* Presets Grid */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] text-white/50 font-semibold uppercase tracking-wider">
                      {language === 'de' ? 'Schnellauswahl' : 'Presets'}:
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {['F8', 'F9', 'F10', 'Alt+C'].map(hk => (
                        <button
                          key={hk}
                          onClick={() => setSettings({ hotkey: hk })}
                          className={`py-2.5 rounded-xl font-mono font-bold text-center text-xs border transition-all cursor-pointer ${
                            settings.hotkey === hk 
                              ? 'bg-white text-black border-white shadow-md' 
                              : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                          }`}
                        >
                          {hk}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Keybind Recording */}
                  <button
                    onClick={() => setIsRecordingCustomHotkey(!isRecordingCustomHotkey)}
                    className={`w-full py-3.5 rounded-xl border font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                      isRecordingCustomHotkey 
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse' 
                        : 'bg-white/[0.04] border-white/10 hover:border-white/30 text-white'
                    }`}
                  >
                    <Keyboard size={15} />
                    <span>
                      {isRecordingCustomHotkey 
                        ? (language === 'de' ? 'Drücke eine beliebige Taste auf der Tastatur...' : 'Press any key on keyboard...') 
                        : (language === 'de' ? 'Eigene Tastenkombination aufnehmen (Klicken & Taste drücken)' : 'Record Custom Keybind (Click & Press Key)')}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* ════════ TAB 6: Speicherort ════════ */}
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {language === 'de' ? 'Speicherort & Dateiverwaltung' : 'Storage & File Directory'}
                  </h2>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de'
                      ? 'Verwalte den Speicherpfad und den Festplattenplatz für deine Gameplay-Aufnahmen.'
                      : 'Manage the directory and disk usage of your clips.'}
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                  <div>
                    <span className="font-bold text-xs text-white block">
                      {language === 'de' ? 'Standard-Speicherordner für Clips' : 'Default Clips Directory'}
                    </span>
                    <span className="text-white/40 text-[11px]">
                      {language === 'de' ? 'Hier werden alle aufgenommenen Videodateien und Metadaten abgelegt.' : 'Where all recorded video files are saved.'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#141620] border border-white/[0.06] font-mono text-xs text-white/80 flex items-center justify-between gap-3">
                    <span className="truncate">{settings.savePath || 'Videos / Eclipse Clips'}</span>
                    <button
                      onClick={handlePickFolder}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-xs font-semibold whitespace-nowrap cursor-pointer transition-all border border-white/10"
                    >
                      {language === 'de' ? 'Ordner ändern' : 'Change Folder'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <button
                      onClick={handleOpenFolder}
                      className="text-xs text-white/70 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <FolderOpen size={14} />
                      <span>{language === 'de' ? 'In Windows Explorer öffnen' : 'Open in Windows Explorer'}</span>
                    </button>

                    <span className="text-xs font-mono text-white/40">
                      {clips.length} Clips • {clips.reduce((acc, c) => acc + (c.fileSize || 0), 0) > 0 
                        ? `${(clips.reduce((acc, c) => acc + (c.fileSize || 0), 0) / (1024 * 1024)).toFixed(1)} MB` 
                        : '0 MB'}
                    </span>
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

    </div>
  )
}
