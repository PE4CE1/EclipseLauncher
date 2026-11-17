import { Select } from '../shared/Select'
import { useState, useEffect, useLayoutEffect, useRef, useId } from 'react'
import { persistAppSettings } from '../../services/settingsPersistence'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, RefreshCw, Zap, Shield, ShieldCheck,
  Settings as SettingsIcon, Download, Bell, Gamepad2,
  Link, Monitor, Check, Plus, Loader2, Folder, Volume2,
  Paintbrush, ExternalLink, Trash2, Power, RotateCcw, Film, HardDrive, Puzzle,
  Boxes, Activity,
} from 'lucide-react'
import { useGameStore } from '../../store/gameStore'
import { useUIStore } from '../../store/uiStore'
import { useThemeStore } from '../../store/themeStore'
import { useScanner } from '../../hooks/useScanner'
import { useSourceStore } from '../../store/sourceStore'
import { SourceConnection } from './SourceConnection'
import { useTranslation } from '../../hooks/useTranslation'
import { GameplayOverlayTab } from './GameplayOverlayTab'
import { AccountProtection } from './AccountProtection'
import { StartupStatus } from './StartupStatus'
import { AppModeControl } from './AppModeControl'
import { QuickAccessSettings } from './QuickAccessSettings'
import { ClipSettingsPanel } from '../clips/ClipSettingsPanel'
import { StorageManagerView } from '../storage/StorageManagerView'
import { PluginsSettingsTab } from './PluginsSettingsTab'
import { AddonsSettingsTab } from './AddonsSettingsTab'
import { fetchSteamUserProfile } from '../../services/steamService'
import { sendAppNotification } from '../../services/notificationService'
import { ChatNotificationSettings } from './ChatNotificationSettings'
import { playNotificationChime, playNotificationSound, getSoundPresets } from '../../services/soundService'
import { SceneTransition } from '../shared/SceneTransition'
import './settings-surfaces.css'
import type { AppSettings } from '../../types/game'

const CleanCheckbox = ({ checked, onChange, label, description, rightElement }: { checked: boolean; onChange: () => void; label: string; description?: string; rightElement?: React.ReactNode }) => {
  const descriptionId = useId()
  return <div className="settings-option-row">
    <label className="settings-option-label">
      <span className="settings-option-copy"><span>{label}</span>{description && <small id={descriptionId}>{description}</small>}</span>
      <span className="settings-toggle">
        <input type="checkbox" role="switch" aria-label={label} aria-describedby={description ? descriptionId : undefined} checked={checked} onChange={onChange} />
        <span aria-hidden="true" />
      </span>
    </label>
    {rightElement && <div className="settings-option-action">{rightElement}</div>}
  </div>
}

export function SettingsView() {
  const settings = useGameStore(state => state.settings)
  const updateSettings = useGameStore(state => state.updateSettings)
  const scanMessage = useGameStore(state => state.scanMessage)
  const isScanning = useGameStore(state => state.isScanning)
  const showNotification = useUIStore(s => s.showNotification)
  const activeSettingsTab = useUIStore(s => s.activeSettingsTab)
  const setActiveSettingsTab = useUIStore(s => s.setActiveSettingsTab)
  const contentScroll = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (contentScroll.current) contentScroll.current.scrollTop = 0
  }, [activeSettingsTab])
  const isSteamMonitorOpen = useUIStore(s => s.isSteamMonitorOpen)
  const toggleSteamMonitor = useUIStore(s => s.toggleSteamMonitor)
  const { installedThemes, activeThemeId, toggleTheme, deleteTheme, setActiveTheme } = useThemeStore()
  const { scan } = useScanner()
  const { sources, syncAll, addSource, addRawSource, removeAllSources } = useSourceStore()
  const { t, language } = useTranslation()

  const de = language === 'de'
  const groups = [
    { label: de ? 'Launcher' : 'Launcher', tabs: [
      { id: 'general', label: t('general'), icon: SettingsIcon, description: de ? 'Sprache, Startverhalten und das Aussehen von Eclipse.' : 'Language, startup behavior and the look of Eclipse.' },
      { id: 'downloads', label: t('downloads'), icon: Download, description: de ? 'Speicherorte, Quellen und Optionen für deine Downloads.' : 'Folders, sources and options for your downloads.' },
      { id: 'storage', label: t('storage'), icon: HardDrive, description: de ? 'Laufwerke und installierte Spiele im Überblick.' : 'Manage your drives and installed games.' },
      { id: 'notifications', label: t('notificationsTab'), icon: Bell, description: de ? 'Wähle, welche Hinweise du sehen und hören möchtest.' : 'Choose which alerts you want to see and hear.' },
    ] },
    { label: de ? 'Spielerlebnis' : 'Experience', tabs: [
      { id: 'gameplay', label: t('gameplay'), icon: Gamepad2, description: de ? 'Deine Anzeigen im Spiel – genau so, wie du sie brauchst.' : 'Set up the information you see while playing.' },
      { id: 'clips', label: 'Clips', icon: Film, description: de ? 'Aufnahme, Audio und Tastenkürzel für deine Highlights.' : 'Recording, audio and shortcuts for your highlights.' },
      { id: 'integrations', label: t('integrations'), icon: Link, description: de ? 'Verbinde Eclipse mit deinen anderen Apps.' : 'Connect Eclipse with your other apps.' },
      { id: 'system', label: t('system'), icon: Monitor, description: de ? 'Hintergrundbeleuchtung, Darstellung und Systemressourcen.' : 'Background lighting, rendering and system resources.' },
    ] },
    { label: de ? 'Konto' : 'Account', tabs: [
      { id: 'profile', label: t('profileSettings'), icon: User, description: de ? 'Steam-Profil, Privatsphäre und Kontoschutz.' : 'Your Steam profile, privacy and account protection.' },
    ] },
    { label: t('extensions'), tabs: [
      { id: 'plugins', label: t('plugins'), icon: Puzzle, description: de ? 'Verwalte Erweiterungen für deine verbundenen Apps.' : 'Manage extensions for your connected apps.' },
      { id: 'addons', label: 'Add-ons', icon: Boxes, description: de ? 'Zusätzliche Funktionen für deinen Launcher.' : 'Additional features for your launcher.' },
    ] },
  ]
  const currentTab = groups.flatMap(group => group.tabs).find(tab => tab.id === activeSettingsTab) || groups[0].tabs[0]

  const [newSourceUrl, setNewSourceUrl] = useState('')
  const [showAddSource, setShowAddSource] = useState(false)
  const [importingSources, setImportingSources] = useState(false)
  const [isCleaningRam, setIsCleaningRam] = useState(false)

  const [detectedVpns, setDetectedVpns] = useState<Array<{ id: string; name: string; isRunning: boolean; isConnected: boolean }>>([])
  const [vpnStatus, setVpnStatus] = useState<{ isConnected: boolean; vpnName?: string }>({ isConnected: false })
  const [isScanningVpns, setIsScanningVpns] = useState(false)
  const [isConnectingVpn, setIsConnectingVpn] = useState(false)

  const refreshVpns = async () => {
    if (!window.electronAPI?.detectInstalledVpns) return
    setIsScanningVpns(true)
    try {
      const [vpns, status] = await Promise.all([
        window.electronAPI.detectInstalledVpns(),
        window.electronAPI.getVpnStatus ? window.electronAPI.getVpnStatus() : { isConnected: false }
      ])
      setDetectedVpns(vpns || [])
      setVpnStatus(status || { isConnected: false })
      if (vpns && vpns.length > 0 && !settings.selectedVpnProvider) {
        set('selectedVpnProvider', vpns[0].id)

      }
    } catch (e) {
      console.warn('VPN scan error:', e)
    } finally {
      setIsScanningVpns(false)
    }
  }

  useEffect(() => {
    if (activeSettingsTab === 'downloads') {
      refreshVpns()
    }
  }, [activeSettingsTab])

  useEffect(() => {
    if (settings.downloadPath || !window.electronAPI?.getDefaultDownloadPath) return
    let active = true
    window.electronAPI.getDefaultDownloadPath().then(path => {
      if (active && path && !useGameStore.getState().settings.downloadPath) set('downloadPath', path)
    }).catch(() => {})
    return () => { active = false }
  }, [settings.downloadPath])

  function persistSettings(patch: Partial<AppSettings>) {
    void persistAppSettings(patch)
  }

  function set<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    persistSettings({ [key]: value } as Pick<AppSettings, K>)
  }

  async function handleBrowsePath() {
    if (window.electronAPI?.selectDirectory) {
      const p = await window.electronAPI.selectDirectory()
      if (p) set('downloadPath', p)
    } else {
      showNotification(t('notSupportedInBrowser'), 'info')
    }
  }

  async function handleAddSource() {
    if (!newSourceUrl || importingSources) return
    const input = newSourceUrl.trim()
    setImportingSources(true)
    try {
      if (input.startsWith('{')) {
        await addRawSource(input)
        showNotification(language === 'de' ? 'Lokale JSON-Quelle hinzugefügt' : 'Local JSON source added', 'success')
      } else {
        await addSource(input)
      }
      setNewSourceUrl('')
      setShowAddSource(false)
    } catch (e: any) {
      showNotification(language === 'de' ? 'Fehler: ' + e.message : 'Error: ' + e.message, 'error')
    } finally { setImportingSources(false) }
  }

  async function handleImportFile() {
    if (!window.electronAPI?.selectJSONFile) return
    try {
      const content = await window.electronAPI.selectJSONFile()
      if (content) {
        await addRawSource(content)
        showNotification(language === 'de' ? 'Datei-Quelle importiert' : 'File source imported', 'success')
        setShowAddSource(false)
      }
    } catch (e: any) {
      showNotification(language === 'de' ? 'Fehler beim Importieren: ' + e.message : 'Import Error: ' + e.message, 'error')
    }
  }

  return (
    <div className="settings-view launcher-page-surface h-full flex text-hub-text bg-hub-base">

      <aside className="settings-navigation" aria-label={t('settings')}>
        <div className="settings-navigation-heading"><SettingsIcon size={16} /><span>{t('settings')}</span></div>
        <nav>
          {groups.map(group => <div className="settings-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.tabs.map(tab => <button key={tab.id} type="button" id={`settings-tab-${tab.id}`}
              aria-current={activeSettingsTab === tab.id ? 'page' : undefined}
              onClick={() => setActiveSettingsTab(tab.id)}>
              <tab.icon size={16} aria-hidden="true" /><span>{tab.label}</span>
            </button>)}
          </div>)}
        </nav>
        <p className="settings-navigation-note"><Check size={12} />{de ? 'Automatische Speicherung' : 'Automatic saving'}</p>
      </aside>

      <div ref={contentScroll} className="settings-scroll" data-settings-page={activeSettingsTab}>
        <SceneTransition sceneKey={activeSettingsTab} data-settings-scene={activeSettingsTab} className="settings-content">
          <header className="settings-page-heading">
            <div><p>{t('settings')}</p><h1>{currentTab.label}</h1><span>{currentTab.description}</span></div>
          </header>
          <div className="settings-content-body">
          {activeSettingsTab === 'general' && (
            <div className="space-y-8">

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
                          aria-label={t('downloadPath')}
                          id="settings-download-path"
                          type="text"
                          value={settings.downloadPath || 'C:\\Downloads'}
                          onChange={e => set('downloadPath', e.target.value)}
                          className="w-full bg-white/[0.025] border border-white/10 rounded-lg py-2 pl-9 pr-4 text-sm text-white focus:outline-none focus:border-white/30 transition-all"
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
                    <Select
                      id="settings-language"
                      aria-label={t('language')}
                      value={language}
                      onChange={e => {
                        const newLang = e.target.value
                        set('language', newLang)
                      }}
                      className="w-full bg-white/[0.025] border border-white/10 rounded-lg py-2 px-4 text-sm text-white focus:outline-none focus:border-white/30 appearance-none transition-all"
                    >
                      <option value="de">Deutsch</option>
                      <option value="en">English</option>
                    </Select>
                  </div>
                  <AppModeControl />
                  <QuickAccessSettings/>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('startupBehavior')}</h2>
                <div className="space-y-3.5">
                  {[
                    { key: 'exitInsteadOfMinimize', label: t('exitInsteadOfMinimize'), value: settings.exitInsteadOfMinimize ?? false },
                    { key: 'autoMinimizeOnGame', label: t('autoMinimizeOnGame'), value: settings.autoMinimizeOnGame ?? false },
                    { key: 'startOnBoot', label: t('startOnBoot'), value: settings.startOnBoot ?? true },
                    { key: 'startMinimized', label: t('startMinimized'), value: settings.startMinimized ?? false },
                    { key: 'launchInLibrary', label: t('launchInLibrary'), value: settings.launchInLibrary ?? false },
                    { key: 'launchInClips', label: t('launchInClips'), value: settings.launchInClips ?? false },
                    { key: 'autoCheckUpdates', label: t('autoCheckUpdates'), value: settings.autoCheckUpdates ?? true },
                  ].map(opt => (
                    <CleanCheckbox
                      key={opt.key}
                      checked={opt.value}
                      label={opt.label}
                      onChange={() => {
                        const patch: Partial<AppSettings> = { [opt.key]: !opt.value }
                        if (!opt.value && opt.key === 'launchInLibrary') patch.launchInClips = false
                        if (!opt.value && opt.key === 'launchInClips') patch.launchInLibrary = false
                        void persistAppSettings(patch)
                      }}
                    />
                  ))}
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              <StartupStatus enabled={settings.startOnBoot !== false} minimized={settings.startMinimized === true} language={language} />

              {/* Minimalist Shortcuts Section */}
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{language === 'de' ? 'Verknüpfungen' : 'Shortcuts'}</h2>
                <div className="settings-glass-card flex items-center justify-between p-4 bg-white/[0.02] border border-white/10 rounded-xl">
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
                    label={language === 'de' ? 'Nicht installierte Steam-Spiele in Bibliothek anzeigen' : 'Show uninstalled Steam games in library'}
                    onChange={() => {

                      set('scanUninstalledSteam', !settings.scanUninstalledSteam)
                      setTimeout(() => scan(), 100)
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.autoScanSplash ?? false}
                    label={language === 'de' ? 'Spiele-Scan automatisch beim Startbildschirm ausführen' : 'Automatically start scanning on Splash Screen'}
                    onChange={() => {

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
                            <span className="text-xs font-semibold text-white">{t('uiBackgroundTask')}</span>
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
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">{t('appearance')}</h2>
                    <p className="text-xs text-white/50 mt-0.5">
                      {language === 'de'
                        ? 'Passe das Design von Eclipse Launcher mit Themes aus dem Web Store an.'
                        : 'Customize Eclipse Launcher styling with themes from the Web Store.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const url = 'https://eclipselauncher.pages.dev/#/themes'
                        if (window.electronAPI?.openUrl) {
                          window.electronAPI.openUrl(url)
                        } else {
                          window.open(url, '_blank')
                        }
                      }}
                      className="px-3.5 py-1.5 bg-white text-black hover:bg-white/90 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <ExternalLink size={13} />
                      <span>{t('webStore')}</span>
                    </button>
                    {activeThemeId && (
                      <button
                        onClick={() => setActiveTheme(null)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                        title={language === 'de' ? 'Auf Standard-Eclipse zurücksetzen' : 'Reset to Default Eclipse'}
                      >
                        <RotateCcw size={12} />
                        <span>{language === 'de' ? 'Standard' : 'Default'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {installedThemes.length === 0 ? (
                  <div className="p-8 border border-white/10 border-dashed rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-white/[0.01]">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40">
                      <Paintbrush size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white/80">{t('noThemes')}</p>
                      <p className="text-xs text-white/40 mt-1 max-w-sm">
                        {language === 'de'
                          ? 'Besuche den Web Store, um Themes mit 1-Klick direkt in deinen Launcher zu importieren.'
                          : 'Visit the Web Store to 1-click import custom themes directly into your launcher.'}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const url = 'https://eclipselauncher.pages.dev/#/themes'
                        if (window.electronAPI?.openUrl) {
                          window.electronAPI.openUrl(url)
                        } else {
                          window.open(url, '_blank')
                        }
                      }}
                      className="mt-1 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all border border-white/10"
                    >
                      <ExternalLink size={13} />
                      <span>{language === 'de' ? 'Themes im Web Store durchsuchen' : 'Browse Themes in Web Store'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {installedThemes.map((theme) => {
                      const isActive = activeThemeId === theme.id
                      return (
                        <div
                          key={theme.id}
                          className={`settings-glass-card p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                            isActive
                              ? 'bg-white/[0.06] border-white/30 shadow-[0_0_20px_rgba(255,255,255,0.04)]'
                              : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                            <div
                              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 border border-white/20 shadow-inner"
                              style={{ backgroundColor: theme.accentColor || '#ffffff' }}
                            >
                              <Paintbrush size={15} className="mix-blend-difference text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white truncate">{theme.name}</h4>
                                {isActive && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-black uppercase tracking-wider flex-shrink-0">
                                    {language === 'de' ? 'Aktiv' : 'Active'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[11px] text-white/50 mt-0.5 truncate">
                                <span>by {theme.author || 'Eclipse Community'}</span>
                                {theme.description && <span className="truncate">• {theme.description}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => toggleTheme(theme.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                                isActive
                                  ? 'bg-white text-black hover:bg-white/90 shadow-sm'
                                  : 'bg-white/10 text-white/80 hover:text-white hover:bg-white/20'
                              }`}
                            >
                              <Power size={12} />
                              <span>{isActive ? (language === 'de' ? 'Deaktivieren' : 'Disable') : (language === 'de' ? 'Aktivieren' : 'Enable')}</span>
                            </button>

                            <button
                              onClick={() => deleteTheme(theme.id)}
                              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
                              title={language === 'de' ? 'Theme löschen' : 'Delete Theme'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeSettingsTab === 'clips' && (
            <div className="settings-clips-embedded">
              <ClipSettingsPanel />
            </div>
          )}

          {activeSettingsTab === 'downloads' && (
            <div className="space-y-8">

              {/* ─── Download Location & Unpack Automation ─── */}
              <section>
                <h2 className="text-lg font-bold text-white mb-1 tracking-tight">{language === 'de' ? 'Download- & Speicherort' : 'Download Directory & Storage'}</h2>
                <p className="text-xs text-white/50 mb-4">{language === 'de' ? 'Standardordner für heruntergeladene Spiele und Entpack-Optionen' : 'Default directory for downloaded games and unpacking behavior'}</p>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">{language === 'de' ? 'Standard Download-Verzeichnis' : 'Default Download Folder'}</label>
                    <div className="flex items-center gap-3 max-w-xl">
                      <input
                        id="settings-download-path-readonly"
                        type="text"
                        readOnly
                        value={settings.downloadPath || 'C:\\Downloads'}
                        className="flex-1 bg-white/[0.025] border border-white/10 rounded-lg py-2 px-4 text-xs font-mono text-white focus:outline-none"
                      />
                      <button
                        onClick={handleBrowsePath}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/10 flex items-center gap-2 cursor-pointer flex-shrink-0"
                      >
                        <Folder size={14} />
                        {language === 'de' ? 'Durchsuchen...' : 'Browse...'}
                      </button>
                    </div>

                    <button
                      onClick={() => setActiveSettingsTab('storage')}
                      className="mt-3 px-4 py-2 bg-white/[0.05] hover:bg-white/[0.09] text-white/90 hover:text-white rounded-lg text-xs font-semibold transition-all border border-white/10 flex items-center gap-2 cursor-pointer shadow-sm"
                    >
                      <HardDrive size={14} className="text-white/70" />
                      <span>{language === 'de' ? 'Festplatten- & Speicherplatz-Manager öffnen' : 'Open Storage & Disk Manager'}</span>
                    </button>
                  </div>

                  <div className="space-y-3.5 pt-2">
                    <CleanCheckbox
                      checked={settings.autoExtractArchive ?? true}
                      label={language === 'de' ? 'Archive nach Download automatisch mit 7-Zip entpacken' : 'Automatically extract archives with 7-Zip after download'}
                      description={language === 'de' ? 'Entpackt .zip, .rar und .7z Dateien direkt in einen sauberen Spielordner und erkennt die Haupt-Executable.' : 'Unpacks game archives automatically and detects the primary game executable.'}
                      onChange={() => {
                        const val = !(settings.autoExtractArchive ?? true)
                        set('autoExtractArchive', val)
                      }}
                    />

                    <CleanCheckbox
                      checked={settings.autoDeleteArchive ?? false}
                      label={language === 'de' ? 'Archivdateien nach erfolgreichem Entpacken löschen' : 'Delete archive files after successful extraction'}
                      description={language === 'de' ? 'Spart Festplattenspeicher, indem die heruntergeladenen .zip/.rar/.7z Archive nach dem Entpacken entfernt werden.' : 'Saves disk space by deleting original compressed files after extraction.'}
                      onChange={() => {
                        const val = !(settings.autoDeleteArchive ?? false)
                        set('autoDeleteArchive', val)
                      }}
                    />
                  </div>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              {/* ─── VPN & Safe Download Protection ─── */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-white" />
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {t('vpnSecurityTitle')}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                      vpnStatus.isConnected
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-white/[0.04] text-white/50 border-white/10'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${vpnStatus.isConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-white/30'}`} />
                      {vpnStatus.isConnected
                        ? `${t('vpnActive')} ${vpnStatus.vpnName || 'Connected'}`
                        : t('noVpnActive')}
                    </span>

                    <button
                      onClick={refreshVpns}
                      className="p-1.5 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors cursor-pointer"
                      title={language === 'de' ? 'VPN-Status & Clients aktualisieren' : 'Refresh VPN status & clients'}
                    >
                      <RefreshCw size={13} className={isScanningVpns ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-white/50 mb-4">
                  {t('vpnSecurityDesc')}
                </p>

                <div className="space-y-4 max-w-xl">
                  <div className="space-y-3">
                    <CleanCheckbox
                      checked={settings.autoVpnOnDownload ?? false}
                      label={t('autoVpnLabel')}
                      description={t('autoVpnDesc')}
                      onChange={() => {
                        const val = !(settings.autoVpnOnDownload ?? false)
                        set('autoVpnOnDownload', val)
                      }}
                    />
                  </div>

                  {/* Detected VPNs List / Card */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white/80 uppercase tracking-wider">
                        {t('detectedVpnsHeader')}
                      </span>
                      <span className="text-[11px] text-white/40 font-mono">
                        {detectedVpns.length} {language === 'de' ? 'gefunden' : 'found'}
                      </span>
                    </div>

                    {detectedVpns.length === 0 ? (
                      <div className="p-3 bg-white/[0.02] border border-white/[0.05] rounded-lg text-center text-xs text-white/40">
                        {t('noVpnFound')}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {detectedVpns.map((vpn) => {
                          const isSelected = (settings.selectedVpnProvider || detectedVpns[0]?.id) === vpn.id
                          return (
                            <div
                              key={vpn.id}
                              onClick={() => {
                                set('selectedVpnProvider', vpn.id)
                              }}
                              className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-white/[0.08] border-white/20 text-white'
                                  : 'bg-white/[0.02] border-white/[0.06] text-white/60 hover:bg-white/[0.04]'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${vpn.isConnected ? 'bg-emerald-400' : (vpn.isRunning ? 'bg-amber-400' : 'bg-white/20')}`} />
                                <div>
                                  <span className="text-xs font-bold text-white block">{vpn.name}</span>
                                  <span className="text-[10px] text-white/40">
                                    {vpn.isConnected ? t('vpnConnected') : (vpn.isRunning ? t('vpnRunning') : t('vpnInstalled'))}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-black">
                                    {language === 'de' ? 'Standard' : 'Default'}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Quick Connect / Disconnect Buttons */}
                    {detectedVpns.length > 0 && (
                      <div className="pt-2 flex items-center gap-2">
                        <button
                          disabled={isConnectingVpn}
                          onClick={async () => {
                            setIsConnectingVpn(true)
                            try {
                              const res = await window.electronAPI?.connectVpn?.(settings.selectedVpnProvider)
                              if (res?.success) {
                                if (res.isCLI || res.isNative) {
                                  showNotification(`${t('vpnConnectedSuccess')} ${res.vpnName || ''}`, 'success')
                                } else {
                                  showNotification(`${res.vpnName || 'VPN'}: ${t('vpnClientOpened')}`, 'info')
                                }
                              } else {
                                showNotification(t('vpnConnectFailed'), 'error')
                              }
                              await refreshVpns()
                            } finally {
                              setIsConnectingVpn(false)
                            }
                          }}
                          className="flex-1 py-2 px-3 bg-white text-black hover:bg-gray-200 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <ShieldCheck size={13} />
                          <span>{isConnectingVpn ? t('connectingVpn') : t('connectVpnNow')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              {/* ─── Debrid Services Integration ─── */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-lg font-bold text-white tracking-tight">{language === 'de' ? 'Debrid Highspeed-Dienste' : 'Debrid Highspeed Services'}</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.06] text-white/80 border border-white/10">
                    Optional
                  </span>
                </div>
                <p className="text-xs text-white/50 mb-4">
                  {language === 'de'
                    ? 'Verbinde Real-Debrid oder TorBox, um Host-Links (1fichier, Rapidgator etc.) mit ungedrosselter Gigabit-Geschwindigkeit direkt im Launcher herunterzuladen.'
                    : 'Connect Real-Debrid or TorBox to download hoster links (1fichier, Rapidgator, etc.) at unthrottled maximum speeds.'}
                </p>

                <div className="space-y-4 max-w-xl">
                  {/* Real-Debrid */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{t('uiRealDebridKey')}</span>
                      </div>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (window.electronAPI?.openUrl) window.electronAPI.openUrl('https://real-debrid.com/apitoken') }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {language === 'de' ? 'API Key abrufen ↗' : 'Get API Key ↗'}
                      </a>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder={t('uiRealDebridToken')}
                        value={settings.realDebridKey || ''}
                        onChange={e => {
                          set('realDebridKey', e.target.value)
                        }}
                        className="flex-1 bg-white/[0.025] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-white/30"
                      />
                      <button
                        onClick={async () => {
                          if (!settings.realDebridKey?.trim()) {
                            showNotification(language === 'de' ? 'Bitte gib zuerst einen Real-Debrid Key ein.' : 'Please enter a Real-Debrid key first.', 'info')
                            return
                          }
                          if (window.electronAPI?.testDebridKey) {
                            const res = await window.electronAPI.testDebridKey('realDebrid', settings.realDebridKey.trim())
                            if (res.success) {
                              showNotification(language === 'de' ? `Real-Debrid verbunden: ${res.username} (${res.type})` : `Connected as ${res.username}`, 'success')
                            } else {
                              showNotification(res.error || t('uiInvalidRealDebridKey'), 'error')
                            }
                          }
                        }}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/10 flex-shrink-0 cursor-pointer"
                      >
                        {language === 'de' ? 'Prüfen' : 'Test'}
                      </button>
                    </div>
                  </div>

                  {/* TorBox */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{t('uiTorBoxKey')}</span>
                      </div>
                      <a
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (window.electronAPI?.openUrl) window.electronAPI.openUrl('https://torbox.app/settings') }}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        {language === 'de' ? 'API Key abrufen ↗' : 'Get API Key ↗'}
                      </a>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder={t('uiTorBoxToken')}
                        value={settings.torboxKey || ''}
                        onChange={e => {
                          set('torboxKey', e.target.value)
                        }}
                        className="flex-1 bg-white/[0.025] border border-white/10 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-white/30"
                      />
                      <button
                        onClick={async () => {
                          if (!settings.torboxKey?.trim()) {
                            showNotification(language === 'de' ? 'Bitte gib zuerst einen TorBox Key ein.' : 'Please enter a TorBox key first.', 'info')
                            return
                          }
                          if (window.electronAPI?.testDebridKey) {
                            const res = await window.electronAPI.testDebridKey('torbox', settings.torboxKey.trim())
                            if (res.success) {
                              showNotification(language === 'de' ? `TorBox verbunden: ${res.username}` : `Connected as ${res.username}`, 'success')
                            } else {
                              showNotification(res.error || t('uiInvalidTorBoxKey'), 'error')
                            }
                          }
                        }}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/10 flex-shrink-0 cursor-pointer"
                      >
                        {language === 'de' ? 'Prüfen' : 'Test'}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <hr className="border-white/[0.08]" />

              {/* Download sources */}
              <section className="settings-sources">
                <div className="settings-sources-header">
                  <div>
                    <h2>{de ? 'Download-Quellen' : 'Download sources'}</h2>
                    <p>{de ? 'Verwalte die Kataloge für deine verfügbaren Downloads.' : 'Manage the catalogs used to find available downloads.'}</p>
                  </div>
                  <div className="settings-sources-actions">
                    <button type="button" onClick={() => { const url = 'https://eclipselauncher.pages.dev/#/downloads'; if (window.electronAPI?.openUrl) void window.electronAPI.openUrl(url); else window.open(url, '_blank', 'noopener,noreferrer') }}><ExternalLink size={13} />{de ? 'Quellen entdecken' : 'Browse sources'}</button>
                    {sources.length > 0 && <>
                      <button type="button" disabled={sources.some(source => source.status === 'syncing')} onClick={() => { void syncAll() }}><RefreshCw size={13} className={sources.some(source => source.status === 'syncing') ? 'animate-spin' : ''} />{de ? 'Alle synchronisieren' : 'Sync all'}</button>
                      <button type="button" className="settings-source-remove-all" onClick={() => removeAllSources()} aria-label={t('removeAllSources')} title={t('removeAllSources')}><Trash2 size={14} /></button>
                    </>}
                  </div>
                </div>
                <div className="settings-source-list">
                  {sources.length === 0 && !showAddSource && (
                    <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-2xl p-6 text-center space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 mx-auto flex items-center justify-center text-white/60">
                        <Download size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          {language === 'de' ? 'Keine Download-Quellen hinterlegt' : 'No Download Sources Configured'}
                        </h3>
                        <p className="text-xs text-hub-muted mt-1 max-w-md mx-auto leading-relaxed">
                          {language === 'de'
                            ? 'Hole dir geprüfte Download-Quellen aus dem offiziellen Eclipse Web Store oder füge eigene JSON-Links ein.'
                            : 'Get verified download sources from the official Eclipse Web Store or add your custom JSON links.'}
                        </p>
                      </div>
                      <div className="flex items-center justify-center gap-2.5 pt-1">
                        <button
                          onClick={() => {
                            const url = 'https://eclipselauncher.pages.dev/#/downloads'
                            if (window.electronAPI?.openUrl) {
                              window.electronAPI.openUrl(url)
                            } else {
                              window.open(url, '_blank')
                            }
                          }}
                          className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 shadow-sm cursor-pointer"
                        >
                          <ExternalLink size={13} className="text-black" />
                          {language === 'de' ? 'Quellen im Web Store finden' : 'Browse Sources in Web Store'}
                        </button>
                        <button
                          onClick={() => setShowAddSource(true)}
                          className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/10 text-xs font-semibold rounded-xl transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <Plus size={14} />
                          {language === 'de' ? 'Manuell hinzufügen' : 'Add Manually'}
                        </button>
                      </div>
                    </div>
                  )}

                  {sources.map(source => (
                    <div key={source.url} className="settings-source-row">
                      <div className="settings-source-heading">
                        <div className="settings-source-name">
                          <h3>{source.name}</h3>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${
                            source.status === 'up_to_date' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                            source.status === 'syncing' ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20' :
                            source.status === 'cached' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                            source.status === 'error' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-white/5 text-white/50 border-white/10'
                          }`}>
                            {source.status === 'up_to_date' ? t('upToDate') :
                             source.status === 'syncing' ? t('syncing') :
                             source.status === 'cached' ? (language === 'de' ? 'Im Cache' : 'Cached') :
                             source.status === 'error' ? t('error') : t('pending')}
                          </span>
                        </div>
                        <span className="settings-source-count">{(source.optionsCount || 0).toLocaleString(de ? 'de-DE' : 'en-US')} <small>{de ? 'Einträge' : 'entries'}</small></span>
                      </div>
                      <SourceConnection source={source} language={language} />
                    </div>
                  ))}

                  {showAddSource ? (
                    <div className="settings-glass-card bg-white/[0.02] border border-white/20 rounded-xl p-4 flex flex-wrap gap-2">
                      <textarea
                        rows={3}
                        disabled={importingSources}
                        aria-label={language === 'de' ? 'Quellen-URLs oder JSON' : 'Source URLs or JSON'}
                        value={newSourceUrl}
                        onChange={e => setNewSourceUrl(e.target.value)}
                        placeholder={language === 'de' ? 'Eine Quellen-URL pro Zeile oder JSON einfügen…' : 'Paste source URLs, one per line, or JSON…'}
                        className="w-full min-w-0 bg-white/[0.025] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30 disabled:opacity-60"
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void handleAddSource() } }}
                      />
                      <button disabled={importingSources} onClick={handleAddSource} className="px-4 py-1.5 bg-white text-black hover:bg-white/90 rounded-lg text-xs font-semibold shadow-sm cursor-pointer disabled:opacity-50">{importingSources ? (language === 'de' ? 'Wird importiert…' : 'Importing…') : t('add')}</button>
                      <button onClick={handleImportFile} className="px-4 py-1.5 bg-hub-base hover:bg-white/10 text-white rounded-lg text-xs font-semibold border border-white/20 cursor-pointer flex items-center gap-1.5">
                        <Download size={14} />
                        {language === 'de' ? 'Datei öffnen' : 'Open File'}
                      </button>
                      <button onClick={() => setShowAddSource(false)} className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/10 cursor-pointer">{t('cancel')}</button>
                    </div>
                  ) : sources.length > 0 ? (
                    <button onClick={() => setShowAddSource(true)} className="w-full py-3 bg-hub-surface hover:bg-white/[0.04] border border-white/10 border-dashed rounded-xl flex items-center justify-center gap-2 text-xs font-medium text-hub-muted hover:text-white transition-colors cursor-pointer">
                      <Plus size={15} />
                      {t('addSource')}
                    </button>
                  ) : null}
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'storage' && (
            <div>
              <StorageManagerView />
            </div>
          )}

          {activeSettingsTab === 'notifications' && (
            <div className="settings-notification-sections space-y-8">
              <ChatNotificationSettings/>
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">{language === 'de' ? 'Hinweise und Töne' : 'Alerts & sound'}</h2>
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
                    checked={settings.freeGamesNotifications ?? true}
                    label={t('freeGamesNotifications')}
                    description={t('freeGamesNotificationsDesc')}
                    onChange={() => set('freeGamesNotifications', !(settings.freeGamesNotifications ?? true))}
                  />

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
                            <div data-selected={isSelected || undefined}
                              key={preset.id}
                              onClick={() => {
                                updateSettings({ notificationSound: preset.id })
                                if (window.electronAPI) {
                                  window.electronAPI.setSettings({ notificationSound: preset.id })
                                }
                                playNotificationSound(preset.id)
                              }}
                              className={`settings-glass-card group p-3 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-white/10 border-white text-white shadow-sm'
                                  : 'bg-white/[0.02] border-white/10 text-white/70 hover:border-white/20 hover:text-white'
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
                                aria-label={t('uiSoundPreview')}
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
            </div>
          )}

          {activeSettingsTab === 'integrations' && (
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('integrations') || 'Discord & Integrations'}</h2>
                <div className="space-y-4">
                  <CleanCheckbox
                    checked={settings.discordRpc ?? true}
                    label="Discord Rich Presence"
                    description={language === 'de' ? 'Aktiviert den Eclipse-Status auf Discord. Ausschalten entfernt auch Idle- und Download-Status.' : 'Enable Eclipse activity on Discord. Turning this off also hides idle and download status.'}
                    onChange={() => {
                      const val = !(settings.discordRpc ?? true)
                      persistSettings({ discordRpc: val })
                    }}
                    rightElement={
                      <div className="inline-flex p-1 rounded-lg bg-black/40 border border-white/10 flex-shrink-0 backdrop-blur-md">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const current = settings.discordActivityStyle || settings.discordRpcActivityStyle || 'clipping'
                            if (current !== 'playing') {
                              persistSettings({ discordActivityStyle: 'playing', discordRpcActivityStyle: 'playing' })
                            }
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                            ((settings.discordActivityStyle || settings.discordRpcActivityStyle) === 'playing')
                              ? 'bg-white text-black font-bold shadow-sm'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Gamepad2 size={12} className={((settings.discordActivityStyle || settings.discordRpcActivityStyle) === 'playing') ? 'text-black' : 'text-white/60'} />
                          <span>{t('uiPlaying')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            const current = settings.discordActivityStyle || settings.discordRpcActivityStyle || 'clipping'
                            if (current !== 'clipping') {
                              persistSettings({ discordActivityStyle: 'clipping', discordRpcActivityStyle: 'clipping' })
                            }
                          }}
                          className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                            ((settings.discordActivityStyle || settings.discordRpcActivityStyle) !== 'playing')
                              ? 'bg-white text-black font-bold shadow-sm'
                              : 'text-white/60 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <Film size={12} className={((settings.discordActivityStyle || settings.discordRpcActivityStyle) !== 'playing') ? 'text-black' : 'text-white/60'} />
                          <span>{t('uiClipping')}</span>
                        </button>
                      </div>
                    }
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcRobloxSubGame ?? true}
                    label={language === 'de' ? 'Detaillierte Roblox Game-Erkennung' : 'Detailed Roblox Game Detection'}
                    description={language === 'de' ? 'Erkennt das exakte Roblox-Spiel (z. B. Blox Fruits) samt individuellem Thumbnail auf Discord statt nur das Standard Roblox-Logo.' : 'Detects the exact Roblox game (e.g. Blox Fruits) with official thumbnail instead of only standard Roblox.'}
                    onChange={() => {
                      const val = !(settings.discordRpcRobloxSubGame ?? true)
                      persistSettings({ discordRpcRobloxSubGame: val })
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcAnimatedText ?? false}
                    label={language === 'de' ? 'Animierter Discord-Status & Text' : 'Animated Discord Status & Text'}
                    description={language === 'de' ? 'Animiert die Statuszeilen und Untertitel deines Discord-Status dynamisch in Echtzeit mit wechselnden Effekten und Glyphen.' : 'Dynamically animates the status lines and subtitles of your Discord status in real-time with cycling effects.'}
                    onChange={() => {
                      const val = !(settings.discordRpcAnimatedText ?? false)
                      persistSettings({ discordRpcAnimatedText: val })
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcIdle ?? true}
                    label={language === 'de' ? 'Idle-Status anzeigen' : 'Show Idle Status'}
                    description={language === 'de' ? 'Zeigt „Stöbert in der Bibliothek“ auf Discord an, wenn kein Spiel aktiv ist.' : 'Show \'Browsing Library\' on Discord when you are not playing any game.'}
                    onChange={() => {
                      const val = !(settings.discordRpcIdle ?? true)
                      persistSettings({ discordRpcIdle: val })
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcShowDownloads ?? true}
                    label={language === 'de' ? 'Aktive Downloads anzeigen' : 'Show Active Downloads'}
                    description={language === 'de' ? 'Zeigt aktive Downloads aus Eclipse und Steam mit Quelle, Fortschritt und Installationsphase an, solange kein Spiel läuft.' : 'Show active Eclipse and Steam downloads with their source, available progress and installation phase while no game is running.'}
                    onChange={() => {
                      const val = !(settings.discordRpcShowDownloads ?? true)
                      persistSettings({ discordRpcShowDownloads: val })
                    }}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcShowVersion === true}
                    label={language === 'de' ? 'Eclipse-Version anzeigen' : 'Show Eclipse version'}
                    description={language === 'de' ? 'Zeigt deine aktuelle Eclipse-Version zusätzlich im Discord-Status an.' : 'Include your current Eclipse version in your Discord activity.'}
                    onChange={() => persistSettings({ discordRpcShowVersion: settings.discordRpcShowVersion !== true })}
                  />

                  <CleanCheckbox
                    checked={settings.discordRpcPrivacyMode ?? false}
                    label={language === 'de' ? 'Privatsphäre- / Stealth-Modus' : 'Privacy / Stealth Mode'}
                    description={language === 'de' ? 'Versteckt Spieltitel auf Discord und zeigt stattdessen nur „Spielt ein Spiel“ an.' : 'Hide specific game titles on Discord and show \'Playing a Game\' instead.'}
                    onChange={() => {
                      const val = !(settings.discordRpcPrivacyMode ?? false)
                      persistSettings({ discordRpcPrivacyMode: val })
                    }}
                  />
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'gameplay' && (
            <GameplayOverlayTab settings={settings} updateSettings={updateSettings} />
          )}

          {activeSettingsTab === 'profile' && (
            <div className="settings-profile-sections space-y-8">
              <section>
                <h2 className="text-lg font-bold text-white mb-4 tracking-tight">{t('profileSettings') || 'Profile Settings'}</h2>
                <div className="space-y-6">
                  {/* Steam Sync Section */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-5 relative overflow-hidden">
                    <h3 className="font-semibold text-white mb-2 flex items-center gap-2"><User size={16} className="text-white"/> {language === 'de' ? 'Steam-Integration' : 'Steam Integration'}</h3>
                    <p className="text-xs text-hub-muted mb-4">{language === 'de' ? 'Verknüpfe dein Steam-Profil, um Avatar, Benutzernamen, Level und Statistiken automatisch zu synchronisieren.' : 'Link your Steam profile to automatically sync your avatar, username, level, and library stats.'}</p>

                    <label className="block text-[10px] font-semibold text-white/50 uppercase tracking-wider mb-2">{language === 'de' ? 'Steam Profil-URL oder ID' : 'Steam Profile URL or ID'}</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder={language === 'de' ? 'https://steamcommunity.com/id/... oder deine SteamID64' : 'https://steamcommunity.com/id/... or your SteamID64'}
                        aria-label={de ? 'Steam Profil-URL oder ID' : 'Steam Profile URL or ID'}
                        id="settings-steam-profile-url"
                        value={settings.steamProfileUrl || ''}
                        onChange={e => set('steamProfileUrl', e.target.value)}
                        className="flex-1 bg-white/[0.025] border border-white/10 rounded-lg py-2 px-4 text-xs text-white focus:outline-none focus:border-white/30"
                      />
                      <button
                        onClick={async () => {
                          if (!settings.steamProfileUrl) return

                          const profile = await fetchSteamUserProfile(settings.steamProfileUrl)
                          if (profile) {

                            const newSettings = {
                              username: profile.username,
                              avatarUrl: profile.avatarFull,
                              steamAvatarFrameUrl: profile.steamAvatarFrameUrl ?? null,
                              steamAvatarFrameStaticUrl: profile.steamAvatarFrameStaticUrl ?? null,
                              steamProfileUrl: settings.steamProfileUrl,
                              steamLevel: profile.steamLevel ?? 0,
                              steamGamesCount: profile.steamGamesCount ?? 0,
                              steamBadgesCount: profile.steamBadgesCount ?? 0,
                              steamRecentGames: profile.steamRecentGames,
                              steamFavoriteBadge: profile.steamFavoriteBadge
                            }

                            persistSettings(newSettings)
                            if ((window as any).electronAPI?.account?.saveIdentity) {
                              (window as any).electronAPI.account.saveIdentity({ username: profile.username }).catch(() => {})
                            }
                            import('../../services/socialService').then(({ syncMyProfile }) => syncMyProfile().catch(() => {}))

                            showNotification(language === 'de' ? 'Steam-Profil synchronisiert!' : 'Steam profile synced!', 'success')
                          } else {
                            showNotification(language === 'de' ? 'Fehler beim Synchronisieren des Steam-Profils.' : 'Failed to sync Steam profile.', 'error')
                          }
                        }}
                        className="px-4 py-2 bg-white text-black hover:bg-white/90 text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap shadow-sm hover:scale-[1.01]"
                      >
                        <RefreshCw size={13} className="text-black" /> {language === 'de' ? 'Profil synchronisieren' : 'Sync Profile'}
                      </button>
                    </div>
                  </div>

                  {/* Privacy Section */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-5 space-y-4">
                    <h3 className="font-semibold text-white text-sm flex items-center gap-2"><Shield size={16} className="text-white"/> {language === 'de' ? 'Privatsphäre-Einstellungen' : 'Profile Privacy'}</h3>

                    <CleanCheckbox
                      checked={settings.profileShowPlaytime !== false}
                      label={language === 'de' ? 'Gesamte Spielzeit anzeigen' : 'Show Total Playtime'}
                      description={language === 'de' ? 'Zeigt deine gesamte Spielzeit über alle Spiele auf deinem Profil an.' : 'Display your accumulated playtime across all games on your profile.'}
                      onChange={() => {
                        const val = !(settings.profileShowPlaytime !== false)
                        set('profileShowPlaytime', val)
                      }}
                    />

                    <CleanCheckbox
                      checked={settings.profileShowSteamStats !== false}
                      label={language === 'de' ? 'Steam-Abzeichen anzeigen' : 'Show Steam Badges'}
                      description={language === 'de' ? 'Zeigt dein synchronisiertes Steam-Level, Spiele und Abzeichen auf deinem Profil an.' : 'Display your synced Steam Level, Games, and Badges on your profile.'}
                      onChange={() => {
                        const val = !(settings.profileShowSteamStats !== false)
                        set('profileShowSteamStats', val)
                      }}
                    />
                  </div>

                  <AccountProtection settings={settings} />
                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'system' && (
            <div className="settings-system-sections space-y-6">
              <section>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="p-2 rounded-xl bg-white/5 text-white/80 border border-white/10">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      {t('system')}
                    </h2>
                    <p className="text-xs text-white/50">
                      {language === 'de'
                        ? 'Hintergrundbeleuchtung, Grafikbeschleunigung und Systemressourcen.'
                        : 'Background lighting, graphics acceleration and system resources.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Background illumination */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-6">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-semibold text-white text-sm tracking-wide">
                            {language === 'de' ? 'Hintergrundbeleuchtung' : 'Background lighting'}
                          </h3>
                          <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full border ${
                            settings.backgroundLighting !== false
                              ? 'bg-white/10 text-white border-white/20'
                              : 'bg-white/5 text-white/40 border-white/10'
                          }`}>
                            {settings.backgroundLighting !== false
                              ? (language === 'de' ? 'An' : 'On')
                              : (language === 'de' ? 'Aus' : 'Off')}
                          </span>
                        </div>
                        <p className="text-xs text-hub-muted leading-relaxed max-w-xl">
                          {language === 'de'
                            ? 'Dezente orange Beleuchtung hinter der Oberfläche. Im Hintergrund wird sie automatisch dunkler und pausiert.'
                            : 'Subtle orange lighting behind the interface. It automatically dims and pauses when Eclipse is in the background.'}
                        </p>
                      </div>

                      {/* Pure White & Black Toggle Switch */}
                      <button
                        id="settings-background-lighting"
                        type="button"
                        role="switch"
                        aria-label={language === 'de' ? 'Hintergrundbeleuchtung' : 'Background lighting'}
                        aria-checked={settings.backgroundLighting !== false}
                        onClick={() => {
                          set('backgroundLighting', settings.backgroundLighting === false)
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          settings.backgroundLighting !== false ? 'bg-white' : 'bg-white/15'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                            settings.backgroundLighting !== false
                              ? 'translate-x-5 bg-black'
                              : 'translate-x-0 bg-white/70'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Minimalist RAM Flush Action */}
                    <div className="mt-4 pt-3.5 border-t border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <p className="text-xs text-white/50 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                        {language === 'de' ? 'Ungenutzten Arbeitsspeicher sofort an Windows und Spiele zurückgeben.' : 'Instantly release unused working memory back to Windows and games.'}
                      </p>
                      <button
                        type="button"
                        disabled={isCleaningRam}
                        onClick={async () => {
                          if (window.electronAPI?.flushRam) {
                            setIsCleaningRam(true)
                            try {
                              const res = await window.electronAPI.flushRam()
                              if (res && res.freedMB > 0) {
                                showNotification(
                                  language === 'de'
                                    ? `RAM bereinigt! ${res.freedMB} MB freigegeben (${res.currentFreeGB} GB frei)`
                                    : `RAM cleaned! ${res.freedMB} MB freed (${res.currentFreeGB} GB free)`,
                                  'success'
                                )
                              } else {
                                showNotification(
                                  language === 'de'
                                    ? `System bereits optimal bereinigt (${res?.currentFreeGB || '0'} GB frei)`
                                    : `System already optimal (${res?.currentFreeGB || '0'} GB free)`,
                                  'info'
                                )
                              }
                            } catch (e: any) {
                              showNotification(
                                language === 'de' ? 'Fehler beim Bereinigen: ' + (e.message || e) : 'Error cleaning RAM: ' + (e.message || e),
                                'error'
                              )
                            } finally {
                              setIsCleaningRam(false)
                            }
                          }
                        }}
                        className={`px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-2 whitespace-nowrap border border-white/10 ${
                          isCleaningRam ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                        }`}
                      >
                        {isCleaningRam ? (
                          <Loader2 size={12} className="text-white animate-spin" />
                        ) : (
                          <RotateCcw size={12} className="text-white" />
                        )}
                        {isCleaningRam
                          ? (language === 'de' ? 'Wird bereinigt...' : 'Cleaning...')
                          : (language === 'de' ? 'RAM bereinigen' : 'Clean RAM')}
                      </button>
                    </div>
                  </div>

                  {/* GPU Hardware Acceleration Card */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-6">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-semibold text-white text-sm tracking-wide">
                            {t('hardwareAcceleration') || 'GPU-Hardwarebeschleunigung'}
                          </h3>
                          <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full border ${
                            settings.hardwareAcceleration !== false
                              ? 'bg-white/10 text-white border-white/20'
                              : 'bg-white/5 text-white/40 border-white/10'
                          }`}>
                            {settings.hardwareAcceleration !== false ? '60 – 120+ FPS' : 'Software CPU'}
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
                        aria-label={t('hardwareAcceleration')}
                        aria-checked={settings.hardwareAcceleration !== false}
                        onClick={() => {
                          const val = !(settings.hardwareAcceleration !== false)
                          set('hardwareAcceleration', val)
                        }}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          settings.hardwareAcceleration !== false ? 'bg-white' : 'bg-white/15'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow-sm ring-0 transition duration-200 ease-in-out ${
                            settings.hardwareAcceleration !== false
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
                          const newSettings = { ...settings }
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
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
                      <div className="py-2 sm:py-0 sm:px-4 first:pl-0">
                        <span className="text-[10px] uppercase font-semibold text-white/40 tracking-wider block mb-1">Pipeline</span>
                        <span className="text-xs font-medium text-white">Direct3D 11 / ANGLE</span>
                      </div>
                      <div className="py-2 sm:py-0 sm:px-4">
                        <span className="text-[10px] uppercase font-semibold text-white/40 tracking-wider block mb-1">{t('uiDpiScaling')}</span>
                        <span className="text-xs font-medium text-white">{t('uiNativeDpi')}</span>
                      </div>
                      <div className="py-2 sm:py-0 sm:px-4 last:pr-0">
                        <span className="text-[10px] uppercase font-semibold text-white/40 tracking-wider block mb-1">{t('uiRefreshRate')}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span className="text-xs font-medium text-white">60 FPS – 240Hz+</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ─── Steam Traffic & Rate-Limit Inspector Card ─── */}
                  <div className="settings-glass-card bg-white/[0.02] border border-white/10 rounded-xl p-5">
                    <div className="flex items-start justify-between gap-6">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-semibold text-white text-sm tracking-wide flex items-center gap-2">
                            <Activity size={16} className="text-emerald-400" />

                            {t('uiTrafficInspector')}
                          </h3>
                          <span className={`text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded-full border ${
                            isSteamMonitorOpen
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-white/5 text-white/40 border-white/10'
                          }`}>
                            {isSteamMonitorOpen ? 'Visible' : 'Hidden'}
                          </span>
                        </div>
                        <p className="text-xs text-hub-muted leading-relaxed max-w-xl font-sans">

                          {t('uiTrafficIntro')} <strong>F9</strong>.
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (window.electronAPI?.toggleSteamMonitorWindow) {
                              window.electronAPI.toggleSteamMonitorWindow()
                            } else if (window.electronAPI?.openSteamMonitorWindow) {
                              window.electronAPI.openSteamMonitorWindow()
                            }
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 hover:text-emerald-300 text-xs font-semibold transition-all flex items-center gap-1.5"
                          title={t('uiToggleInspector')}
                        >
                          <Activity size={13} />
                          <span>{t('uiLaunchInspector')}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </section>
            </div>
          )}

          {activeSettingsTab === 'plugins' && (
            <PluginsSettingsTab />
          )}

          {activeSettingsTab === 'addons' && (
            <AddonsSettingsTab />
          )}

          {/* Fallback for empty tabs */}
          {!['general', 'clips', 'downloads', 'notifications', 'integrations', 'gameplay', 'profile', 'system', 'storage', 'plugins', 'addons'].includes(activeSettingsTab) && (
            <div className="flex flex-col items-center justify-center h-64 text-hub-muted">
              <SettingsIcon size={32} className="mb-4 opacity-50" />
              <p>{t('settingsUnderConstruction')}</p>
            </div>
          )}

          </div>
        </SceneTransition>
      </div>

    </div>
  )
}
