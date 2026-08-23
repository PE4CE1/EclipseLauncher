import { app, ipcMain, desktopCapturer, shell, dialog, globalShortcut, clipboard, BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'

// Resolve ffmpeg-static path
function getFFmpegPath(): string | null {
  try {
    const ffmpegModule = require('ffmpeg-static')
    if (ffmpegModule && typeof ffmpegModule === 'string' && fs.existsSync(ffmpegModule)) {
      return ffmpegModule
    }
  } catch {}

  const fallback = path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe')
  if (fs.existsSync(fallback)) {
    return fallback
  }
  return null
}

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
  format?: 'mp4' | 'webm' | 'mkv'
  tags?: string[]
}

export interface ClipSettingsRecord {
  enabled: boolean
  replayDurationSeconds: number
  hotkey: string
  fullRecordHotkey?: string
  qualityPreset?: 'low' | 'standard' | 'high' | 'custom'
  quality: '4k' | '1440p' | '1080p' | '720p' | '480p' | '360p'
  fps: 120 | 60 | 30 | 24
  bitrate?: '20M' | '15M' | '10M' | '8M' | '5M' | 'auto' | 'ultra' | 'high' | 'medium' | 'low'
  videoEncoder?: 'gpu' | 'cpu'
  selectedGpu?: string
  codec?: 'h264' | 'hevc' | 'av1' | 'vp9'
  format?: 'mp4' | 'webm' | 'mkv'
  audioRecordingOption?: 'all' | 'game_only' | 'game_and_discord'
  audioOutputDeviceId?: string
  audioOutputVolume?: number
  captureMic: boolean
  monoAudioInput?: boolean
  micDeviceId?: string
  micVolume: number
  gameAudioVolume?: number
  selectedMonitorId?: string
  screenRecordingOnAppStart?: boolean
  savePath?: string
  notifyOnClip: boolean
  playSoundOnClip?: boolean
  autoStartOnGame?: boolean
  maxStorageGB?: number
}

const DEFAULT_SETTINGS: ClipSettingsRecord = {
  enabled: true,
  replayDurationSeconds: 30,
  hotkey: 'F8',
  fullRecordHotkey: 'F9',
  qualityPreset: 'high',
  quality: '1080p',
  fps: 60,
  bitrate: '10M',
  videoEncoder: 'gpu',
  selectedGpu: 'auto',
  codec: 'h264',
  format: 'mp4',
  audioRecordingOption: 'all',
  audioOutputDeviceId: 'auto',
  audioOutputVolume: 100,
  captureMic: false,
  monoAudioInput: false,
  micDeviceId: 'auto',
  micVolume: 80,
  gameAudioVolume: 100,
  selectedMonitorId: 'screen:0:0',
  screenRecordingOnAppStart: false,
  notifyOnClip: true,
  playSoundOnClip: true,
  autoStartOnGame: true,
  maxStorageGB: 25,
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

/**
 * Process Raw Video Chunk with FFmpeg to produce a pristine, exact-duration valid video file
 */
async function processVideoFile(
  tempInputPath: string, 
  finalOutputPath: string, 
  format: string, 
  targetDurationSec: number,
  concatListPath?: string | null
): Promise<boolean> {
  const ffmpeg = getFFmpegPath()
  if (!ffmpeg || !fs.existsSync(ffmpeg)) {
    fs.copyFileSync(tempInputPath, finalOutputPath)
    return true
  }

  const duration = targetDurationSec > 0 ? targetDurationSec : 30

  return new Promise((resolve) => {
    const args: string[] = ['-y', '-err_detect', 'ignore_err']

    if (concatListPath && fs.existsSync(concatListPath)) {
      args.push('-f', 'concat', '-safe', '0', '-i', concatListPath)
    } else {
      args.push('-i', tempInputPath)
    }

    args.push(
      '-sseof', `-${duration}`,
      '-t', `${duration}`,
      '-avoid_negative_ts', 'make_zero',
      '-fflags', '+genpts+discardcorrupt'
    )

    if (format === 'mp4') {
      args.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        '-movflags', '+faststart',
        finalOutputPath
      )
    } else if (format === 'mkv') {
      args.push(
        '-c:v', 'copy',
        '-c:a', 'copy',
        finalOutputPath
      )
    } else {
      // webm
      args.push(
        '-c:v', 'libvpx-vp9',
        '-crf', '28',
        '-b:v', '0',
        '-c:a', 'libopus',
        finalOutputPath
      )
    }

    execFile(ffmpeg, args, { timeout: 45000 }, (err, stdout, stderr) => {
      if (err || !fs.existsSync(finalOutputPath) || fs.statSync(finalOutputPath).size < 500) {
        console.warn('[FFmpeg] Direct trim attempt on input:', err?.message || 'File empty')
        // Fallback without -sseof to transcode all available content
        const fallbackArgs = ['-y', '-err_detect', 'ignore_err', '-i', tempInputPath]
        if (format === 'mp4') {
          fallbackArgs.push(
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '160k',
            '-movflags', '+faststart',
            finalOutputPath
          )
        } else {
          fallbackArgs.push(
            '-c:v', 'copy',
            '-c:a', 'copy',
            finalOutputPath
          )
        }
        execFile(ffmpeg, fallbackArgs, { timeout: 45000 }, (fErr) => {
          if (fErr || !fs.existsSync(finalOutputPath) || fs.statSync(finalOutputPath).size < 500) {
            console.warn('[FFmpeg] Fallback copy initiated')
            try {
              fs.copyFileSync(tempInputPath, finalOutputPath)
            } catch {}
          }
          resolve(fs.existsSync(finalOutputPath))
        })
        return
      }
      resolve(true)
    })
  })
}

let activeReplayHotkey: string | null = null
let activeRecordHotkey: string | null = null

export function registerClipsGlobalHotkey(mainWindow?: BrowserWindow) {
  const settings = loadClipSettings()
  
  if (activeReplayHotkey) {
    try { globalShortcut.unregister(activeReplayHotkey) } catch {}
    activeReplayHotkey = null
  }
  if (activeRecordHotkey) {
    try { globalShortcut.unregister(activeRecordHotkey) } catch {}
    activeRecordHotkey = null
  }

  if (!settings.enabled) return

  const replayHk = settings.hotkey || 'F8'
  try {
    const success = globalShortcut.register(replayHk, () => {
      const targetWindow = mainWindow || BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('clips:hotkey-pressed', { action: 'replay', hotkey: replayHk })
      }
    })
    if (success) {
      activeReplayHotkey = replayHk
    }
  } catch (err) {
    console.warn('[Clips] Error registering global replay hotkey:', replayHk, err)
  }

  if (settings.fullRecordHotkey && settings.fullRecordHotkey !== replayHk) {
    try {
      const success = globalShortcut.register(settings.fullRecordHotkey, () => {
        const targetWindow = mainWindow || BrowserWindow.getAllWindows().find(w => !w.isDestroyed())
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('clips:hotkey-pressed', { action: 'full_record', hotkey: settings.fullRecordHotkey })
        }
      })
      if (success) {
        activeRecordHotkey = settings.fullRecordHotkey
      }
    } catch {}
  }
}

export function initClipsIPC(mainWindow?: BrowserWindow) {
  getClipsDirectory()
  registerClipsGlobalHotkey(mainWindow)

  // 1. Get screen / window capture sources
  ipcMain.handle('clips:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
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

  // 2. Save clip buffer to disk with FFmpeg processing
  ipcMain.handle('clips:save', async (_, payload: {
    videoBase64: string
    prevVideoBase64?: string
    title: string
    gameTitle: string
    gameId?: string | number
    duration: number
    thumbnailDataUrl: string
    resolution?: string
    fps?: number
    format?: 'mp4' | 'webm' | 'mkv'
    tags?: string[]
  }) => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const clipId = 'clip_' + Date.now()

      const base64Data = payload.videoBase64.replace(/^data:video\/[\w-]+;base64,/, '')
      const buffer = Buffer.from(base64Data, 'base64')

      if (buffer.length < 1000) {
        console.error('[Clips] Incoming video buffer too small:', buffer.length)
        return { success: false, error: 'Aufnahme-Puffer enthält noch keine Videodaten.' }
      }

      const chosenFormat = payload.format || settings.format || 'mp4'
      const videoExt = chosenFormat.replace('.', '').toLowerCase()
      const fileName = clipId + '.' + videoExt
      const finalVideoPath = path.join(dir, fileName)
      const tempRawPath = path.join(dir, 'temp_' + clipId + '.webm')
      const metaFilePath = path.join(dir, clipId + '.json')

      let tempPrevPath: string | null = null
      let concatListPath: string | null = null

      // 1. Write current memory buffer to temporary file
      fs.writeFileSync(tempRawPath, buffer)

      // Optional previous session for continuous stitching
      if (payload.prevVideoBase64) {
        tempPrevPath = path.join(dir, 'temp_prev_' + clipId + '.webm')
        const prevBase64Data = payload.prevVideoBase64.replace(/^data:video\/[\w-]+;base64,/, '')
        const prevBuf = Buffer.from(prevBase64Data, 'base64')
        if (prevBuf.length > 1000) {
          fs.writeFileSync(tempPrevPath, prevBuf)
          concatListPath = path.join(dir, 'concat_' + clipId + '.txt')
          const prevEscaped = tempPrevPath.replace(/\\/g, '/')
          const currEscaped = tempRawPath.replace(/\\/g, '/')
          fs.writeFileSync(concatListPath, `file '${prevEscaped}'\nfile '${currEscaped}'\n`, 'utf-8')
        }
      }

      // 2. Process with FFmpeg into clean, valid MP4/WebM/MKV with exact trimmed duration
      const targetDuration = payload.duration || settings.replayDurationSeconds || 30
      await processVideoFile(tempRawPath, finalVideoPath, videoExt, targetDuration, concatListPath)

      // 3. Remove temporary files
      if (fs.existsSync(tempRawPath)) {
        try { fs.unlinkSync(tempRawPath) } catch {}
      }
      if (tempPrevPath && fs.existsSync(tempPrevPath)) {
        try { fs.unlinkSync(tempPrevPath) } catch {}
      }
      if (concatListPath && fs.existsSync(concatListPath)) {
        try { fs.unlinkSync(concatListPath) } catch {}
      }

      if (!fs.existsSync(finalVideoPath) || fs.statSync(finalVideoPath).size < 500) {
        console.error('[Clips] Final video file does not exist after processing')
        return { success: false, error: 'Video-Konvertierung fehlgeschlagen.' }
      }

      const finalStat = fs.statSync(finalVideoPath)

      const meta: ClipMetadata = {
        id: clipId,
        title: payload.title || ((payload.gameTitle || 'Gameplay') + ' Clip'),
        gameTitle: payload.gameTitle || 'Game',
        gameId: payload.gameId,
        duration: payload.duration || 30,
        thumbnailUrl: payload.thumbnailDataUrl || '',
        fileName: fileName,
        fileSize: finalStat.size,
        createdAt: Date.now(),
        resolution: payload.resolution || '1080p',
        fps: payload.fps || 60,
        format: chosenFormat as any,
        tags: payload.tags || ['highlight'],
      }

      fs.writeFileSync(metaFilePath, JSON.stringify(meta, null, 2), 'utf-8')

      const normalizedPath = finalVideoPath.replace(/\\/g, '/')

      return {
        success: true,
        clip: {
          ...meta,
          videoUrl: 'local-media://' + encodeURIComponent(normalizedPath),
          filePath: finalVideoPath,
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
            const normalizedPath = videoFilePath.replace(/\\/g, '/')
            clips.push({
              ...meta,
              fileSize: stat.size,
              filePath: videoFilePath,
              videoUrl: 'local-media://' + encodeURIComponent(normalizedPath),
            })
          }
        } catch {}
      }

      clips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return clips
    } catch (err: any) {
      console.error('[Clips] list clips error:', err)
      return []
    }
  })

  // 4. Read Video Data URL as 100% fail-safe fallback
  ipcMain.handle('clips:read-video-data', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const buf = fs.readFileSync(filePath)
        const ext = path.extname(filePath).toLowerCase()
        const mime = ext === '.webm' ? 'video/webm' : ext === '.mkv' ? 'video/x-matroska' : 'video/mp4'
        return { success: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}` }
      }
      return { success: false, error: 'File not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // 5. Delete clip
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

  // 6. Rename clip or update tags
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

  // 7. Open clip in explorer
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

  // 8. Copy clip to clipboard
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

  // 9. Export clip
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

  // 10. Get & save settings
  ipcMain.handle('clips:get-settings', async () => {
    return loadClipSettings()
  })

  ipcMain.handle('clips:save-settings', async (_, newSettings: Partial<ClipSettingsRecord>) => {
    const updated = saveClipSettings(newSettings)
    registerClipsGlobalHotkey(mainWindow)
    return updated
  })

  // 11. Select custom folder
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
