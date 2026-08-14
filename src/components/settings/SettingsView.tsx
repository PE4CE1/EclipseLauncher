import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  User, RefreshCw, Save, Shield,
  Settings as SettingsIcon, Download, Bell, Gamepad2, 
  Link, Monitor, Check, Plus, Trash, Loader2, Folder, Volume2
} from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useScanner } from '../../hooks/useScanner'
import { useSourceStore } from '../../store/sourceStore'
import { useTranslation } from '../../hooks/useTranslation'
import { GameplayOverlayTab } from './GameplayOverlayTab'
import { fetchSteamUserProfile } from '../../services/steamService'
import { sendAppNotification } from '../../services/notificationService'
import { playNotificationChime, playNotificationSound, getSoundPresets } from '../../services/soundService'

export function SettingsView() {
  const { settings, updateSettings, scanMessage, isScanning } = useGameStore()
  const { showNotification, activeSettingsTab, setActiveSettingsTab } = useUIStore()
  const { scan } = useScanner()
  const { sources, syncSource, syncAll, addSource, removeSource, removeAllSources } = useSourceStore()
  const { t, language } = useTranslation()

  const TABS = [
    { id: 'general', label: t('general'), icon: SettingsIcon },
    { id: 'downloads', label: t('downloads'), icon: Download },
    { id: 'notifications', label: t('notificationsTab'), icon: Bell },
    { id: 'gameplay', label: t('gameplay'), icon: Gamepad2 },
    { id: 'integrations', label: t('integrations'), icon: Link },
    { id: 'system', label: t('system') || 'System', icon: Monitor },
    { id: 'profile', label: t('profileSettings'), icon: User },
  ]

  const [localSettings, setLocalSettings] = useState(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [showAddSource, setShowAddSource] = useState(false)

  const [startupOptions] = useState({
    exitInsteadOfMinimize: true,
    hideToTray: false,
    startOnBoot: true,
    startMinimized: false,
    launchInLibrary: false,
    autoCheckUpdates: settings.autoCheckUpdates ?? true
  })
  const [downloadOptions, setDownloadOptions] = useState({
    speedLimit: '0',
    adapter: 'All adapters',
    seedAfter: false,
    unpackAuto: true,
    showMBps: false,
    deleteArchive: false,
    createShortcut: true
  })

  useEffect(() => { setLocalSettings(settings) }, [settings])

  function set(key: string, value: any) {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  async function handleBrowsePath() {
    if (window.electronAPI?.selectDirectory) {
      const p = await window.electronAPI.selectDirectory()
      if (p) set('downloadPath', p)
    } else {
      showNotification(t('notSupportedInBrowser'), 'info')
    }
  }

  async function save() {
    if (isSaving) return
    setIsSaving(true)
    setSaveState('saving')
    const newSettings = { ...localSettings, autoCheckUpdates: startupOptions.autoCheckUpdates }
    updateSettings(newSettings)
    if (window.electronAPI) {
      await window.electronAPI.setSettings(newSettings as any)
    }
    setTimeout(() => {
      setIsSaving(false)
      setSaveState('saved')
      if (newSettings.soundEffects ?? true) {
        playNotificationSound(newSettings.notificationSound || 'eclipse_calm')
      }
      showNotification(t('settingsSaved') || 'Settings saved', 'success', 'Eclipse Launcher', 2000)
      setTimeout(() => {
        setSaveState('idle')
      }, 1500)
    }, 350)
  }

  function handleAddSource() {
    if (!newSourceUrl) return
    addSource(newSourceUrl)
    setNewSourceUrl('')
    setShowAddSource(false)
  }

  // Reusable clean monochrome checkbox
  const CleanCheckbox = ({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) => (
    <label className="flex items-start gap-3 cursor-pointer group select-none">
      <div 
        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all duration-150 flex-shrink-0 mt-0.5 ${
          checked 
            ? 'bg-white border-white text-black shadow-sm' 
            : 'bg-white/[0.04] border-white/20 group-hover:border-white/40'
        }`}
      >
        {checked && <Check size={13} strokeWidth={3} className="text-black" />}
      </div>
      <div className="flex-1">
        <span className="text-sm text-white/80 group-hover:text-white transition-colors block font-medium">
          {label}
        </span>
        {description && (
          <span className="text-xs text-hub-muted block mt-0.5">
            {description}
          </span>
        )}
      </div>
      <input type="checkbox" className="hidden" checked={checked} onChange={onChange} />
    </label>
  )

  return (
    <div className="h-full flex text-hub-text bg-hub-base">
      
      {/* ─── Left Sidebar ─── */}
      <div className="w-60 border-r border-hub-border/40 bg-hub-surface flex flex-col h-full overflow-y-auto pt-6">
        <div className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-white/40">{t('settings')}</div>
        <nav className="flex flex-col space-y-0.5 px-2">
          {TABS.map(tab => {
            const Icon = tab.icon
            const isActive = activeSettingsTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSettingsTab(tab.id)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                  isActive 
                    ? 'bg-white/10 text-white font-medium shadow-sm' 
                    : 'text-hub-text-secondary hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-white' : 'text-hub-muted'} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ─── Right Content Area (GPU Layer Isolated, Left-Aligned) ─── */}
      <div 
        style={{ contain: 'paint layout', transform: 'translateZ(0)', willChange: 'scroll-position' }}
        className="flex-1 overflow-y-auto px-10 py-8 relative"
      >
        <div className="w-full max-w-5xl pb-32">
          {activeSettingsTab === 'general' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-8">
              
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white tracking-tight">{t('appBasics')}</h2>
                  <button 
                    onClick={() => scan()} 
                    className="px-3 py-1.5 bg-white/10 text-white hover:bg-white/20 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 border border-white/10"
                  >
                    <RefreshCw size={13} className={isScanning ? "animate-spin" : ""} />
                    {isScanning ? t('scanning') : t('scanNow')}
                  </button>
                </div>
                
                <div className="space-y-5">
                  {/* Download Path */}
                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{t('downloadPath')}</label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Folder className="absolute left-3 top-2.5 text-hub-muted" size={16} />
                        <input 
                          type="text" 
                          value={localSettings.downloadPath || 'C:\\Downloads'}
                          onChange={e => set('downloadPath', e.target.value)}
                          className="w-full bg-hub-elevated border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-white/30 transition-all"
                        />
                      </div>
                      <button onClick={handleBrowsePath} className="px-4 py-2 bg-white/10 border border-white/15 rounded-lg text-xs font-semibold text-white hover:bg-white/20 transition-all">
                        {t('change')}
                      </button>
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{t('language')}</label>
                    <select 
                      value={language}
                      onChange={e => {
                        updateSettings({ language: e.target.value })
                        set('language', e.target.value)
                      }}
                      className="w-full bg-hub-elevated border border-white/10 rounded-lg py-2 px-4 text-sm text-white focus:outline-none focus:border-white/30 appearance-none transition-all"
                    >
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('startupBehavior')}</h2>
                <div className="space-y-3.5">
                  {[
                    { key: 'exitInsteadOfMinimize', label: t('exitInsteadOfMinimize'), value: settings.exitInsteadOfMinimize ?? true },
                    { key: 'hideToTray', label: t('hideToTray'), value: settings.hideToTray ?? false },
                    { key: 'startOnBoot', label: t('startOnBoot'), value: settings.startOnBoot ?? true },
                    { key: 'startMinimized', label: t('startMinimized'), value: settings.startMinimized ?? false },
                    { key: 'launchInLibrary', label: t('launchInLibrary'), value: settings.launchInLibrary ?? false },
                    { key: 'autoCheckUpdates', label: t('autoCheckUpdates'), value: settings.autoCheckUpdates ?? true },
                  ].map(opt => (
                    <CleanCheckbox
                      key={opt.key}
                      checked={opt.value}
                      label={opt.label}
                      onChange={() => {
                        const val = !opt.value
                        updateSettings({ [opt.key]: val })
                        if (window.electronAPI) {
                          window.electronAPI.setSettings({ [opt.key]: val })
                          if (opt.key === 'startOnBoot' || opt.key === 'startMinimized') {
                            const sBoot = opt.key === 'startOnBoot' ? val : (settings.startOnBoot ?? true)
                            const sMin = opt.key === 'startMinimized' ? val : (settings.startMinimized ?? false)
                            window.electronAPI.setAutoLaunch(sBoot, sMin)
                          }
                        }
                      }}
                    />
                  ))}
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              {/* Minimalist Shortcuts Section */}
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{language === 'de' ? 'Verknüpfungen' : 'Shortcuts'}</h2>
                <div className="flex items-center justify-between p-4 bg-[#0f1015] border border-white/10 rounded-xl">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-sm text-white">
                      {language === 'de' ? 'Desktop-Verknüpfung erstellen' : 'Create Desktop Shortcut'}
                    </div>
                    <div className="text-xs text-white/50">
                      {language === 'de' ? 'Erstellt eine Verknüpfung von Eclipse Launcher auf deinem Desktop.' : 'Creates a shortcut of Eclipse Launcher on your desktop.'}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (window.electronAPI?.createDesktopShortcut) {
                        const res = await window.electronAPI.createDesktopShortcut()
                        if (res?.success) {
                          showNotification(language === 'de' ? 'Desktop-Verknüpfung erfolgreich erstellt!' : 'Desktop shortcut created successfully!', 'success')
                        } else {
                          showNotification(language === 'de' ? 'Fehler beim Erstellen der Verknüpfung.' : 'Failed to create desktop shortcut.', 'error')
                        }
                      } else {
                        showNotification(t('notSupportedInBrowser'), 'info')
                      }
                    }}
                    className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.01]"
                  >
                    <Monitor size={13} className="text-black" />
                    {language === 'de' ? 'Erstellen' : 'Create'}
                  </button>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('library')}</h2>
                <div className="space-y-3.5">
                  <CleanCheckbox
                    checked={settings.scanUninstalledSteam ?? false}
                    label="Show uninstalled Steam games in library"
                    onChange={() => {
                      updateSettings({ scanUninstalledSteam: !settings.scanUninstalledSteam })
                      set('scanUninstalledSteam', !settings.scanUninstalledSteam)
                      setTimeout(() => scan(), 100)
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.autoScanSplash ?? false}
                    label="Automatically start scanning on Splash Screen"
                    onChange={() => {
                      updateSettings({ autoScanSplash: !settings.autoScanSplash })
                      set('autoScanSplash', !settings.autoScanSplash)
                    }}
                  />

                  {/* Clean Background Task Indicator */}
                  <AnimatePresence>
                    {scanMessage.includes('Fetching names') && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-3 mt-4 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                          <Loader2 size={16} className="text-white animate-spin" />
                          <div className="flex flex-col">
                            <span className="text-xs font-semibold text-white">Background Task Running</span>
                            <span className="text-[11px] text-white/50">{scanMessage}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('appearance')}</h2>
                <div className="flex gap-3 mb-4">
                  <button className="px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-xs font-semibold transition-all shadow-sm">{t('webStore')}</button>
                  <button className="px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-semibold transition-colors">{t('delete')}</button>
                  <button className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors border border-white/10">+ {t('create')}</button>
                </div>
                <div className="p-4 border border-white/10 border-dashed rounded-lg text-center text-xs text-hub-muted">
                  {t('noThemes')}
                </div>
              </section>
            </motion.div>
          )}

          {activeSettingsTab === 'downloads' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-8">
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('downloadBehavior')}</h2>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{t('maxDownloadSpeed')}</label>
                    <input 
                      type="number" 
                      placeholder="Unlimited (0)" 
                      value={downloadOptions.speedLimit}
                      onChange={e => setDownloadOptions(prev => ({ ...prev, speedLimit: e.target.value }))}
                      className="w-full max-w-xs bg-hub-elevated border border-white/10 rounded-lg py-2 px-4 text-sm text-white focus:outline-none focus:border-white/30 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{t('networkAdapter')}</label>
                    <select 
                      value={downloadOptions.adapter}
                      onChange={e => setDownloadOptions(prev => ({ ...prev, adapter: e.target.value }))}
                      className="w-full max-w-xs bg-hub-elevated border border-white/10 rounded-lg py-2 px-4 text-sm text-white focus:outline-none focus:border-white/30 appearance-none transition-all"
                    >
                      <option>{t('allAdapters')}</option>
                      <option>{t('ethernet')}</option>
                      <option>{t('wifi')}</option>
                    </select>
                  </div>

                  <div className="space-y-3.5 pt-2">
                    {[
                      { key: 'seedAfter', label: t('seedAfter') },
                      { key: 'unpackAuto', label: t('unpackAuto') },
                      { key: 'showMBps', label: t('showMBps') },
                      { key: 'deleteArchive', label: t('deleteArchive') },
                      { key: 'createShortcut', label: t('createShortcut') },
                    ].map(opt => (
                      <CleanCheckbox
                        key={opt.key}
                        checked={downloadOptions[opt.key as keyof typeof downloadOptions] as boolean}
                        label={opt.label}
                        onChange={() => setDownloadOptions(prev => ({ ...prev, [opt.key]: !prev[opt.key as keyof typeof downloadOptions] }))}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-white tracking-tight">{t('downloadSourcesManagement')}</h2>
                  <div className="flex gap-2">
                    <button onClick={() => syncAll()} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/10">
                      {t('syncSources')}
                    </button>
                    <button onClick={() => removeAllSources()} className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-xs font-semibold transition-all">
                      {t('removeAllSources')}
                    </button>
                  </div>
                </div>
                
                <p className="text-xs text-hub-muted mb-6">
                  {t('sourceDescription')}
                </p>

                <div className="space-y-4">
                  {sources.map(source => (
                    <div key={source.url} className="bg-[#0f1015] border border-white/10 rounded-xl p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold text-white text-sm">{source.name}</h3>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                            source.status === 'up_to_date' ? 'bg-white/10 text-white border-white/20' :
                            source.status === 'syncing' ? 'bg-white/10 text-white border-white/20' :
                            source.status === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-white/5 text-white/50 border-white/10'
                          }`}>
                            {source.status === 'up_to_date' ? t('upToDate') :
                             source.status === 'syncing' ? t('syncing') :
                             source.status === 'error' ? t('error') : t('pending')}
                          </span>
                        </div>
                        <span className="text-xs text-hub-muted">{source.optionsCount} {t('downloadOptions')}</span>
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          readOnly 
                          value={source.url} 
                          className="flex-1 bg-hub-base border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 focus:outline-none"
                        />
                        <button onClick={() => syncSource(source.url)} className="p-1.5 text-white/70 hover:text-white bg-white/5 rounded-lg border border-white/10 hover:bg-white/10">
                          <RefreshCw size={14} className={source.status === 'syncing' ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => removeSource(source.url)} className="p-1.5 text-red-400 hover:text-red-300 bg-red-500/10 rounded-lg border border-red-500/20 hover:bg-red-500/20">
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {showAddSource ? (
                    <div className="bg-hub-surface border border-white/20 rounded-xl p-4 flex gap-2">
                      <input 
                        type="text" 
                        value={newSourceUrl}
                        onChange={e => setNewSourceUrl(e.target.value)}
                        placeholder="https://example.com/source.json"
                        className="flex-1 bg-hub-base border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                        autoFocus
                        onKeyDown={e => e.key === 'Enter' && handleAddSource()}
                      />
                      <button onClick={handleAddSource} className="px-4 py-1.5 bg-white text-black hover:bg-white/90 rounded-lg text-xs font-semibold shadow-sm">{t('add')}</button>
                      <button onClick={() => setShowAddSource(false)} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/10">{t('cancel')}</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddSource(true)} className="w-full py-3 bg-hub-surface hover:bg-white/[0.04] border border-white/10 border-dashed rounded-xl flex items-center justify-center gap-2 text-xs font-medium text-hub-muted hover:text-white transition-colors">
                      <Plus size={15} />
                      {t('addSource')}
                    </button>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeSettingsTab === 'notifications' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-8">
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">{language === 'de' ? 'Benachrichtigungen' : 'Notifications'}</h2>
                    <p className="text-xs text-white/50 mt-0.5">{language === 'de' ? 'Benachrichtigungen im Client, Update-Hinweise und Audio-Feedback' : 'In-client alerts, update notices, and audio feedback'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        playNotificationSound(settings.notificationSound || 'eclipse_calm')
                      }}
                      className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/10 flex items-center gap-2 cursor-pointer"
                    >
                      <Volume2 size={13} />
                      {language === 'de' ? 'Sound testen' : 'Test Sound'}
                    </button>
                    <button
                      onClick={() => {
                        sendAppNotification({
                          title: 'Eclipse Launcher',
                          body: language === 'de' ? 'Neue Version verfügbar: Eclipse Launcher v2.4 ist jetzt bereit zum Download!' : 'New version available: Eclipse Launcher v2.4 is ready to download!',
                          type: 'info',
                          playSound: true,
                          duration: 2000,
                        })
                      }}
                      className="px-3 py-1.5 bg-white text-black hover:bg-white/90 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Bell size={13} className="text-black" />
                      {language === 'de' ? 'Benachrichtigung testen' : 'Test Notification'}
                    </button>
                  </div>
                </div>

                <div className="space-y-5">
                  <CleanCheckbox
                    checked={settings.desktopNotifications ?? true}
                    label={language === 'de' ? 'Benachrichtigungen' : 'Notifications'}
                    description={language === 'de' ? 'Zeige Benachrichtigungen im Launcher an, wenn Downloads/Installationen fertig sind oder eine neue Version von Eclipse verfügbar ist.' : 'Show notifications inside the launcher when games finish downloading, installing, or when a new version of Eclipse is available.'}
                    onChange={() => {
                      const val = !(settings.desktopNotifications ?? true)
                      updateSettings({ desktopNotifications: val })
                      if (window.electronAPI) {
                        window.electronAPI.setSettings({ desktopNotifications: val })
                      }
                    }}
                  />
                  <CleanCheckbox
                    checked={settings.soundEffects ?? true}
                    label={language === 'de' ? 'Sound-Effekte' : 'Sound Effects'}
                    description={language === 'de' ? 'Spiele dezente Audio-Hinweise ab, wenn Downloads fertig sind, Spiele starten oder Aktionen abgeschlossen werden.' : 'Play subtle audio cues when downloads finish, games launch, or actions complete.'}
                    onChange={() => {
                      const val = !(settings.soundEffects ?? true)
                      updateSettings({ soundEffects: val })
                      if (window.electronAPI) {
                        window.electronAPI.setSettings({ soundEffects: val })
                      }
                    }}
                  />

                  {/* Sound Effect Presets */}
                  {(settings.soundEffects ?? true) && (
                    <div className="pt-2">
                      <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2.5">
                        {t('soundPresetLabel') || (language === 'de' ? 'Sound-Effekt Preset' : 'Sound Effect Preset')}
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {getSoundPresets(language).map((preset) => {
                          const isSelected = (settings.notificationSound || 'eclipse_calm') === preset.id
                          return (
                            <div
                              key={preset.id}
                              onClick={() => {
                                updateSettings({ notificationSound: preset.id })
                                if (window.electronAPI) {
                                  window.electronAPI.setSettings({ notificationSound: preset.id })
                                }
                                playNotificationSound(preset.id)
                              }}
                              className={`group p-3 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-white/10 border-white text-white shadow-sm'
                                  : 'bg-hub-surface border-white/10 text-white/70 hover:border-white/20 hover:text-white'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <span className="text-xs font-bold text-white block">{preset.name}</span>
                                <p className="text-[11px] text-white/40 mt-0.5 truncate">{preset.desc}</p>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  playNotificationSound(preset.id)
                                }}
                                className="w-7 h-7 rounded-lg bg-white/5 group-hover:bg-white/15 border border-white/10 flex items-center justify-center flex-shrink-0 text-white/70 hover:text-white transition-all cursor-pointer"
                                aria-label="Play sound preview"
                              >
                                <Volume2 size={12} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeSettingsTab === 'integrations' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-8">
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('integrations') || 'Discord & Integrations'}</h2>
                <div className="space-y-4">
                  <CleanCheckbox
                    checked={settings.discordRpc ?? true}
                    label="Discord Rich Presence"
                    description="Automatically show your currently played game as a status on Discord."
                    onChange={() => {
                      const val = !(settings.discordRpc ?? true)
                      updateSettings({ discordRpc: val })
                      if (window.electronAPI) {
                        window.electronAPI.setSettings({ discordRpc: val })
                      }
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcIdle ?? false}
                    label="Show Idle Status"
                    description="Show 'Browsing Library' on Discord when you are not playing any game."
                    onChange={() => {
                      const val = !(settings.discordRpcIdle ?? false)
                      updateSettings({ discordRpcIdle: val })
                      if (window.electronAPI) {
                        window.electronAPI.setSettings({ discordRpcIdle: val })
                      }
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcShowDownloads ?? true}
                    label="Show Active Downloads"
                    description="Display download progress and speed on Discord when downloading games."
                    onChange={() => {
                      const val = !(settings.discordRpcShowDownloads ?? true)
                      updateSettings({ discordRpcShowDownloads: val })
                      if (window.electronAPI) {
                        window.electronAPI.setSettings({ discordRpcShowDownloads: val })
                      }
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcPrivacyMode ?? false}
                    label="Privacy / Stealth Mode"
                    description="Hide specific game titles on Discord and show 'Playing a Game' instead."
                    onChange={() => {
                      const val = !(settings.discordRpcPrivacyMode ?? false)
                      updateSettings({ discordRpcPrivacyMode: val })
                      if (window.electronAPI) {
                        window.electronAPI.setSettings({ discordRpcPrivacyMode: val })
                      }
                    }}
                  />
                </div>
              </section>
            </motion.div>
          )}

          {activeSettingsTab === 'gameplay' && (
            <GameplayOverlayTab settings={settings} updateSettings={updateSettings} />
          )}

          {activeSettingsTab === 'profile' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-8">
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('profileSettings') || 'Profile Settings'}</h2>
                <div className="space-y-6">
                  {/* Steam Sync Section */}
                  <div className="bg-[#0f1015] border border-white/10 rounded-xl p-5 relative overflow-hidden">
                    <h3 className="font-semibold text-white mb-2 flex items-center gap-2"><User size={16} className="text-white"/> Steam Integration</h3>
                    <p className="text-xs text-hub-muted mb-4">Link your Steam profile to automatically sync your avatar, username, level, and library stats.</p>
                    
                    <label className="block text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">Steam Profile URL or ID</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="https://steamcommunity.com/id/... or your SteamID64"
                        value={localSettings.steamProfileUrl || ''}
                        onChange={e => set('steamProfileUrl', e.target.value)}
                        className="flex-1 bg-[#16181c] border border-white/10 rounded-lg py-2 px-4 text-xs text-white focus:outline-none focus:border-white/30"
                      />
                      <button 
                        onClick={async () => {
                          if (!localSettings.steamProfileUrl) return
                          
                          const profile = await fetchSteamUserProfile(localSettings.steamProfileUrl)
                          if (profile) {
                            set('username', profile.username)
                            set('avatarUrl', profile.avatarFull)
                            set('steamLevel', profile.steamLevel ?? 0)
                            set('steamGamesCount', profile.steamGamesCount ?? 0)
                            set('steamBadgesCount', profile.steamBadgesCount ?? 0)
                            set('steamRecentGames', profile.steamRecentGames)
                            set('steamFavoriteBadge', profile.steamFavoriteBadge)
                            
                            const newSettings = {
                              username: profile.username,
                              avatarUrl: profile.avatarFull,
                              steamProfileUrl: localSettings.steamProfileUrl,
                              steamLevel: profile.steamLevel ?? 0,
                              steamGamesCount: profile.steamGamesCount ?? 0,
                              steamBadgesCount: profile.steamBadgesCount ?? 0,
                              steamRecentGames: profile.steamRecentGames,
                              steamFavoriteBadge: profile.steamFavoriteBadge
                            }
                            
                            updateSettings(newSettings)
                            if (window.electronAPI) {
                              window.electronAPI.setSettings(newSettings)
                            }
                            
                            showNotification('Steam profile synced!', 'success')
                          } else {
                            showNotification('Failed to sync Steam profile.', 'error')
                          }
                        }}
                        className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shadow-sm hover:scale-[1.01]"
                      >
                        <RefreshCw size={13} className="text-black" /> Sync Profile
                      </button>
                    </div>
                  </div>

                  {/* Privacy Section */}
                  <div className="bg-[#0f1015] border border-white/10 rounded-xl p-5 space-y-4">
                    <h3 className="font-semibold text-white text-sm flex items-center gap-2"><Shield size={16} className="text-white"/> Profile Privacy</h3>
                    
                    <CleanCheckbox
                      checked={localSettings.profileShowPlaytime !== false}
                      label="Show Total Playtime"
                      description="Display your accumulated playtime across all games on your profile."
                      onChange={() => {
                        const val = !(localSettings.profileShowPlaytime !== false)
                        set('profileShowPlaytime', val)
                        updateSettings({ profileShowPlaytime: val })
                        if (window.electronAPI) window.electronAPI.setSettings({ profileShowPlaytime: val })
                      }}
                    />

                    <CleanCheckbox
                      checked={localSettings.profileShowSteamStats !== false}
                      label="Show Steam Badges"
                      description="Display your synced Steam Level, Games, and Badges on your profile."
                      onChange={() => {
                        const val = !(localSettings.profileShowSteamStats !== false)
                        set('profileShowSteamStats', val)
                        updateSettings({ profileShowSteamStats: val })
                        if (window.electronAPI) window.electronAPI.setSettings({ profileShowSteamStats: val })
                      }}
                    />
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {activeSettingsTab === 'system' && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-6">
              <section>
                <div className="flex items-center gap-2.5 mb-5">
                  <Monitor className="text-white" size={20} />
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    {t('system') || 'System & Performance'}
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* GPU Hardware Acceleration Card */}
                  <div className="bg-[#0f1015] border border-white/10 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-6">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-semibold text-white text-sm tracking-wide">
                            {t('hardwareAcceleration') || 'GPU-Hardwarebeschleunigung'}
                          </h3>
                          <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full border ${
                            localSettings.hardwareAcceleration !== false
                              ? 'bg-white/10 text-white border-white/20'
                              : 'bg-white/5 text-white/40 border-white/10'
                          }`}>
                            {localSettings.hardwareAcceleration !== false ? '60 – 120+ FPS' : 'Software CPU'}
                          </span>
                        </div>
                        <p className="text-xs text-hub-muted leading-relaxed max-w-xl">
                          {t('hardwareAccelerationDesc') || 'Verwendet deine Grafikkarte (Direct3D 11 / ANGLE) für flüssige 60–120+ FPS Animationen, ruckelfreies Scrollen und maximale Performance.'}
                        </p>
                      </div>

                      {/* Pure White & Black Toggle Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={localSettings.hardwareAcceleration !== false}
                        onClick={() => {
                          const val = !(localSettings.hardwareAcceleration !== false)
                          set('hardwareAcceleration', val)
                          updateSettings({ hardwareAcceleration: val })
                          if (window.electronAPI) {
                            window.electronAPI.setSettings({ hardwareAcceleration: val })
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          localSettings.hardwareAcceleration !== false ? 'bg-white' : 'bg-white/15'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                            localSettings.hardwareAcceleration !== false
                              ? 'translate-x-5 bg-black'
                              : 'translate-x-0 bg-white/70'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Minimalist Restart Notice & Action */}
                    <div className="mt-5 pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <p className="text-xs text-white/50 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                        {t('restartRequiredDesc') || 'Änderungen an der GPU-Hardwarebeschleunigung werden nach einem Neustart von Eclipse wirksam.'}
                      </p>
                      <button
                        onClick={async () => {
                          const newSettings = { ...localSettings }
                          updateSettings(newSettings)
                          if (window.electronAPI) {
                            await window.electronAPI.setSettings(newSettings)
                            if (window.electronAPI.relaunchApp) {
                              await window.electronAPI.relaunchApp()
                            } else {
                              window.location.reload()
                            }
                          } else {
                            window.location.reload()
                          }
                        }}
                        className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shadow-sm hover:scale-[1.01]"
                      >
                        <RefreshCw size={12} className="text-black" />
                        {t('restartNow') || 'Eclipse jetzt neu starten'}
                      </button>
                    </div>
                  </div>

                  {/* Clean Minimalist Pipeline Details */}
                  <div className="bg-[#0f1015] border border-white/10 rounded-xl p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
                      <div className="py-2 sm:py-0 sm:px-4 first:pl-0">
                        <span className="text-[10px] uppercase font-semibold text-white/40 tracking-wider block mb-1">Pipeline</span>
                        <span className="text-xs font-medium text-white">Direct3D 11 / ANGLE</span>
                      </div>
                      <div className="py-2 sm:py-0 sm:px-4">
                        <span className="text-[10px] uppercase font-semibold text-white/40 tracking-wider block mb-1">High-DPI Skalierung</span>
                        <span className="text-xs font-medium text-white">Native DPI (Aktiv)</span>
                      </div>
                      <div className="py-2 sm:py-0 sm:px-4 last:pr-0">
                        <span className="text-[10px] uppercase font-semibold text-white/40 tracking-wider block mb-1">Bildwiederholrate</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-xs font-medium text-white">60 FPS – 240Hz+</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </motion.div>
          )}

          {/* Fallback for empty tabs */}
          {!['general', 'downloads', 'notifications', 'integrations', 'gameplay', 'profile', 'system'].includes(activeSettingsTab) && (
            <div className="flex flex-col items-center justify-center h-64 text-hub-muted">
              <SettingsIcon size={32} className="mb-4 opacity-50" />
              <p>{t('settingsUnderConstruction')}</p>
            </div>
          )}

        </div>
      </div>

      {/* Floating Save Button */}
      <div className="absolute bottom-6 right-8 z-30">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={save}
          disabled={isSaving}
          className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 flex items-center gap-2.5 shadow-2xl cursor-pointer border ${
            saveState === 'saved'
              ? 'bg-white text-black border-white'
              : 'bg-white text-black hover:bg-white/90 border-white/20'
          }`}
        >
          {saveState === 'saving' && <Loader2 size={14} className="animate-spin text-black" />}
          {saveState === 'saved' && <Check size={14} strokeWidth={3} className="text-black" />}
          {saveState === 'idle' && <Save size={14} className="text-black" />}
          <span>
            {saveState === 'saving' ? (t('saving') || 'Speichern...') : saveState === 'saved' ? 'Gespeichert' : (t('saveSettings') || 'Einstellungen speichern')}
          </span>
        </motion.button>
      </div>

    </div>
  )
}
