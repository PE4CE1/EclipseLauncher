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
export type ActiveView = 'home' | 'catalogue' | 'library' | 'downloads' | 'settings' | 'profile' | 'notifications' | 'eclipse-info' | 'clips'

export interface EclipseClip {
  id: string
  title: string
  gameTitle: string
  gameId?: string | number
  duration: number           // in seconds
  thumbnailUrl: string       // base64 data url or local-media path
  videoUrl: string           // local-media:// path
  filePath: string           // absolute disk file path
  fileSize: number           // in bytes
  createdAt: number          // timestamp in ms
  resolution?: string        // e.g. "1080p"
  fps?: number               // e.g. 60
  tags?: string[]
}

export interface ClipSettings {
  enabled: boolean
  replayDurationSeconds: number // 15, 30, 45, 60, 90, 120, 180, 300
  hotkey: string                // e.g. 'F8', 'F9', 'Alt+C', custom
  fullRecordHotkey?: string     // e.g. 'F9'
  quality: '1440p' | '1080p' | '720p' // resolution
  fps: 60 | 30
  bitrate?: 'ultra' | 'high' | 'medium' | 'low' // 20M, 12M, 8M, 5M
  captureMic: boolean
  micVolume: number             // 0 - 100
  gameAudioVolume?: number      // 0 - 100
  savePath?: string             // custom folder or default Videos/Eclipse Clips
  notifyOnClip: boolean
  playSoundOnClip?: boolean
  autoStartOnGame?: boolean
  maxStorageGB?: number         // e.g. 25
}

export interface SteamRecentGame {
  name: string
  playtime: string
  iconUrl: string
  appId: string
}

export interface SteamBadge {
  name: string
  iconUrl: string
  xp?: string
  level?: string
}

export interface SteamFavoriteBadge {
  name: string
  iconUrl: string
  xp?: string
  url?: string
}

export interface SteamProfileGame {
  appId: string
  name: string
  iconUrl?: string
  playtime?: string
}

export interface EclipseFriend {
  id: string
  username: string
  avatarUrl: string
  status: 'online' | 'offline' | 'ingame'
  currentGame?: string
  steamProfileUrl?: string
  level?: number
  steamLevel?: number
  steamGamesCount?: number
  steamBadgesCount?: number
  steamRecentGames?: SteamRecentGame[]
  steamFavoriteBadge?: SteamFavoriteBadge
  steamBadges?: SteamBadge[]
  steamGames?: SteamProfileGame[]
  steamBackgroundUrl?: string
  steamBackgroundMovie?: string
  showSteamBackground?: boolean
  lastSeen?: number
  totalPlaytimeHours?: string
  totalPlaytimeMins?: number
  totalLibraryCount?: number
  totalInstalledCount?: number
  topPlayedGames?: Array<{
    id: string
    name: string
    steamId?: number | null
    playTimeMinutes: number
    lastPlayed: number
  }>
  friendCode?: string
  bannerUrl?: string
  avatarFrame?: string
  bio?: string
  profileAccentColor?: string
  socialDiscord?: string
  socialTwitch?: string
  socialYoutube?: string
  showHardwareSpecs?: boolean
  hardwareSpecs?: {
    cpu?: string
    gpu?: string
    ram?: string
    display?: string
    os?: string
  }
}

export interface FriendRequest {
  fromUid: string
  fromUsername: string
  fromAvatarUrl: string
  fromFriendCode: string
  timestamp: number
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
  autoExtractArchive?: boolean
  autoDeleteArchive?: boolean
  autoVpnOnDownload?: boolean
  selectedVpnProvider?: string
  realDebridKey?: string
  torboxKey?: string
  allDebridKey?: string
  hardwareAcceleration?: boolean
  gamePerformanceMode?: boolean
  autoMinimizeOnGame?: boolean
  autoRestoreOnGameStop?: boolean
  desktopNotifications?: boolean
  soundEffects?: boolean
  notificationSound?: string
  username: string
  avatarUrl: string
  bannerUrl?: string
  avatarFrame?: string
  bio?: string
  profileAccentColor?: string
  socialDiscord?: string
  socialTwitch?: string
  socialYoutube?: string
  showHardwareSpecs?: boolean
  hardwareSpecs?: {
    cpu?: string
    gpu?: string
    ram?: string
    display?: string
    os?: string
  }
  discordRpc: boolean
  discordRpcIdle: boolean
  discordRpcShowDownloads: boolean
  discordRpcPrivacyMode: boolean
  overlayPerformance: boolean
  overlayGeneralAlwaysOn?: boolean
  overlayMetrics: {
    fps: boolean
    cpu: boolean
    ram: boolean
    gpu: boolean
    ping: boolean
    time: boolean
    layout?: 'vertical' | 'horizontal'
    scale?: number
  }
  overlayCrosshair: boolean
  overlayCps?: boolean
  overlayController?: boolean
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
  overlayRobloxCps: boolean
  overlayRLHud: boolean
  overlayRLSteam: boolean
  overlayRLController?: boolean
  rlPlaylist: '1v1' | '2v2' | '3v3'
  trnApiKey: string
  steamProfileUrl: string
  rlScoreboardKeyKb?: string
  rlScoreboardKeyCtrl?: string
  rlSteamAvatarScale?: number
  rlControllerSkin?: 'ps5_white' | 'ps5_black' | 'ps4_white' | 'ps4_black' | 'xbox_one'
  rlControllerUrl?: string
  rlControllerScale?: number
  steamLevel?: number
  steamGamesCount?: number
  steamBadgesCount?: number
  steamRecentGames?: SteamRecentGame[]
  steamFavoriteBadge?: any
  steamBadges?: SteamBadge[]
  steamGames?: SteamProfileGame[]
  steamBackgroundUrl?: string
  steamBackgroundMovie?: string
  eclipseFriends?: EclipseFriend[]
  incomingFriendRequests?: FriendRequest[]
  outgoingFriendRequests?: Array<{
    toUid: string
    toUsername: string
    toAvatarUrl: string
    toFriendCode: string
    timestamp: number
  }>
  friendCode?: string
  userUid?: string
  socialApiUrl?: string
  profileShowPlaytime?: boolean
  profileShowSteamStats?: boolean
  profileShowSteamBackground?: boolean
  overlayPositions: {
    performance: { xPct: number; yPct: number }
    robloxTimer: { xPct: number; yPct: number }
    robloxCps: { xPct: number; yPct: number }
    crosshair: { xPct: number; yPct: number }
    rlHud: { xPct: number; yPct: number }
    rlSteamAvatar: { xPct: number; yPct: number }
    rlController?: { xPct: number; yPct: number }
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
  createGameShortcut?: (game: { name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string }) => Promise<{ success: boolean; error?: string }>
  relaunchApp?: () => Promise<void>
  showNativeNotification?: (options: { title: string; body: string }) => Promise<{ success: boolean }>
  scanGames: () => Promise<{ success: boolean; games: InstalledGame[]; error?: string }>
  onScanProgress: (cb: (p: { stage: string; message: string; count: number }) => void) => () => void
  getCurrentGame: () => Promise<{ name: string; startTime: number } | null>
  launchGame: (launchUrl: string) => Promise<{ success: boolean; error?: string }>
  uninstallGame?: (game: { id: string; name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string; platform?: string }) => Promise<{ success: boolean; error?: string; uninstallerLaunched?: boolean; trashed?: boolean }>
  stopGame: () => Promise<{ success: boolean; error?: string }>
  onGameStopped: (callback: () => void) => () => void
  onGameStarted?: (callback: (data: { name: string; startTime: number }) => void) => () => void
  getPlaytime?: () => Promise<Record<string, { name: string; playTimeMinutes: number; lastPlayed: number; steamId?: number }>>
  savePlaytime?: (db: any) => Promise<boolean>
  addPlaytime?: (gameIdOrName: string, minutes: number, name?: string, steamId?: number) => Promise<any>
  onOverlayUpdate: (cb: (data: any) => void) => () => void
  onOverlayEditStart: (cb: (gameData: any) => void) => () => void
  onOverlayEditEnd: (cb: () => void) => () => void
  onMetricsUpdate: (cb: (data: { cpu: number; gpu: number; ram: number; ramMB: number; totalMB: number; idleTime: number }) => void) => () => void
  onCPSUpdate?: (cb: (data: { lmb: number; rmb: number; total: number; buttonClicked?: 'lmb' | 'rmb' }) => void) => () => void
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



  // Native Download Engine
  startDownload: (magnetURI: string, downloadPath?: string, autoExtract?: boolean, autoDelete?: boolean) => Promise<{ success: boolean; infoHash?: string; error?: string }>
  startHttpDownload: (url: string, name: string, downloadPath?: string, autoExtract?: boolean, autoDelete?: boolean) => Promise<{ success: boolean; infoHash?: string; provider?: string; error?: string }>
  startNativeDownload: (url: string, gameTitle: string, downloadPath?: string, autoExtract?: boolean, autoDelete?: boolean) => Promise<{ success: boolean; infoHash?: string; provider?: string; error?: string }>
  testDebridKey: (provider: string, apiKey: string) => Promise<{ success: boolean; username?: string; type?: string; expiration?: string; error?: string }>
  checkLinkStatus: (url: string) => Promise<boolean>
  pauseDownload: (infoHash: string) => Promise<void>
  resumeDownload: (infoHash: string) => Promise<void>
  cancelDownload: (infoHash: string) => Promise<void>
  onTorrentProgress: (callback: (payload: any) => void) => () => void
  selectDirectory: () => Promise<string | null>
  getDefaultDownloadPath?: () => Promise<string>

  // VPN Management
  detectInstalledVpns?: () => Promise<Array<{ id: string; name: string; path?: string; cli?: string; isRunning: boolean; isConnected: boolean; isWindowsNative?: boolean; nativeName?: string }>>
  getVpnStatus?: () => Promise<{ isConnected: boolean; vpnName?: string; adapterName?: string }>
  connectVpn?: (vpnId?: string) => Promise<{ success: boolean; vpnName?: string; isCLI?: boolean; isNative?: boolean; error?: string; message?: string }>
  disconnectVpn?: (vpnId?: string) => Promise<{ success: boolean; message?: string }>

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
  downloadUpdate: (url?: string) => Promise<any>
  installUpdate: () => Promise<void>
  onUpdaterEvent: (callback: (payload: { status: string; data?: any }) => void) => () => void

  // Hardware Specs
  getHardwareSpecs?: () => Promise<{ cpu: string; gpu: string; ram: string; display: string; os: string } | null>

  // Eclipse Clips Studio (Medal.tv Style)
  clips?: {
    getSources: () => Promise<Array<{ id: string; name: string; thumbnail?: string; appIcon?: string }>>
    saveClip: (payload: any) => Promise<{ success: boolean; clip?: EclipseClip; error?: string }>
    listClips: () => Promise<EclipseClip[]>
    deleteClip: (clipId: string) => Promise<{ success: boolean; error?: string }>
    updateMeta: (payload: { clipId: string; title: string; tags?: string[] }) => Promise<{ success: boolean; meta?: any; error?: string }>
    openFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>
    copyFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
    exportClip: (payload: { filePath: string; suggestedName: string }) => Promise<{ success: boolean; exportedPath?: string; canceled?: boolean; error?: string }>
    getSettings: () => Promise<ClipSettings>
    saveSettings: (settings: Partial<ClipSettings>) => Promise<ClipSettings>
    pickFolder: () => Promise<string | null>
    onHotkeyTriggered: (callback: (data: { hotkey: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
