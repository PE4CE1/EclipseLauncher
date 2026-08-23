import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Scissors, Film, Mic, Keyboard, FolderOpen, Volume2, ShieldCheck,
  Check, Settings, ArrowLeft, RotateCcw, Sliders, Bell
} from 'lucide-react'
import { useClipStore } from '../../store/clipStore'
import { useTranslation } from '../../hooks/useTranslation'
import { sendAppNotification } from '../../services/notificationService'

interface ClipSettingsPanelProps {
  onBack?: () => void
}

export function ClipSettingsPanel({ onBack }: ClipSettingsPanelProps) {
  const { language } = useTranslation()
  const { settings, setSettings, clips, refreshClips } = useClipStore()
  const [activeTab, setActiveTab] = useState<'capture' | 'video' | 'audio' | 'hotkeys' | 'storage'>('capture')
  const [isRecordingCustomHotkey, setIsRecordingCustomHotkey] = useState(false)

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

  // Clean Checkbox / Switch Row
  const SettingSwitchRow = ({
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
      className="p-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/15 transition-all flex items-center justify-between gap-4 cursor-pointer"
    >
      <div className="space-y-0.5 min-w-0 flex-1">
        <span className="font-semibold text-white text-xs block">{title}</span>
        {description && <span className="text-white/40 text-[11px] block leading-relaxed">{description}</span>}
      </div>
      <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ${checked ? 'bg-white' : 'bg-white/10'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full transition-transform ${checked ? 'left-6 bg-black' : 'left-1 bg-white/40'}`} />
      </div>
    </div>
  )

  const TABS = [
    { id: 'capture', label: language === 'de' ? 'Aufnahme & Replay' : 'Capture & Replay', icon: Scissors },
    { id: 'video', label: language === 'de' ? 'Qualität & Bitrate' : 'Quality & Bitrate', icon: Film },
    { id: 'audio', label: language === 'de' ? 'Audio & Mikrofon' : 'Audio & Voice', icon: Mic },
    { id: 'hotkeys', label: language === 'de' ? 'Hotkeys & Tasten' : 'Hotkeys', icon: Keyboard },
    { id: 'storage', label: language === 'de' ? 'Speicherort & Dateien' : 'Storage & Files', icon: FolderOpen },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white/70 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft size={14} />
              <span>{language === 'de' ? 'Zurück zu Clips' : 'Back to Clips'}</span>
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>{language === 'de' ? 'Clips Studio Einstellungen' : 'Clips Studio Settings'}</span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                MEDAL CORE
              </span>
            </h1>
            <p className="text-xs text-white/50">
              {language === 'de' 
                ? 'Konfiguriere Replay-Buffer, Videoqualität, Audioquellen und Tastenkombinationen für deine Gameplay-Aufnahmen.'
                : 'Configure replay buffer, video quality, audio sources, and hotkeys for gameplay clipping.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenFolder()}
            className="px-3.5 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 transition-all text-white text-xs font-semibold flex items-center gap-2 cursor-pointer"
          >
            <FolderOpen size={14} />
            <span>{language === 'de' ? 'Ordner öffnen' : 'Open Folder'}</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-1 bg-white/[0.02] p-1 rounded-2xl border border-white/[0.06] overflow-x-auto scrollbar-none">
        {TABS.map(tab => {
          const Icon = tab.icon
          const isSelected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer flex-1 justify-center ${
                isSelected 
                  ? 'bg-white text-black font-bold shadow-md' 
                  : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Contents */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="space-y-6"
      >
        
        {/* ─── TAB 1: Aufnahme & Replay-Buffer ─── */}
        {activeTab === 'capture' && (
          <div className="space-y-4">
            <div className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Scissors size={14} className="text-white/70" />
                <span>{language === 'de' ? 'Replay-Buffer & Hintergrund-Aufnahme' : 'Replay Buffer & Background Capture'}</span>
              </h3>

              <SettingSwitchRow
                title={language === 'de' ? 'Replay-Buffer aktivieren' : 'Enable Replay Buffer'}
                description={language === 'de' ? 'Hält laufend die letzten Sekunden im Arbeitsspeicher, um beim Drücken des Hotkeys sofort den Clip zu speichern.' : 'Keeps a rolling buffer in memory so you can capture clips on demand.'}
                checked={settings.enabled}
                onChange={() => setSettings({ enabled: !settings.enabled })}
              />

              {/* Replay Duration Grid */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white text-xs block">
                      {language === 'de' ? 'Replay-Buffer Dauer (Cliplänge)' : 'Replay Buffer Duration (Clip Length)'}
                    </span>
                    <span className="text-white/40 text-[11px]">
                      {language === 'de' ? 'Wie viele Sekunden Gameplay rückwirkend gespeichert werden' : 'How many seconds of gameplay are saved on keypress'}
                    </span>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    {settings.replayDurationSeconds} {language === 'de' ? 'Sekunden' : 'Seconds'}
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
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
                        {sec >= 60 ? `${sec / 60} min` : `${sec}s`}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <SettingSwitchRow
                  title={language === 'de' ? 'Auto-Start bei Spielstart' : 'Auto-Start on Game Launch'}
                  description={language === 'de' ? 'Startet den Replay-Buffer automatisch im Hintergrund, wenn ein Spiel gestartet wird.' : 'Automatically starts buffer when a game is launched.'}
                  checked={settings.autoStartOnGame !== false}
                  onChange={() => setSettings({ autoStartOnGame: settings.autoStartOnGame !== false ? false : true })}
                />

                <SettingSwitchRow
                  title={language === 'de' ? 'HUD-Benachrichtigung nach Clip' : 'HUD Notification on Clip'}
                  description={language === 'de' ? 'Zeigt einen kurzen Toast "Clip gespeichert! 🎮" an, wenn ein Clip erstellt wurde.' : 'Displays toast alert when a clip is captured.'}
                  checked={settings.notifyOnClip !== false}
                  onChange={() => setSettings({ notifyOnClip: settings.notifyOnClip !== false ? false : true })}
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 2: Video & Qualität ─── */}
        {activeTab === 'video' && (
          <div className="space-y-4">
            <div className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Film size={14} className="text-white/70" />
                <span>{language === 'de' ? 'Auflösung, Framerate & Bitrate' : 'Resolution, Frame Rate & Bitrate'}</span>
              </h3>

              {/* Resolution */}
              <div className="space-y-2">
                <span className="font-semibold text-white text-xs block">
                  {language === 'de' ? 'Aufnahme-Auflösung' : 'Capture Resolution'}
                </span>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: '1440p', label: '1440p (2K Ultra)', desc: '2560 × 1440' },
                    { id: '1080p', label: '1080p (Full HD)', desc: '1920 × 1080 (Empfohlen)' },
                    { id: '720p', label: '720p (HD)', desc: '1280 × 720 (Geringe Last)' },
                  ].map(q => (
                    <button
                      key={q.id}
                      onClick={() => setSettings({ quality: q.id as any })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.quality === q.id 
                          ? 'bg-white text-black border-white shadow-md' 
                          : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span className="font-bold text-xs block">{q.label}</span>
                      <span className={`text-[10px] block mt-0.5 ${settings.quality === q.id ? 'text-black/60 font-mono' : 'text-white/40 font-mono'}`}>
                        {q.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame Rate */}
              <div className="space-y-2">
                <span className="font-semibold text-white text-xs block">
                  {language === 'de' ? 'Bildwiederholrate (FPS)' : 'Frame Rate (FPS)'}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 60, label: '60 FPS (Flüssig / Silky Smooth)', desc: 'Optimale Bewegungsschärfe' },
                    { id: 30, label: '30 FPS (Standard)', desc: 'Minimalste Dateigröße' },
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setSettings({ fps: f.id as any })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        settings.fps === f.id 
                          ? 'bg-white text-black border-white shadow-md' 
                          : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span className="font-bold text-xs block">{f.label}</span>
                      <span className={`text-[10px] block mt-0.5 ${settings.fps === f.id ? 'text-black/60' : 'text-white/40'}`}>
                        {f.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Bitrate Control */}
              <div className="space-y-2">
                <span className="font-semibold text-white text-xs block">
                  {language === 'de' ? 'Video-Bitrate & Kodierung' : 'Video Bitrate'}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'ultra', label: 'Ultra (20M)', desc: 'Maximale Details' },
                    { id: 'high', label: 'Hoch (12M)', desc: 'Empfohlen' },
                    { id: 'medium', label: 'Mittel (8M)', desc: 'Ausgewogen' },
                    { id: 'low', label: 'Sparsam (5M)', desc: 'Kleine Dateien' },
                  ].map(b => (
                    <button
                      key={b.id}
                      onClick={() => setSettings({ bitrate: b.id as any })}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        (settings.bitrate || 'high') === b.id 
                          ? 'bg-white text-black border-white shadow-md' 
                          : 'bg-white/[0.02] border-white/[0.06] text-white/50 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <span className="font-bold text-xs block">{b.label}</span>
                      <span className={`text-[10px] block ${(settings.bitrate || 'high') === b.id ? 'text-black/60' : 'text-white/40'}`}>
                        {b.desc}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 100% Watermark Free */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-3">
                <ShieldCheck size={20} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <span className="font-bold text-xs text-white block">
                    {language === 'de' ? '100% Kostenlos & Ohne Wasserzeichen' : '100% Free & No Watermarks'}
                  </span>
                  <span className="text-[11px] text-white/40">
                    {language === 'de' 
                      ? 'Alle Clips werden sauber in Originalqualität ohne Einblendungen oder störende Logos exportiert.'
                      : 'All clips are exported in native quality with zero watermarks or ads.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 3: Audio & Mikrofon ─── */}
        {activeTab === 'audio' && (
          <div className="space-y-4">
            <div className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Mic size={14} className="text-white/70" />
                <span>{language === 'de' ? 'Audio-Quellen & Pegel' : 'Audio Sources & Levels'}</span>
              </h3>

              {/* Game Audio Volume */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Volume2 size={16} className="text-white/60" />
                    <div>
                      <span className="font-semibold text-white text-xs block">
                        {language === 'de' ? 'Spiel-Sound Lautstärke' : 'Game Audio Volume'}
                      </span>
                      <span className="text-white/40 text-[11px]">
                        {language === 'de' ? 'Lautstärke der System- und Spielgeräusche im Clip' : 'System and gameplay sound level in clips'}
                      </span>
                    </div>
                  </div>
                  <span className="font-mono text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                    {settings.gameAudioVolume ?? 100}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={settings.gameAudioVolume ?? 100}
                  onChange={e => setSettings({ gameAudioVolume: parseInt(e.target.value) })}
                  className="w-full accent-white"
                />
              </div>

              {/* Microphone Toggle & Gain */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Mic size={16} className="text-white/60" />
                    <div>
                      <span className="font-semibold text-white text-xs block">
                        {language === 'de' ? 'Eigenes Mikrofon aufnehmen' : 'Include Microphone in Clips'}
                      </span>
                      <span className="text-white/40 text-[11px]">
                        {language === 'de' ? 'Nimmt deine eigene Stimme parallel zum Spiel auf' : 'Records your voice microphone alongside the game'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setSettings({ captureMic: !settings.captureMic })}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      settings.captureMic 
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' 
                        : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    {settings.captureMic ? (language === 'de' ? 'Aktiv' : 'On') : (language === 'de' ? 'Aus' : 'Off')}
                  </button>
                </div>

                {settings.captureMic && (
                  <div className="pt-3 border-t border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-white/70">
                        {language === 'de' ? 'Mikrofon-Lautstärke (Gain)' : 'Microphone Volume (Gain)'}:
                      </span>
                      <span className="font-mono text-emerald-400 font-bold text-xs bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {settings.micVolume || 80}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={settings.micVolume || 80}
                      onChange={e => setSettings({ micVolume: parseInt(e.target.value) })}
                      className="w-full accent-emerald-400"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB 4: Hotkeys ─── */}
        {activeTab === 'hotkeys' && (
          <div className="space-y-4">
            <div className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Keyboard size={14} className="text-white/70" />
                <span>{language === 'de' ? 'Globale Tastenkombinationen' : 'Global Hotkeys'}</span>
              </h3>

              {/* Replay Hotkey Box */}
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-white text-xs block">
                      {language === 'de' ? 'Replay-Clip Hotkey (Letzte Sekunden aufnehmen)' : 'Replay Clip Hotkey (Capture Buffer)'}
                    </span>
                    <span className="text-white/40 text-[11px]">
                      {language === 'de' ? 'Funktioniert global in jedem laufenden Spiel' : 'Works globally across all running games'}
                    </span>
                  </div>
                  <span className="px-3 py-1.5 rounded-xl bg-white/10 font-mono font-bold text-white border border-white/15 text-xs">
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
                  className={`w-full py-3 rounded-xl border font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
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
          </div>
        )}

        {/* ─── TAB 5: Speicherort ─── */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="bg-[#0c0d12] border border-white/[0.08] rounded-2xl p-6 space-y-5">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <FolderOpen size={14} className="text-white/70" />
                <span>{language === 'de' ? 'Speicherort & Dateiverwaltung' : 'Storage & File Directory'}</span>
              </h3>

              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                <div>
                  <span className="font-semibold text-white text-xs block">
                    {language === 'de' ? 'Standard-Speicherordner für Clips' : 'Default Clips Directory'}
                  </span>
                  <span className="text-white/40 text-[11px]">
                    {language === 'de' ? 'Hier werden alle Gameplay-Videos und Thumbnails abgespeichert' : 'Where all recorded gameplay video files and thumbnails are stored'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#14161c] border border-white/[0.06] font-mono text-xs text-white/80 flex items-center justify-between gap-3">
                  <span className="truncate">{settings.savePath || 'Videos / Eclipse Clips'}</span>
                  <button
                    onClick={handlePickFolder}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-sans text-xs font-semibold whitespace-nowrap cursor-pointer transition-all border border-white/10"
                  >
                    {language === 'de' ? 'Ordner ändern' : 'Change Folder'}
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleOpenFolder}
                    className="text-xs text-white/70 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <FolderOpen size={14} />
                    <span>{language === 'de' ? 'Ordner in Windows Explorer öffnen' : 'Open in Windows Explorer'}</span>
                  </button>

                  <span className="text-xs font-mono text-white/40">
                    {clips.length} Clips • {clips.reduce((acc, c) => acc + (c.fileSize || 0), 0) > 0 ? `${(clips.reduce((acc, c) => acc + (c.fileSize || 0), 0) / (1024 * 1024)).toFixed(1)} MB` : '0 MB'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

      </motion.div>

    </div>
  )
}
