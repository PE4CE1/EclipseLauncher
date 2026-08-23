import { app, ipcMain, desktopCapturer, shell, dialog, globalShortcut, clipboard, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'

export interface ClipMetadata {
  id: string
  title: string
  gameTitle: string
  gameId?: string | number
  duration: number
  thumbnailUrl: string
  fileName: string
  fileSize: number
  createdAt: number
  resolution?: string
  fps?: number
  tags?: string[]
}

export interface ClipSettingsRecord {
  enabled: boolean
  replayDurationSeconds: number
  hotkey: string
  quality: '1080p' | '720p'
  fps: 60 | 30
  captureMic: boolean
  micVolume: number
  savePath?: string
  notifyOnClip: boolean
}

const DEFAULT_SETTINGS: ClipSettingsRecord = {
  enabled: true,
  replayDurationSeconds: 30,
  hotkey: 'F8',
  quality: '1080p',
  fps: 60,
  captureMic: false,
  micVolume: 80,
  notifyOnClip: true,
}

function getClipsDirectory(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath
  }
  try {
    const videosPath = app.getPath('videos')
    const eclipseClips = path.join(videosPath, 'Eclipse Clips')
    if (!fs.existsSync(eclipseClips)) {
      fs.mkdirSync(eclipseClips, { recursive: true })
    }
    return eclipseClips
  } catch {
    const fallback = path.join(app.getPath('userData'), 'Eclipse Clips')
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true })
    }
    return fallback
  }
}

function getSettingsPath(): string {
  return path.join(app.getPath('userData'), 'clip_settings.json')
}

function loadClipSettings(): ClipSettingsRecord {
  const p = getSettingsPath()
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      return { ...DEFAULT_SETTINGS, ...data }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }
  return { ...DEFAULT_SETTINGS }
}

function saveClipSettings(settings: Partial<ClipSettingsRecord>) {
  const current = loadClipSettings()
  const updated = { ...current, ...settings }
  fs.writeFileSync(getSettingsPath(), JSON.stringify(updated, null, 2), 'utf-8')
  return updated
}

let activeRegisteredHotkey: string | null = null

export function registerClipsGlobalHotkey(mainWindow?: BrowserWindow) {
  const settings = loadClipSettings()
  if (!settings.enabled) {
    if (activeRegisteredHotkey) {
      globalShortcut.unregister(activeRegisteredHotkey)
      activeRegisteredHotkey = null
    }
    return
  }

  const targetHotkey = settings.hotkey || 'F8'
  if (activeRegisteredHotkey === targetHotkey) return

  if (activeRegisteredHotkey) {
    globalShortcut.unregister(activeRegisteredHotkey)
    activeRegisteredHotkey = null
  }

  try {
    const success = globalShortcut.register(targetHotkey, () => {
      const targetWindow = mainWindow || BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('clips:hotkey-pressed', { hotkey: targetHotkey })
      }
    })
    if (success) {
      activeRegisteredHotkey = targetHotkey
    } else {
      console.warn('[Clips] Failed to register global hotkey:', targetHotkey)
    }
  } catch (err) {
    console.warn('[Clips] Error registering global hotkey:', targetHotkey, err)
  }
}

export function initClipsIPC(mainWindow?: BrowserWindow) {
  // Ensure default directory
  getClipsDirectory()

  // Register hotkey
  registerClipsGlobalHotkey(mainWindow)

  // 1. Get screen / window capture sources
  ipcMain.handle('clips:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      })
      return sources.map(s => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : undefined,
        appIcon: s.appIcon ? s.appIcon.toDataURL() : undefined,
      }))
    } catch (err: any) {
      console.error('[Clips] getSources error:', err)
      return []
    }
  })

  // 2. Save clip buffer to disk
  ipcMain.handle('clips:save', async (_, payload: {
    videoBase64: string
    title: string
    gameTitle: string
    gameId?: string | number
    duration: number
    thumbnailDataUrl: string
    resolution?: string
    fps?: number
    tags?: string[]
  }) => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const clipId = 'clip_' + Date.now()
      const videoExt = payload.videoBase64.startsWith('data:video/mp4') ? 'mp4' : 'webm'
      const fileName = clipId + '.' + videoExt
      const videoFilePath = path.join(dir, fileName)
      const metaFilePath = path.join(dir, clipId + '.json')

      // Convert base64 to buffer
      const base64Data = payload.videoBase64.replace(/^data:video\/\w+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')
      fs.writeFileSync(videoFilePath, buffer)

      const meta: ClipMetadata = {
        id: clipId,
        title: payload.title || ((payload.gameTitle || 'Gameplay') + ' Clip'),
        gameTitle: payload.gameTitle || 'Game',
        gameId: payload.gameId,
        duration: payload.duration || 30,
        thumbnailUrl: payload.thumbnailDataUrl || '',
        fileName: fileName,
        fileSize: buffer.length,
        createdAt: Date.now(),
        resolution: payload.resolution || '1080p',
        fps: payload.fps || 60,
        tags: payload.tags || ['highlight'],
      }

      fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), 'utf-8')

      return {
        success: true,
        clip: {
          ...meta,
          videoUrl: 'local-media://' + videoFilePath.replace(/\\/g, '/'),
          filePath: videoFilePath,
        },
      }
    } catch (err: any) {
      console.error('[Clips] save clip error:', err)
      return { success: false, error: err.message }
    }
  })

  // 3. List all clips from disk
  ipcMain.handle('clips:list', async () => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      if (!fs.existsSync(dir)) return []

      const files = fs.readdirSync(dir)
      const metaFiles = files.filter(f => f.endsWith('.json') && f.startsWith('clip_'))
      const clips: any[] = []

      for (const mf of metaFiles) {
        const metaPath = path.join(dir, mf)
        try {
          const raw = fs.readFileSync(metaPath, 'utf-8')
          const meta: ClipMetadata = JSON.parse(raw)
          const videoFilePath = path.join(dir, meta.fileName)
          
          if (fs.existsSync(videoFilePath)) {
            const stat = fs.statSync(videoFilePath)
            clips.push({
              ...meta,
              fileSize: stat.size,
              filePath: videoFilePath,
              videoUrl: 'local-media://' + videoFilePath.replace(/\\/g, '/'),
            })
          }
        } catch {
          // ignore corrupted metadata files
        }
      }

      // Sort by createdAt descending
      clips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return clips
    } catch (err: any) {
      console.error('[Clips] list clips error:', err)
      return []
    }
  })

  // 4. Delete clip
  ipcMain.handle('clips:delete', async (_, clipId: string) => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const metaPath = path.join(dir, clipId + '.json')
      if (fs.existsSync(metaPath)) {
        try {
          const raw = fs.readFileSync(metaPath, 'utf-8')
          const meta: ClipMetadata = JSON.parse(raw)
          const videoFilePath = path.join(dir, meta.fileName)
          if (fs.existsSync(videoFilePath)) {
            fs.unlinkSync(videoFilePath)
          }
        } catch (_) {}
        fs.unlinkSync(metaPath)
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 5. Rename clip or update tags
  ipcMain.handle('clips:update-meta', async (_, payload: { clipId: string; title: string; tags?: string[] }) => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const metaPath = path.join(dir, payload.clipId + '.json')
      if (fs.existsSync(metaPath)) {
        const raw = fs.readFileSync(metaPath, 'utf-8')
        const meta: ClipMetadata = JSON.parse(raw)
        meta.title = payload.title || meta.title
        if (payload.tags) meta.tags = payload.tags
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8')
        return { success: true, meta }
      }
      return { success: false, error: 'Clip not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 6. Open clip in explorer
  ipcMain.handle('clips:open-folder', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath)
        return { success: true }
      }
      const dir = getClipsDirectory()
      shell.openPath(dir)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 7. Copy clip to clipboard
  ipcMain.handle('clips:copy-file', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        clipboard.writeText(filePath)
        return { success: true }
      }
      return { success: false, error: 'File does not exist' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 8. Export clip
  ipcMain.handle('clips:export', async (_, payload: { filePath: string; suggestedName: string }) => {
    try {
      const ext = path.extname(payload.filePath) || '.mp4'
      const win = mainWindow || BrowserWindow.getFocusedWindow()
      const { canceled, filePath } = await dialog.showSaveDialog(win as any, {
        title: 'Export Clip',
        defaultPath: payload.suggestedName + ext,
        filters: [{ name: 'Video', extensions: [ext.replace('.', '')] }],
      })
      if (!canceled && filePath) {
        fs.copyFileSync(payload.filePath, filePath)
        return { success: true, exportedPath: filePath }
      }
      return { success: false, canceled: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 9. Get & save settings
  ipcMain.handle('clips:get-settings', async () => {
    return loadClipSettings()
  })

  ipcMain.handle('clips:save-settings', async (_, newSettings: Partial<ClipSettingsRecord>) => {
    const updated = saveClipSettings(newSettings)
    registerClipsGlobalHotkey(mainWindow)
    return updated
  })

  // 10. Select custom folder
  ipcMain.handle('clips:pick-folder', async () => {
    const win = mainWindow || BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win as any, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Eclipse Clips Folder',
    })
    if (!res.canceled && res.filePaths.length > 0) {
      return res.filePaths[0]
    }
    return null
  })
}
