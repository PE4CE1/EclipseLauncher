// ─── Installed / Local Games ─────────────────────────────────────────────────
export interface InstalledGame {
  id: string
  name: string
  platform: 'steam' | 'epic' | 'custom'
  installPath: string
  launchUrl: string
  iconUrl?: string
  appId?: string
  steamId?: number        // resolved Steam AppID (may come from scan or name lookup)
  installed?: boolean
  sizeBytes?: number
  lastPlayed?: number
  playTimeMinutes?: number
}

// ─── Library / User Games ────────────────────────────────────────────────────
export interface LibraryGame {
  id: string
  steamId?: number         // Steam AppID for asset resolution
  name: string
  coverImage?: string      // cached or fallback
  platform: 'steam' | 'epic' | 'custom'
  installed: boolean
  installPath?: string
  launchUrl?: string
  addedAt: number
  lastPlayed?: number
  playTimeMinutes?: number
  isFavorite?: boolean
  genres?: string[]
  rating?: number
  metacritic?: number
  releaseDate?: string
  developer?: string
  publisher?: string
}

// ─── Download Manager ────────────────────────────────────────────────────────
export interface DownloadItem {
  id: string
  gameName: string
  steamId?: number
  coverImage?: string
  progress: number
  speed: string
  totalSize: string
  downloadedSize: string
  eta: string
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'queued'
  startedAt: number
}

// ─── UI State ────────────────────────────────────────────────────────────────
export type ActiveView = 'home' | 'catalogue' | 'library' | 'downloads' | 'settings' | 'profile' | 'notifications' | 'eclipse-info'

export interface SteamRecentGame {
  name: string
  playtime: string
  iconUrl: string
  appId: string
}

export interface SteamFavoriteBadge {
  name: string
  iconUrl: string
  xp: string
  url: string
}

export interface EclipseFriend {
  id: string
  username: string
  avatarUrl: string
  status: 'online' | 'offline' | 'ingame'
  currentGame?: string
  steamProfileUrl?: string
  level?: number
  steamRecentGames?: SteamRecentGame[]
  steamFavoriteBadge?: SteamFavoriteBadge
}

export type ScanStatus = 'idle' | 'scanning' | 'complete' | 'error'

// ─── Settings ────────────────────────────────────────────────────────────────
export interface AppSettings {
  steamPath: string
  epicManifestPath: string
  theme: 'dark' | 'darker'
  language: string
  autoScan: boolean
  scanUninstalledSteam: boolean
  autoScanSplash: boolean
  autoCheckUpdates: boolean
  exitInsteadOfMinimize: boolean
  hideToTray: boolean
  startOnBoot: boolean
  startMinimized: boolean
  launchInLibrary: boolean
  downloadPath: string
  hardwareAcceleration?: boolean
  desktopNotifications?: boolean
  soundEffects?: boolean
  notificationSound?: string
  username: string
  avatarUrl: string
  discordRpc: boolean
  discordRpcIdle: boolean
  discordRpcShowDownloads: boolean
  discordRpcPrivacyMode: boolean
  overlayPerformance: boolean
  overlayMetrics: {
    fps: boolean
    cpu: boolean
    ram: boolean
    gpu: boolean
    ping: boolean
    time: boolean
  }
  overlayCrosshair: boolean
  crosshairConfig: {
    preset: string
    color: string
    size: number
    thickness: number
    gap: number
    dot: boolean
    dotSize: number
    outline: boolean
    outlineColor: string
    opacity: number
    tStyle: boolean
    style: 'cross' | 'x' | 'circle'
  }
  overlayRobloxTimer: boolean
  overlayRLHud: boolean
  overlayRLSteam: boolean
  rlPlaylist: '1v1' | '2v2' | '3v3'
  trnApiKey: string
  steamProfileUrl: string
  steamLevel?: number
  steamGamesCount?: number
  steamBadgesCount?: number
  steamRecentGames?: SteamRecentGame[]
  steamFavoriteBadge?: SteamFavoriteBadge
  eclipseFriends?: EclipseFriend[]
  friendCode?: string
  profileShowPlaytime?: boolean
  profileShowSteamStats?: boolean
  rlScoreboardKeyKb: string
  rlScoreboardKeyCtrl: string
  rlSteamAvatarScale: number
  overlayPositions: {
    performance: { xPct: number; yPct: number }
    robloxTimer: { xPct: number; yPct: number }
    crosshair: { xPct: number; yPct: number }
    rlHud: { xPct: number; yPct: number }
    rlSteamAvatar: { xPct: number; yPct: number }
  }
}

// ─── Electron API (window.electronAPI) ──────────────────────────────────────
export interface ElectronAPI {
  isOverlay?: boolean
  minimizeWindow: () => void
  maximizeWindow: () => void
  closeWindow: () => void
  hideWindow: () => void
  isMaximized: () => Promise<boolean>
  setWindowSize: (w: number, h: number, center?: boolean) => void
  setWindowResizable: (resizable: boolean) => void
  setAutoLaunch: (enabled: boolean, startMinimized: boolean) => Promise<void>
  createDesktopShortcut?: () => Promise<{ success: boolean; error?: string }>
  relaunchApp?: () => Promise<void>
  showNativeNotification?: (options: { title: string; body: string }) => Promise<{ success: boolean }>
  scanGames: () => Promise<{ success: boolean; games: InstalledGame[]; error?: string }>
  onScanProgress: (cb: (p: { stage: string; message: string; count: number }) => void) => () => void
  getCurrentGame: () => Promise<{ name: string; startTime: number } | null>
  launchGame: (launchUrl: string) => Promise<{ success: boolean; error?: string }>
  stopGame: () => Promise<{ success: boolean; error?: string }>
  onGameStopped: (callback: () => void) => () => void
  onGameStarted?: (callback: (data: { name: string; startTime: number }) => void) => () => void
  onOverlayUpdate: (cb: (data: any) => void) => () => void
  onOverlayEditStart: (cb: (gameData: any) => void) => () => void
  onOverlayEditEnd: (cb: () => void) => () => void
  onMetricsUpdate: (cb: (data: { cpu: number; gpu: number; ram: number; ramMB: number; totalMB: number; idleTime: number }) => void) => () => void
  startOverlayEdit: () => Promise<void>
  exitOverlayEdit: () => Promise<void>
  saveOverlayPositions: (positions: any) => Promise<{ success: boolean; error?: string }>
  openExeDialog: () => Promise<string | null>
  getSettings: () => Promise<Partial<AppSettings>>
  setSettings: (data: Partial<AppSettings>) => Promise<{ success: boolean; error?: string }>
  openPath: (path: string) => Promise<{ success: boolean; error?: string }>
  onNavigate?: (cb: (direction: 'back' | 'forward') => void) => () => void

  // Discord RPC
  setDiscordActivity: (gameName: string, startTime: number, isPrivacyMode?: boolean) => Promise<{ success: boolean; error?: string }>
  setDiscordDownloadActivity?: (downloadName: string) => Promise<{ success: boolean; error?: string }>
  setDiscordIdleActivity: () => Promise<{ success: boolean; error?: string }>
  clearDiscordActivity: () => Promise<{ success: boolean; error?: string }>



  // Torrent Engine
  startDownload: (magnetURI: string, downloadPath?: string, autoExtract?: boolean) => Promise<{ success: boolean; infoHash?: string; error?: string }>
  pauseDownload: (infoHash: string) => Promise<void>
  resumeDownload: (infoHash: string) => Promise<void>
  cancelDownload: (infoHash: string) => Promise<void>
  onTorrentProgress: (callback: (payload: any) => void) => () => void
  selectDirectory: () => Promise<string | null>
  
  // HTTP Downloads
  startHttpDownload: (url: string, name: string, downloadPath?: string, autoExtract?: boolean) => Promise<{ success: boolean; infoHash?: string; error?: string }>
  checkLinkStatus: (url: string) => Promise<boolean>

  // Cloudflare bypass
  fetchSourceCF: (url: string) => Promise<string | null>

  // Generic fetch (CORS bypass)
  utilFetch: (url: string, options?: any) => Promise<string | null>
  openUrl: (url: string) => Promise<void>

  // Friends Window
  openFriendsWindow: () => Promise<void>
  closeFriendsWindow: () => Promise<void>
  openAddFriendModal: () => Promise<void>
  onShowAddFriendModal: (callback: () => void) => () => void
  openFriendProfileModal: (friendId: string) => Promise<void>
  onShowFriendProfileModal: (callback: (friendId: string) => void) => () => void

  // Auto Updater
  checkUpdate: () => Promise<void>
  downloadUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
  onUpdaterEvent: (callback: (payload: { status: string; data?: any }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
