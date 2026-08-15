import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InstalledGame, LibraryGame, AppSettings } from '../types/game'

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

export function deduplicateLibrary(games: LibraryGame[]): LibraryGame[] {
  if (!Array.isArray(games)) return []
  const seen = new Map<string, LibraryGame>()

  for (const game of games) {
    if (!game || !game.name) continue
    const normName = normalize(game.name)
    const steamKey = game.steamId ? `steam_${game.steamId}` : null

    let matchedKey: string | null = null
    if (steamKey && seen.has(steamKey)) {
      matchedKey = steamKey
    } else if (seen.has(normName)) {
      matchedKey = normName
    }

    if (matchedKey) {
      const existing = seen.get(matchedKey)!
      const merged: LibraryGame = {
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
      seen.set(matchedKey, merged)
      seen.set(normName, merged)
      if (steamKey) seen.set(steamKey, merged)
    } else {
      seen.set(normName, game)
      if (steamKey) seen.set(steamKey, game)
    }
  }

  return Array.from(new Set(seen.values()))
}

interface GameStore {
  // Installed games from scanner
  installedGames: InstalledGame[]
  setInstalledGames: (games: InstalledGame[]) => void

  // User library
  library: LibraryGame[]
  addToLibrary: (game: LibraryGame) => void
  removeFromLibrary: (id: string) => void
  toggleFavorite: (id: string) => void
  updateLastPlayed: (id: string) => void

  // Playtime & Sessions
  activeGame: { id: string; name: string; startTime: number; lastTick?: number } | null
  startPlaySession: (gameIdOrName: string, name: string) => void
  stopPlaySession: () => void
  tickPlaySession: () => void
  addPlayTime: (gameIdOrName: string, minutes: number, name?: string) => void
  syncPlaytimeFromDisk: (diskDb: Record<string, { playTimeMinutes: number; lastPlayed?: number; steamId?: number }>) => void

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
        set((state) => ({ library: state.library.filter((g) => g.id !== id) })),
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
      startPlaySession: (gameIdOrName, name) =>
        set((state) => ({
          activeGame: { id: gameIdOrName, name: name || gameIdOrName, startTime: Date.now(), lastTick: Date.now() },
          lastPlayed: [gameIdOrName, ...state.lastPlayed.filter((x) => x !== gameIdOrName)].slice(0, 20),
          installedGames: state.installedGames.map((g) =>
            g.id === gameIdOrName || normalize(g.name) === normalize(name || gameIdOrName) || g.appId === gameIdOrName
              ? { ...g, lastPlayed: Date.now() }
              : g
          ),
          library: state.library.map((g) =>
            g.id === gameIdOrName || normalize(g.name) === normalize(name || gameIdOrName) || String(g.steamId) === gameIdOrName
              ? { ...g, lastPlayed: Date.now() }
              : g
          ),
        })),

      stopPlaySession: () =>
        set((state) => {
          if (!state.activeGame) return { activeGame: null }
          const now = Date.now()
          const last = state.activeGame.lastTick || state.activeGame.startTime
          const deltaMins = Math.max(0, Math.round(((now - last) / 60000) * 10) / 10)
          const gameId = state.activeGame.id
          const gameName = state.activeGame.name

          if (deltaMins > 0 && window.electronAPI?.addPlaytime) {
            window.electronAPI.addPlaytime(gameId, deltaMins, gameName).catch(() => {})
          }

          const installedGames = state.installedGames.map((g) => {
            const matches = g.id === gameId || normalize(g.name) === normalize(gameName) || g.appId === gameId
            return matches ? { ...g, playTimeMinutes: Math.round(((g.playTimeMinutes || 0) + deltaMins) * 10) / 10, lastPlayed: now } : g
          })
          const library = state.library.map((g) => {
            const matches = g.id === gameId || normalize(g.name) === normalize(gameName) || String(g.steamId) === gameId
            return matches ? { ...g, playTimeMinutes: Math.round(((g.playTimeMinutes || 0) + deltaMins) * 10) / 10, lastPlayed: now } : g
          })

          return { activeGame: null, installedGames, library }
        }),

      tickPlaySession: () =>
        set((state) => {
          if (!state.activeGame) return state
          const now = Date.now()
          const last = state.activeGame.lastTick || state.activeGame.startTime
          const deltaMins = (now - last) / 60000
          if (deltaMins < 0.25) return state // Tick every ~15-30s

          const gameId = state.activeGame.id
          const gameName = state.activeGame.name
          const roundedDelta = Math.round(deltaMins * 10) / 10

          if (roundedDelta > 0 && window.electronAPI?.addPlaytime) {
            window.electronAPI.addPlaytime(gameId, roundedDelta, gameName).catch(() => {})
          }

          const installedGames = state.installedGames.map((g) => {
            const matches = g.id === gameId || normalize(g.name) === normalize(gameName) || g.appId === gameId
            return matches ? { ...g, playTimeMinutes: Math.round(((g.playTimeMinutes || 0) + roundedDelta) * 10) / 10, lastPlayed: now } : g
          })
          const library = state.library.map((g) => {
            const matches = g.id === gameId || normalize(g.name) === normalize(gameName) || String(g.steamId) === gameId
            return matches ? { ...g, playTimeMinutes: Math.round(((g.playTimeMinutes || 0) + roundedDelta) * 10) / 10, lastPlayed: now } : g
          })

          return {
            activeGame: { ...state.activeGame, lastTick: now },
            installedGames,
            library
          }
        }),

      addPlayTime: (gameIdOrName, minutes, name) =>
        set((state) => {
          const cleanName = name || gameIdOrName
          if (window.electronAPI?.addPlaytime) {
            window.electronAPI.addPlaytime(gameIdOrName, minutes, cleanName).catch(() => {})
          }
          const installedGames = state.installedGames.map((g) => {
            const matches = g.id === gameIdOrName || normalize(g.name) === normalize(cleanName) || g.appId === gameIdOrName
            return matches ? { ...g, playTimeMinutes: Math.round(((g.playTimeMinutes || 0) + minutes) * 10) / 10, lastPlayed: Date.now() } : g
          })
          const library = state.library.map((g) => {
            const matches = g.id === gameIdOrName || normalize(g.name) === normalize(cleanName) || String(g.steamId) === gameIdOrName
            return matches ? { ...g, playTimeMinutes: Math.round(((g.playTimeMinutes || 0) + minutes) * 10) / 10, lastPlayed: Date.now() } : g
          })
          return { installedGames, library }
        }),

      syncPlaytimeFromDisk: (diskDb) =>
        set((state) => {
          if (!diskDb || typeof diskDb !== 'object') return state
          
          const installedGames = state.installedGames.map(g => {
            const normName = normalize(g.name)
            const diskEntry = diskDb[normName] || (g.steamId ? diskDb[`steam_${g.steamId}`] : null) || diskDb[g.id]
            if (diskEntry && typeof diskEntry.playTimeMinutes === 'number') {
              return {
                ...g,
                playTimeMinutes: Math.max(g.playTimeMinutes || 0, diskEntry.playTimeMinutes),
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
                playTimeMinutes: Math.max(g.playTimeMinutes || 0, diskEntry.playTimeMinutes),
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
        username: 'User',
        theme: 'dark',
        language: 'en',
        autoScan: true,
        scanUninstalledSteam: true,
        autoScanSplash: true,
        autoCheckUpdates: true,
        exitInsteadOfMinimize: true,
        hideToTray: false,
        startOnBoot: true,
        startMinimized: false,
        launchInLibrary: false,
        discordRpc: true,
        discordRpcIdle: true,
        discordRpcShowDownloads: true,
        discordRpcPrivacyMode: false,
        overlayPerformance: false,
        overlayCrosshair: false,
        overlayRobloxTimer: false,
        overlayRLHud: false,
        overlayRLSteam: false,
        overlayPositions: {
          performance: { xPct: 0.02, yPct: 0.03 },
          robloxTimer: { xPct: 0.78, yPct: 0.03 },
          crosshair: { xPct: 0.5, yPct: 0.5 },
          rlHud: { xPct: 0.02, yPct: 0.05 },
          rlSteamAvatar: { xPct: 0.65, yPct: 0.50 },
        },
      },


      updateSettings: (data) =>
        set((state) => ({ settings: { ...state.settings, ...data } })),
    }),
    {
      name: 'gamehub-store',
      partialize: (state) => ({
        installedGames: state.installedGames,
        library: state.library,
        lastPlayed: state.lastPlayed,
        favoriteIds: state.favoriteIds,
        settings: state.settings,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && Array.isArray(state.library)) {
          state.library = deduplicateLibrary(state.library)
        }
      },
    }
  )
)
