import { useEffect, useState, useCallback } from 'react'
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
import { SplashView } from './components/splash/SplashView'
import { EclipseInfoView } from './components/eclipse/EclipseInfoView'
import { EclipseCinemaModal } from './components/eclipse/EclipseCinemaModal'
import { GameDetailModal } from './components/shared/GameDetailModal'
import { Notification } from './components/shared/Notification'
import { FriendsWindow } from './components/friends/FriendsWindow'
import { AddFriendModal } from './components/friends/AddFriendModal'
import { useUIStore } from './store/uiStore'
import { useGameStore } from './store/gameStore'
import { useDownloadStore } from './store/downloadStore'
import { useScanner } from './hooks/useScanner'
import { sendAppNotification } from './services/notificationService'
import { playLaunchCue } from './services/soundService'

const pageVariants = {
  initial: { opacity: 0, y: 6, filter: 'blur(3px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit:    { opacity: 0, y: -4, filter: 'blur(3px)' },
}

function ViewRouter() {
  const { activeView } = useUIStore()

  const views: Record<string, JSX.Element> = {
    home:      <HomeView />,
    catalogue: <CatalogueView />,
    library:   <LibraryView />,
    downloads: <DownloadsView />,
    settings:  <SettingsView />,
    profile:   <ProfileView />,
    notifications: <NotificationsView />,
    'eclipse-info': <EclipseInfoView />,
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
  const isGameModalOpen = useUIStore(state => state.isGameModalOpen)
  const settings = useGameStore(state => state.settings)
  const { scan } = useScanner()
  const [isSplashComplete, setIsSplashComplete] = useState(false)

  const handleSplashComplete = useCallback(() => {
    setIsSplashComplete(true)
    const currentSettings = useGameStore.getState().settings
    if (currentSettings.launchInLibrary) {
      useUIStore.getState().setActiveView('library')
    }
  }, [])

  // Auto-updater listener
  useEffect(() => {
    if (!window.electronAPI?.onUpdaterEvent) return;

    // Check for updates automatically on startup if enabled
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

  // Mouse thumb buttons (Back/Forward) & Electron navigation listener
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

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('auxclick', handleAuxClick)

    const handleContextMenu = (e: MouseEvent) => {
      if (process.env.NODE_ENV === 'production') {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', handleContextMenu)

    // Listen for cross-window friend add modal trigger
    let cleanupAddFriend: (() => void) | undefined
    if (window.electronAPI?.onShowAddFriendModal) {
      cleanupAddFriend = window.electronAPI.onShowAddFriendModal(() => {
        useUIStore.getState().setIsAddFriendOpen(true)
      })
    }

    let cleanupFriendProfile: (() => void) | undefined
    if (window.electronAPI?.onShowFriendProfileModal) {
      cleanupFriendProfile = window.electronAPI.onShowFriendProfileModal((friendId) => {
        useUIStore.getState().openFriendProfile(friendId)
      })
    }

    let cleanupElectronNav: (() => void) | undefined
    if (window.electronAPI?.onNavigate) {
      cleanupElectronNav = window.electronAPI.onNavigate((direction) => {
        if (direction === 'back') useUIStore.getState().goBack()
        if (direction === 'forward') useUIStore.getState().goForward()
      })
    }

    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('auxclick', handleAuxClick)
      document.removeEventListener('contextmenu', handleContextMenu)
      if (cleanupAddFriend) cleanupAddFriend()
      if (cleanupFriendProfile) cleanupFriendProfile()
      if (cleanupElectronNav) cleanupElectronNav()
    }
  }, [])

  // Process Monitor listeners for game start & stop
  useEffect(() => {
    let cleanupStart: (() => void) | undefined
    let cleanupStop: (() => void) | undefined

    // Initial check in case a game is already running
    if (window.electronAPI?.getCurrentGame) {
      window.electronAPI.getCurrentGame().then(game => {
        if (game) {
          useGameStore.getState().startPlaySession(game.name, game.name)
        }
      })
    }

    if (window.electronAPI?.onGameStarted) {
      cleanupStart = window.electronAPI.onGameStarted((data) => {
        useGameStore.getState().startPlaySession(data.name, data.name)
        if (useGameStore.getState().settings.soundEffects ?? true) {
          playLaunchCue()
        }
      })
    }
    if (window.electronAPI?.onGameStopped) {
      cleanupStop = window.electronAPI.onGameStopped(() => {
        useGameStore.getState().stopPlaySession()
      })
    }

    return () => {
      if (cleanupStart) cleanupStart()
      if (cleanupStop) cleanupStop()
    }
  }, [])

  // Active game playtime ticker
  const activeGame = useGameStore(state => state.activeGame)
  useEffect(() => {
    if (!activeGame) return
    const interval = setInterval(() => {
      useGameStore.getState().addPlayTime(activeGame.id, 1)
    }, 60000)

    return () => {
      clearInterval(interval)
    }
  }, [activeGame])


  // Discord RPC syncing
  const discordRpcEnabled = useGameStore(state => state.settings.discordRpc ?? true)
  const discordRpcIdleEnabled = useGameStore(state => state.settings.discordRpcIdle ?? false)
  const discordRpcShowDownloads = useGameStore(state => state.settings.discordRpcShowDownloads ?? true)
  const discordRpcPrivacyMode = useGameStore(state => state.settings.discordRpcPrivacyMode ?? false)
  const downloads = useDownloadStore(state => state.downloads)

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



  return (
    <div className="flex flex-col h-screen bg-hub-base select-none overflow-hidden relative">
      {/* Custom frameless title bar */}
      <TitleBar />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fixed Sidebar */}
        <Sidebar />

        {/* Content area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-hidden relative">
            <ViewRouter />
            <GameDetailModal />
          </main>
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

      {/* Startup Splash Overlay with Seamless Crossfade */}
      <AnimatePresence>
        {!isSplashComplete && (
          <SplashView onComplete={handleSplashComplete} />
        )}
      </AnimatePresence>
    </div>
  )
}
