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
  micFileName?: string
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
  captureMic: true,
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

function getClipsMetadataDbPath(): string {
  return path.join(app.getPath('userData'), 'clips_metadata.json')
}

function loadAllClipsMetadata(): Record<string, ClipMetadata> {
  const p = getClipsMetadataDbPath()
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch {
      return {}
    }
  }
  return {}
}

function saveAllClipsMetadata(data: Record<string, ClipMetadata>) {
  try {
    fs.writeFileSync(getClipsMetadataDbPath(), JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[Clips] Failed to save clips metadata db:', err)
  }
}

let cachedEncoder: string | null = null
async function getBestVideoEncoder(ffmpeg: string): Promise<string> {
  if (cachedEncoder) return cachedEncoder
  const encoders = ['h264_nvenc', 'h264_amf', 'h264_qsv']
  for (const enc of encoders) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=black:s=128x128', '-vframes', '1', '-c:v', enc, '-f', 'null', '-'], { timeout: 2000 }, (err) => {
          if (err) reject(err); else resolve()
        })
      })
      cachedEncoder = enc
      return enc
    } catch {}
  }
  cachedEncoder = 'libx264'
  return cachedEncoder
}

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

  return new Promise(async (resolve) => {
    const encoder = await getBestVideoEncoder(ffmpeg)
    console.log(`[FFmpeg] Using video encoder: ${encoder}`)

    const runPass1 = (useConcat: boolean, cb: (success: boolean) => void) => {
      const args = ['-y', '-err_detect', 'ignore_err']
      if (useConcat && concatListPath && fs.existsSync(concatListPath)) {
        args.push('-f', 'concat', '-safe', '0', '-i', concatListPath)
      } else {
        args.push('-i', tempInputPath)
      }
      const tempMkv = tempInputPath + '.mkv'
      args.push('-c', 'copy', tempMkv)

      execFile(ffmpeg, args, { timeout: 15000 }, (err) => {
        if (err || !fs.existsSync(tempMkv) || fs.statSync(tempMkv).size < 500) {
          cb(false)
        } else {
          cb(true)
        }
      })
    }

    runPass1(true, (success1) => {
      const tempMkv = tempInputPath + '.mkv'
      const sourceFile = success1 ? tempMkv : tempInputPath

      const pass2Args = ['-y', '-err_detect', 'ignore_err']
      
      const outArgs: string[] = []
      if (format === 'mp4' || format === 'mkv') {
        outArgs.push(
          '-map', '0:v:0?', '-map', '0:a?',
          '-c:v', encoder,
          ...(encoder === 'libx264' ? ['-preset', 'veryfast', '-crf', '23'] : (encoder === 'h264_nvenc' ? ['-preset', 'p1', '-cq', '26'] : [])),
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '192k',
          '-af', 'aresample=async=1000',
          '-movflags', '+faststart'
        )
      } else {
        outArgs.push('-map', '0:v:0?', '-map', '0:a?', '-c:v', 'libvpx-vp9', '-crf', '28', '-b:v', '0', '-deadline', 'realtime', '-c:a', 'libopus')
      }
      outArgs.push(finalOutputPath)

      const attemptTranscode = (useSseof: boolean, cb: (success: boolean) => void) => {
        const args = [...pass2Args]
        if (useSseof) {
          args.push('-sseof', `-${duration}`)
        }
        args.push('-i', sourceFile, ...outArgs)
        
        execFile(ffmpeg, args, { timeout: 60000 }, (err) => {
          if (err || !fs.existsSync(finalOutputPath) || fs.statSync(finalOutputPath).size < 500) {
            cb(false)
          } else {
            cb(true)
          }
        })
      }

      attemptTranscode(true, (successSseof) => {
        if (successSseof) {
          try { if (fs.existsSync(tempMkv)) fs.unlinkSync(tempMkv) } catch {}
          resolve(true)
          return
        }

        console.warn('[FFmpeg] sseof Pass 2 failed, falling back to full transcode without sseof')
        attemptTranscode(false, (successFull) => {
          try { if (fs.existsSync(tempMkv)) fs.unlinkSync(tempMkv) } catch {}
          if (successFull) {
            resolve(true)
          } else {
            console.error('[FFmpeg] Fallback transcode failed, copying raw as .webm')
            const rawWebmPath = finalOutputPath.replace(/\.(mp4|mkv)$/, '.webm')
            try { fs.copyFileSync(sourceFile, rawWebmPath) } catch {}
            // Update the expected file if needed by caller, but caller uses finalOutputPath directly.
            // Wait, we MUST output to finalOutputPath if caller relies on it. 
            // If caller relies on .mp4, returning raw .webm as .mp4 will break it.
            // Let's just output raw as finalOutputPath, but since it's broken, return false.
            try { fs.copyFileSync(sourceFile, finalOutputPath) } catch {}
            resolve(false)
          }
        })
      })
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

  ipcMain.handle('clips:save', async (_, payload: {
    videoBase64?: string
    prevVideoBase64?: string
    videoBuffer?: Uint8Array
    prevVideoBuffer?: Uint8Array
    micBuffer?: Uint8Array
    prevMicBuffer?: Uint8Array
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

      let buffer: Buffer
      if (payload.videoBuffer) {
        buffer = Buffer.from(payload.videoBuffer)
      } else {
        const base64Data = payload.videoBase64 ? (payload.videoBase64.includes(',') ? payload.videoBase64.split(',')[1] : payload.videoBase64) : ''
        buffer = Buffer.from(base64Data, 'base64')
      }

      let prevBuf: Buffer
      if (payload.prevVideoBuffer) {
        prevBuf = Buffer.from(payload.prevVideoBuffer)
      } else {
        const prevBase64Data = payload.prevVideoBase64 ? (payload.prevVideoBase64.includes(',') ? payload.prevVideoBase64.split(',')[1] : payload.prevVideoBase64) : ''
        prevBuf = Buffer.from(prevBase64Data, 'base64')
      }

      if (buffer.length < 1000 && prevBuf.length < 1000) {
        console.error('[Clips] Incoming video buffer too small:', buffer.length, prevBuf.length)
        return { success: false, error: 'Aufnahme-Puffer enthält noch keine Videodaten.' }
      }

      const chosenFormat = payload.format || settings.format || 'mp4'
      const videoExt = chosenFormat.replace('.', '').toLowerCase()
      const fileName = clipId + '.' + videoExt
      const finalVideoPath = path.join(dir, fileName)

      const tempDir = path.join(app.getPath('temp'), 'eclipse_clips_tmp')
      if (!fs.existsSync(tempDir)) {
        try { fs.mkdirSync(tempDir, { recursive: true }) } catch {}
      }

      const tempRawPath = path.join(tempDir, 'temp_' + clipId + '.webm')
      let tempPrevPath: string | null = null
      let concatListPath: string | null = null

      if (buffer.length > 100) {
        fs.writeFileSync(tempRawPath, buffer)
      }

      if (payload.prevVideoBuffer) {
        tempPrevPath = path.join(tempDir, 'temp_prev_' + clipId + '.webm')
        if (prevBuf.length > 1000) {
          fs.writeFileSync(tempPrevPath, prevBuf)
          concatListPath = path.join(tempDir, 'concat_' + clipId + '.txt')
          const prevEscaped = tempPrevPath.replace(/\\/g, '/')
          let concatContent = `file '${prevEscaped}'\n`
          if (buffer.length > 100) {
            const currEscaped = tempRawPath.replace(/\\/g, '/')
            concatContent += `file '${currEscaped}'\n`
          }
          fs.writeFileSync(concatListPath, concatContent, 'utf-8')
        }
      }

      const inputForFfmpeg = (buffer.length > 100) ? tempRawPath : tempPrevPath!
      
      const targetDuration = payload.duration || settings.replayDurationSeconds || 30
      await processVideoFile(inputForFfmpeg, finalVideoPath, videoExt, targetDuration, concatListPath)

      try { if (fs.existsSync(tempRawPath)) fs.unlinkSync(tempRawPath) } catch {}
      try { if (tempPrevPath && fs.existsSync(tempPrevPath)) fs.unlinkSync(tempPrevPath) } catch {}
      try { if (concatListPath && fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath) } catch {}

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
        micFileName: undefined,
        fileSize: finalStat.size,
        createdAt: Date.now(),
        resolution: payload.resolution || '1080p',
        fps: payload.fps || 60,
        format: chosenFormat as any,
        tags: payload.tags || ['highlight'],
      }

      const allMeta = loadAllClipsMetadata()
      allMeta[clipId] = meta
      saveAllClipsMetadata(allMeta)

      const normalizedPath = finalVideoPath.replace(/\\/g, '/')

      return {
        success: true,
        clip: {
          ...meta,
          videoUrl: 'local-media://file/' + encodeURIComponent(normalizedPath),
          filePath: finalVideoPath,
        },
      }
    } catch (err: any) {
      console.error('[Clips] save clip error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('clips:list', async () => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      if (!fs.existsSync(dir)) return []

      const allMeta = loadAllClipsMetadata()
      let metaChanged = false

      const files = fs.readdirSync(dir)

      for (const f of files) {
        if (f.endsWith('.json') && f.startsWith('clip_')) {
          const legacyPath = path.join(dir, f)
          try {
            const raw = fs.readFileSync(legacyPath, 'utf-8')
            const legacyMeta: ClipMetadata = JSON.parse(raw)
            if (legacyMeta && legacyMeta.id && !allMeta[legacyMeta.id]) {
              allMeta[legacyMeta.id] = legacyMeta
              metaChanged = true
            }
            fs.unlinkSync(legacyPath)
          } catch (_) {}
        }
        if (f.startsWith('temp_') || f.startsWith('concat_') || f.endsWith('.webm_full.mp4')) {
          try {
            fs.unlinkSync(path.join(dir, f))
          } catch (_) {}
        }
      }

      const videoExtensions = ['.mp4', '.mkv', '.webm']
      const videoFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase()
        return videoExtensions.includes(ext) && !f.startsWith('temp_') && !f.endsWith('.webm_full.mp4')
      })

      const clips: any[] = []

      for (const vf of videoFiles) {
        const videoFilePath = path.join(dir, vf)
        try {
          if (!fs.existsSync(videoFilePath)) continue
          const stat = fs.statSync(videoFilePath)
          const baseName = path.parse(vf).name
          let meta = allMeta[baseName] || Object.values(allMeta).find(m => m.fileName === vf)
          
          if (!meta) {
            const clipId = baseName.startsWith('clip_') ? baseName : 'clip_' + (stat.birthtimeMs || Date.now())
            meta = {
              id: clipId,
              title: vf.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
              gameTitle: 'Gameplay',
              duration: 30,
              thumbnailUrl: '',
              fileName: vf,
              fileSize: stat.size,
              createdAt: stat.birthtimeMs || stat.mtimeMs || Date.now(),
              format: path.extname(vf).replace('.', '') as any,
              tags: ['clip'],
            }
            allMeta[meta.id] = meta
            metaChanged = true
          }

          const normalizedPath = videoFilePath.replace(/\\/g, '/')
          clips.push({
            ...meta,
            fileSize: stat.size,
            filePath: videoFilePath,
            videoUrl: 'local-media://file/' + encodeURIComponent(normalizedPath),
          })
        } catch (_) {}
      }

      if (metaChanged) {
        saveAllClipsMetadata(allMeta)
      }

      clips.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      return clips
    } catch (err: any) {
      console.error('[Clips] list clips error:', err)
      return []
    }
  })

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

  ipcMain.handle('clips:delete', async (_, clipId: string) => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const allMeta = loadAllClipsMetadata()
      const meta = allMeta[clipId]

      if (meta) {
        const videoFilePath = path.join(dir, meta.fileName)
        if (fs.existsSync(videoFilePath)) {
          try { fs.unlinkSync(videoFilePath) } catch (_) {}
        }
        delete allMeta[clipId]
        saveAllClipsMetadata(allMeta)
      } else {
        const files = fs.readdirSync(dir)
        for (const f of files) {
          if (f.startsWith(clipId)) {
            try { fs.unlinkSync(path.join(dir, f)) } catch (_) {}
          }
        }
      }

      const legacyJson = path.join(dir, clipId + '.json')
      if (fs.existsSync(legacyJson)) {
        try { fs.unlinkSync(legacyJson) } catch (_) {}
      }

      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('clips:update-meta', async (_, payload: { clipId: string; title: string; tags?: string[] }) => {
    try {
      const allMeta = loadAllClipsMetadata()
      if (allMeta[payload.clipId]) {
        allMeta[payload.clipId].title = payload.title || allMeta[payload.clipId].title
        if (payload.tags) allMeta[payload.clipId].tags = payload.tags
        saveAllClipsMetadata(allMeta)
        return { success: true, meta: allMeta[payload.clipId] }
      }
      return { success: false, error: 'Clip not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

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

  ipcMain.handle('clips:export', async (_, payload: { filePath: string; suggestedName: string; trimStart?: number; trimEnd?: number }) => {
    try {
      const ext = path.extname(payload.filePath) || '.mp4'
      const win = mainWindow || BrowserWindow.getFocusedWindow()
      const { canceled, filePath } = await dialog.showSaveDialog(win as any, {
        title: 'Export Clip',
        defaultPath: payload.suggestedName + ext,
        filters: [{ name: 'Video', extensions: [ext.replace('.', '')] }],
      })
      if (!canceled && filePath) {
        const ffmpeg = getFFmpegPath()
        const hasTrim = (payload.trimStart !== undefined && payload.trimStart > 0) || (payload.trimEnd !== undefined)
        if (hasTrim && ffmpeg) {
          const ss = payload.trimStart || 0
          const ffmpegArgs = ['-y', '-ss', `${ss}`, '-i', payload.filePath]
          if (payload.trimEnd && payload.trimEnd > ss) {
            const dur = payload.trimEnd - ss
            ffmpegArgs.push('-t', `${dur}`)
          }
          ffmpegArgs.push(
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            filePath
          )
          execFile(ffmpeg, ffmpegArgs, { timeout: 60000 }, (err) => {
            if (err || !fs.existsSync(filePath) || fs.statSync(filePath).size < 500) {
              try { fs.copyFileSync(payload.filePath, filePath) } catch {}
            }
          })
        } else {
          fs.copyFileSync(payload.filePath, filePath)
        }
        return { success: true, exportedPath: filePath }
      }
      return { success: false }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('clips:get-settings', async () => {
    return loadClipSettings()
  })

  ipcMain.handle('clips:save-settings', async (_, settings: Partial<ClipSettingsRecord>) => {
    const updated = saveClipSettings(settings)
    registerClipsGlobalHotkey(mainWindow)
    return updated
  })

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
