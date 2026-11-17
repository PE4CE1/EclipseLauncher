import { useWindowActivity } from './hooks/useWindowActivity'
import { desktopFetch as fetch } from './services/httpClient'
import { useState, useEffect, useLayoutEffect, useRef, memo, lazy, Suspense } from 'react'
import { MotionConfig } from 'framer-motion'
import { Sidebar } from './components/layout/Sidebar'
import { TitleBar } from './components/layout/TitleBar'
import { TopBar } from './components/layout/TopBar'
import { LauncherAtmosphere } from './components/layout/LauncherAtmosphere'
import { Notification } from './components/shared/Notification'
import { APP_VERSION, checkStartupUpdates } from './services/updateService'
import { useUIStore } from './store/uiStore'
import { useGameStore } from './store/gameStore'
import { useDownloadStore } from './store/downloadStore'
import { sendAppNotification } from './services/notificationService'
import { initSocialNetwork, updateSocialPresence } from './services/socialClient'
import { scheduleBackgroundTask } from './services/startupScheduler'
import { getNonSteamGame, repairNonSteamIdentity } from './services/nonSteamGames'
import { watchNativeGameSession } from './services/nativeGameSession'
import { watchNativeGameRegistry } from './services/nativeGameRegistry'
import { initClipEngine } from './services/clipEngineLifecycle'
import { initVoiceEngine } from './services/voiceEngine'
import { findSteamIdByName, getHardcodedSteamId, isPlaceholderAppName, extractAppIdFromPlaceholder, getKnownSteamGameName, resolveSteamAppName, resolveGamePreviewImage, KNOWN_GAME_PREVIEWS } from './services/steamService'
import { useThemeStore } from './store/themeStore'
import { useShallow } from 'zustand/react/shallow'
import { SceneTransition } from './components/shared/SceneTransition'
import { FreeGamesView } from './components/freegames/FreeGamesView'
import './components/layout/scene-motion.css'
import './components/settings/settings-surfaces.css'

const GameDetailModal = lazy(() => import('./components/shared/GameDetailModal').then(module => ({ default: module.GameDetailModal })))
const FriendsWindow = lazy(() => import('./components/friends/FriendsWindow').then(module => ({ default: module.FriendsWindow })))
const AddFriendModal = lazy(() => import('./components/friends/AddFriendModal').then(module => ({ default: module.AddFriendModal })))
const SplashView = lazy(() => import('./components/splash/SplashView').then(module => ({ default: module.SplashView })))
const EclipseCinemaModal = lazy(() => import('./components/eclipse/EclipseCinemaModal').then(module => ({ default: module.EclipseCinemaModal })))
const ChangelogModal = lazy(() => import('./components/eclipse/ChangelogModal').then(module => ({ default: module.ChangelogModal })))

const MemoHomeView = memo(lazy(() => import('./components/home/HomeView').then(module => ({ default: module.HomeView }))))
const MemoCatalogueView = memo(lazy(() => import('./components/catalogue/CatalogueView').then(module => ({ default: module.CatalogueView }))))
const MemoLibraryView = memo(lazy(() => import('./components/library/LibraryView').then(module => ({ default: module.LibraryView }))))
const MemoDownloadsView = memo(lazy(() => import('./components/downloads/DownloadsView').then(module => ({ default: module.DownloadsView }))))
const MemoSettingsView = memo(lazy(() => import('./components/settings/SettingsView').then(module => ({ default: module.SettingsView }))))
const MemoProfileView = memo(lazy(() => import('./components/profile/ProfileView').then(module => ({ default: module.ProfileView }))))
const MemoNotificationsView = memo(lazy(() => import('./components/notifications/NotificationsView').then(module => ({ default: module.NotificationsView }))))
const MemoEclipseInfoView = memo(lazy(() => import('./components/eclipse/EclipseInfoView').then(module => ({ default: module.EclipseInfoView }))))
const MemoClipsView = memo(lazy(() => import('./components/clips/ClipsView').then(module => ({ default: module.ClipsView }))))
const MemoStorageManagerView = memo(lazy(() => import('./components/storage/StorageManagerView').then(module => ({ default: module.StorageManagerView }))))
const MemoFreeGamesView = memo(FreeGamesView)

const VIEW_COMPONENTS = {
  home: MemoHomeView, catalogue: MemoCatalogueView, library: MemoLibraryView,
  downloads: MemoDownloadsView, settings: MemoSettingsView, profile: MemoProfileView,
  notifications: MemoNotificationsView, 'eclipse-info': MemoEclipseInfoView,
  clips: MemoClipsView, storage: MemoStorageManagerView, 'free-games': MemoFreeGamesView,
}

function ViewRouter() {
  const activeView = useUIStore(state => state.activeView)
  const covered = useUIStore(state => state.isGameModalOpen)
  const view = Object.prototype.hasOwnProperty.call(VIEW_COMPONENTS, activeView) ? activeView as keyof typeof VIEW_COMPONENTS : 'home'
  const View = VIEW_COMPONENTS[view]
  return <SceneTransition sceneKey={`${view}:${covered}`} animateOnMount enabled={!covered} data-view-scene={view} className={view === 'home' ? 'h-full w-full relative' : 'h-full w-full relative pt-16'}>
    <View />
  </SceneTransition>
}

export default function App() {
  useEffect(()=>window.electronAPI?.onSettingsUpdate?.(patch=>{
    const enabled=patch.overlayPerformance
    if(typeof enabled==='boolean')useGameStore.setState(state=>state.settings.overlayPerformance===enabled?state:{settings:{...state.settings,overlayPerformance:enabled}})
  }),[])
  const [showSplash, setShowSplash] = useState(true)
  const isFriendsOpen = useUIStore(state => state.isFriendsOpen)
  const isAddFriendOpen = useUIStore(state => state.isAddFriendOpen)
  const isCinemaOpen = useUIStore(state => state.isEclipseCinemaActive)
  const isChangelogOpen = useUIStore(state => state.isChangelogOpen)
  const openPanels = (isFriendsOpen ? 1 : 0) | (isAddFriendOpen ? 2 : 0) | (isCinemaOpen ? 4 : 0) | (isChangelogOpen ? 8 : 0)
  // Keep a panel mounted after its first use so its exit animation can complete.
  const [mountedPanels, setMountedPanels] = useState(0)
  useEffect(() => { if (openPanels) setMountedPanels(previous => previous | openPanels) }, [openPanels])
  const isGameModalOpen = useUIStore(state => state.isGameModalOpen)
  const viewLayer = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (viewLayer.current) viewLayer.current.inert = isGameModalOpen
  }, [isGameModalOpen])
  const [hasOpenedGameDetails, setHasOpenedGameDetails] = useState(false)
  useEffect(() => { if (isGameModalOpen) setHasOpenedGameDetails(true) }, [isGameModalOpen])
  const settings = useGameStore(useShallow(({ settings: s }) => ({
    backgroundLighting: s.backgroundLighting,
    launchInLibrary: s.launchInLibrary,
    launchInClips: s.launchInClips,
  })))
  const windowActive = useWindowActivity()

  // Sync disk playtime and setup game process listeners
  useEffect(() => watchNativeGameRegistry(window.electronAPI, useGameStore), [])

  useEffect(() => {
    if (window.electronAPI?.getPlaytime) {
      window.electronAPI.getPlaytime().then((db) => {
        if (db) useGameStore.getState().syncPlaytimeFromDisk(db)
      }).catch(() => {})
    }

    // Pre-restore persistent account identity from Registry/UserProfile (Tier 1 & 2)
    const syncId = window.electronAPI?.account?.initialIdentity
    if (syncId?.canonicalUid && syncId?.friendCode && syncId.friendCode.startsWith('ECL-')) {
      useGameStore.getState().updateSettings({
        userUid: syncId.canonicalUid,
        friendCode: syncId.friendCode,
        accountSecret: syncId.accountSecret,
        ...(syncId.username && syncId.username !== 'User' && syncId.username !== 'Eclipse Player' ? { username: syncId.username } : {})
      })
    }

    if (window.electronAPI?.account?.getIdentity) {
      window.electronAPI.account.getIdentity().then((identity) => {
        if (identity?.canonicalUid && identity?.friendCode && identity.friendCode.startsWith('ECL-')) {
          const current = useGameStore.getState().settings
          const patch: Record<string, any> = {
            userUid: identity.canonicalUid,
            friendCode: identity.friendCode,
            accountSecret: identity.accountSecret,
          }
          if (identity.username && identity.username !== 'User' && identity.username !== 'Eclipse Player' && (current.username === 'User' || !current.username)) {
            patch.username = identity.username
          }
          useGameStore.getState().updateSettings(patch)
        }
      }).catch(() => {})
    }

    // Load Electron persisted settings and merge into Zustand store.
    // This ensures userUid and friendCode survive across app restarts.
    if (window.electronAPI?.getSettings) {
      window.electronAPI.getSettings().then((saved: any) => {
        if (!saved) return
        const current = useGameStore.getState().settings
        const patch: Record<string, any> = {}
        // Prefer Electron-saved userUid/friendCode over localStorage defaults
        if (saved.userUid) patch.userUid = saved.userUid
        if (saved.friendCode && saved.friendCode.startsWith('ECL-')) {
          patch.friendCode = saved.friendCode
        }
        if (saved.accountSecret) patch.accountSecret = saved.accountSecret
        // Authoritative username from settings: if saved.username is set, keep it and sync to persistent identity
        if (saved.username && saved.username !== 'User' && saved.username !== 'Eclipse Player') {
          patch.username = saved.username
          if (window.electronAPI?.account?.saveIdentity) {
            window.electronAPI.account.saveIdentity({ username: saved.username }).catch(() => {})
          }
        }
        if (saved.avatarUrl && !current.avatarUrl) patch.avatarUrl = saved.avatarUrl
        if (saved.steamProfileUrl && !current.steamProfileUrl) patch.steamProfileUrl = saved.steamProfileUrl
        if (saved.steamLevel && !current.steamLevel) patch.steamLevel = saved.steamLevel
        if (saved.language) {
          patch.language = saved.language
        } else if (current.language && window.electronAPI?.setSettings) {
          window.electronAPI.setSettings({ language: current.language }).catch(() => {})
        }
        if (typeof saved.backgroundLighting === 'boolean') patch.backgroundLighting = saved.backgroundLighting
        if (typeof saved.launchInLibrary === 'boolean') patch.launchInLibrary = saved.launchInLibrary
        if (typeof saved.launchInClips === 'boolean') patch.launchInClips = saved.launchInClips
        if (Object.keys(patch).length > 0) {
          useGameStore.getState().updateSettings(patch)
        }
      }).catch(() => {})
    }

    // Global Self-Heal: Resolve missing steam IDs and placeholder game names on startup
    const healMissingSteamIds = async () => {
      const current = useGameStore.getState().installedGames || []
      const currentLib = useGameStore.getState().library || []
      if (current.length === 0 && currentLib.length === 0) return

      let changedInstalled = false
      const updated = current.map(g => {
        if (getNonSteamGame(g.name)) {
          const repaired = repairNonSteamIdentity(g)
          if (g.steamId !== repaired.steamId || g.iconUrl !== repaired.iconUrl || g.name !== repaired.name) changedInstalled = true
          return repaired
        }
        let name = g.name
        const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(name))
        if (numId && isPlaceholderAppName(name, numId)) {
          const known = getKnownSteamGameName(numId)
          if (known) {
            name = known
            changedInstalled = true
          }
        }
        if (!g.steamId && numId) {
          changedInstalled = true
          return {
            ...g,
            name,
            steamId: numId,
            iconUrl: g.iconUrl || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${numId}/header.jpg`,
          }
        }
        if (!g.steamId && g.platform !== 'steam' && name) {
          const knownId = getHardcodedSteamId(name)
          if (knownId) {
            changedInstalled = true
            return {
              ...g,
              name,
              steamId: knownId,
              iconUrl: g.iconUrl || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${knownId}/header.jpg`,
            }
          }
        }
        if (name !== g.name) {
          changedInstalled = true
          return { ...g, name }
        }
        return g
      })
      if (changedInstalled) {
        useGameStore.getState().setInstalledGames(updated)
      }

      let changedLib = false
      const updatedLib = currentLib.map(g => {
        if (getNonSteamGame(g.name)) {
          const repaired = repairNonSteamIdentity(g)
          if (g.steamId !== repaired.steamId || g.iconUrl !== repaired.iconUrl || g.name !== repaired.name) changedLib = true
          return repaired
        }
        let name = g.name
        const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(name))
        if (numId && isPlaceholderAppName(name, numId)) {
          const known = getKnownSteamGameName(numId)
          if (known) {
            name = known
            changedLib = true
          }
        }
        if (!g.steamId && numId) {
          changedLib = true
          return {
            ...g,
            name,
            steamId: numId,
            iconUrl: g.iconUrl || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${numId}/header.jpg`,
          }
        }
        if (name !== g.name) {
          changedLib = true
          return { ...g, name }
        }
        return g
      })
      if (changedLib) {
        useGameStore.getState().setLibrary(updatedLib)
      }

      // Background lookup for any remaining placeholder games across both installedGames and library
      const allToCheck = [...updated, ...updatedLib]
      const remainingPlaceholders = allToCheck.filter(g => {
        const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(g.name))
        return isPlaceholderAppName(g.name, numId || undefined)
      })
      if (remainingPlaceholders.length > 0) {
        const uniqueAppIds = Array.from(new Set(
          remainingPlaceholders
            .map(g => g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(g.name)))
            .filter((id): id is number => typeof id === 'number' && id > 0)
        ))

        for (const numId of uniqueAppIds) {
          const resolved = await resolveSteamAppName(numId)
          if (resolved && !isPlaceholderAppName(resolved, numId)) {
            const fresh = useGameStore.getState().installedGames
            useGameStore.getState().setInstalledGames(
              fresh.map(fg => {
                const fgNum = fg.steamId || (fg.appId ? Number(fg.appId) : extractAppIdFromPlaceholder(fg.name))
                return (fgNum === numId) ? { ...fg, name: resolved, steamId: numId } : fg
              })
            )
            const freshLib = useGameStore.getState().library
            useGameStore.getState().setLibrary(
              freshLib.map(fl => {
                const flNum = fl.steamId || (fl.appId ? Number(fl.appId) : extractAppIdFromPlaceholder(fl.name))
                return (flNum === numId) ? { ...fl, name: resolved, steamId: numId } : fl
              })
            )
          }
        }
      }

      // Background lookup for any other unresolved non-Steam games
      const freshCurrent = useGameStore.getState().installedGames
      const remaining = freshCurrent.filter(g => !g.steamId && g.platform !== 'steam' && g.name && !isPlaceholderAppName(g.name, g.appId))
      if (remaining.length > 0) {
        const results = await Promise.allSettled(
          remaining.map(async g => ({
            id: g.id,
            steamId: await findSteamIdByName(g.name)
          }))
        )
        const idMap = new Map<string, number>()
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.steamId) {
            idMap.set(r.value.id, r.value.steamId)
          }
        })
        if (idMap.size > 0) {
          const fresh = useGameStore.getState().installedGames
          useGameStore.getState().setInstalledGames(
            fresh.map(g => {
              if (idMap.has(g.id)) {
                const sid = idMap.get(g.id)!
                return {
                  ...g,
                  steamId: sid,
                  iconUrl: g.iconUrl || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${sid}/header.jpg`
                }
              }
              return g
            })
          )
        }
      }

      // Self-heal game icon URLs:
      // 1. Games known to lack standard static headers (e.g. 3722330 Shift At Midnight, 4704690 Meccha Chameleon) get their known preview
      // 2. Standard games restore their normal static header image if their iconUrl was inadvertently overwritten with a capsule
      const currentInstalled = useGameStore.getState().installedGames
      let iconSanitized = false
      const sanitizedGames = currentInstalled.map(g => {
        const norm = g.name ? g.name.toLowerCase().trim() : ''
        const knownPreview = (g.steamId && KNOWN_GAME_PREVIEWS[g.steamId]) || (norm && KNOWN_GAME_PREVIEWS[norm])
        if (knownPreview) {
          if (g.iconUrl !== knownPreview) {
            iconSanitized = true
            return { ...g, iconUrl: knownPreview }
          }
          return g
        }
        // If a standard Steam game's iconUrl was overwritten with a preview capsule, restore normal header
        if (g.steamId && g.steamId !== 999001 && g.iconUrl && (g.iconUrl.includes('capsule_') || g.iconUrl.includes('tiny_image'))) {
          iconSanitized = true
          return {
            ...g,
            iconUrl: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${g.steamId}/header.jpg`
          }
        }
        return g
      })
      if (iconSanitized) {
        useGameStore.getState().setInstalledGames(sanitizedGames)
      }
    }
    const cancelHealing = scheduleBackgroundTask(healMissingSteamIds, 3000)

    // Initialize Eclipse Clips Studio Background Engine & Replay Hotkeys
    const disposeClips=initClipEngine()
    initVoiceEngine()

    const gameSession = watchNativeGameSession(window.electronAPI, (data) => {
      if (data?.name) {
        const state = useGameStore.getState()
        if (state.activeGame?.authoritative && state.activeGame.name === data.name && state.activeGame.startTime === data.startTime) return
        state.startPlaySession(data.name, data.name, true, data.startTime)
        updateSocialPresence('ingame', data.name).catch(() => {})
      }
    }, reconcileOnly => {
      if (reconcileOnly && !useGameStore.getState().activeGame?.authoritative) return
      useGameStore.getState().stopPlaySession()
      window.electronAPI?.getPlaytime?.().then(db => {
        if (db) useGameStore.getState().syncPlaytimeFromDisk(db, true)
      }).catch(() => {})
      document.body.classList.remove('game-performance-mode')
      updateSocialPresence('online', null).catch(() => {})
    })
    const refreshGameSession = () => { void gameSession.refresh() }
    window.addEventListener('focus', refreshGameSession)

    const interval = setInterval(() => {
      const state = useGameStore.getState()
      if (state.activeGame) {
        state.tickPlaySession()
      }
    }, 30000)

    return () => {
      cancelHealing()
      disposeClips()
      gameSession.dispose()
      window.removeEventListener('focus', refreshGameSession)
      clearInterval(interval)
      document.body.classList.remove('game-performance-mode')
    }
  }, [])

  // The splash owns library preparation; only restore the preferred destination here.
  useEffect(() => {
    if (!showSplash) return
    useUIStore.getState().setActiveView(settings.launchInClips ? 'clips' : settings.launchInLibrary ? 'library' : 'home')
  }, [showSplash, settings.launchInClips, settings.launchInLibrary])

  useEffect(() => {
    if (showSplash) return
    return scheduleBackgroundTask(() => {
      if (!localStorage.getItem(`eclipse_changelog_seen_${APP_VERSION}`)) useUIStore.getState().setIsChangelogOpen(true)
    }, 1000)
  }, [showSplash])

  // Anti-Idle Repaint Guard: Ensures GPU surface wakes immediately on user return
  useEffect(() => {
    let lastActive = Date.now()
    const handleActivity = () => {
      const now = Date.now()
      if (now - lastActive > 60000) {
        window.electronAPI?.invalidateWindow?.()
        window.requestAnimationFrame(() => {})
      }
      lastActive = now
    }

    const handleWake = () => {
      window.electronAPI?.invalidateWindow?.()
      window.requestAnimationFrame(() => {})
    }

    window.addEventListener('mousemove', handleActivity, { passive: true })
    window.addEventListener('mousedown', handleActivity, { passive: true })
    window.addEventListener('keydown', handleActivity, { passive: true })
    window.addEventListener('focus', handleWake)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') handleWake()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('mousedown', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('focus', handleWake)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Authentication and the social SDK do not block the cached library UI.
  useEffect(() => {
    if (showSplash) return
    return scheduleBackgroundTask(initSocialNetwork)
  }, [showSplash])


  // Listen to standalone Friends Window events
  useEffect(() => window.electronAPI?.onOpenFreeGames?.(() => {
    useUIStore.getState().setActiveView('free-games')
  }), [])

  useEffect(() => {
    const unsubAdd = (window as any).electronAPI?.onShowAddFriendModal?.(() => {
      if (useUIStore.getState().isAddFriendOpen) {
        requestAnimationFrame(() => window.electronAPI?.addFriendModalReady?.())
        return
      }
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

  // Listen to Tray Game Launches
  useEffect(() => {
    if (!window.electronAPI?.onTrayLaunchGame) return
    const unlisten = window.electronAPI.onTrayLaunchGame((data: any) => {
      if (!data) return
      const name = data.displayName || data.name
      const lang = useGameStore.getState().settings.language === 'de' ? 'de' : 'en'
      if (name) {
        useUIStore.getState().showNotification(
          lang === 'de' ? `Starte ${name}...` : `Launching ${name}...`,
          'info'
        )
      }
    })
    return () => {
      unlisten?.()
    }
  }, [])

  // Deep Link Theme Installer listener & startup check
  useEffect(() => {
    const handleInstall = (theme: any) => {
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
    }

    // Check for any theme passed at startup
    if ((window as any).electronAPI?.getPendingTheme) {
      (window as any).electronAPI.getPendingTheme().then((theme: any) => {
        if (theme) handleInstall(theme)
      }).catch(() => {})
    }

    const unsubTheme = (window as any).electronAPI?.onThemeInstallRequest?.(handleInstall)
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

  // Live Auto-Sync: Refresh installed official themes CSS to keep wallpapers, buttons & tweaks up to date
  useEffect(() => {
    const knownThemeFiles: Record<string, string> = {
      liquidglass: 'liquid-glass.css',
      midnightoled: 'oled.css',
      cyberpunkneon: 'cyberpunk.css',
      crimsonsteel: 'crimson.css',
      emeraldmatrix: 'emerald.css',
      frostedsakura: 'sakura.css',
      nebulapurple: 'nebula.css',
      radiant: 'radiant.css',
      miamivice84: 'miami.css',
      nordicfrost: 'frost.css',
      toxicbiohazard: 'biohazard.css',
      solarflare: 'solar.css',
      phantomgold: 'gold.css'
    }

    installedThemes.forEach((theme) => {
      const slug = theme.name.toLowerCase().replace(/[^a-z0-9]/g, '')
      const fileName = knownThemeFiles[slug]
      if (fileName) {
        const url = `https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/themes/${fileName}?t=${Date.now()}`
        fetch(url)
          .then((r) => (r.ok ? r.text() : null))
          .then((latestCss) => {
            if (latestCss && latestCss !== theme.css) {
              useThemeStore.getState().installTheme({
                ...theme,
                css: latestCss
              })
            }
          })
          .catch(() => {})
      }
    })
  }, [activeThemeId])

  // Auto-updater listener
  useEffect(() => {
    if (!window.electronAPI?.onUpdaterEvent) return;

    const unsubscribe = window.electronAPI.onUpdaterEvent((payload) => {
      const { status, data } = payload;
      let progress = undefined;
      let info = undefined;
      
      if (status === 'downloading' && typeof data?.percent === 'number') {
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
    const cancelCheck = scheduleBackgroundTask(() => checkStartupUpdates(useGameStore.getState().settings.autoCheckUpdates !== false))
    return () => { cancelCheck(); unsubscribe() }
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

  // Global Keybinds: Escape to close modal, F9 to toggle Steam Monitor Window
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isGameModalOpen && !document.fullscreenElement) {
        useUIStore.getState().setIsGameModalOpen(false)
      }
      if (e.key === 'F9') {
        e.preventDefault()
        if (window.electronAPI?.toggleSteamMonitorWindow) {
          window.electronAPI.toggleSteamMonitorWindow()
        } else if (window.electronAPI?.openSteamMonitorWindow) {
          window.electronAPI.openSteamMonitorWindow()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGameModalOpen])

  // Process Monitor & Discord Activity
  const activeGame = useGameStore(state => state.activeGame)
  const isGamePerformanceMode = Boolean(!windowActive && activeGame)
  const isPerformanceMode = !windowActive

  // Sync performance mode class whenever activeGame or settings change
  useEffect(() => {
    if (isPerformanceMode) {
      document.documentElement.classList.add('performance-mode')
      document.body.classList.add('performance-mode')
    } else {
      document.documentElement.classList.remove('performance-mode')
      document.body.classList.remove('performance-mode')
    }

    if (isGamePerformanceMode) {
      document.body.classList.add('game-performance-mode')
    } else {
      document.body.classList.remove('game-performance-mode')
    }
  }, [isPerformanceMode, isGamePerformanceMode])

  const activeDownloadName = useDownloadStore(state => Object.values(state.downloads).find(d => d.status === 'downloading' || d.status === 'extracting')?.name)
  // Only the native process monitor chooses the game. The renderer contributes
  // Eclipse download state, including an explicit end notification.
  useEffect(() => {
    void window.electronAPI?.updateDiscordDownload?.(activeDownloadName || null).catch(() => {})
  }, [activeDownloadName])

  // Well below the server's 150-second presence TTL, including background timer throttling.
  useEffect(() => {
    const pushPresence = () => {
      const currentActive = useGameStore.getState().activeGame
      if (currentActive && currentActive.name) {
        updateSocialPresence('ingame', currentActive.name)
      } else {
        updateSocialPresence('online', null)
      }
    }

    pushPresence()
    const heartbeat = setInterval(pushPresence, 60000)

    return () => clearInterval(heartbeat)
  }, [activeGame])

  // Clear presence to offline when closing or navigating away from Eclipse
  useEffect(() => {
    const handleUnload = () => {
      updateSocialPresence('offline', null)
    }
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [])

  return (
    <MotionConfig reducedMotion={isPerformanceMode ? "always" : "user"}>
      <div className="launcher-shell h-screen bg-hub-base select-none overflow-hidden relative" data-atmosphere={!activeThemeId || undefined} data-unfocused={!windowActive || undefined}>
        <LauncherAtmosphere enabled={!activeThemeId && settings.backgroundLighting !== false} focused={windowActive} active={windowActive && !activeGame && !isCinemaOpen} />
        <div className="launcher-chrome flex flex-col h-full relative z-[1]">
          {/* Custom frameless title bar */}
          <TitleBar />

          {/* Main layout */}
          <div className="flex flex-1 overflow-hidden">
            {/* Fixed Sidebar */}
            {!showSplash && <Sidebar />}

            {/* Content area */}
            <div className="launcher-content flex-1 overflow-hidden relative">
              {/* Main views and GameDetailModal (both extend from top y=0 behind TopBar) */}
              <main className="h-full w-full overflow-hidden relative">
                <div ref={viewLayer} className="launcher-view h-full w-full" data-covered={isGameModalOpen || undefined} aria-hidden={isGameModalOpen || undefined}>
                  {!showSplash && <Suspense fallback={<div className="h-full w-full" aria-busy="true" />}><ViewRouter /></Suspense>}
                </div>
                <Suspense fallback={null}>
                  {(isGameModalOpen || hasOpenedGameDetails) && <GameDetailModal />}
                </Suspense>
              </main>

              {/* Frosted Glass TopBar: Floats on Top of EVERYTHING */}
              {!showSplash && <TopBar />}
            </div>
          </div>

          {/* Toast notifications */}
          <Notification />

          {/* Friends Overlay Windows */}
          <Suspense fallback={null}>{!!((openPanels | mountedPanels) & 1) && <FriendsWindow />}</Suspense>
          <Suspense fallback={null}>{!!((openPanels | mountedPanels) & 2) && <AddFriendModal />}</Suspense>
          <Suspense fallback={null}>{!!((openPanels | mountedPanels) & 4) && <EclipseCinemaModal />}</Suspense>
          <Suspense fallback={null}>{!!((openPanels | mountedPanels) & 8) && <ChangelogModal />}</Suspense>

          {/* Startup Splash Screen */}
          <Suspense fallback={null}>
            {showSplash && (
              <SplashView
                onComplete={() => {
                  setShowSplash(false)
                  // Show changelog once per version after install or update
                  const seenKey = `eclipse_changelog_seen_${APP_VERSION}`
                  if (!localStorage.getItem(seenKey)) {
                    useUIStore.getState().setIsChangelogOpen(true)
                  }
                }}
              />
            )}
          </Suspense>
        </div>
      </div>
    </MotionConfig>
  )
}
