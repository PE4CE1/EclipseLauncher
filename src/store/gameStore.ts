import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { InstalledGame, LibraryGame, AppSettings } from '../types/game'

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

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
  activeGame: { id: string; name: string; startTime: number } | null
  startPlaySession: (gameIdOrName: string, name: string) => void
  stopPlaySession: () => void
  addPlayTime: (gameIdOrName: string, minutes: number) => void

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
        set((state) => ({
          library: state.library.some((g) => g.id === game.id)
            ? state.library
            : [game, ...state.library],
        })),
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
          activeGame: { id: gameIdOrName, name, startTime: Date.now() },
          lastPlayed: [gameIdOrName, ...state.lastPlayed.filter((x) => x !== gameIdOrName)].slice(0, 20),
          installedGames: state.installedGames.map((g) =>
            g.id === gameIdOrName || normalize(g.name) === normalize(name) || g.appId === gameIdOrName
              ? { ...g, lastPlayed: Date.now() }
              : g
          ),
          library: state.library.map((g) =>
            g.id === gameIdOrName || normalize(g.name) === normalize(name) || String(g.steamId) === gameIdOrName
              ? { ...g, lastPlayed: Date.now() }
              : g
          ),
        })),

      stopPlaySession: () => set({ activeGame: null }),

      addPlayTime: (gameIdOrName, minutes) =>
        set((state) => {
          const installedGames = state.installedGames.map((g) => {
            const matches = g.id === gameIdOrName || normalize(g.name) === normalize(gameIdOrName) || g.appId === gameIdOrName
            return matches ? { ...g, playTimeMinutes: (g.playTimeMinutes || 0) + minutes, lastPlayed: Date.now() } : g
          })
          const library = state.library.map((g) => {
            const matches = g.id === gameIdOrName || normalize(g.name) === normalize(gameIdOrName) || String(g.steamId) === gameIdOrName
            return matches ? { ...g, playTimeMinutes: (g.playTimeMinutes || 0) + minutes, lastPlayed: Date.now() } : g
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
    }
  )
)
