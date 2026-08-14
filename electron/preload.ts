import { contextBridge, ipcRenderer } from 'electron'

export type ScanProgress = {
  stage: 'steam' | 'epic' | 'done'
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
  isOverlay: process.argv.includes('--is-overlay'),
  
  // Window controls
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow:    () => ipcRenderer.send('window:close'),
  hideWindow:     () => ipcRenderer.send('window:hide'),
  isMaximized:    () => ipcRenderer.invoke('window:is-maximized'),
  setWindowSize:  (w: number, h: number, center?: boolean) => ipcRenderer.send('window:set-size', w, h, center),
  setWindowResizable: (resizable: boolean) => ipcRenderer.send('window:set-resizable', resizable),
  setAutoLaunch:  (enabled: boolean, startMinimized: boolean) => ipcRenderer.invoke('system:set-auto-launch', { enabled, startMinimized }),
  createDesktopShortcut: () => ipcRenderer.invoke('system:create-desktop-shortcut'),
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

  // Game launching
  getCurrentGame: () => ipcRenderer.invoke('games:current'),
  launchGame: (launchUrl: string) => ipcRenderer.invoke('games:launch', launchUrl),
  stopGame: () => ipcRenderer.invoke('games:stop'),
  onGameStopped: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('games:stopped', handler)
    return () => ipcRenderer.removeListener('games:stopped', handler)
  },

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

  setRLPlaylist: (playlist: string) => ipcRenderer.invoke('rl:set-playlist', playlist),
  setRLApiKey: (key: string) => ipcRenderer.invoke('rl:set-api-key', key),

  startOverlayEdit: () => ipcRenderer.invoke('overlay:open-edit'),
  exitOverlayEdit: () => ipcRenderer.invoke('overlay:exit-edit'),
  saveOverlayPositions: (positions: any) => ipcRenderer.invoke('overlay:save-positions', positions),

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

  // Discord RPC
  setDiscordActivity: (gameName: string, startTime: number, isPrivacyMode?: boolean) => ipcRenderer.invoke('discord:set-activity', gameName, startTime, isPrivacyMode),
  setDiscordDownloadActivity: (downloadName: string) => ipcRenderer.invoke('discord:set-download-activity', downloadName),
  setDiscordIdleActivity: () => ipcRenderer.invoke('discord:set-idle-activity'),
  clearDiscordActivity: () => ipcRenderer.invoke('discord:clear-activity'),



  // Torrent Engine
  startDownload: (magnetURI: string, downloadPath?: string, autoExtract?: boolean) => ipcRenderer.invoke('torrent:start', magnetURI, downloadPath, autoExtract),
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
  onTorrentProgress: (callback: (payload: any) => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: any) => callback(payload)
    ipcRenderer.on('torrent:progress', handler)
    return () => ipcRenderer.removeListener('torrent:progress', handler)
  },

  // Cloudflare bypass fetch
  fetchSourceCF: (url: string) => ipcRenderer.invoke('source:fetch-cf', url),

  // Generic CORS bypass fetch
  utilFetch: (url: string, options?: any) => ipcRenderer.invoke('util:fetch', url, options),

  // ─── Friends Window ──────────────────────────────────────────────────────────
  openFriendsWindow: () => ipcRenderer.invoke('open-friends-window'),
  closeFriendsWindow: () => ipcRenderer.invoke('close-friends-window'),
  openAddFriendModal: () => ipcRenderer.invoke('open-add-friend-modal'),
  onShowAddFriendModal: (callback: () => void) => {
    ipcRenderer.on('show-add-friend-modal', callback)
    return () => ipcRenderer.removeListener('show-add-friend-modal', callback)
  },
  openFriendProfileModal: (friendId: string) => ipcRenderer.invoke('open-friend-profile-modal', friendId),
  onShowFriendProfileModal: (callback: (friendId: string) => void) => {
    const handler = (_event: any, friendId: string) => callback(friendId)
    ipcRenderer.on('show-friend-profile-modal', handler)
    return () => ipcRenderer.removeListener('show-friend-profile-modal', handler)
  },

  // HTTP Download Engine & Link check
  startHttpDownload: (url: string, name: string, downloadPath?: string, autoExtract?: boolean) => ipcRenderer.invoke('http-download:start', url, name, downloadPath, autoExtract),
  checkLinkStatus: (url: string) => ipcRenderer.invoke('link:check', url),

  // Auto Updater
  checkUpdate: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
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
  }
})
