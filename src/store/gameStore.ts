import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { createReferenceStorage } from './referenceStorage'
import { runtimeMode } from '../services/runtimeMode'
import { withoutRetiredSettings } from '../services/retiredSettings'
import { withKeyforsteamDefaults } from '../services/keyforsteamDefaults'
import { getHardcodedSteamId, isPlaceholderAppName, extractAppIdFromPlaceholder, getKnownSteamGameName, KNOWN_GAME_PREVIEWS } from '../services/steamService'
import type { InstalledGame, LibraryGame, AppSettings } from '../types/game'

import { deduplicateByAliases, normalizeGameName as normalize } from '../services/gameDeduplication'

export function deduplicateLibrary(games: LibraryGame[]): LibraryGame[] {
  if (!Array.isArray(games)) return []
  const prepared = games.filter(game => game && typeof game.name === 'string' && game.name.trim()).map(game => {
    const steamId = game.steamId || extractAppIdFromPlaceholder(game.name) || undefined
    const name = steamId && isPlaceholderAppName(game.name, steamId)
      ? getKnownSteamGameName(steamId) || game.name
      : game.name
    return { ...game, name, steamId }
  })
  return deduplicateByAliases(prepared, game => [
    ...(game.id ? [`id_${game.id}`] : []),
    ...(game.steamId ? [`steam_${game.steamId}`] : []),
    ...(normalize(game.name) ? [`name_${normalize(game.name)}`] : []),
  ], (existing, game) => {
    const steamId = existing.steamId || game.steamId
    const name = !isPlaceholderAppName(game.name, steamId) ? game.name
      : !isPlaceholderAppName(existing.name, steamId) ? existing.name
      : (steamId ? getKnownSteamGameName(steamId) : null) || existing.name
    return {
      ...existing,
      ...game,
      name,
      id: existing.id || game.id,
      steamId,
      installed: existing.installed || game.installed,
      installPath: existing.installPath || game.installPath,
      launchUrl: existing.launchUrl || game.launchUrl,
      playTimeMinutes: Math.max(existing.playTimeMinutes || 0, game.playTimeMinutes || 0),
      lastPlayed: Math.max(existing.lastPlayed || 0, game.lastPlayed || 0),
      isFavorite: existing.isFavorite || game.isFavorite,
    }
  })
}

interface GameStore {
  // Installed games from scanner
  installedGames: InstalledGame[]
  setInstalledGames: (games: InstalledGame[]) => void

  // User library
  library: LibraryGame[]
  setLibrary: (library: LibraryGame[]) => void
  addToLibrary: (game: LibraryGame) => void
  removeFromLibrary: (id: string) => void
  toggleFavorite: (id: string) => void
  updateLastPlayed: (id: string) => void

  // Playtime & Sessions
  activeGame: { id: string; name: string; startTime: number; lastTick?: number; authoritative?: boolean } | null
  startPlaySession: (gameIdOrName: string, name: string, authoritative?: boolean, startedAt?: number) => void
  stopPlaySession: () => void
  tickPlaySession: () => void
  addPlayTime: (gameIdOrName: string, minutes: number, name?: string) => void
  syncPlaytimeFromDisk: (diskDb: Record<string, { playTimeMinutes: number; lastPlayed?: number; steamId?: number }>, authoritative?: boolean) => void

  // Recently played (ordered IDs)
  lastPlayed: string[]

  // Favorite game IDs
  favoriteIds: string[]

  // Scan state
  isScanning: boolean
  scanMessage: string
  setIsScanning: (v: boolean) => void
  setScanMessage: (msg: string) => void

  // Settings
  settings: Partial<AppSettings>
  updateSettings: (data: Partial<AppSettings>) => void
}

export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      installedGames: [],
      favoriteIds: [],
      setInstalledGames: (games) => set({ installedGames: games }),

      library: [],
      setLibrary: (library) => set({ library: deduplicateLibrary(library) }),
      addToLibrary: (game) =>
        set((state) => {
          const normGameName = normalize(game.name)
          const existingIdx = state.library.findIndex(
            (g) =>
              g.id === game.id ||
              (game.steamId && g.steamId === game.steamId) ||
              (normGameName && normalize(g.name) === normGameName)
          )

          if (existingIdx >= 0) {
            const existing = state.library[existingIdx]
            const updated = [...state.library]
            updated[existingIdx] = {
              ...existing,
              ...game,
              id: existing.id || game.id,
              steamId: existing.steamId || game.steamId,
              installed: existing.installed || game.installed,
              installPath: existing.installPath || game.installPath,
              launchUrl: existing.launchUrl || game.launchUrl,
              playTimeMinutes: Math.max(existing.playTimeMinutes || 0, game.playTimeMinutes || 0),
              lastPlayed: Math.max(existing.lastPlayed || 0, game.lastPlayed || 0),
              isFavorite: existing.isFavorite || game.isFavorite,
            }
            return { library: deduplicateLibrary(updated) }
          }

          return { library: deduplicateLibrary([game, ...state.library]) }
        }),
      removeFromLibrary: (id) =>
        set((state) => ({
          library: state.library.filter((g) => g.id !== id),
          favoriteIds: state.favoriteIds.filter(favoriteId => favoriteId !== id),
          lastPlayed: state.lastPlayed.filter(gameId => gameId !== id),
        })),
      toggleFavorite: (id) =>
        set((state) => ({
          favoriteIds: state.favoriteIds.includes(id)
            ? state.favoriteIds.filter(f => f !== id)
            : [...state.favoriteIds, id],
          library: state.library.map((g) =>
            g.id === id ? { ...g, isFavorite: !g.isFavorite } : g
          ),
        })),
      updateLastPlayed: (id) =>
        set((state) => ({
          lastPlayed: [id, ...state.lastPlayed.filter((x) => x !== id)].slice(0, 20),
          library: state.library.map((g) =>
            g.id === id ? { ...g, lastPlayed: Date.now() } : g
          ),
        })),

      activeGame: null,
      startPlaySession: (gameIdOrName, name, authoritative = false, startedAt) =>
        set((state) => {
          const gameName = name || gameIdOrName
          const startTime = authoritative && Number.isFinite(startedAt) && startedAt! > 0 ? Math.min(startedAt!, Date.now()) : Date.now()
          const norm = normalize(gameName)
          const isRoblox = norm === 'roblox' || gameIdOrName === 'roblox' || gameIdOrName === '999001'
          const isMatch = (g: any) =>
            g.id === gameIdOrName ||
            normalize(g.name) === norm ||
            g.appId === gameIdOrName ||
            String(g.steamId) === gameIdOrName ||
            (isRoblox && (g.id === 'roblox' || normalize(g.name) === 'roblox' || g.steamId === 999001))

          return {
            activeGame: { id: gameIdOrName, name: gameName, startTime, lastTick: Date.now(), authoritative },
            lastPlayed: [gameIdOrName, ...state.lastPlayed.filter((x) => x !== gameIdOrName)].slice(0, 20),
            installedGames: state.installedGames.map((g) =>
              isMatch(g) ? { ...g, lastPlayed: Date.now() } : g
            ),
            library: state.library.map((g) =>
              isMatch(g) ? { ...g, lastPlayed: Date.now() } : g
            ),
          }
        }),

      stopPlaySession: () =>
        set((state) => {
          if (!state.activeGame) return { activeGame: null }
          const now = Date.now()
          const last = state.activeGame.lastTick || state.activeGame.startTime
          const deltaMins = Math.max(0, (now - last) / 60000)
          const gameId = state.activeGame.id
          const gameName = state.activeGame.name
          const norm = normalize(gameName)
          const isRoblox = norm === 'roblox' || gameId === 'roblox' || gameId === '999001'

          if (deltaMins > 0 && !state.activeGame.authoritative && window.electronAPI?.addPlaytime) {
            window.electronAPI.addPlaytime(gameId, deltaMins, gameName, isRoblox ? 999001 : undefined).catch(() => {})
          }

          const isMatch = (g: any) =>
            g.id === gameId ||
            normalize(g.name) === norm ||
            g.appId === gameId ||
            String(g.steamId) === gameId ||
            (isRoblox && (g.id === 'roblox' || normalize(g.name) === 'roblox' || g.steamId === 999001))

          const installedGames = state.installedGames.map((g) =>
            isMatch(g) ? { ...g, playTimeMinutes: (g.playTimeMinutes || 0) + deltaMins, lastPlayed: now } : g
          )
          const library = state.library.map((g) =>
            isMatch(g) ? { ...g, playTimeMinutes: (g.playTimeMinutes || 0) + deltaMins, lastPlayed: now } : g
          )

          return { activeGame: null, installedGames, library }
        }),

      tickPlaySession: () =>
        set((state) => {
          if (!state.activeGame) return state
          const now = Date.now()
          const last = state.activeGame.lastTick || state.activeGame.startTime
          const deltaMins = Math.floor((now - last) / 60000)
          if (deltaMins < 1) return state // Tick each full minute

          const gameId = state.activeGame.id
          const gameName = state.activeGame.name
          const norm = normalize(gameName)
          const isRoblox = norm === 'roblox' || gameId === 'roblox' || gameId === '999001'

          if (!state.activeGame.authoritative && window.electronAPI?.addPlaytime) {
            window.electronAPI.addPlaytime(gameId, deltaMins, gameName, isRoblox ? 999001 : undefined).catch(() => {})
          }

          const isMatch = (g: any) =>
            g.id === gameId ||
            normalize(g.name) === norm ||
            g.appId === gameId ||
            String(g.steamId) === gameId ||
            (isRoblox && (g.id === 'roblox' || normalize(g.name) === 'roblox' || g.steamId === 999001))

          const installedGames = state.installedGames.map((g) =>
            isMatch(g) ? { ...g, playTimeMinutes: (g.playTimeMinutes || 0) + deltaMins, lastPlayed: now } : g
          )
          const library = state.library.map((g) =>
            isMatch(g) ? { ...g, playTimeMinutes: (g.playTimeMinutes || 0) + deltaMins, lastPlayed: now } : g
          )

          return {
            activeGame: { ...state.activeGame, lastTick: last + deltaMins * 60000 },
            installedGames,
            library
          }
        }),

      addPlayTime: (gameIdOrName, minutes, name) =>
        set((state) => {
          const cleanName = name || gameIdOrName
          const wholeMins = Math.max(0, Math.round(minutes))
          const norm = normalize(cleanName)
          const isRoblox = norm === 'roblox' || gameIdOrName === 'roblox' || gameIdOrName === '999001'

          if (window.electronAPI?.addPlaytime) {
            window.electronAPI.addPlaytime(gameIdOrName, wholeMins, cleanName, isRoblox ? 999001 : undefined).catch(() => {})
          }

          const isMatch = (g: any) =>
            g.id === gameIdOrName ||
            normalize(g.name) === norm ||
            g.appId === gameIdOrName ||
            String(g.steamId) === gameIdOrName ||
            (isRoblox && (g.id === 'roblox' || normalize(g.name) === 'roblox' || g.steamId === 999001))

          const installedGames = state.installedGames.map((g) =>
            isMatch(g) ? { ...g, playTimeMinutes: Math.round((g.playTimeMinutes || 0) + wholeMins), lastPlayed: Date.now() } : g
          )
          const library = state.library.map((g) =>
            isMatch(g) ? { ...g, playTimeMinutes: Math.round((g.playTimeMinutes || 0) + wholeMins), lastPlayed: Date.now() } : g
          )
          return { installedGames, library }
        }),

      syncPlaytimeFromDisk: (diskDb, authoritative = false) =>
        set((state) => {
          if (!diskDb || typeof diskDb !== 'object') return state
          
          const installedGames = state.installedGames.map(g => {
            const normName = normalize(g.name)
            const diskEntry = diskDb[normName] || (g.steamId ? diskDb[`steam_${g.steamId}`] : null) || diskDb[g.id]
            if (diskEntry && typeof diskEntry.playTimeMinutes === 'number') {
              return {
                ...g,
                playTimeMinutes: authoritative ? diskEntry.playTimeMinutes : Math.max(g.playTimeMinutes || 0, diskEntry.playTimeMinutes),
                lastPlayed: Math.max(g.lastPlayed || 0, diskEntry.lastPlayed || 0)
              }
            }
            return g
          })

          const library = state.library.map(g => {
            const normName = normalize(g.name)
            const diskEntry = diskDb[normName] || (g.steamId ? diskDb[`steam_${g.steamId}`] : null) || diskDb[g.id]
            if (diskEntry && typeof diskEntry.playTimeMinutes === 'number') {
              return {
                ...g,
                playTimeMinutes: authoritative ? diskEntry.playTimeMinutes : Math.max(g.playTimeMinutes || 0, diskEntry.playTimeMinutes),
                lastPlayed: Math.max(g.lastPlayed || 0, diskEntry.lastPlayed || 0)
              }
            }
            return g
          })

          return { installedGames, library }
        }),

      lastPlayed: [],

      isScanning: false,
      scanMessage: '',
      setIsScanning: (v) => set({ isScanning: v }),
      setScanMessage: (msg) => set({ scanMessage: msg }),

      settings: {
        avatarFrame: 'steam',
        username: (() => {
          const syncId = typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity : null
          return (syncId?.username && syncId.username !== 'User' && syncId.username !== 'Eclipse Player') ? syncId.username : 'User'
        })(),
        friendCode: (() => {
          const syncId = typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity : null
          return (syncId?.friendCode && syncId.friendCode.startsWith('ECL-')) ? syncId.friendCode : undefined
        })(),
        userUid: (() => {
          const syncId = typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity : null
          return syncId?.canonicalUid || undefined
        })(),
        accountSecret: (() => {
          const syncId = typeof window !== 'undefined' ? (window as any).electronAPI?.account?.initialIdentity : null
          return syncId?.accountSecret || undefined
        })(),
        theme: 'dark',
        language: 'de',
        autoScan: true,
        scanUninstalledSteam: true,
        autoScanSplash: true,
        autoCheckUpdates: true,
        exitInsteadOfMinimize: false,
        exitInsteadOfMinimizeMigrated_v1_3_0: true,
        hideToTray: false,
        freeGamesNotifications: true,
        startOnBoot: true,
        startMinimized: false,
        launchInLibrary: false,
        launchInClips: false,
        discordRpc: true,
        discordRpcIdle: true,
        discordRpcShowDownloads: true,
        discordRpcPrivacyMode: false,
        discordRpcActivityStyle: 'clipping',
        discordActivityStyle: 'clipping',
        discordRpcRobloxSubGame: true,
        discordRpcAnimatedText: false,
        hardwareAcceleration: true,
        backgroundLighting: true,
        showHardwareSpecs: false,
        keyforsteamEnabled: true,
        keyforsteamDefaultsVersion: 1,
        keyforsteamRegion: 'de',
        overlayPerformance: false,
        overlayCrosshair: false,
        overlayGeneralAlwaysOn: false,
        overlayRobloxTimer: false,
        overlayRobloxCps: false,
        overlayCps: false,
        overlayController: false,
        overlayRLController: false,
        rlControllerSkin: 'ps5_white',
        rlControllerUrl: 'https://gamepadviewer.com/?p=1&s=ps5_white',
        rlControllerScale: 80,
        overlayControllerStreamOnly: false,
        overlayControllerStreamWindow: false,
        overlayControllerStreamPos: 'bottom_right',
        overlayControllerStreamScale: 1,
        overlayStreamQuality: '1080p60',
        overlayRLHud: false,
        overlayRLSteam: false,
        overlayMedia: false,
        overlayMediaSource: 'all',
        overlayMediaAutoHide: false,
        overlayMediaVisualizer: true,
        overlayMediaKeybinds: {
          playPause: '',
          next: '',
          prev: '',
        },
        overlayPositions: {
          performance: { xPct: 0.02, yPct: 0.03 },
          robloxTimer: { xPct: 0.78, yPct: 0.03 },
          robloxCps: { xPct: 0.78, yPct: 0.12 },
          crosshair: { xPct: 0.5, yPct: 0.5 },
          rlHud: { xPct: 0.02, yPct: 0.05 },
          rlSteamAvatar: { xPct: 0.65, yPct: 0.50 },
          media: { xPct: 0.02, yPct: 0.85 },
        },
        overlayClipNotification: true,
        overlayClipToastColor: '#ff6600',
      },


      updateSettings: (data) => {
        const patch = withoutRetiredSettings(data)
        set((state) => Object.entries(patch).every(([key, value]) => Object.is(state.settings[key as keyof AppSettings], value))
          ? state : { settings: { ...state.settings, ...patch } })
      },
    }),
    {
      name: 'gamehub-store',
      storage: createReferenceStorage(() => localStorage, runtimeMode === 'clips'),
      partialize: (state) => runtimeMode === 'clips' ? { settings: state.settings } : ({
        installedGames: state.installedGames,
        library: state.library,
        lastPlayed: state.lastPlayed,
        favoriteIds: state.favoriteIds,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.installedGames)) {
          state.installedGames = state.installedGames.map(g => {
            let name = g.name
            const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(name))
            if (numId && isPlaceholderAppName(name, numId)) {
              const known = getKnownSteamGameName(numId)
              if (known) {
                name = known
              }
            }
            const knownId = numId || (name ? getHardcodedSteamId(name) : undefined)
            if (knownId || name !== g.name) {
              const norm = name ? name.toLowerCase().trim() : ''
              const knownPreview = (knownId && KNOWN_GAME_PREVIEWS[knownId]) || (norm && KNOWN_GAME_PREVIEWS[norm])
              const cleanIcon = knownPreview || ((g.iconUrl && !g.iconUrl.includes('capsule_') && !g.iconUrl.includes('tiny_image'))
                ? g.iconUrl
                : (knownId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${knownId}/header.jpg` : undefined))
              return {
                ...g,
                name,
                steamId: knownId || g.steamId,
                iconUrl: cleanIcon,
              }
            }
            return g
          })
        }
        if (state && Array.isArray(state.library)) {
          state.library = state.library.map(g => {
            let name = g.name
            const numId = g.steamId || (g.appId ? Number(g.appId) : extractAppIdFromPlaceholder(name)) || undefined
            if (numId && isPlaceholderAppName(name, numId)) {
              const known = getKnownSteamGameName(numId)
              if (known) {
                name = known
              }
            }
            const knownId = numId || (name ? getHardcodedSteamId(name) : undefined)
            if (knownId || name !== g.name) {
              const norm = name ? name.toLowerCase().trim() : ''
              const knownPreview = (knownId && KNOWN_GAME_PREVIEWS[knownId]) || (norm && KNOWN_GAME_PREVIEWS[norm])
              const cleanIcon = knownPreview || ((g.iconUrl && !g.iconUrl.includes('capsule_') && !g.iconUrl.includes('tiny_image'))
                ? g.iconUrl
                : (knownId ? `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${knownId}/header.jpg` : undefined))
              return {
                ...g,
                name,
                steamId: knownId || g.steamId,
                iconUrl: cleanIcon,
              }
            }
            return g
          })
          state.library = deduplicateLibrary(state.library)
        }
        if (state && state.settings) {
          state.settings = withKeyforsteamDefaults(withoutRetiredSettings(state.settings))
          if (!localStorage.getItem('eclipse_exit_minimize_v130')) {
            state.settings.exitInsteadOfMinimize = false
            state.settings.exitInsteadOfMinimizeMigrated_v1_3_0 = true
            localStorage.setItem('eclipse_exit_minimize_v130', 'true')
            if (window.electronAPI) {
              window.electronAPI.setSettings({ exitInsteadOfMinimize: false, exitInsteadOfMinimizeMigrated_v1_3_0: true })
            }
          }
          state.settings.backgroundLighting ??= true
          // Zero-Flicker Identity Auto-Sanitizer:
          // Immediately heal friendCode from initialIdentity if localStorage has a legacy code or missing code
          const syncIdent = (typeof window !== 'undefined' && (window as any).electronAPI?.account?.initialIdentity) || null
          if (syncIdent?.friendCode && syncIdent.friendCode.startsWith('ECL-')) {
            if (!state.settings.friendCode || !state.settings.friendCode.startsWith('ECL-')) {
              state.settings.friendCode = syncIdent.friendCode
            }
          }
          if (syncIdent?.canonicalUid && !state.settings.userUid) {
            state.settings.userUid = syncIdent.canonicalUid
          }
          if (syncIdent?.accountSecret && !state.settings.accountSecret) {
            state.settings.accountSecret = syncIdent.accountSecret
          }
        }
      },
    }
  )
)
