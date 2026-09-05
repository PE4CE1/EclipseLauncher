import { contextBridge, ipcRenderer } from 'electron'

export type ScanProgress = {
  stage: 'steam' | 'epic' | 'rockstar' | 'roblox' | 'done'
  message: string
  count: number
}

export type InstalledGame = {
  id: string
  name: string
  platform: 'steam' | 'epic' | 'custom'
  installPath: string
  launchUrl: string
  iconUrl?: string
  sizeBytes?: number
}

export type Settings = {
  rawgApiKey?: string
  steamPath?: string
  epicManifestPath?: string
  theme?: string
  language?: string
}

// Expose a typed API to the renderer via window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  isOverlay: typeof process !== 'undefined' && Array.isArray(process?.argv) && process.argv.includes('--is-overlay'),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),
  hideWindow:     () => ipcRenderer.send('window:hide'),
  isMaximized:    () => ipcRenderer.invoke('window:is-maximized'),
  setWindowSize:  (w: number, h: number, center?: boolean) => ipcRenderer.send('window:set-size', w, h, center),
  setWindowResizable: (resizable: boolean) => ipcRenderer.send('window:set-resizable', resizable),
  invalidateWindow: () => ipcRenderer.invoke('window:invalidate'),
  setAutoLaunch:  (enabled: boolean, startMinimized: boolean) => ipcRenderer.invoke('system:set-auto-launch', { enabled, startMinimized }),
  createDesktopShortcut: () => ipcRenderer.invoke('system:create-desktop-shortcut'),
  createGameShortcut: (game: { name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string }) =>
    ipcRenderer.invoke('games:create-shortcut', game),
  relaunchApp:    () => ipcRenderer.invoke('app:relaunch'),
  showNativeNotification: (options: { title: string; body: string }) => ipcRenderer.invoke('notification:show', options),
  openUrl:        (url: string) => ipcRenderer.invoke('system:open-url', url),
  openPath:       (fullPath: string) => ipcRenderer.invoke('system:open-path', fullPath),
  onNavigate:     (cb: (direction: 'back' | 'forward') => void) => {
    const handlerBack = () => cb('back')
    const handlerForward = () => cb('forward')
    ipcRenderer.on('navigation:back', handlerBack)
    ipcRenderer.on('navigation:forward', handlerForward)
    return () => {
      ipcRenderer.removeListener('navigation:back', handlerBack)
      ipcRenderer.removeListener('navigation:forward', handlerForward)
    }
  },

  // Game scanning
  scanGames: () => ipcRenderer.invoke('games:scan'),
  onScanProgress: (callback: (progress: ScanProgress) => void) => {
    const handler = (_: Electron.IpcRendererEvent, progress: ScanProgress) => callback(progress)
    ipcRenderer.on('games:scan-progress', handler)
    return () => ipcRenderer.removeListener('games:scan-progress', handler)
  },

  // Game launching & uninstall
  getCurrentGame: () => ipcRenderer.invoke('games:current'),
  launchGame: (launchUrl: string) => ipcRenderer.invoke('games:launch', launchUrl),
  uninstallGame: (game: { id: string; name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string; platform?: string }) =>
    ipcRenderer.invoke('games:uninstall', game),
  stopGame: () => ipcRenderer.invoke('games:stop'),
  onGameStopped: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('games:stopped', handler)
    return () => ipcRenderer.removeListener('games:stopped', handler)
  },

  // Playtime persistence
  getPlaytime: () => ipcRenderer.invoke('playtime:get'),
  savePlaytime: (db: any) => ipcRenderer.invoke('playtime:save', db),
  addPlaytime: (gameIdOrName: string, minutes: number, name?: string, steamId?: number) =>
    ipcRenderer.invoke('playtime:add', { gameIdOrName, name, minutes, steamId }),

  // Overlay
  onOverlayUpdate: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('overlay:update', handler)
    return () => ipcRenderer.removeListener('overlay:update', handler)
  },

  onOverlayEditStart: (callback: (gameData: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('overlay:edit-start', handler)
    return () => ipcRenderer.removeListener('overlay:edit-start', handler)
  },

  onOverlayEditEnd: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('overlay:edit-end', handler)
    return () => ipcRenderer.removeListener('overlay:edit-end', handler)
  },
  setOverlayIgnoreMouse: (ignore: boolean) => ipcRenderer.send('overlay:set-ignore-mouse', ignore),

  onMetricsUpdate: (callback: (data: { cpu: number; ram: number; ramMB: number; totalMB: number }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('metrics:update', handler)
    return () => ipcRenderer.removeListener('metrics:update', handler)
  },

  onRLMMRUpdate: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('rl:mmr-update', handler)
    return () => ipcRenderer.removeListener('rl:mmr-update', handler)
  },

  onCPSUpdate: (callback: (data: { lmb: number; rmb: number; total: number; buttonClicked?: 'lmb' | 'rmb' }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('overlay:cps-update', handler)
    return () => ipcRenderer.removeListener('overlay:cps-update', handler)
  },

  setRLPlaylist: (playlist: string) => ipcRenderer.invoke('rl:set-playlist', playlist),
  setRLApiKey: (key: string) => ipcRenderer.invoke('rl:set-api-key', key),
  resetRLSession: () => ipcRenderer.invoke('rl:reset-session'),
  getDetectedRLPlayer: () => ipcRenderer.invoke('rl:get-detected-player'),

  startOverlayEdit: () => ipcRenderer.invoke('overlay:open-edit'),
  exitOverlayEdit: () => ipcRenderer.invoke('overlay:exit-edit'),
  saveOverlayPositions: (positions: any) => ipcRenderer.invoke('overlay:save-positions', positions),
  triggerRobloxNudge: () => ipcRenderer.invoke('roblox:trigger-nudge'),
  onGamepadState: (callback: (state: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('overlay:gamepad-state', handler)
    return () => ipcRenderer.removeListener('overlay:gamepad-state', handler)
  },

  onGameStarted: (callback: (data: { name: string; startTime: number }) => void) => {
    const handler = (_: any, data: { name: string; startTime: number }) => callback(data)
    ipcRenderer.on('games:started', handler)
    return () => ipcRenderer.removeListener('games:started', handler)
  },

  // File dialog
  openExeDialog: () => ipcRenderer.invoke('dialog:open-exe'),

  // Settings persistence
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (data: Partial<Settings>) => ipcRenderer.invoke('settings:set', data),
  onSettingsUpdate: (callback: (settings: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('settings:update', handler)
    return () => ipcRenderer.removeListener('settings:update', handler)
  },

  // Discord RPC
  setDiscordActivity: (gameName: string, startTime: number, isPrivacyMode?: boolean, style?: 'clipping' | 'playing', appId?: string | number, customIconUrl?: string, customState?: string, customSmallIconUrl?: string, customSmallText?: string, isAnimated?: boolean) => 
    ipcRenderer.invoke('discord:set-activity', gameName, startTime, isPrivacyMode, style, appId, customIconUrl, customState, customSmallIconUrl, customSmallText, isAnimated),
  setDiscordDownloadActivity: (downloadName: string, isAnimated?: boolean) => ipcRenderer.invoke('discord:set-download-activity', downloadName, isAnimated),
  setDiscordIdleActivity: (isAnimated?: boolean) => ipcRenderer.invoke('discord:set-idle-activity', isAnimated),
  clearDiscordActivity: () => ipcRenderer.invoke('discord:clear-activity'),



  // Native Download Engine
  startDownload: (magnetURI: string, gameTitle?: string, downloadPath?: string, autoExtract = true, autoDelete = false) => 
    ipcRenderer.invoke('torrent:start', magnetURI, gameTitle, downloadPath, autoExtract, autoDelete),
  startHttpDownload: (url: string, name: string, downloadPath?: string, autoExtract = true, autoDelete = false) => 
    ipcRenderer.invoke('http-download:start', url, name, downloadPath, autoExtract, autoDelete),
  startNativeDownload: (url: string, gameTitle: string, downloadPath?: string, autoExtract = true, autoDelete = false) => {
    if (url.startsWith('magnet:')) {
      return ipcRenderer.invoke('torrent:start', url, gameTitle, downloadPath, autoExtract, autoDelete)
    }
    return ipcRenderer.invoke('http-download:start', url, gameTitle, downloadPath, autoExtract, autoDelete)
  },
  testDebridKey: (provider: string, apiKey: string) => ipcRenderer.invoke('debrid:test-key', { provider, apiKey }),
  checkLinkStatus: (url: string) => ipcRenderer.invoke('link:check', url),
  pauseDownload: (infoHash: string) => Promise.all([
    ipcRenderer.invoke('torrent:pause', infoHash).catch(() => {}),
    ipcRenderer.invoke('http-download:pause', infoHash).catch(() => {})
  ]),
  resumeDownload: (infoHash: string) => Promise.all([
    ipcRenderer.invoke('torrent:resume', infoHash).catch(() => {}),
    ipcRenderer.invoke('http-download:resume', infoHash).catch(() => {})
  ]),
  cancelDownload: (infoHash: string) => Promise.all([
    ipcRenderer.invoke('torrent:cancel', infoHash).catch(() => {}),
    ipcRenderer.invoke('http-download:cancel', infoHash).catch(() => {})
  ]),
  selectDirectory: () => ipcRenderer.invoke('dialog:open-directory'),
  selectJSONFile: () => ipcRenderer.invoke('dialog:open-json-file'),
  getDefaultDownloadPath: () => ipcRenderer.invoke('app:get-default-download-path'),
  // VPN Management
  detectInstalledVpns: () => ipcRenderer.invoke('vpn:detect'),
  getVpnStatus: () => ipcRenderer.invoke('vpn:status'),
  connectVpn: (vpnId?: string) => ipcRenderer.invoke('vpn:connect', vpnId),
  disconnectVpn: (vpnId?: string) => ipcRenderer.invoke('vpn:disconnect', vpnId),

  onTorrentProgress: (callback: (payload: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('torrent:progress', handler)
    return () => ipcRenderer.removeListener('torrent:progress', handler)
  },

  // Friends Window (Standalone Desktop Window)
  openFriendsWindow: () => ipcRenderer.invoke('open-friends-window'),
  closeFriendsWindow: () => ipcRenderer.invoke('close-friends-window'),
  openAddFriendModal: () => ipcRenderer.invoke('open-add-friend-modal'),
  openFriendProfileModal: (friendId: string) => ipcRenderer.invoke('open-friend-profile-modal', friendId),
  onShowAddFriendModal: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('show-add-friend-modal', handler)
    return () => ipcRenderer.removeListener('show-add-friend-modal', handler)
  },
  onShowFriendProfileModal: (callback: (friendId: string) => void) => {
    const handler = (_: any, friendId: string) => callback(friendId)
    ipcRenderer.on('show-friend-profile-modal', handler)
    return () => ipcRenderer.removeListener('show-friend-profile-modal', handler)
  },

  // Source Management & Local Disk Caching
  getCachedSources: () => ipcRenderer.invoke('sources:get-all-cached'),
  fetchAndCacheSource: (url: string) => ipcRenderer.invoke('sources:fetch-and-cache', url),
  clearSourceCache: (url?: string) => ipcRenderer.invoke('sources:clear-cache', url),
  saveRawSourceToCache: (url: string, name: string, data: any[]) => ipcRenderer.invoke('sources:save-raw-source', url, name, data),
  fetchSourceCF: (url: string) => ipcRenderer.invoke('source:fetch-cf', url),

  // Generic CORS bypass fetch
  utilFetch: (url: string, options?: any) => ipcRenderer.invoke('util:fetch', url, options),

  // Auto Updater
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (url?: string) => ipcRenderer.invoke('updater:download', url),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Generic invoke for other commands
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),

  // Generic on method
  on: (channel: string, cb: (...args: any[]) => void) => {
    const handler = (_: any, ...args: any[]) => cb(...args)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },

  onUpdaterEvent: (callback: (payload: { status: string, data?: any }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },

  // Custom Theme Deep Link
  onThemeInstallRequest: (callback: (theme: any) => void) => {
    const handler = (_: any, theme: any) => callback(theme)
    ipcRenderer.on('theme:install-request', handler)
    return () => ipcRenderer.removeListener('theme:install-request', handler)
  },
  getPendingTheme: () => ipcRenderer.invoke('theme:get-pending'),

  // Hardware Specs Detection
  getHardwareSpecs: () => ipcRenderer.invoke('system:get-hardware-specs'),

  // True Boost Memory & System Optimization
  flushRam: () => ipcRenderer.invoke('boost:manual-flush'),
  setMediaPerformanceMode: (isPerf: boolean) => ipcRenderer.invoke('media:set-performance-mode', isPerf),
  onBoostStatus: (callback: (data: { active: boolean; gameName?: string; freedMB?: number; timestamp: number }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('boost:status', handler)
    return () => ipcRenderer.removeListener('boost:status', handler)
  },

  // ─── Eclipse Clips Studio (Medal.tv Style) ───────────────────────────────────
  clips: {
    getSources: () => ipcRenderer.invoke('clips:get-sources'),
    saveClip: (payload: any) => ipcRenderer.invoke('clips:save', payload),
    listClips: () => ipcRenderer.invoke('clips:list'),
    deleteClip: (clipId: string) => ipcRenderer.invoke('clips:delete', clipId),
    updateMeta: (payload: { clipId: string; title: string; tags?: string[] }) => ipcRenderer.invoke('clips:update-meta', payload),
    openFolder: (filePath: string) => ipcRenderer.invoke('clips:open-folder', filePath),
    copyFile: (filePath: string) => ipcRenderer.invoke('clips:copy-file', filePath),
    exportClip: (payload: { filePath: string; suggestedName: string }) => ipcRenderer.invoke('clips:export', payload),
    readVideoData: (filePath: string) => ipcRenderer.invoke('clips:read-video-data', filePath),
    getSettings: () => ipcRenderer.invoke('clips:get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('clips:save-settings', settings),
    pickFolder: () => ipcRenderer.invoke('clips:pick-folder'),
    onHotkeyTriggered: (callback: (data: { hotkey: string }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('clips:hotkey-pressed', handler)
      return () => ipcRenderer.removeListener('clips:hotkey-pressed', handler)
    },
    onAutoClipTriggered: (callback: (data: { game: string; eventType: string; title: string; timestamp: number }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('clip:auto-triggered', handler)
      return () => ipcRenderer.removeListener('clip:auto-triggered', handler)
    }
  },

  // ─── Native Windows Voice Listener (Offline Speech API) ────────────────────
  voice: {
    start: (phrase?: string) => ipcRenderer.invoke('voice:start', phrase),
    stop: () => ipcRenderer.invoke('voice:stop'),
    setPhrase: (phrase: string) => ipcRenderer.send('voice:set-phrase', phrase),
    onHotwordDetected: (callback: (data: { text: string; confidence: number }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('voice:hotword-detected', handler)
      return () => ipcRenderer.removeListener('voice:hotword-detected', handler)
    }
  },

  // Window minimize / restore state listener
  onAppMinimized: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:minimized', handler)
    return () => ipcRenderer.removeListener('app:minimized', handler)
  },
  onAppRestored: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('app:restored', handler)
    return () => ipcRenderer.removeListener('app:restored', handler)
  },

  // ─── Stream Studio (Discord Game + Controller Compositor) ─────────────────
  stream: {
    open: (gameName?: string) => ipcRenderer.invoke('stream:open', gameName),
    close: () => ipcRenderer.invoke('stream:close'),
    minimize: () => ipcRenderer.invoke('stream:minimize'),
    maximize: () => ipcRenderer.invoke('stream:maximize'),
    getStatus: () => ipcRenderer.invoke('stream:status'),
    getSources: () => ipcRenderer.invoke('stream:get-sources'),
    setTitle: (title: string) => ipcRenderer.invoke('stream:set-title', title),
    setResolution: (width: number, height: number) => ipcRenderer.invoke('stream:set-resolution', { width, height }),
    onGameUpdate: (callback: (data: { gameName: string | null; title: string }) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('stream:game-update', handler)
      return () => ipcRenderer.removeListener('stream:game-update', handler)
    }
  },

  // ─── Windows Media Integration ──────────────────────────────────────────
  media: {
    getStatus: (filter?: string) => ipcRenderer.invoke('media:get-status', filter),
    setFilter: (filter: string) => ipcRenderer.invoke('media:set-filter', filter),
    playPause: () => ipcRenderer.invoke('media:play-pause'),
    next: () => ipcRenderer.invoke('media:next'),
    previous: () => ipcRenderer.invoke('media:previous'),
    registerHotkeys: (keybinds: { playPause?: string; next?: string; prev?: string }) => ipcRenderer.invoke('media:register-hotkeys', keybinds),
    onUpdate: (callback: (state: any) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('media:update', handler)
      return () => ipcRenderer.removeListener('media:update', handler)
    }
  },

  // ─── Storage & Disk Space Manager ─────────────────────────────────────────
  storage: {
    getDrives: () => ipcRenderer.invoke('storage:get-drives'),
    getGameSizes: (games: any[]) => ipcRenderer.invoke('storage:get-game-sizes', games),
    openFolder: (folderPath: string) => ipcRenderer.invoke('storage:open-folder', folderPath)
  },

  // ─── Spicetify Spotify Extension & Mod Manager ───────────────────────────
  spicetify: {
    getStatus: () => ipcRenderer.invoke('spicetify:get-status'),
    install: () => ipcRenderer.invoke('spicetify:install'),
    apply: () => ipcRenderer.invoke('spicetify:apply'),
    restore: () => ipcRenderer.invoke('spicetify:restore'),
    upgrade: () => ipcRenderer.invoke('spicetify:upgrade'),
    openFolder: () => ipcRenderer.invoke('spicetify:open-folder'),
    onLog: (callback: (log: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('spicetify:log', handler)
      return () => ipcRenderer.removeListener('spicetify:log', handler)
    },
    onStatus: (callback: (status: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('spicetify:status', handler)
      return () => ipcRenderer.removeListener('spicetify:status', handler)
    }
  },

  // ─── Vencord Discord Client Mod Manager ──────────────────────────────────
  vencord: {
    getStatus: () => ipcRenderer.invoke('vencord:get-status'),
    install: () => ipcRenderer.invoke('vencord:install'),
    repair: () => ipcRenderer.invoke('vencord:repair'),
    uninstall: () => ipcRenderer.invoke('vencord:uninstall'),
    openThemes: () => ipcRenderer.invoke('vencord:open-themes'),
    openFolder: () => ipcRenderer.invoke('vencord:open-folder'),
    onLog: (callback: (log: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('vencord:log', handler)
      return () => ipcRenderer.removeListener('vencord:log', handler)
    },
    onStatus: (callback: (status: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('vencord:status', handler)
      return () => ipcRenderer.removeListener('vencord:status', handler)
    }
  },

  // ─── Millennium Steam Client Mod Manager ─────────────────────────────────
  millennium: {
    getStatus: () => ipcRenderer.invoke('millennium:get-status'),
    install: (lang?: string) => ipcRenderer.invoke('millennium:install', lang),
    repair: (lang?: string) => ipcRenderer.invoke('millennium:repair', lang),
    uninstall: (lang?: string) => ipcRenderer.invoke('millennium:uninstall', lang),
    openThemes: () => ipcRenderer.invoke('millennium:open-themes'),
    openStore: () => ipcRenderer.invoke('millennium:open-store'),
    openFolder: () => ipcRenderer.invoke('millennium:open-folder'),
    launchInstaller: (lang?: string) => ipcRenderer.invoke('millennium:launch-installer', lang),
    onLog: (callback: (log: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('millennium:log', handler)
      return () => ipcRenderer.removeListener('millennium:log', handler)
    },
    onStatus: (callback: (status: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('millennium:status', handler)
      return () => ipcRenderer.removeListener('millennium:status', handler)
    }
  },

  // ─── OpenAsar Discord Speed & RAM Booster ─────────────────────────────────
  openasar: {
    getStatus: () => ipcRenderer.invoke('openasar:get-status'),
    install: (lang?: string) => ipcRenderer.invoke('openasar:install', lang),
    uninstall: (lang?: string) => ipcRenderer.invoke('openasar:uninstall', lang),
    openFolder: () => ipcRenderer.invoke('openasar:open-folder'),
    openGithub: () => ipcRenderer.invoke('openasar:open-github'),
    onLog: (callback: (log: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('openasar:log', handler)
      return () => ipcRenderer.removeListener('openasar:log', handler)
    },
    onStatus: (callback: (status: string) => void) => {
      const handler = (_: any, data: string) => callback(data)
      ipcRenderer.on('openasar:status', handler)
      return () => ipcRenderer.removeListener('openasar:status', handler)
    }
  },

  // ─── Roblox Codes & Live Game Tracker ─────────────────────────────────────
  roblox: {
    getActiveExperience: () => ipcRenderer.invoke('roblox:get-active-experience'),
    getCodes: (gameName: string, placeId?: string, universeId?: string, forceRefresh?: boolean) =>
      ipcRenderer.invoke('roblox:get-codes', gameName, placeId, universeId, forceRefresh),
    refreshExperience: () => ipcRenderer.invoke('roblox:refresh-experience'),
    onExperienceChange: (callback: (experience: any) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('roblox:experience-changed', handler)
      return () => ipcRenderer.removeListener('roblox:experience-changed', handler)
    }
  },
})
