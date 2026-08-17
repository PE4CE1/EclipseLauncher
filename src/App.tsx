import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sidebar } from './components/layout/Sidebar'
import { TitleBar } from './components/layout/TitleBar'
import { TopBar } from './components/layout/TopBar'
import { HomeView } from './components/home/HomeView'
import { CatalogueView } from './components/catalogue/CatalogueView'
import { LibraryView } from './components/library/LibraryView'
import { DownloadsView } from './components/downloads/DownloadsView'
import { SettingsView } from './components/settings/SettingsView'
import { ProfileView } from './components/profile/ProfileView'
import { NotificationsView } from './components/notifications/NotificationsView'
import { EclipseInfoView } from './components/eclipse/EclipseInfoView'
import { EclipseCinemaModal } from './components/eclipse/EclipseCinemaModal'
import { GameDetailModal } from './components/shared/GameDetailModal'
import { Notification } from './components/shared/Notification'
import { FriendsWindow } from './components/friends/FriendsWindow'
import { AddFriendModal } from './components/friends/AddFriendModal'
import { SplashView } from './components/splash/SplashView'
import { useUIStore } from './store/uiStore'
import { useGameStore } from './store/gameStore'
import { useDownloadStore } from './store/downloadStore'
import { useScanner } from './hooks/useScanner'
import { sendAppNotification } from './services/notificationService'
import { initFirebaseSocial, updateFirebasePresence } from './services/firebaseService'
import { useThemeStore } from './store/themeStore'

const pageVariants = {
  initial: { opacity: 0, y: 6, filter: 'blur(3px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit:    { opacity: 0, y: -4, filter: 'blur(3px)' },
}

function ViewRouter() {
  const { activeView } = useUIStore()

  const views: Record<string, JSX.Element> = {
    home:          <HomeView />,
    catalogue:     <div className="h-full pt-16"><CatalogueView /></div>,
    library:       <div className="h-full pt-16"><LibraryView /></div>,
    downloads:     <div className="h-full pt-16"><DownloadsView /></div>,
    settings:      <div className="h-full pt-16"><SettingsView /></div>,
    profile:       <div className="h-full pt-16"><ProfileView /></div>,
    notifications: <div className="h-full pt-16"><NotificationsView /></div>,
    'eclipse-info':<div className="h-full pt-16"><EclipseInfoView /></div>,
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeView}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="h-full"
      >
        {views[activeView] ?? <HomeView />}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const isGameModalOpen = useUIStore(state => state.isGameModalOpen)
  const settings = useGameStore(state => state.settings)
  const { scan } = useScanner()

  // Sync disk playtime and setup game process listeners
  useEffect(() => {
    if (window.electronAPI?.getPlaytime) {
      window.electronAPI.getPlaytime().then((db) => {
        if (db) useGameStore.getState().syncPlaytimeFromDisk(db)
      }).catch(() => {})
    }

    const unsubStart = window.electronAPI?.onGameStarted?.((data) => {
      if (data?.name) {
        useGameStore.getState().startPlaySession(data.name, data.name)
      }
    })

    const unsubStop = window.electronAPI?.onGameStopped?.(() => {
      useGameStore.getState().stopPlaySession()
    })

    const interval = setInterval(() => {
      const state = useGameStore.getState()
      if (state.activeGame) {
        state.tickPlaySession()
      }
    }, 15000)

    return () => {
      unsubStart?.()
      unsubStop?.()
      clearInterval(interval)
    }
  }, [])

  // Background library scan and startup preferences
  useEffect(() => {
    const currentSettings = useGameStore.getState().settings
    if (currentSettings.launchInLibrary) {
      useUIStore.getState().setActiveView('library')
    }
    if (currentSettings.autoScan !== false) {
      scan().catch((e) => console.warn('[App] Background scan error:', e))
    }
  }, [])

  // Initialize Firebase Real-Time Social Sync
  useEffect(() => {
    initFirebaseSocial()
  }, [])

  // Listen to standalone Friends Window events
  useEffect(() => {
    const unsubAdd = (window as any).electronAPI?.onShowAddFriendModal?.(() => {
      useUIStore.getState().setIsAddFriendOpen(true)
    })
    const unsubProfile = (window as any).electronAPI?.onShowFriendProfileModal?.((friendId: string) => {
      useUIStore.getState().openFriendProfile(friendId)
    })
    return () => {
      unsubAdd?.()
      unsubProfile?.()
    }
  }, [])

  // Deep Link Theme Installer listener
  useEffect(() => {
    const unsubTheme = (window as any).electronAPI?.onThemeInstallRequest?.((theme: any) => {
      if (theme && theme.css) {
        useThemeStore.getState().installTheme(theme)
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        sendAppNotification({
          title: lang === 'de' ? 'Neues Theme installiert! 🎨' : 'New Theme Installed! 🎨',
          body: lang === 'de'
            ? `Das Theme "${theme.name}" wurde erfolgreich importiert und aktiviert!`
            : `Theme "${theme.name}" was successfully imported and activated!`,
          type: 'info'
        })
        useUIStore.getState().showNotification(
          lang === 'de'
            ? `Theme "${theme.name}" importiert & aktiviert! ✨`
            : `Theme "${theme.name}" imported & activated! ✨`,
          'success'
        )
      }
    })
    return () => unsubTheme?.()
  }, [])

  // Dynamic Custom CSS Theme Injection
  const { installedThemes, activeThemeId } = useThemeStore()
  useEffect(() => {
    const styleId = 'eclipse-custom-theme-style'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null

    const activeTheme = installedThemes.find((t) => t.id === activeThemeId)

    if (activeTheme && activeTheme.css) {
      if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = styleId
        document.head.appendChild(styleEl)
      }
      styleEl.textContent = activeTheme.css
    } else {
      if (styleEl) {
        styleEl.remove()
      }
    }
  }, [installedThemes, activeThemeId])

  // Auto-updater listener
  useEffect(() => {
    if (!window.electronAPI?.onUpdaterEvent) return;

    const currentSettings = useGameStore.getState().settings;
    if (currentSettings.autoCheckUpdates && window.electronAPI.checkUpdate) {
      window.electronAPI.checkUpdate();
    }

    return window.electronAPI.onUpdaterEvent((payload) => {
      const { status, data } = payload;
      let progress = undefined;
      let info = undefined;
      
      if (status === 'downloading' && data?.percent) {
        progress = data.percent;
      }
      if (status === 'available' || status === 'downloaded' || status === 'error') {
        info = data;
      }
      
      if (status === 'available') {
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        const ver = data?.version ? ` (v${data.version})` : ''
        const title = lang === 'de' ? 'Eclipse Update verfügbar' : 'Eclipse Update Available'
        const body = lang === 'de' 
          ? `Eine neue Version${ver} von Eclipse Launcher ist verfügbar! Klicke zum Herunterladen.`
          : `A new version${ver} of Eclipse Launcher is available! Click to download.`
        sendAppNotification({
          title,
          body,
          type: 'info',
          playSound: true,
        })
      }

      if (status === 'downloaded') {
        const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
        const title = lang === 'de' ? 'Update bereit' : 'Update Ready'
        const body = lang === 'de'
          ? 'Das Eclipse Update wurde heruntergeladen und wird beim Neustart installiert.'
          : 'The Eclipse update is ready to install on restart.'
        sendAppNotification({
          title,
          body,
          type: 'success',
          playSound: true,
        })
      }

      useUIStore.getState().setUpdateState(status as any, progress, info);
    });
  }, [])

  // Mouse thumb buttons (Back/Forward)
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      // Button 3 = Mouse Back (XButton1)
      if (e.button === 3) {
        e.preventDefault()
        e.stopPropagation()
        useUIStore.getState().goBack()
      }
      // Button 4 = Mouse Forward (XButton2)
      else if (e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
        useUIStore.getState().goForward()
      }
    }

    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  // Global Keybind: Escape to close GameDetailModal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isGameModalOpen) {
        useUIStore.getState().setIsGameModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGameModalOpen])

  // Process Monitor & Discord Activity
  const activeGame = useGameStore(state => state.activeGame)
  const downloads = useDownloadStore(state => state.downloads)
  const discordRpcEnabled = settings.discordRpc !== false
  const discordRpcIdleEnabled = settings.discordRpcIdle !== false
  const discordRpcShowDownloads = settings.discordRpcShowDownloads !== false
  const discordRpcPrivacyMode = !!settings.discordRpcPrivacyMode

  useEffect(() => {
    if (!discordRpcEnabled) {
      if (window.electronAPI?.clearDiscordActivity) {
        window.electronAPI.clearDiscordActivity()
      }
      return
    }

    if (activeGame) {
      if (window.electronAPI?.setDiscordActivity) {
        window.electronAPI.setDiscordActivity(activeGame.name, activeGame.startTime, discordRpcPrivacyMode)
      }
      return
    }

    const activeDownload = Object.values(downloads).find(d => d.status === 'downloading' || d.status === 'extracting')
    if (activeDownload && discordRpcShowDownloads) {
      if (window.electronAPI?.setDiscordDownloadActivity) {
        window.electronAPI.setDiscordDownloadActivity(activeDownload.name)
      }
      return
    }

    if (discordRpcIdleEnabled) {
      if (window.electronAPI?.setDiscordIdleActivity) {
        window.electronAPI.setDiscordIdleActivity()
      }
    } else {
      if (window.electronAPI?.clearDiscordActivity) {
        window.electronAPI.clearDiscordActivity()
      }
    }
  }, [activeGame, downloads, discordRpcEnabled, discordRpcIdleEnabled, discordRpcShowDownloads, discordRpcPrivacyMode])

  // Live Cloud Presence (Online / In-Game / Game Name)
  useEffect(() => {
    if (activeGame) {
      updateFirebasePresence('ingame', activeGame.name)
    } else {
      updateFirebasePresence('online', null)
    }
  }, [activeGame])

  return (
    <div className="flex flex-col h-screen bg-hub-base select-none overflow-hidden relative">
      {/* Custom frameless title bar */}
      <TitleBar />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fixed Sidebar */}
        <Sidebar />

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">
          {/* Main views and GameDetailModal (both extend from top y=0 behind TopBar) */}
          <main className="h-full w-full overflow-hidden relative">
            <ViewRouter />
            <GameDetailModal />
          </main>

          {/* Frosted Glass TopBar: Floats on Top of EVERYTHING */}
          <TopBar />
        </div>
      </div>

      {/* Toast notifications */}
      <Notification />
      
      {/* Friends Overlay Windows */}
      <FriendsWindow />
      <AnimatePresence>
        <AddFriendModal />
      </AnimatePresence>

      {/* Cinematic Easter Egg Eclipse Animation */}
      <EclipseCinemaModal />

      {/* Startup Splash Screen */}
      <AnimatePresence>
        {showSplash && <SplashView onComplete={() => setShowSplash(false)} />}
      </AnimatePresence>
    </div>
  )
}
