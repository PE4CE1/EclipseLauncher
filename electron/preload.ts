import { controlDownload } from './downloadControls'
import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { CrosshairGameId } from '../src/services/gameCrosshairs'
import type { SocialSnapshot, SocialRefreshRequest, SocialRefreshResult } from '../src/types/socialState'

let mediaSubscribers = 0
let latestMetrics: Record<string, unknown> | undefined
let latestRLState: unknown
ipcRenderer.on('rl:mmr-update', (_event, data: unknown) => { latestRLState = data })
// Widgets can mount after the first deduplicated update has already arrived.
ipcRenderer.on('metrics:update', (_event, data: Record<string, unknown>) => { latestMetrics = data })

export type ScanProgress = {
  stage: 'steam' | 'epic' | 'riot' | 'rockstar' | 'roblox' | 'done'
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
  appMode: process.argv.includes('--eclipse-clips-mode') ? 'clips' : 'launcher',
  switchAppMode: (mode: 'launcher' | 'clips') => ipcRenderer.invoke('app:switch-mode', mode),
  clipboard: {
    writeText: (value: string) => ipcRenderer.invoke('clipboard:write-text', value),
  },
  isOverlay: typeof process !== 'undefined' && Array.isArray(process?.argv) && process.argv.includes('--is-overlay'),
  
  nativeMicrophone: {
    list: () => ipcRenderer.invoke('microphone:list'),
    start: (id: string, deviceId: string) => ipcRenderer.invoke('microphone:start', id, deviceId),
    stop: (id: string) => ipcRenderer.invoke('microphone:stop', id),
    onData: (callback: (packet: import('../src/types/microphone').NativeMicrophonePacket) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, packet: import('../src/types/microphone').NativeMicrophonePacket) => {
        try { callback(packet) }
        finally { if (packet.sequence !== undefined) ipcRenderer.send('microphone:ack', packet.id, packet.sequence) }
      }
      ipcRenderer.on('microphone:data', handler)
      return () => ipcRenderer.removeListener('microphone:data', handler)
    },
  },
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
  getAutoLaunchStatus: () => ipcRenderer.invoke('system:get-auto-launch'),
  openStartupSettings: () => ipcRenderer.invoke('system:open-startup-settings'),
  getWindowState: () => ipcRenderer.invoke('window:get-state'),
  onMemoryPressure: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('memory:pressure', handler)
    return () => ipcRenderer.removeListener('memory:pressure', handler)
  },
  createDesktopShortcut: () => ipcRenderer.invoke('system:create-desktop-shortcut'),
  createGameShortcut: (game: { name: string; installPath?: string; launchUrl?: string; steamId?: number; appId?: string }) =>
    ipcRenderer.invoke('games:create-shortcut', game),
  relaunchApp:    () => ipcRenderer.invoke('app:relaunch'),
  showNativeNotification: (options: { title: string; body: string; peerId?: string; silent?: boolean }) => ipcRenderer.invoke('notification:show', options),
  openUrl:        (url: string, fallbackUrl?: string) => ipcRenderer.invoke('system:open-url', url, fallbackUrl),
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

  onMemoryTrim: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('memory:trim', handler)
    return () => ipcRenderer.removeListener('memory:trim', handler)
  },

  // Game scanning
  scanGames: (options?: { scanUninstalledSteam?: boolean }) => ipcRenderer.invoke('games:scan', options),
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
  getFpsAccess: () => ipcRenderer.invoke('fps:get-access'),
  enableFpsAccess: () => ipcRenderer.invoke('fps:enable-access'),
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

  onMetricsUpdate: (callback: (data: Record<string, unknown>) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('metrics:update', handler)
    if (latestMetrics) callback(latestMetrics)
    return () => ipcRenderer.removeListener('metrics:update', handler)
  },

  onRLMMRUpdate: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('rl:mmr-update', handler)
    if (latestRLState) callback(latestRLState)
    return () => ipcRenderer.removeListener('rl:mmr-update', handler)
  },

  onRLScoreboardToggle: (callback: (open: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, open: boolean) => { if (typeof open === 'boolean') callback(open) }
    ipcRenderer.on('rl:scoreboard-toggle', handler)
    return () => ipcRenderer.removeListener('rl:scoreboard-toggle', handler)
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
  getRLState: () => ipcRenderer.invoke('rl:get-state'),

  getOverlayState: () => ipcRenderer.invoke('overlay:get-current-state'),
  startOverlayEdit: (game?: CrosshairGameId) => ipcRenderer.invoke('overlay:open-edit', game),
  getCS2Stats:()=>ipcRenderer.invoke('cs2:stats-get'),
  resetCS2Stats:()=>ipcRenderer.invoke('cs2:stats-reset'),
  onCS2Stats:(callback:(stats:import('../src/types/cs2Stats').CS2Stats)=>void)=>{const listener=(_event:unknown,stats:import('../src/types/cs2Stats').CS2Stats)=>callback(stats);ipcRenderer.on('cs2:stats',listener);return()=>ipcRenderer.removeListener('cs2:stats',listener)},
  exitOverlayEdit: () => ipcRenderer.invoke('overlay:exit-edit'),
  saveOverlayPositions: (positions: any) => ipcRenderer.invoke('overlay:save-positions', positions),
  triggerRobloxNudge: () => ipcRenderer.invoke('roblox:trigger-nudge'),
  onGamepadState: (callback: (state: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('overlay:gamepad-state', handler)
    return () => ipcRenderer.removeListener('overlay:gamepad-state', handler)
  },
  startGamepadService: () => ipcRenderer.invoke('gamepad:start-service'),
  stopGamepadService: () => ipcRenderer.invoke('gamepad:stop-service'),
  onClipSavedToast: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('overlay:clip-saved', handler)
    return () => ipcRenderer.removeListener('overlay:clip-saved', handler)
  },
  showClipToast: (data: any) => ipcRenderer.invoke('overlay:show-clip-toast', data),
  dismissClipToast: () => ipcRenderer.invoke('overlay:dismiss-clip-toast'),

  onGameStarted: (callback: (data: { name: string; startTime: number }) => void) => {
    const handler = (_: any, data: { name: string; startTime: number }) => callback(data)
    ipcRenderer.on('games:started', handler)
    return () => ipcRenderer.removeListener('games:started', handler)
  },
  registerInstalledGames: (games: Array<{ name: string; executable: string; steamId?: number }>) => ipcRenderer.invoke('games:register-installed', games),

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

  // Free Games Radar
  checkFreeGamesNow: () => ipcRenderer.invoke('freegames:check-now'),
  getFreeGames: () => ipcRenderer.invoke('freegames:get-cached'),
  onOpenFreeGames: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('freegames:open', handler)
    return () => { ipcRenderer.removeListener('freegames:open', handler) }
  },
  onFreeGamesUpdated: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('freegames:updated', handler)
    return () => { ipcRenderer.removeListener('freegames:updated', handler) }
  },
  onTrayLaunchGame: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('tray:launch-game', handler)
    return () => ipcRenderer.removeListener('tray:launch-game', handler)
  },

  // Discord RPC
  setDiscordActivity: (gameName: string, startTime: number, isPrivacyMode?: boolean, style?: 'clipping' | 'playing', appId?: string | number, customIconUrl?: string, customState?: string, customSmallIconUrl?: string, customSmallText?: string, isAnimated?: boolean) => 
    ipcRenderer.invoke('discord:set-activity', gameName, startTime, isPrivacyMode, style, appId, customIconUrl, customState, customSmallIconUrl, customSmallText, isAnimated),
  setDiscordDownloadActivity: (downloadName: string, isAnimated?: boolean) => ipcRenderer.invoke('discord:set-download-activity', downloadName, isAnimated),
  updateDiscordDownload: (downloadName: string | null) => ipcRenderer.invoke('discord:update-download', downloadName),
  setDiscordIdleActivity: (isAnimated?: boolean) => ipcRenderer.invoke('discord:set-idle-activity', isAnimated),
  clearDiscordActivity: () => ipcRenderer.invoke('discord:clear-activity'),



  // Native Download Engine
  startDownload: (magnetURI: string, gameTitle?: string, downloadPath?: string, autoExtract = true, autoDelete = false) => 
    ipcRenderer.invoke('torrent:start', magnetURI, gameTitle, downloadPath, autoExtract, autoDelete),
  startHttpDownload: (url: string, name: string, downloadPath?: string, autoExtract = true, autoDelete = false, mirrors: string[] = []) =>
    ipcRenderer.invoke('http-download:start', url, name, downloadPath, autoExtract, autoDelete, mirrors),
  startNativeDownload: (url: string, gameTitle: string, downloadPath?: string, autoExtract = true, autoDelete = false, mirrors: string[] = []) => {
    if (url.startsWith('magnet:')) {
      return ipcRenderer.invoke('torrent:start', url, gameTitle, downloadPath, autoExtract, autoDelete)
    }
    return ipcRenderer.invoke('http-download:start', url, gameTitle, downloadPath, autoExtract, autoDelete, mirrors)
  },
  testDebridKey: (provider: string, apiKey: string) => ipcRenderer.invoke('debrid:test-key', { provider, apiKey }),
  checkLinkStatus: (url: string) => ipcRenderer.invoke('link:check', url),
  inspectDownloadLink: (url: string) => ipcRenderer.invoke('link:inspect', url),
  pauseDownload: (infoHash: string) => controlDownload((channel, id) => ipcRenderer.invoke(channel, id), 'pause', infoHash),
  resumeDownload: (infoHash: string) => controlDownload((channel, id) => ipcRenderer.invoke(channel, id), 'resume', infoHash),
  cancelDownload: (infoHash: string) => controlDownload((channel, id) => ipcRenderer.invoke(channel, id), 'cancel', infoHash),
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
  chatNotifications: {
    setContext: (context: { uid: string; peerId: string | null; visible: boolean }) => ipcRenderer.send('chat:context', context),
    isActive: (uid: string, peer: string) => ipcRenderer.invoke('chat:active', uid, peer),
    setMuted: (uid: string, peer: string, muted: boolean) => ipcRenderer.invoke('chat:mute', uid, peer, muted),
    onMuted: (callback: (muted: Record<string, string[]>) => void) => {
      const handler = (_: Electron.IpcRendererEvent, value: Record<string, string[]>) => callback(value)
      ipcRenderer.on('chat:muted', handler); return () => { ipcRenderer.removeListener('chat:muted', handler) }
    },
    open: (peer: string) => ipcRenderer.invoke('chat:open', peer),
    pending: () => ipcRenderer.invoke('chat:pending'),
    onOpen: (callback: (peer: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, peer: string) => callback(peer)
      ipcRenderer.on('chat:open', handler); return () => { ipcRenderer.removeListener('chat:open', handler) }
    },
  },
  socialState: {
    publish: (snapshot: SocialSnapshot) => ipcRenderer.send('social:publish', snapshot),
    getSnapshot: () => ipcRenderer.invoke('social:get'),
    onSnapshot: (callback: (snapshot: SocialSnapshot | null) => void) => {
      const handler = (_: Electron.IpcRendererEvent, snapshot: SocialSnapshot | null) => callback(snapshot)
      ipcRenderer.on('social:snapshot', handler)
      return () => { ipcRenderer.removeListener('social:snapshot', handler) }
    },
    refresh: (force: boolean) => ipcRenderer.invoke('social:refresh', force),
    onRefresh: (callback: (request: SocialRefreshRequest) => void) => {
      const handler = (_: Electron.IpcRendererEvent, request: SocialRefreshRequest) => callback(request)
      ipcRenderer.on('social:refresh', handler)
      return () => { ipcRenderer.removeListener('social:refresh', handler) }
    },
    completeRefresh: (result: SocialRefreshResult) => ipcRenderer.send('social:refreshed', result),
  },
  openFriendsWindow: () => ipcRenderer.invoke('open-friends-window'),
  closeFriendsWindow: () => ipcRenderer.invoke('close-friends-window'),
  openSteamMonitorWindow: () => ipcRenderer.invoke('open-steam-monitor-window'),
  closeSteamMonitorWindow: () => ipcRenderer.invoke('close-steam-monitor-window'),
  toggleSteamMonitorWindow: () => ipcRenderer.invoke('toggle-steam-monitor-window'),
  minimizeSteamMonitorWindow: () => ipcRenderer.invoke('minimize-steam-monitor-window'),
  bringSteamMonitorToFront: () => ipcRenderer.invoke('bring-steam-monitor-to-front'),
  setSteamMonitorAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('set-steam-monitor-always-on-top', flag),
  broadcastSteamTelemetry: (data: any) => ipcRenderer.send('steam-telemetry-broadcast', data),
  onSteamTelemetryUpdate: (callback: (data: any) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('steam-telemetry-update', handler)
    return () => ipcRenderer.removeListener('steam-telemetry-update', handler)
  },
  openAddFriendModal: () => ipcRenderer.invoke('open-add-friend-modal'),
  addFriendModalReady: () => ipcRenderer.invoke('add-friend-modal-ready'),
  addFriendModalClosed: () => ipcRenderer.invoke('add-friend-modal-closed'),
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
  requestText: async (request: { id: string; url: string; method?: 'GET' | 'HEAD'; headers?: Record<string, string> }) => {
    const response = await ipcRenderer.invoke('network:request', request)
    if (response?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    return response
  },
  cancelRequest: (id: string) => ipcRenderer.send('network:cancel', id),
  getCrosshairImage: async (request: { id: string; url: string }) => {
    const result = await ipcRenderer.invoke('crosshair:image', request)
    if (result?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    return result
  },
  prefetchArtwork: (request: { id: string; url: string }) => ipcRenderer.invoke('artwork:prefetch', request),

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
  releaseUnusedMediaMemory: () => webFrame.clearCache(),
  clips: {
    nativeStart: (duration:number) => ipcRenderer.invoke('clips:native-start',duration),
    nativeStop: () => ipcRenderer.invoke('clips:native-stop'),
    nativeRetryMicrophone: () => ipcRenderer.invoke('clips:native-retry-mic'),
    nativeSnapshot: () => ipcRenderer.invoke('clips:native-snapshot'),
    nativePreview: () => ipcRenderer.invoke('clips:native-preview'),
    nativeSetDuration: (seconds:number) => ipcRenderer.invoke('clips:native-duration',seconds),
    onNativeStatus: (callback:(status:import('../src/types/game').ClipCaptureStatus)=>void) => {const listener=(_event:Electron.IpcRendererEvent,status:import('../src/types/game').ClipCaptureStatus)=>callback(status);ipcRenderer.on('clips:native-status',listener);return()=>ipcRenderer.removeListener('clips:native-status',listener)},
    getAutoClipStatus: () => ipcRenderer.invoke('clips:autoclip-status'),
    setupAutoClipGame: (game: 'cs2' | 'dota2') => ipcRenderer.invoke('clips:autoclip-setup', game),
    getSources: () => ipcRenderer.invoke('clips:get-sources'),
    saveClip: (payload: any) => ipcRenderer.invoke('clips:save', payload),
    listClips: () => ipcRenderer.invoke('clips:list'),
    deleteClip: (clipId: string) => ipcRenderer.invoke('clips:delete', clipId),
    updateMeta: (payload: { clipId: string; title: string; tags?: string[] }) => ipcRenderer.invoke('clips:update-meta', payload),
    shareConfig: () => ipcRenderer.invoke('clips:share-config'),
    shareLinks: (filePath:string) => ipcRenderer.invoke('clips:share-links',filePath),
    shareClip: (payload:unknown) => ipcRenderer.invoke('clips:share',payload),
    deleteShare: (payload:unknown) => ipcRenderer.invoke('clips:share-delete',payload),
    copyShare: (id:string) => ipcRenderer.invoke('clips:share-copy',id),
    copyEdited: (payload:unknown) => ipcRenderer.invoke('clips:copy-edited',payload),
    onShareProgress: (callback:(progress:{phase:string;percent:number})=>void) => {const listener=(_event:Electron.IpcRendererEvent,progress:{phase:string;percent:number})=>callback(progress);ipcRenderer.on('clips:share-progress',listener);return()=>ipcRenderer.removeListener('clips:share-progress',listener)},
    audioProcesses: () => ipcRenderer.invoke('clips:audio-processes'),
    prepareAudio: (selection: {game:string;discord:boolean;historySeconds:number}) => ipcRenderer.invoke('clips:audio-prepare',selection),
    stopAudio: () => ipcRenderer.invoke('clips:audio-stop'),
    setAudioHistory: (seconds: number) => ipcRenderer.invoke('clips:audio-history', seconds),
    onAudioStatus: (callback: (status: {channel:string;available:boolean})=>void) => { const listener=(_event:Electron.IpcRendererEvent,status:{channel:string;available:boolean})=>callback(status);ipcRenderer.on('clips:audio-status',listener);return()=>ipcRenderer.removeListener('clips:audio-status',listener) },
    saveDraft: (payload: { clipId: string; draft: { state: import('../src/services/clipEdits').ClipEditState; sourceDuration: number } | null }) => ipcRenderer.invoke('clips:save-draft', payload),
    openFolder: (filePath: string) => ipcRenderer.invoke('clips:open-folder', filePath),
    copyFile: (filePath: string) => ipcRenderer.invoke('clips:copy-file', filePath),
    exportClip: (payload: { filePath: string; suggestedName: string }) => ipcRenderer.invoke('clips:export', payload),
    optimizeClip: (payload: { clipId: string; quality?: 'balanced' | 'discord' }) => ipcRenderer.invoke('clips:optimize', payload),
    readVideoData: (filePath: string) => ipcRenderer.invoke('clips:read-video-data', filePath),
    analyzeClip: (clipId: string) => ipcRenderer.invoke('clips:analyze', clipId),
    setCaptureActive: (active: boolean) => ipcRenderer.invoke('clips:capture-active', active),
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
    playPause: (filter?: string, sessionId?: string) => ipcRenderer.invoke('media:play-pause', filter, sessionId),
    next: (filter?: string, sessionId?: string) => ipcRenderer.invoke('media:next', filter, sessionId),
    previous: (filter?: string, sessionId?: string) => ipcRenderer.invoke('media:previous', filter, sessionId),
    registerHotkeys: (keybinds: { playPause?: string; next?: string; prev?: string }) => ipcRenderer.invoke('media:register-hotkeys', keybinds),
    onUpdate: (callback: (state: any) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('media:update', handler)
      if (mediaSubscribers++ === 0) void ipcRenderer.invoke('media:subscribe').catch(() => {})
      let active = true
      return () => {
        if (!active) return
        active = false
        ipcRenderer.removeListener('media:update', handler)
        if (--mediaSubscribers === 0) void ipcRenderer.invoke('media:unsubscribe').catch(() => {})
      }
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
    searchGames: (query: string) => ipcRenderer.invoke('roblox:search-code-games', query),
    onCodesUpdated: (callback: (data: unknown) => void) => {
      const handler = (_: unknown, data: unknown) => callback(data)
      ipcRenderer.on('roblox:codes-updated', handler)
      return () => ipcRenderer.removeListener('roblox:codes-updated', handler)
    },
    getActiveExperience: () => ipcRenderer.invoke('roblox:get-active-experience'),
    getCodes: (gameName: string, placeId?: string, universeId?: string, forceRefresh?: boolean) =>
      ipcRenderer.invoke('roblox:get-codes', gameName, placeId, universeId, forceRefresh),
    refreshExperience: () => ipcRenderer.invoke('roblox:refresh-experience'),
    getExperiencePlaytime: () => ipcRenderer.invoke('roblox:get-experience-playtime'),
    syncPlaytime: () => ipcRenderer.invoke('roblox:sync-playtime'),
    onExperienceChange: (callback: (experience: any) => void) => {
      const handler = (_: any, data: any) => callback(data)
      ipcRenderer.on('roblox:experience-changed', handler)
      return () => ipcRenderer.removeListener('roblox:experience-changed', handler)
    },
    onPlaytimeUpdated: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('roblox:playtime-updated', handler)
      return () => ipcRenderer.removeListener('roblox:playtime-updated', handler)
    }
  },

  // ─── Persistent Account & Machine Anchoring ──────────────────────────────
  account: {
    initialIdentity: (() => {
      try {
        return ipcRenderer.sendSync('account:get-identity-sync')
      } catch {
        return null
      }
    })(),
    getIdentitySync: () => {
      try {
        return ipcRenderer.sendSync('account:get-identity-sync')
      } catch {
        return null
      }
    },
    getIdentity: () => ipcRenderer.invoke('account:get-identity'),
    saveIdentity: (data: any) => ipcRenderer.invoke('account:save-identity', data),
    getDeviceAnchor: () => ipcRenderer.invoke('account:get-device-anchor'),
  },

  // Controller real-time hardware battery & telemetry
  getControllerBattery: () => ipcRenderer.invoke('controller:get-battery'),
  vibrateController: () => ipcRenderer.invoke('controller:vibrate'),
})
