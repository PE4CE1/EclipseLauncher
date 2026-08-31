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

function CustomSelect({ value, onChange, options, className }: { value: any, onChange: (val: any) => void, options: { value: any, label: string }[], className?: string }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectedLabel = options.find(o => String(o.value) === String(value))?.label || options[0]?.label || "";
  
  return (
    <div className={"relative " + (className || "")}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#161822] border border-white/10 rounded-xl px-3 py-2 text-xs text-white cursor-pointer flex items-center justify-between hover:border-white/30 transition-colors select-none"
      >
        <span className="truncate">{selectedLabel}</span>
        <svg className={"w-4 h-4 transition-transform " + (isOpen ? "rotate-180" : "")} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </div>
      <AnimatePresence>
        {isOpen && (
          <React.Fragment>
            <div className="fixed inset-0 z-[9999]" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: -4, scale: 0.98 }} 
              animate={{ opacity: 1, y: 0, scale: 1 }} 
              exit={{ opacity: 0, y: -4, scale: 0.98 }} 
              transition={{ duration: 0.12 }}
              className="absolute z-[10000] w-full mt-1.5 bg-[#161822] border border-white/15 rounded-xl shadow-2xl overflow-y-auto max-h-56 custom-scrollbar p-1 backdrop-blur-xl"
            >
              {options.map((opt, i) => (
                <div 
                  key={opt.value + "-" + i}
                  onClick={() => { onChange(opt.value); setIsOpen(false) }}
                  className={"px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors " + (String(value) === String(opt.value) ? "bg-amber-400/20 text-amber-400 font-bold" : "text-white/80 hover:bg-white/10 hover:text-white")}
                >
                  {opt.label}
                </div>
              ))}
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ClipSettingsPanel({ onBack }: ClipSettingsPanelProps) {
  const { language } = useTranslation()
  const { settings, setSettings, clips, refreshClips } = useClipStore()
  
  const [activeTab, setActiveTab] = useState<'capture' | 'autoclip' | 'screen' | 'video' | 'audio' | 'hotkeys' | 'storage'>('capture')
  const [isRecordingCustomHotkey, setIsRecordingCustomHotkey] = useState(false)
  
  const [audioOutputs, setAudioOutputs] = useState<AudioDevice[]>([])
  const [audioInputs, setAudioInputs] = useState<AudioDevice[]>([])
  const [screenSources, setScreenSources] = useState<ScreenSource[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(false)

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
    { id: 'autoclip', label: language === 'de' ? 'Smart Auto-Clipping' : 'Smart Auto-Clipping', icon: Sparkles, badge: 'BETA' },
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
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all text-left cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black font-bold shadow-md'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon size={15} />
                    <span className="truncate">{tab.label}</span>
                  </div>
                  {tab.badge && (
                    <span className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${
                      isSelected 
                        ? 'bg-black text-amber-400 border border-black/20' 
                        : 'bg-amber-400/20 text-amber-400 border border-amber-400/30'
                    }`}>
                      {tab.badge}
                    </span>
                  )}
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


            {/* ════════ TAB: Smart Auto-Clipping ════════ */}
            {activeTab === 'autoclip' && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="p-1.5 rounded-lg bg-amber-400/10 text-amber-400 border border-amber-400/20">
                      <Sparkles size={16} />
                    </span>
                    <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      <span>{language === 'de' ? 'Smart Auto-Clipping (AI & Events)' : 'Smart Auto-Clipping (AI & Events)'}</span>
                    </h2>
                    <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-md bg-amber-400/20 text-amber-400 border border-amber-400/30">
                      BETA
                    </span>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    {language === 'de' 
                      ? 'Nimmt Tore, Kills und epische Momente vollautomatisch im Hintergrund auf – ohne dass du eine Taste drücken musst. 100% bannfrei & ohne DLL-Injection.'
                      : 'Automatically captures goals, frags, and highlight moments in the background without pressing a hotkey. 100% safe & anti-cheat certified.'}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Master Switch */}
                  <SettingToggle
                    title={language === 'de' ? 'Smart Auto-Clipping aktivieren' : 'Enable Smart Auto-Clipping'}
                    description={language === 'de' ? 'Aktiviert die automatische Erkennung von Match-Highlights in unterstützten Spielen.' : 'Enables automatic highlight detection for supported games.'}
                    checked={settings.autoClipEnabled === true}
                    onChange={() => setSettings({ autoClipEnabled: !settings.autoClipEnabled })}
                  />

                  {/* Rocket League Highlights */}
                  <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-white block">
                          ⚽ Rocket League Highlights
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Log & Replay Engine
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SettingToggle
                        title={language === 'de' ? 'Tore automatisch clippen' : 'Auto-Clip Goals'}
                        description={language === 'de' ? 'Clippt automatisch, wenn ein Tor erzielt wird.' : 'Clips when a goal is scored.'}
                        checked={settings.autoClipRocketLeagueGoals !== false}
                        onChange={() => setSettings({ autoClipRocketLeagueGoals: settings.autoClipRocketLeagueGoals !== false ? false : true })}
                      />
                      <SettingToggle
                        title={language === 'de' ? 'Glanzparaden / Saves clippen' : 'Auto-Clip Epic Saves'}
                        description={language === 'de' ? 'Clippt spektakuläre Torhüter-Paraden.' : 'Clips incredible saves and goal stops.'}
                        checked={settings.autoClipRocketLeagueSaves !== false}
                        onChange={() => setSettings({ autoClipRocketLeagueSaves: settings.autoClipRocketLeagueSaves !== false ? false : true })}
                      />
                      <SettingToggle
                        title={language === 'de' ? 'Demolitions clippen' : 'Auto-Clip Demolitions'}
                        description={language === 'de' ? 'Clippt Explosionen von gegnerischen Fahrzeugen.' : 'Clips vehicle demolitions.'}
                        checked={settings.autoClipRocketLeagueDemos === true}
                        onChange={() => setSettings({ autoClipRocketLeagueDemos: !settings.autoClipRocketLeagueDemos })}
                      />
                      <SettingToggle
                        title={language === 'de' ? 'Match-Siege clippen' : 'Auto-Clip Match Wins'}
                        description={language === 'de' ? 'Clippt den Sieg-Bildschirm am Ende des Matches.' : 'Clips the victory celebration on match win.'}
                        checked={settings.autoClipRocketLeagueWins !== false}
                        onChange={() => setSettings({ autoClipRocketLeagueWins: settings.autoClipRocketLeagueWins !== false ? false : true })}
                      />
                    </div>
                  </div>

                  {/* CS2 Highlights */}
                  <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4">
                    <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-bold text-white block">
                          🎯 Counter-Strike 2 (CS2) Highlights
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Valve Game State Integration
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SettingToggle
                        title={language === 'de' ? 'Kills & Multi-Kills clippen' : 'Auto-Clip Kills & Aces'}
                        description={language === 'de' ? 'Clippt Kills, Multi-Kills und 5k Aces automatisch.' : 'Clips frags, multi-kills and aces automatically.'}
                        checked={settings.autoClipCS2Kills !== false}
                        onChange={() => setSettings({ autoClipCS2Kills: settings.autoClipCS2Kills !== false ? false : true })}
                      />
                      <SettingToggle
                        title={language === 'de' ? 'Rundensiege clippen' : 'Auto-Clip Round Wins'}
                        description={language === 'de' ? 'Clippt gewonnene Clutch-Runden.' : 'Clips clutch round victories.'}
                        checked={settings.autoClipCS2Wins === true}
                        onChange={() => setSettings({ autoClipCS2Wins: !settings.autoClipCS2Wins })}
                      />
                    </div>
                  </div>

                  {/* Clip Cooldown Setting */}
                  <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-white block">
                          {language === 'de' ? 'Anti-Spam Cooldown zwischen Auto-Clips' : 'Anti-Spam Cooldown between Auto-Clips'}
                        </span>
                        <span className="text-white/40 text-[11px]">
                          {language === 'de' ? 'Mindestabstand zwischen zwei automatischen Clips, um Duplikate zu verhindern.' : 'Minimum interval between triggers to prevent duplicate clips.'}
                        </span>
                      </div>
                      <span className="px-3 py-1 rounded-xl bg-white/10 font-mono text-amber-400 font-bold text-xs border border-white/10">
                        {settings.autoClipCooldownSeconds || 15}s
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 pt-1">
                      {[10, 15, 20, 30].map(sec => {
                        const isSel = (settings.autoClipCooldownSeconds || 15) === sec
                        return (
                          <button
                            key={sec}
                            onClick={() => setSettings({ autoClipCooldownSeconds: sec })}
                            className={'py-2.5 rounded-xl text-center font-mono font-semibold text-xs border transition-all cursor-pointer ' + (
                              isSel
                                ? 'bg-white text-black border-white shadow-md'
                                : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                            )}
                          >
                            {sec}s Cooldown
                          </button>
                        )
                      })}
                    </div>
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
                      <CustomSelect value={settings.quality || "1080p"} onChange={val => setSettings({ quality: val as any, qualityPreset: "custom" })} options={[{ value: "4k", label: "4K Ultra HD (2160p)" }, { value: "1440p", label: "2K Quad HD (1440p)" }, { value: "1080p", label: "Full HD (1080p)" }, { value: "720p", label: "Standard HD (720p)" }, { value: "480p", label: "Low (480p)" }, { value: "360p", label: "Fast Share (360p)" }]} />
                    </div>

                    {/* FPS */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Bildwiederholrate (FPS)' : 'FPS'}
                      </label>
                      <CustomSelect value={settings.fps || 60} onChange={val => setSettings({ fps: parseInt(val) as any, qualityPreset: "custom" })} options={[{ value: 60, label: language === "de" ? "60 FPS (Flüssig & Standard)" : "60 FPS (Smooth & Standard)" }, { value: 30, label: language === "de" ? "30 FPS (Ressourcensparend)" : "30 FPS (Resource Saving)" }, { value: 24, label: language === "de" ? "24 FPS (Kino-Look)" : "24 FPS (Cinematic)" }]} />
                    </div>

                    {/* Bitrate */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Bitrate' : 'Bitrate'}
                      </label>
                      <CustomSelect value={settings.bitrate || "10M"} onChange={val => setSettings({ bitrate: val as any, qualityPreset: "custom" })} options={[{ value: "50M", label: "50 Mbps (Max)" }, { value: "30M", label: "30 Mbps (Ultra)" }, { value: "15M", label: "15 Mbps (High)" }, { value: "10M", label: "10 Mbps (Standard)" }, { value: "5M", label: "5 Mbps (Low)" }]} />
                    </div>
                  </div>

                  {/* Row 2: Video Encoder, Selected GPU, Codec */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-white/[0.04]">
                    {/* Video Encoder */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Video-Encoder' : 'Video Encoder'}
                      </label>
                      <CustomSelect value={settings.videoEncoder || "gpu"} onChange={val => setSettings({ videoEncoder: val as any, qualityPreset: "custom" })} options={[{ value: "gpu", label: language === "de" ? "Hardware GPU (Empfohlen)" : "Hardware GPU (Recommended)" }, { value: "cpu", label: language === "de" ? "Software CPU (Langsam)" : "Software CPU (Slow)" }]} />
                    </div>

                    {/* Selected GPU */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Gewählte GPU' : 'Selected GPU'}
                      </label>
                      <CustomSelect value={settings.selectedGpu || "auto"} onChange={val => setSettings({ selectedGpu: val, qualityPreset: "custom" })} options={[{ value: "auto", label: language === "de" ? "Automatisch (Beste verfügbare GPU)" : "Auto (Best available GPU)" }, { value: "nvidia", label: "NVIDIA (NVENC)" }, { value: "amd", label: "AMD (AMF)" }, { value: "intel", label: "Intel (QuickSync)" }]} />
                    </div>

                    {/* Codec */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-white/60 block">
                        {language === 'de' ? 'Codec' : 'Codec'}
                      </label>
                      <CustomSelect value={settings.codec || "h264"} onChange={val => setSettings({ codec: val as any, qualityPreset: "custom" })} options={[{ value: "h264", label: "H.264 (Maximale Kompatibilität)" }, { value: "vp8", label: "VP8 (Web-Optimiert)" }]} />
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
                    <CustomSelect value={settings.audioOutputDeviceId || "auto"} onChange={val => setSettings({ audioOutputDeviceId: val })} options={[{ value: "auto", label: language === "de" ? "Auto (Standard-Audiogerät)" : "Auto (Default Audio Device)" }, ...audioOutputs.map(dev => ({ value: dev.deviceId, label: dev.label }))]} />
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
                        <CustomSelect value={settings.micDeviceId || "auto"} onChange={val => setSettings({ micDeviceId: val })} options={[{ value: "auto", label: language === "de" ? "Auto (Standard-Mikrofon)" : "Auto (Default Microphone)" }, ...audioInputs.map(dev => ({ value: dev.deviceId, label: dev.label }))]} />
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

                <div className="p-5 rounded-2xl bg-[#0e1017] border border-white/[0.08] space-y-4 relative">
                  <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500 text-black text-[9px] font-bold uppercase rounded-bl-xl rounded-tr-2xl z-10">BETA</div>
                  <div className="flex items-start gap-3">
                    <Mic className="text-amber-500 mt-0.5" size={18} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-white block">
                          {language === 'de' ? 'Voice Capture (Clips per Sprachbefehl)' : 'Voice Capture (Clips via Voice)'}
                        </span>
                        <button
                          onClick={() => setSettings({ voiceCaptureEnabled: !settings.voiceCaptureEnabled })}
                          className={`w-10 h-5 rounded-full relative transition-colors ${settings.voiceCaptureEnabled ? 'bg-amber-500' : 'bg-white/10'}`}
                        >
                          <span className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${settings.voiceCaptureEnabled ? 'left-[22px]' : 'left-1'}`} />
                        </button>
                      </div>
                      <span className="text-white/40 text-[10px] leading-relaxed block mt-1">
                        {language === 'de' 
                          ? 'Erstelle Clips nur mit deiner Stimme, ohne die Hände von der Tastatur zu nehmen! (Mikrofonzugriff erforderlich)'
                          : 'Create clips using just your voice without taking your hands off the keyboard! (Requires microphone access)'}
                      </span>
                    </div>
                  </div>
                  <AnimatePresence>
                    {settings.voiceCaptureEnabled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pt-3 border-t border-white/5 space-y-4"
                      >
                        <div className="space-y-2">
                          <label className="text-[11px] font-semibold text-white/60 block">
                            {language === 'de' ? 'Sprachbefehl auswählen (100% Zuverlässig)' : 'Select Voice Phrase (100% Reliable)'}
                          </label>
                          
                          {/* Predefined Guaranteed Hotword Buttons */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {[
                              { phrase: 'clip that', label: 'Clip That', tag: 'Standard' },
                              { phrase: 'eclipse that', label: 'Eclipse That', tag: 'Eclipse' },
                              { phrase: 'clip it', label: 'Clip It', tag: 'Quick' },
                              { phrase: 'save clip', label: 'Save Clip', tag: 'Classic' },
                              { phrase: 'clip das', label: 'Clip das', tag: 'DE' },
                              { phrase: 'clip das mal', label: 'Clip das mal', tag: 'DE' },
                            ].map((preset) => {
                              const isSelected = (settings.voiceCapturePhrase || 'clip that').toLowerCase().trim() === preset.phrase.toLowerCase()
                              return (
                                <button
                                  key={preset.phrase}
                                  type="button"
                                  onClick={() => setSettings({ voiceCapturePhrase: preset.phrase })}
                                  className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-300 shadow-md ring-1 ring-amber-500/30'
                                      : 'bg-[#161822] border-white/10 text-white/80 hover:bg-white/[0.06] hover:text-white'
                                  }`}
                                >
                                  <span className="text-xs font-semibold">{preset.label}</span>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                    isSelected ? 'bg-amber-500/30 text-amber-200' : 'bg-white/5 text-white/40'
                                  }`}>
                                    {preset.tag}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                          <span className="text-[10px] text-white/40 leading-tight block pt-1">
                            {language === 'de' 
                              ? 'Wähle deinen gewünschten Sprachbefehl. Das System reagiert präzise auf diese Phrase.' 
                              : 'Select your preferred voice command. The system listens precisely for this phrase.'}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[11px] font-semibold text-white/60 block flex justify-between">
                            {language === 'de' ? 'Mikrofon für Sprachsteuerung' : 'Voice Capture Microphone'}
                          </label>
                          <CustomSelect value={settings.micDeviceId || 'auto'} onChange={val => setSettings({ micDeviceId: val })} options={[{ value: 'auto', label: language === 'de' ? 'Auto (Standard-Mikrofon)' : 'Auto (Default Microphone)' }, ...audioInputs.map(dev => ({ value: dev.deviceId, label: dev.label }))]} />
                          <span className="text-[10px] text-white/40 leading-tight block">
                            {language === 'de' ? 'Stelle sicher, dass dein primäres Mikrofon ausgewählt ist.' : 'Ensure your primary microphone is selected.'}
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
