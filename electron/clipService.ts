import { openExternalPath } from './externalLaunch'
import { app, desktopCapturer, shell, dialog, globalShortcut, clipboard, ClipboardItem, BrowserWindow } from 'electron'
import { ipcMain } from './ipcSecurity'
import { writeJsonAtomicSync } from './jsonStorage'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import { randomUUID } from 'crypto'
import { showClipSavedToast } from './overlayManager'
import { encodeReplay, inspectMedia, extractWaveform, exportEditedClip, type MediaFacts, type ReplayAudioFiles, type ReplayTiming, type ReplayHistorySegment } from './clipMedia'
import { DEFAULT_CLIP_AUDIO_SETTINGS } from '../src/services/clipAudioDefaults'
import { DISCORD_FILE_LIMIT_BYTES } from '../src/services/clipSharing'
import { ClipExportCache } from './clipExportCache'
import { validateClipDraftInput, type ClipEditDraft } from '../src/services/clipEdits'
import type { ClipAnalysis, EclipseClip } from '../src/types/game'
import { initClipSharing } from './clipShareService'
import { createBoundedWorkQueue } from '../src/services/boundedWorkQueue'
import { initProcessAudioCapture, freezeProcessAudio, snapshotProcessAudio } from './processAudioCapture'
import { initMicrophoneCapture } from './microphoneCapture'
import { getAutoClipStatus, setupAutoClipGame, refreshAutoClipSettings } from './autoClipService'
import type { AutoClipOptions } from '../src/types/autoClips'
import { rocketPlayerId } from './rocketLeagueEvents'
import type {ReplayLease} from './clipMedia'
import {initNativeCapture,takeNativeSnapshot} from './nativeCaptureService'
import {storeClipThumbnail,removeClipThumbnail} from './clipThumbnails'

// Resolve ffmpeg-static path
export function getFFmpegPath(): string | null {
  try {
    const ffmpegModule = require('ffmpeg-static')
    if (ffmpegModule && typeof ffmpegModule === 'string') {
      const physicalPath = ffmpegModule.replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2')
      if (fs.existsSync(physicalPath)) return physicalPath
      if (!/(^|[\\/])app\.asar([\\/]|$)/i.test(ffmpegModule) && fs.existsSync(ffmpegModule)) return ffmpegModule
    }
  } catch {}

  const fallback = path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', 'ffmpeg.exe').replace(/([\\/])app\.asar([\\/])/i, '$1app.asar.unpacked$2')
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
  applicationAudio?: boolean
  discordFileName?: string
  gameAudioFileName?: string
  desktopAudioFileName?: string
  mediaVersion?: number
  width?: number
  height?: number
  averageFps?: number
  videoFileSize?: number
  audioFileSize?: number
  requestedFps?: number
  requestedResolution?: string
  requestedBitrate?: string
  captureWidth?: number
  captureHeight?: number
  captureFps?: number
  hasGameAudio?: boolean
  hasMicAudio?: boolean
  fileSize: number
  createdAt: number
  resolution?: string
  fps?: number
  bitrate?: string
  format?: 'mp4' | 'webm' | 'mkv'
  tags?: string[]
  editDraft?: ClipEditDraft
}

export interface ClipSettingsRecord extends AutoClipOptions {
  enabled: boolean
  replayDurationSeconds: number
  hotkey: string
  fullRecordHotkey?: string
  qualityPreset?: 'low' | 'standard' | 'high' | 'custom'
  quality: '4k' | '1440p' | '1080p' | '720p' | '480p' | '360p'
  fps: 120 | 60 | 30 | 24
  bitrate?: '50M' | '30M' | '20M' | '15M' | '10M' | '8M' | '5M' | 'auto' | 'ultra' | 'high' | 'medium' | 'low' | string
  videoEncoder?: 'gpu' | 'cpu'
  selectedGpu?: string
  codec?: 'h264' | 'hevc' | 'av1' | 'vp9'
  format?: 'mp4' | 'webm' | 'mkv'
  separateApplications?: boolean
  gameAudioProcess?: string
  captureDiscord?: boolean
  captureDesktop?: boolean
  audioRecordingOption?: 'all' | 'game_only' | 'game_and_discord'
  audioOutputDeviceId?: string
  audioOutputVolume?: number
  captureMic: boolean
  monoAudioInput?: boolean
  micDeviceId?: string
  micVolume: number
  micSensitivity?: number
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
  qualityPreset: 'standard',
  quality: '720p',
  fps: 60,
  bitrate: '6M',
  videoEncoder: 'gpu',
  selectedGpu: 'auto',
  codec: 'h264',
  format: 'mp4',
  audioRecordingOption: 'all',
  audioOutputDeviceId: 'auto',
  audioOutputVolume: 100,
  ...DEFAULT_CLIP_AUDIO_SETTINGS,
  micDeviceId: 'auto',
  micVolume: 80,
  micSensitivity: -40,
  gameAudioVolume: 100,
  gameAudioProcess: 'auto',
  selectedMonitorId: 'screen:0:0',
  screenRecordingOnAppStart: false,
  notifyOnClip: true,
  playSoundOnClip: true,
  autoStartOnGame: true,
  maxStorageGB: 25,
  autoClipEnabled: false,
  autoClipRocketLeagueEnabled: false,
  autoClipCS2Enabled: true,
  autoClipDota2Enabled: false,
  autoClipLoLEnabled: false,
  autoClipCooldownSeconds: 15,
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

export function loadClipSettings(): ClipSettingsRecord {
  const p = getSettingsPath()
  if (fs.existsSync(p)) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      const res = { ...DEFAULT_SETTINGS, ...data }
      delete res.captureEngine
      if (typeof res.micSensitivity === 'number' && res.micSensitivity > 0) {
        res.micSensitivity = -40
      }
      // Ensure standard preset is the default for all users unless explicitly configured
      if (!res.qualityPreset || !['low', 'standard', 'high', 'custom'].includes(res.qualityPreset)) {
        res.qualityPreset = 'standard'
        res.quality = '720p'
        res.fps = 60
        res.bitrate = '6M'
      } else if (res.qualityPreset === 'standard') {
        res.bitrate = '6M'
      }
      return res
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }
  return { ...DEFAULT_SETTINGS }
}

function saveClipSettings(settings: Partial<ClipSettingsRecord>) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Invalid clip settings')
  settings={...settings};delete (settings as Record<string,unknown>).captureEngine
  for (const [key,value] of Object.entries(settings)) if (key.startsWith('autoClip') && !['autoClipCooldownSeconds','autoClipRocketLeaguePlayerId'].includes(key) && typeof value !== 'boolean') throw new Error('Invalid automatic clipping setting')
  if (settings.autoClipRocketLeaguePlayerId !== undefined && settings.autoClipRocketLeaguePlayerId !== '' && !rocketPlayerId(settings.autoClipRocketLeaguePlayerId)) throw new Error('Invalid Rocket League player ID')
  for (const key of ['rocketLeagueClipDurationSeconds','overwatchClipDurationSeconds'] as const) if (settings[key] !== undefined && settings[key] !== 0 && (!Number.isSafeInteger(settings[key]) || settings[key]! < 5 || settings[key]! > 600)) throw new Error('Invalid game clip duration')
  if (settings.autoClipCooldownSeconds !== undefined && (!Number.isFinite(settings.autoClipCooldownSeconds) || settings.autoClipCooldownSeconds < 5 || settings.autoClipCooldownSeconds > 120)) throw new Error('Invalid auto clip interval')
  if (settings.replayDurationSeconds !== undefined && (!Number.isFinite(settings.replayDurationSeconds) || settings.replayDurationSeconds < 5 || settings.replayDurationSeconds > 600)) throw new Error('Replay duration must be between 5 and 600 seconds')
  if (settings.format !== undefined && !['mp4', 'webm', 'mkv'].includes(settings.format)) throw new Error('Invalid clip format')
  if (settings.fps !== undefined && ![24, 30, 60, 120].includes(settings.fps)) throw new Error('Invalid clip frame rate')
  if (settings.quality !== undefined && !['360p','480p','720p','1080p','1440p','4k'].includes(settings.quality)) throw new Error('Invalid clip resolution')
  if (settings.videoEncoder !== undefined && !['gpu','cpu'].includes(settings.videoEncoder)) throw new Error('Invalid video encoder')
  for (const field of ['micVolume','audioOutputVolume','gameAudioVolume'] as const) if (settings[field] !== undefined && (!Number.isFinite(settings[field]) || settings[field]! < 0 || settings[field]! > 100)) throw new Error('Invalid audio level')
  if (settings.micSensitivity !== undefined && (!Number.isFinite(settings.micSensitivity) || settings.micSensitivity < -60 || settings.micSensitivity > -10)) throw new Error('Invalid microphone threshold')
  if (settings.bitrate !== undefined && settings.bitrate !== 'auto' && !['ultra','high','medium','low'].includes(String(settings.bitrate)) && (!/^\d+(?:\.\d+)?M?$/i.test(String(settings.bitrate)) || parseFloat(String(settings.bitrate)) < .5 || parseFloat(String(settings.bitrate)) > 100)) throw new Error('Invalid recording bitrate')
  for (const key of ['separateApplications','captureDiscord','captureDesktop'] as const) if(settings[key] !== undefined && typeof settings[key] !== 'boolean') throw new Error('Invalid application audio setting')
  if(settings.gameAudioProcess !== undefined && !['auto','none'].includes(settings.gameAudioProcess) && !/^[^\\/\r\n]{1,195}\.exe$/i.test(settings.gameAudioProcess)) throw new Error('Invalid audio application')
  const current = loadClipSettings()
  const updated = { ...current, ...settings }
  if (typeof updated.micSensitivity === 'number' && updated.micSensitivity > 0) {
    updated.micSensitivity = -40
  }
  writeJsonAtomicSync(getSettingsPath(), updated)
  return updated
}

function getClipsMetadataDbPath(): string {
  return path.join(app.getPath('userData'), 'clips_metadata.json')
}

let metadataCache:{path:string;signature:string;data:Record<string,ClipMetadata>}|undefined
const metadataSignature=(stat:fs.Stats)=>`${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`

function loadAllClipsMetadata(): Record<string, ClipMetadata> {
  const p = getClipsMetadataDbPath()
  if (fs.existsSync(p)) {
    try {
      const signature=metadataSignature(fs.statSync(p))
      if(metadataCache?.path===p&&metadataCache.signature===signature)return metadataCache.data
      const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const data=Object.fromEntries(Object.entries(parsed).filter(([id, value]) => {
        if (!validClipId(id) || !value || typeof value !== 'object') return false
        const meta = value as Partial<ClipMetadata>
        return typeof meta.fileName === 'string' && path.basename(meta.fileName) === meta.fileName &&
          ['.mp4', '.webm', '.mkv'].includes(path.extname(meta.fileName).toLowerCase())
      })) as Record<string, ClipMetadata>
      metadataCache={path:p,signature,data}
      return data
    } catch {
      return {}
    }
  }
  metadataCache=undefined
  return {}
}

function saveAllClipsMetadata(data: Record<string, ClipMetadata>) {
  const file=getClipsMetadataDbPath()
  writeJsonAtomicSync(file, data)
  metadataCache={path:file,signature:metadataSignature(fs.statSync(file)),data}
}

function audioBytes(directory: string, meta: ClipMetadata): number {
  return [meta.gameAudioFileName, meta.micFileName, meta.discordFileName, meta.desktopAudioFileName].reduce((sum, name) => {
    if (!name) return sum
    try { const file = clipFilePath(directory, name, true); return sum + (fs.existsSync(file) ? fs.statSync(file).size : 0) } catch { return sum }
  }, 0)
}

const analysisCache = new Map<string, { key: string; result: ClipAnalysis & { clip: EclipseClip } }>()
const analysisPending = new Map<string, Promise<ClipAnalysis>>()
const measuredMedia = new Map<string, { size: number; mtime: number; facts: MediaFacts }>()
function rememberMedia(file: string, facts: MediaFacts) {
  const stat = fs.statSync(file)
  measuredMedia.set(file, { size: stat.size, mtime: stat.mtimeMs, facts })
  while (measuredMedia.size > 24) measuredMedia.delete(measuredMedia.keys().next().value!)
}
function knownMedia(file: string): MediaFacts | undefined {
  const cached = measuredMedia.get(file)
  if (!cached) return
  const stat = fs.statSync(file)
  if (cached.size === stat.size && cached.mtime === stat.mtimeMs) return cached.facts
  measuredMedia.delete(file)
}

function validClipId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 &&
    !/[\\/\x00]/.test(value) && value !== '.' && value !== '..' &&
    !['__proto__', 'constructor', 'prototype'].includes(value)
}

function clipFilePath(directory: string, fileName: unknown, audio = false): string {
  if (typeof fileName !== 'string' || path.basename(fileName) !== fileName ||
    !(audio ? ['.m4a', '.webm', '.wav', '.ogg'] : ['.mp4', '.webm', '.mkv']).includes(path.extname(fileName).toLowerCase())) throw new Error('Invalid clip filename')
  const candidate = path.join(directory, fileName)
  if (fs.existsSync(candidate) && (path.dirname(fs.realpathSync(candidate)).toLowerCase() !== fs.realpathSync(directory).toLowerCase() || !fs.statSync(candidate).isFile())) throw new Error('Clip is outside the configured clips directory')
  return candidate
}

function requireManagedClipPath(filePath: unknown): string {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('Invalid clip path')
  const directory = getClipsDirectory(loadClipSettings().savePath)
  const candidate = clipFilePath(directory, path.basename(filePath))
  if (path.resolve(candidate).toLowerCase() !== path.resolve(filePath).toLowerCase()) throw new Error('Clip is outside the configured clips directory')
  return candidate
}

let cachedEncoder: string | null = null
async function getBestVideoEncoder(ffmpeg: string): Promise<string> {
  if (cachedEncoder) return cachedEncoder
  const encoders = ['h264_nvenc', 'h264_amf', 'h264_qsv']
  for (const enc of encoders) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=black:s=640x360', '-vframes', '1', '-c:v', enc, '-f', 'null', '-'], { timeout: 2000, windowsHide: true }, (err) => {
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


async function checkMediaStreams(ffmpeg: string, filePath: string): Promise<{ hasVideo: boolean; hasAudio: boolean; audioCodec?: string }> {
  return new Promise((resolve) => {
    execFile(ffmpeg, ['-i', filePath], { timeout: 5000, windowsHide: true }, (_err, _stdout, stderr) => {
      const errStr = stderr || ''
      const hasVideo = /Stream #\d+:\d+.*Video:/i.test(errStr)
      const audioMatch = errStr.match(/Stream #\d+:\d+.*Audio:\s*([a-zA-Z0-9_]+)/i)
      const hasAudio = Boolean(audioMatch)
      const audioCodec = audioMatch ? audioMatch[1].toLowerCase() : undefined
      resolve({ hasVideo, hasAudio, audioCodec })
    })
  })
}

async function safeReplaceFile(srcPath: string, destPath: string, maxAttempts = 8): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.renameSync(srcPath, destPath)
      return true
    } catch (err: any) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 150 * attempt))
        continue
      }
      throw err
    }
  }
  return false
}


export async function processVideoFile(
  input: string, output: string, format: string, duration: number, fps = 60,
  previous?: string | null, quality = '720p', bitrate = '6M', forceCpu = false,
  audio?: ReplayAudioFiles, inputFacts?: { current: MediaFacts; previous?: MediaFacts }
): Promise<MediaFacts> {
  const ffmpeg = getFFmpegPath()
  if (!ffmpeg || !fs.existsSync(ffmpeg)) throw new Error('FFmpeg is unavailable. Restart or reinstall Eclipse Launcher to process clips.')
  return encodeReplay(ffmpeg, input, output, { previous, duration, fps, quality, bitrate, format,
    encoder: forceCpu ? 'libx264' : () => getBestVideoEncoder(ffmpeg), audio, inputFacts })
}
function runFFmpeg(executable: string, args: string[], timeout: number): Promise<Error | null> {
  return new Promise(resolve => {
    execFile(executable, args, { timeout, windowsHide: true }, error => resolve(error))
  })
}

let activeReplayHotkey: string | null = null
let savedMainWindow: BrowserWindow | null = null

export function registerClipsGlobalHotkey(mainWindow?: BrowserWindow) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    savedMainWindow = mainWindow
  }
  const settings = loadClipSettings()
  const desired = settings.enabled ? settings.hotkey || 'F8' : null
  if (activeReplayHotkey === desired) return
  
  if (activeReplayHotkey) {
    try { globalShortcut.unregister(activeReplayHotkey) } catch {}
    activeReplayHotkey = null
  }

  if (!settings.enabled) return

  const replayHk = settings.hotkey || 'F8'
  try {
    const success = globalShortcut.register(replayHk, () => {
      const targetWindow = (savedMainWindow && !savedMainWindow.isDestroyed())
        ? savedMainWindow
        : BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && !w.webContents.getURL().includes('overlay.html'))
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

}

export function validateClipExport(payload: import('../src/services/clipEdits').ClipExportRequest) {
      if (!payload || typeof payload.filePath !== 'string' || typeof payload.suggestedName !== 'string') throw new Error('Invalid export request')
      payload = { ...payload, filePath: requireManagedClipPath(payload.filePath) }
      for (const value of [payload.gameVolume,payload.micVolume,payload.discordVolume,payload.desktopVolume,payload.cropX]) if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Invalid audio volume or crop')
      if (payload.output !== undefined && !['source','portrait','square'].includes(payload.output) || payload.maxBytes !== undefined && (!Number.isSafeInteger(payload.maxBytes) || payload.maxBytes < 1_000_000 || payload.maxBytes > 100_000_000)) throw new Error('Invalid output options')
      if (payload.cuts !== undefined && (!Array.isArray(payload.cuts) || payload.cuts.length > 100 || payload.cuts.some((cut, i) => !cut || !Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < (payload.trimStart || 0) || cut.end <= cut.start || cut.end > (payload.trimEnd ?? Infinity) || i > 0 && cut.start < payload.cuts![i-1].end))) throw new Error('Invalid cuts')
      if ((payload.trimStart !== undefined && (!Number.isFinite(payload.trimStart) || payload.trimStart < 0)) ||
        (payload.trimEnd !== undefined && (!Number.isFinite(payload.trimEnd) || payload.trimEnd <= (payload.trimStart || 0)))) throw new Error('Invalid trim range')
  return payload
}
const discordExportCache=new ClipExportCache()
export async function renderManagedClip(payload: import('../src/services/clipEdits').ClipExportRequest, output: string) {
  payload = validateClipExport(payload)
  const ffmpeg=getFFmpegPath();if(!ffmpeg)throw new Error('FFmpeg unavailable')
  const meta=Object.values(loadAllClipsMetadata()).find(item=>item.fileName===path.basename(payload.filePath))
  const sidecar=(name?:string)=>name?clipFilePath(path.dirname(payload.filePath),name,true):undefined
  const options={start:payload.trimStart||0,end:payload.trimEnd,cuts:payload.cuts,output:payload.output,cropX:payload.cropX,maxBytes:payload.maxBytes,separate:meta?.mediaVersion===2,gameFile:sidecar(meta?.gameAudioFileName),micFile:sidecar(meta?.micFileName),discordFile:sidecar(meta?.discordFileName),desktopFile:sidecar(meta?.desktopAudioFileName),desktopVolume:payload.desktopVolume,gameVolume:payload.gameVolume??(meta?.desktopAudioFileName?0:1),micVolume:payload.micVolume??1,discordVolume:payload.discordVolume??(meta?.desktopAudioFileName?0:1)}
  const key=payload.maxBytes===DISCORD_FILE_LIMIT_BYTES?await discordExportCache.key([payload.filePath,options.gameFile,options.micFile,options.discordFile,options.desktopFile],{profile:'adaptive-upload-v3',container:path.extname(output).toLowerCase(),options}):undefined
  if(key&&await discordExportCache.reuse(key,output,DISCORD_FILE_LIMIT_BYTES))return
  await exportEditedClip(ffmpeg,payload.filePath,output,{...options,encoder:loadClipSettings().videoEncoder==='cpu'?'libx264':()=>getBestVideoEncoder(ffmpeg)})
  if(key)await discordExportCache.remember(key,output)
}

export function initClipsIPC(mainWindow?: BrowserWindow) {
  ipcMain.handle('clips:autoclip-status', () => getAutoClipStatus())
  ipcMain.handle('clips:autoclip-setup', (_event, game: unknown) => setupAutoClipGame(game))
  initProcessAudioCapture()
  initMicrophoneCapture()
  initNativeCapture(getFFmpegPath,()=>loadClipSettings() as import('../src/types/game').ClipSettings)
  initClipSharing(renderManagedClip, validateClipExport)
  getClipsDirectory()
  registerClipsGlobalHotkey(mainWindow)
  ipcMain.handle('clips:capture-active', (event, active: boolean) => {
    if (typeof active !== 'boolean' || !mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false
    mainWindow.webContents.setBackgroundThrottling(!active)
    return true
  })

  ipcMain.handle('clips:get-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: false,
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

  const clipQueue = createBoundedWorkQueue(3, 192 * 1024 * 1024)

  ipcMain.handle('clips:save', async (event, payload: {
    nativeSnapshotId?: string
    videoBase64?: string
    prevVideoBase64?: string
    videoBuffer?: Uint8Array
    prevVideoBuffer?: Uint8Array
    micBuffer?: Uint8Array
    prevMicBuffer?: Uint8Array
    replayLease?: string
    replayVideoId?: string
    replayMicId?: string
    history?: { videoBuffer?: Uint8Array; micBuffer?: Uint8Array; replayVideoId?:string; replayMicId?:string; start?: number; wallStart?: number; micOffset?: number }[]
    timing?: ReplayTiming
    captureWidth?: number
    captureHeight?: number
    captureFps?: number
    desktopAudio?: boolean
    toastRequestId?: string
    title: string
    gameTitle: string
    gameId?: string | number
    duration: number
    thumbnailDataUrl: string
    resolution?: string
    fps?: number
    bitrate?: string
    format?: 'mp4' | 'webm' | 'mkv'
    tags?: string[]
  }) => {
    if (!payload || typeof payload !== 'object') return { success: false, error: 'Invalid clip payload' }
    if (payload.desktopAudio !== undefined && typeof payload.desktopAudio !== 'boolean') return { success: false, error: 'Invalid desktop audio flag' }
    if (payload.toastRequestId !== undefined && (typeof payload.toastRequestId !== 'string' || !/^[a-f\d-]{36}$/i.test(payload.toastRequestId))) return { success: false, error: 'Invalid clip notification request' }
    if (payload.history && (!Array.isArray(payload.history) || payload.history.length > (payload.replayLease?128:32) || payload.history.some(segment => !segment || (!segment.videoBuffer&&!segment.replayVideoId) || [segment.start,segment.wallStart,segment.micOffset].some(value => value !== undefined && !Number.isFinite(value))))) return { success: false, error: 'Invalid replay history' }
    if ((!payload.videoBuffer || payload.videoBuffer.byteLength < 512) && !payload.videoBase64 && !payload.replayVideoId && payload.history?.length) {
      const history = [...payload.history]
      let latest = history.pop()
      while (latest && (!latest.videoBuffer || latest.videoBuffer.byteLength < 512)) latest = history.pop()
      if (latest) payload = { ...payload, videoBuffer: latest.videoBuffer, micBuffer: latest.micBuffer, history,
        timing: { currentStart: latest.start, currentWallStart: latest.wallStart, currentMicOffset: latest.micOffset } }
    }
    const buffers = [payload.videoBuffer,payload.prevVideoBuffer,payload.micBuffer,payload.prevMicBuffer,...(payload.history || []).flatMap(segment => [segment.videoBuffer,segment.micBuffer])]
    if (buffers.some(value => value !== undefined && !(value instanceof Uint8Array))) return { success: false, error: 'Invalid replay buffers' }
    if (payload.history) payload = { ...payload, history: payload.history.filter(segment => segment.replayVideoId || segment.videoBuffer && segment.videoBuffer.byteLength >= 512) }
    const snapshotBytes = buffers.reduce((sum,value)=>sum+(value?.byteLength||0),0) + ((payload.videoBase64?.length || 0) + (payload.prevVideoBase64?.length || 0)) * 3
    let diskLease:ReplayLease|undefined
    let native:ReturnType<typeof takeNativeSnapshot>|undefined
    try {
      if(payload.nativeSnapshotId){
        native=takeNativeSnapshot(event.sender,payload.nativeSnapshotId);diskLease=native.lease
        payload={...payload,replayVideoId:'video',replayMicId:native.mic?'mic':undefined,history:[],timing:{currentStart:0,currentWallStart:native.start,currentMicOffset:0},desktopAudio:native.desktop,captureWidth:native.width,captureHeight:native.height,captureFps:native.fps}
      }else if(payload.replayLease)throw new Error('Legacy replay sessions are no longer supported')
    }catch(error){diskLease?.release();return{success:false,error:error instanceof Error?error.message:'Replay snapshot unavailable'}}
    const frozenAudio = freezeProcessAudio?.(event.sender)
    const settingsSnapshot = loadClipSettings()
    return clipQueue.run(snapshotBytes, async () => {
    const temporaryFiles: string[] = []
    let incompleteOutput: string | undefined
    const pendingAudio: string[] = []

    try {
      if (!payload || typeof payload !== 'object') throw new Error('Invalid clip payload')
      if ([payload.videoBuffer,payload.prevVideoBuffer,payload.micBuffer,payload.prevMicBuffer].reduce((sum, value) => sum+(value?.byteLength||0),0) > 512*1024*1024) throw new Error('Replay snapshot exceeds the processing limit')
      if (payload.format !== undefined && !['mp4', 'webm', 'mkv'].includes(payload.format)) throw new Error('Invalid clip format')
      if (payload.duration !== undefined && (!Number.isFinite(payload.duration) || payload.duration <= 0 || payload.duration > 24 * 60 * 60)) throw new Error('Invalid clip duration')
      const settings = settingsSnapshot
      const dir = getClipsDirectory(settings.savePath)
      const clipId = 'clip_' + Date.now() + '_' + randomUUID().slice(0, 8)

      let buffer: Buffer
      if (payload.videoBuffer) {
        buffer = Buffer.from(payload.videoBuffer.buffer, payload.videoBuffer.byteOffset, payload.videoBuffer.byteLength)
      } else {
        const base64Data = payload.videoBase64 ? (payload.videoBase64.includes(',') ? payload.videoBase64.split(',')[1] : payload.videoBase64) : ''
        buffer = Buffer.from(base64Data, 'base64')
      }

      let prevBuf: Buffer
      if (payload.prevVideoBuffer) {
        prevBuf = Buffer.from(payload.prevVideoBuffer.buffer, payload.prevVideoBuffer.byteOffset, payload.prevVideoBuffer.byteLength)
      } else {
        const prevBase64Data = payload.prevVideoBase64 ? (payload.prevVideoBase64.includes(',') ? payload.prevVideoBase64.split(',')[1] : payload.prevVideoBase64) : ''
        prevBuf = Buffer.from(prevBase64Data, 'base64')
      }

      const diskVideo=diskLease?.get(payload.replayVideoId),diskMic=diskLease?.get(payload.replayMicId)
      if ((diskVideo?.size||buffer.length) < 512 && prevBuf.length < 512) {
        console.error('[Clips] Incoming video buffer too small (incomplete or empty frames):', buffer.length, prevBuf.length)
        return { success: false, error: 'Aufnahme-Puffer enthält noch nicht genügend Videodaten. Bitte warte ein paar Sekunden.' }
      }

      const chosenFormat = payload.format || settings.format || 'mp4'
      const videoExt = ['mp4', 'webm', 'mkv'].includes(chosenFormat) ? chosenFormat : 'mp4'
      const fileName = clipId + '.' + videoExt
      const finalVideoPath = path.join(dir, fileName)
      const processingVideoPath = path.join(dir, `temp_${clipId}.${videoExt}`)
      incompleteOutput = processingVideoPath

      const tempDir = path.join(app.getPath('temp'), 'eclipse_clips_tmp')
      if (!fs.existsSync(tempDir)) {
        try { fs.mkdirSync(tempDir, { recursive: true }) } catch {}
      }

      const tempRawPath = diskVideo?.path || path.join(tempDir, 'temp_' + clipId + '.webm')
      if(!diskVideo)temporaryFiles.push(tempRawPath)
      let tempPrevPath: string | null = null

      if (prevBuf.length > 500) {
        tempPrevPath = path.join(tempDir, 'temp_prev_' + clipId + '.webm')
        temporaryFiles.push(tempPrevPath)
      }

      const inputForFfmpeg = ((diskVideo?.size||buffer.length) > 500) ? tempRawPath : (tempPrevPath || tempRawPath)
      const targetDuration = payload.duration || settings.replayDurationSeconds || 30
      const targetFps = payload.fps || settings.fps || 60
      const targetRes = payload.resolution || settings.quality || '720p'
      const targetBit = payload.bitrate || settings.bitrate || '6M'
      const micPath = diskMic?.size ? diskMic.path : payload.micBuffer?.byteLength ? path.join(tempDir, `mic_${clipId}.webm`) : undefined
      const previousMicPath = payload.prevMicBuffer?.byteLength ? path.join(tempDir, `mic_prev_${clipId}.webm`) : undefined
      const writes: Promise<void>[] = []
      const history: ReplayHistorySegment[] = (payload.history || []).map((segment,index) => {
        const videoPart=diskLease?.get(segment.replayVideoId),micPart=diskLease?.get(segment.replayMicId)
        const file = videoPart?.path || path.join(tempDir, `${clipId}_history_${index}.webm`)
        const mic = micPart?.size ? micPart.path : segment.micBuffer?.byteLength ? path.join(tempDir, `${clipId}_history_${index}_mic.webm`) : undefined
        for (const [destination,data] of [[file,segment.videoBuffer],[mic,segment.micBuffer]] as const) {
          if (destination && data) { temporaryFiles.push(destination); writes.push(fs.promises.writeFile(destination,Buffer.from(data.buffer,data.byteOffset,data.byteLength))) }
        }
        return { path: file, mic, start: segment.start, wallStart: segment.wallStart, micOffset: segment.micOffset }
      })
      if (buffer.length > 500) writes.push(fs.promises.writeFile(tempRawPath, buffer))
      if (tempPrevPath) writes.push(fs.promises.writeFile(tempPrevPath, prevBuf))
      for (const [file, data] of [[micPath, payload.micBuffer], [previousMicPath, payload.prevMicBuffer]] as const) {
        if (file && data) { temporaryFiles.push(file); writes.push(fs.promises.writeFile(file, Buffer.from(data.buffer,data.byteOffset,data.byteLength))) }
      }
      // Wait for every write before cleanup, including when one write fails.
      const written = await Promise.allSettled(writes)
      const failedWrite = written.find((result): result is PromiseRejectedResult => result.status === 'rejected')
      if (failedWrite) throw failedWrite.reason
      const gameAudioFileName = `${clipId}.game.m4a`
      const micFileName = `${clipId}.mic.m4a`
      const gameAudioPath = path.join(dir, gameAudioFileName)
      const micOutputPath = path.join(dir, micFileName)
      const discordFileName = `${clipId}.discord.m4a`, discordOutputPath = path.join(dir, discordFileName)
      const desktopFileName = `${clipId}.desktop.m4a`, desktopOutputPath = path.join(dir, desktopFileName)
      const isolated: ReplayAudioFiles = {...native?.audio}
      isolated.history = history
      let inputFacts: { current: MediaFacts; previous?: MediaFacts } | undefined
      if (!native && settings.separateApplications && payload.timing?.currentWallStart && Number.isFinite(payload.timing.currentWallStart)) {
        const ffmpeg = getFFmpegPath()
        if (!ffmpeg) throw new Error('FFmpeg unavailable')
        const current = await inspectMedia(ffmpeg,inputForFfmpeg)
        const previousFacts = tempPrevPath && current.duration < targetDuration ? await inspectMedia(ffmpeg,tempPrevPath) : undefined
        inputFacts = { current, previous: previousFacts }
        let remaining = targetDuration - current.duration
        for (const segment of [...history].reverse()) {
          if (remaining <= .01) break
          segment.facts = await inspectMedia(ffmpeg,segment.path)
          remaining -= segment.facts.duration
          if (!segment.facts.hasVideo || !segment.facts.duration || !segment.wallStart || !Number.isFinite(segment.wallStart) || Math.abs(segment.wallStart-Date.now())>2_400_000) continue
          for (const kind of ['game','discord'] as const) {
            const file = path.join(tempDir, `${path.basename(segment.path)}_${kind}.wav`)
            if (snapshotProcessAudio(kind,file,segment.wallStart,Math.min(606,segment.facts.duration),frozenAudio)) {
              temporaryFiles.push(file); segment[kind] = file
            }
          }
        }
        for (const [input, wall, previous, facts] of [[inputForFfmpeg,payload.timing.currentWallStart,false,current],[tempPrevPath,payload.timing.previousWallStart,true,previousFacts]] as const) {
          if (!input || !wall || !facts?.hasVideo || !facts.duration || !Number.isFinite(wall) || Math.abs(wall-Date.now())>2_400_000) continue
          for (const kind of ['game','discord'] as const) {
            const file=path.join(tempDir,`${clipId}_${kind}_${previous?'previous':'current'}.wav`)
            if(snapshotProcessAudio(kind,file,wall,Math.min(606,facts.duration),frozenAudio)) {
              temporaryFiles.push(file)
              if(kind==='game') { if(previous) isolated.previousGamePath=file;else isolated.gamePath=file }
              else { if(previous) isolated.previousDiscordPath=file;else isolated.discordPath=file }
            }
          }
        }
      }
      pendingAudio.push(gameAudioPath, micOutputPath, discordOutputPath, desktopOutputPath)
      const measured = await processVideoFile(inputForFfmpeg, processingVideoPath, videoExt, targetDuration, targetFps, tempPrevPath, targetRes, targetBit, settings.videoEncoder === 'cpu', {
        ...isolated, desktop: payload.desktopAudio === true, desktopOutputPath, gameGain: (settings.audioOutputVolume ?? 100)/100, micPath, previousMicPath, gameOutputPath: gameAudioPath, micOutputPath, discordOutputPath, timing: payload.timing,
      }, inputFacts)

      if (!fs.existsSync(processingVideoPath) || fs.statSync(processingVideoPath).size < 500) {
        console.error('[Clips] Final video file does not exist after processing')
        return { success: false, error: 'Video-Konvertierung fehlgeschlagen.' }
      }
      fs.renameSync(processingVideoPath, finalVideoPath)
      incompleteOutput = finalVideoPath
      rememberMedia(finalVideoPath, measured)

      const finalStat = fs.statSync(finalVideoPath)
      const ffmpeg = getFFmpegPath()
      const audioFileSize = pendingAudio.reduce((sum, file) => sum + (fs.existsSync(file) ? fs.statSync(file).size : 0), 0)
      const thumbnail=await storeClipThumbnail(dir,clipId,payload.thumbnailDataUrl||'')
      if(thumbnail.file)pendingAudio.push(thumbnail.file)

      const meta: ClipMetadata = {
        id: clipId,
        title: payload.title || ((payload.gameTitle || 'Gameplay') + ' Clip'),
        gameTitle: payload.gameTitle || 'Game',
        gameId: payload.gameId,
        duration: measured.duration,
        thumbnailUrl: thumbnail.url,
        fileName: fileName,
        micFileName: fs.existsSync(micOutputPath) ? micFileName : undefined,
        gameAudioFileName: fs.existsSync(gameAudioPath) ? gameAudioFileName : undefined,
        discordFileName: fs.existsSync(discordOutputPath) ? discordFileName : undefined,
        desktopAudioFileName: fs.existsSync(desktopOutputPath) ? desktopFileName : undefined,
        mediaVersion: 2, applicationAudio: settings.separateApplications === true,
        width: measured.width, height: measured.height,
        averageFps: measured.averageFps,
        videoFileSize: finalStat.size, audioFileSize,
        fileSize: finalStat.size + audioFileSize,
        createdAt: Date.now(),
        resolution: `${measured.width}×${measured.height}`,
        fps: measured.fps || measured.averageFps,
        bitrate: `${(measured.bitrate / 1_000_000).toFixed(2)} Mbps`,
        requestedResolution: targetRes, requestedFps: targetFps, requestedBitrate: targetBit,
        captureWidth: payload.captureWidth, captureHeight: payload.captureHeight, captureFps: payload.captureFps,
        hasGameAudio: fs.existsSync(gameAudioPath), hasMicAudio: fs.existsSync(micOutputPath),
        format: chosenFormat as any,
        tags: payload.tags || ['highlight'],
      }

      const allMeta = loadAllClipsMetadata()
      allMeta[clipId] = meta
      saveAllClipsMetadata(allMeta)
      incompleteOutput = undefined
      pendingAudio.length = 0

      const normalizedPath = finalVideoPath.replace(/\\/g, '/')

      if (settings.notifyOnClip !== false) {
        try {
          let appLang: string | undefined = undefined
          let overlayClipNotificationAllowed = true
          let toastColor: string | undefined
          try {
            const settingsFile = path.join(app.getPath('userData'), 'settings.json')
            if (fs.existsSync(settingsFile)) {
              const parsed = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
              if (parsed.language) appLang = parsed.language
              if (parsed.overlayClipNotification === false) overlayClipNotificationAllowed = false
              if (typeof parsed.overlayClipToastColor === 'string' && /^#[a-f0-9]{6}$/i.test(parsed.overlayClipToastColor)) toastColor = parsed.overlayClipToastColor
            }
          } catch (_) {}

          if (overlayClipNotificationAllowed) {
            showClipSavedToast({
              requestId: payload.toastRequestId,
              status: 'saved',
              title: meta.title,
              gameTitle: meta.gameTitle,
              duration: meta.duration,
              thumbnailUrl: payload.thumbnailDataUrl,
              timestamp: meta.createdAt,
              ...(appLang ? { language: appLang } : {}),
              ...(toastColor ? { color: toastColor } : {}),
            })
          }
        } catch (e) {
          console.warn('[Clips] Failed to show overlay clip toast:', e)
        }
      }

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
    } finally {
      for (const temporaryFile of temporaryFiles) {
        try { fs.unlinkSync(temporaryFile) } catch {}
      }
      for (const file of pendingAudio) { try { fs.unlinkSync(file) } catch {} }
      if (incompleteOutput) {
        try { fs.unlinkSync(incompleteOutput) } catch {}
      }
    }
    }).catch(error => ({ success: false, error: error instanceof Error ? error.message : 'Clip queue unavailable' })).finally(()=>diskLease?.release())
  })

  ipcMain.handle('clips:list', async () => {
    try {
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      if (!fs.existsSync(dir)) return []

      const allMeta = loadAllClipsMetadata()
      let metaChanged = false
      const migratedJsonFiles: string[] = []

      const files = fs.readdirSync(dir)

      for (const f of files) {
        if (f.endsWith('.json') && f.startsWith('clip_')) {
          const legacyPath = path.join(dir, f)
          try {
            const raw = fs.readFileSync(legacyPath, 'utf-8')
            const legacyMeta: ClipMetadata = JSON.parse(raw)
            if (legacyMeta && validClipId(legacyMeta.id) && typeof legacyMeta.fileName === 'string' && path.basename(legacyMeta.fileName) === legacyMeta.fileName && !allMeta[legacyMeta.id]) {
              allMeta[legacyMeta.id] = legacyMeta
              metaChanged = true
              migratedJsonFiles.push(legacyPath)
            }
          } catch (_) {}
        }
      }

      const videoExtensions = ['.mp4', '.mkv', '.webm']
      const videoFiles = files.filter(f => {
        const ext = path.extname(f).toLowerCase()
        return videoExtensions.includes(ext) && !f.startsWith('temp_') && !f.endsWith('.webm_full.mp4')
      })

      const clips: any[] = []
      const metadataByFile = new Map(Object.values(allMeta).map(meta => [meta.fileName, meta]))

      for (const vf of videoFiles) {
        const videoFilePath = path.join(dir, vf)
        try {
          if (!fs.existsSync(videoFilePath)) continue
          const stat = fs.statSync(videoFilePath)
          const baseName = path.parse(vf).name
          let meta = allMeta[baseName] || metadataByFile.get(vf)
          
          if (!meta) {
            const clipId = baseName.startsWith('clip_') ? baseName : 'clip_' + (stat.birthtimeMs || Date.now())
            meta = {
              id: clipId,
              title: vf.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
              gameTitle: 'Gameplay',
              duration: 0,
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
          if(meta.thumbnailUrl?.startsWith('data:image/')) {
            try {
              const original=meta.thumbnailUrl,thumbnail=await storeClipThumbnail(dir,meta.id,original)
              // A rename/delete can commit while the thumbnail write is pending.
              const current=allMeta[meta.id]
              if(!current||!fs.existsSync(videoFilePath))continue
              meta=current
              if(thumbnail.url!==original&&meta.thumbnailUrl===original){meta.thumbnailUrl=thumbnail.url;metaChanged=true}
            }catch(error){console.warn('[Clips] Thumbnail migration deferred:',error instanceof Error?error.message:String(error))}
          }
          clips.push({
            ...meta,
            duration: meta.width && meta.height ? meta.duration : 0,
            videoFileSize: stat.size,
            audioFileSize: audioBytes(dir, meta),
            fileSize: stat.size + audioBytes(dir, meta),
            filePath: videoFilePath,
            videoUrl: 'local-media://file/' + encodeURIComponent(normalizedPath),
          })
        } catch (_) {}
      }

      if (metaChanged) {
        saveAllClipsMetadata(allMeta)
        for (const legacyPath of migratedJsonFiles) {
          try { fs.unlinkSync(legacyPath) } catch {}
        }
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
      filePath = requireManagedClipPath(filePath)
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

  ipcMain.handle('clips:analyze', async (_, clipId: string) => {
    try {
      if (!validClipId(clipId)) throw new Error('Invalid clip ID')
      const meta = loadAllClipsMetadata()[clipId]
      if (!meta) throw new Error('Clip not found')
      const directory = getClipsDirectory(loadClipSettings().savePath)
      const file = clipFilePath(directory, meta.fileName)
      const sidecar = (name?: string) => {
        if (!name || meta.mediaVersion !== 2) return undefined
        const candidate = clipFilePath(directory, name, true)
        return fs.existsSync(candidate) ? candidate : undefined
      }
      const gameFile = sidecar(meta.gameAudioFileName), micFile = sidecar(meta.micFileName), discordFile = sidecar(meta.discordFileName), desktopFile = sidecar(meta.desktopAudioFileName)
      const key = [file, gameFile, micFile, discordFile, desktopFile].map(item => item ? `${item}:${fs.statSync(item).mtimeMs}:${fs.statSync(item).size}` : '').join('|')
      const cached = analysisCache.get(clipId)
      if (cached?.key === key) return { ...cached.result, clip: { ...cached.result.clip, title: meta.title, tags: meta.tags, editDraft: meta.editDraft } }
      if (analysisPending.has(key)) return await analysisPending.get(key)
      const task = (async () => {
        const ffmpeg = getFFmpegPath()
        if (!ffmpeg) throw new Error('FFmpeg is unavailable')
        const facts = knownMedia(file) || await inspectMedia(ffmpeg, file)
        if (!facts.hasVideo || !facts.duration) throw new Error('Clip contains no playable video')
        const audioFileSize = audioBytes(directory, meta)
        const updated = { width: facts.width, height: facts.height, fps: facts.fps || facts.averageFps,
          averageFps: facts.averageFps, duration: facts.duration, resolution: `${facts.width}×${facts.height}`,
          bitrate: `${(facts.bitrate / 1_000_000).toFixed(2)} Mbps`, videoFileSize: facts.fileSize, audioFileSize, fileSize: facts.fileSize + audioFileSize }
        const gameSource = meta.mediaVersion === 2 ? gameFile : (facts.hasAudio ? file : undefined)
        const [gamePeaks, micPeaks, discordPeaks, desktopPeaks] = await Promise.all([
          gameSource ? extractWaveform(ffmpeg, gameSource, facts.duration) : Promise.resolve([]),
          micFile ? extractWaveform(ffmpeg, micFile, facts.duration) : Promise.resolve([]),
          discordFile ? extractWaveform(ffmpeg, discordFile, facts.duration) : Promise.resolve([]),
          desktopFile ? extractWaveform(ffmpeg, desktopFile, facts.duration) : Promise.resolve([]),
        ])
        const all = loadAllClipsMetadata()
        if (!all[clipId] || !fs.existsSync(file)) throw new Error('Clip was deleted during analysis')
        all[clipId] = { ...all[clipId], ...updated, title: all[clipId].title, tags: all[clipId].tags }
        saveAllClipsMetadata(all)
        const url = (source?: string) => source ? `local-media://file/${encodeURIComponent(source.replace(/\\/g, '/'))}` : undefined
        const result: ClipAnalysis & { clip: EclipseClip } = { success: true, clip: { ...all[clipId], filePath: file, videoUrl: url(file)! },
          discord: { available: !!discordFile, url: url(discordFile), peaks: discordPeaks },
          desktop: { available: !!desktopFile, url: url(desktopFile), peaks: desktopPeaks },
          game: { available: !!gameSource, url: url(gameSource), peaks: gamePeaks },
          mic: { available: !!micFile, url: url(micFile), peaks: micPeaks },
          separateAudio: meta.mediaVersion === 2, hasGameAudio: !!gameFile, hasMicAudio: !!micFile }
        analysisCache.set(clipId, { key, result })
        while (analysisCache.size > 24) analysisCache.delete(analysisCache.keys().next().value!)
        return result
      })().finally(() => analysisPending.delete(key))
      analysisPending.set(key, task)
      return await task
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) } }
  })

  ipcMain.handle('clips:delete', async (_, clipId: string) => {
    try {
      if (!validClipId(clipId)) throw new Error('Invalid clip ID')
      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const allMeta = loadAllClipsMetadata()
      const meta = Object.prototype.hasOwnProperty.call(allMeta, clipId) ? allMeta[clipId] : undefined

      if (meta) {
        const videoFilePath = clipFilePath(dir, meta.fileName)
        if (fs.existsSync(videoFilePath)) {
          fs.unlinkSync(videoFilePath)
        }
        for (const name of [meta.gameAudioFileName, meta.micFileName,meta.discordFileName,meta.desktopAudioFileName]) {
          if (name) { const file = clipFilePath(dir, name, true); if (fs.existsSync(file)) fs.unlinkSync(file) }
        }
        analysisCache.delete(clipId)
        removeClipThumbnail(dir,clipId)
        delete allMeta[clipId]
        saveAllClipsMetadata(allMeta)
      } else {
        const files = fs.readdirSync(dir)
        for (const f of files) {
          if (path.parse(f).name === clipId && ['.mp4', '.webm', '.mkv', '.json'].includes(path.extname(f).toLowerCase())) {
            fs.unlinkSync(path.join(dir, f))
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
      if (!payload || !validClipId(payload.clipId) || typeof payload.title !== 'string' || !payload.title.trim() || payload.title.length > 500 ||
        (payload.tags !== undefined && (!Array.isArray(payload.tags) || payload.tags.length > 50 || payload.tags.some(tag => typeof tag !== 'string' || tag.length > 100)))) throw new Error('Invalid clip metadata')
      const allMeta = loadAllClipsMetadata()
      if (Object.prototype.hasOwnProperty.call(allMeta, payload.clipId)) {
        allMeta[payload.clipId].title = payload.title.trim()
        const draft = allMeta[payload.clipId].editDraft
        if (draft) { draft.state.title = allMeta[payload.clipId].title; draft.baseTitle = allMeta[payload.clipId].title }
        if (payload.tags) allMeta[payload.clipId].tags = payload.tags
        saveAllClipsMetadata(allMeta)
        return { success: true, meta: allMeta[payload.clipId] }
      }
      return { success: false, error: 'Clip not found' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('clips:save-draft', async (_, payload: { clipId: string; draft: unknown }) => {
    try {
      if (!payload || !validClipId(payload.clipId) || payload.draft === undefined) throw new Error('Invalid clip draft')
      const all = loadAllClipsMetadata(), meta = Object.prototype.hasOwnProperty.call(all, payload.clipId) ? all[payload.clipId] : undefined
      if (!meta) throw new Error('Clip not found')
      const file = clipFilePath(getClipsDirectory(loadClipSettings().savePath), meta.fileName)
      if (!fs.existsSync(file)) throw new Error('Clip not found')
      if (payload.draft === null) {
        if (!meta.editDraft) return { success: true, draft: null, title: meta.title }
        meta.title = typeof meta.editDraft?.baseTitle === 'string' && meta.editDraft.baseTitle.trim() ? meta.editDraft.baseTitle.slice(0, 500) : meta.title
        delete meta.editDraft
      } else {
        const draft = validateClipDraftInput(payload.draft)
        const baseTitle = typeof meta.editDraft?.baseTitle === 'string' ? meta.editDraft.baseTitle : meta.title
        meta.editDraft = { version: 1, baseTitle: (baseTitle || 'Clip').slice(0, 500), savedAt: Date.now(), ...draft }
        meta.title = draft.state.title
      }
      saveAllClipsMetadata(all)
      return { success: true, draft: meta.editDraft || null, title: meta.title }
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : String(error) } }
  })

  ipcMain.handle('clips:open-folder', async (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath)
        return { success: true }
      }
      const dir = getClipsDirectory()
      openExternalPath(dir)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('clips:copy-file', async (_, filePath: string) => {
    try {
      filePath = requireManagedClipPath(filePath)
      if (fs.existsSync(filePath)) {
        // 2. Windows native CF_HDROP / FileDropList via PowerShell
        if (process.platform === 'win32') {
          await new Promise<void>((resolve, reject) => {
            const escaped = filePath.replace(/'/g, "''")
            execFile(
              'powershell',
              ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Set-Clipboard -LiteralPath '${escaped}'`],
              { timeout: 3000, windowsHide: true },
              (err) => {
                if (err) { reject(err); return }
                resolve()
              }
            )
          })
        }

        if (process.platform !== 'win32') await clipboard.write([new ClipboardItem({'text/uri-list':new Blob([pathToFileURL(filePath).href],{type:'text/uri-list'}),'text/plain':filePath})])

        return { success: true }
      }
      return { success: false, error: 'File does not exist' }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('clips:export', async (_, payload: import('../src/services/clipEdits').ClipExportRequest) => {
    let pendingExport: string | undefined
    try {
      payload = validateClipExport(payload)
      const ext = payload.maxBytes || payload.output && payload.output !== 'source' ? '.mp4' : path.extname(payload.filePath) || '.mp4'
      const win = mainWindow || BrowserWindow.getFocusedWindow()
      const { canceled, filePath } = await dialog.showSaveDialog(win as any, {
        title: 'Export Clip',
        defaultPath: payload.suggestedName + ext,
        filters: [{ name: 'Video', extensions: [ext.replace('.', '')] }],
      })
      if (!canceled && filePath) {
        if (path.resolve(filePath).toLowerCase() === path.resolve(payload.filePath).toLowerCase()) throw new Error('Choose a different file to preserve the original clip')
        pendingExport = path.join(path.dirname(filePath), `.eclipse-export-${randomUUID()}${path.extname(filePath) || ext}`)
        const ffmpeg = getFFmpegPath()
        const hasEdits = payload.trimStart !== undefined || payload.trimEnd !== undefined || payload.gameVolume !== undefined || payload.micVolume !== undefined || payload.discordVolume !== undefined || payload.desktopVolume !== undefined || !!payload.cuts?.length || !!payload.output || !!payload.maxBytes
        if (hasEdits && !ffmpeg) throw new Error('FFmpeg is required to edit clips')
        if (hasEdits && ffmpeg) {
          const meta = Object.values(loadAllClipsMetadata()).find(item => item.fileName === path.basename(payload.filePath))
          const directory = path.dirname(payload.filePath)
          const sidecar = (name?: string) => name ? clipFilePath(directory, name, true) : undefined
          await exportEditedClip(ffmpeg, payload.filePath, pendingExport, {
            start: payload.trimStart || 0, end: payload.trimEnd,
            cuts: payload.cuts, output: payload.output, cropX: payload.cropX, maxBytes: payload.maxBytes, discordVolume: payload.discordVolume ?? (meta?.desktopAudioFileName ? 0 : 1),
            gameFile: sidecar(meta?.gameAudioFileName), micFile: sidecar(meta?.micFileName), discordFile: sidecar(meta?.discordFileName), desktopFile: sidecar(meta?.desktopAudioFileName), desktopVolume: payload.desktopVolume,
            separate: meta?.mediaVersion === 2, gameVolume: payload.gameVolume ?? (meta?.desktopAudioFileName ? 0 : 1), micVolume: payload.micVolume ?? 1,
          })
        } else fs.copyFileSync(payload.filePath, pendingExport)
        await fs.promises.rename(pendingExport, filePath)
        pendingExport = undefined
        return { success: true, exportedPath: filePath }
      }
      return { success: false }
    } catch (err: any) {
      return { success: false, error: err.message }
    } finally {
      if (pendingExport) {
        try { fs.unlinkSync(pendingExport) } catch {}
      }
    }
  })

  ipcMain.handle('clips:optimize', async (_, payload: { clipId: string; quality?: 'balanced' | 'discord' }) => {
    let pendingOptimization: string | undefined
    try {
      if (!payload || !validClipId(payload.clipId)) throw new Error('Invalid clip ID')
      const allMeta = loadAllClipsMetadata()
      const meta = Object.prototype.hasOwnProperty.call(allMeta, payload.clipId) ? allMeta[payload.clipId] : undefined
      if (!meta) {
        return { success: false, error: 'Clip nicht in Metadaten gefunden.' }
      }

      const settings = loadClipSettings()
      const dir = getClipsDirectory(settings.savePath)
      const filePath = clipFilePath(dir, meta.fileName)

      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'Videodatei auf Festplatte nicht gefunden.' }
      }

      const originalStat = fs.statSync(filePath)
      const ffmpeg = getFFmpegPath()
      if (!ffmpeg) {
        return { success: false, error: 'FFmpeg ist nicht verfügbar.' }
      }
      const originalFacts = await inspectMedia(ffmpeg, filePath)

      const mode = payload.quality || 'balanced'
      const webm = path.extname(filePath).toLowerCase() === '.webm'
      const mp4 = path.extname(filePath).toLowerCase() === '.mp4'
      const encoder = webm ? 'libvpx-vp9' : settings.videoEncoder === 'cpu' ? 'libx264' : await getBestVideoEncoder(ffmpeg)
      const tempOptPath = path.join(dir, `temp_opt_${randomUUID()}${path.extname(meta.fileName)}`)
      pendingOptimization = tempOptPath

      // Determine bitrates and CQ levels for genuine optimization (~50-65% compression)
      let targetB = '2.4M'
      let maxrate = '3.0M'
      let bufsize = '4.5M'
      let cq = '27'
      let crf = '27'

      if (mode === 'discord') {
        targetB = '1.8M'
        maxrate = '2.4M'
        bufsize = '3.5M'
        cq = '28'
        crf = '28'
      } else {
        if (originalFacts.height <= 480) {
          targetB = '1.4M'
          maxrate = '1.8M'
          bufsize = '2.5M'
          cq = '27'
          crf = '27'
        } else if (originalFacts.height > 720 && originalFacts.height <= 1080) {
          targetB = '4.0M'
          maxrate = '5.0M'
          bufsize = '7M'
          cq = '26'
          crf = '26'
        } else if (originalFacts.height > 1080) {
          targetB = '6.5M'
          maxrate = '8.0M'
          bufsize = '12M'
          cq = '26'
          crf = '26'
        } else {
          // 720p (standard default): ~2.4M VBR -> 30s is ~9.5-10.5 MB
          targetB = '2.4M'
          maxrate = '3.0M'
          bufsize = '4.5M'
          cq = '27'
          crf = '27'
        }
      }

      const streams = await checkMediaStreams(ffmpeg, filePath)
      const targetH = mode === 'discord' ? Math.min(720, originalFacts.height) : originalFacts.height

      // Direct, clean transcode without synthetic fps/setpts manipulation to eliminate any freeze frame / Standbild risk
      const ffmpegArgs: string[] = [
        '-y', '-err_detect', 'ignore_err',
        '-i', filePath,
        '-vf', `scale=-2:${targetH}:flags=bicubic`,
        '-c:v', encoder,
        ...(webm ? ['-b:v', targetB, '-crf', crf, '-deadline', 'realtime'] : encoder === 'h264_nvenc'
          ? ['-rc:v', 'vbr', '-cq:v', cq, '-b:v', targetB, '-maxrate', maxrate, '-bufsize', bufsize, '-preset', 'p2']
          : encoder === 'libx264'
          ? ['-crf', crf, '-preset', 'faster', '-maxrate', maxrate, '-bufsize', bufsize]
          : ['-b:v', targetB, '-maxrate', maxrate]),
        '-pix_fmt', 'yuv420p', '-fps_mode', 'vfr',
        ...(streams.hasAudio
          ? (streams.audioCodec === (webm ? 'opus' : 'aac') ? ['-c:a', 'copy'] : ['-c:a', webm ? 'libopus' : 'aac', '-b:a', '128k'])
          : []),
        '-avoid_negative_ts', 'make_zero',
        ...(mp4 ? ['-movflags', '+faststart'] : []),
        tempOptPath
      ]

      let encodeErr: any = null
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(ffmpeg, ffmpegArgs, { maxBuffer: 20 * 1024 * 1024, timeout: 60000, windowsHide: true }, (err) => {
            if (err) reject(err); else resolve()
          })
        })
      } catch (err) {
        encodeErr = err
      }

      // If GPU encoder failed (e.g. NVENC sessions exhausted), fallback to CPU libx264
      if (encodeErr && encoder !== 'libx264' && !webm) {
        console.warn('[Clips] Hardware encoder failed in optimize, falling back to libx264:', encodeErr?.message)
        const cpuArgs: string[] = [
          '-y', '-err_detect', 'ignore_err',
          '-i', filePath,
          '-vf', `scale=-2:${targetH}:flags=bicubic`,
          '-c:v', 'libx264', '-crf', crf, '-preset', 'faster',
          '-maxrate', maxrate, '-bufsize', bufsize,
          '-pix_fmt', 'yuv420p', '-fps_mode', 'vfr',
          ...(streams.hasAudio
            ? (streams.audioCodec === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k'])
            : []),
          '-avoid_negative_ts', 'make_zero',
          ...(mp4 ? ['-movflags', '+faststart'] : []),
          tempOptPath
        ]
        await new Promise<void>((resolve, reject) => {
          execFile(ffmpeg, cpuArgs, { maxBuffer: 20 * 1024 * 1024, timeout: 60000, windowsHide: true }, (err) => {
            if (err) reject(err); else resolve()
          })
        })
      } else if (encodeErr) throw encodeErr

      if (!fs.existsSync(tempOptPath)) {
        return { success: false, error: 'Optimierungsdatei konnte nicht erstellt werden.' }
      }

      const newStat = fs.statSync(tempOptPath)
      const measured = await inspectMedia(ffmpeg, tempOptPath)
      if (!measured.hasVideo || Math.abs(measured.duration-originalFacts.duration) > .15) throw new Error('Optimization changed the clip duration')
      if (newStat.size >= originalStat.size || newStat.size < 1000) {
        try { fs.unlinkSync(tempOptPath) } catch {}
        const curMb = (originalStat.size / 1_000_000).toFixed(1)
        return {
          success: false,
          alreadyOptimal: true,
          error: `Dieser Clip ist mit ${curMb} MB bereits maximal komprimiert und kann nicht weiter verkleinert werden.`
        }
      }

      // Safe atomic replacement with retry logic against Windows file locks
      if (!fs.existsSync(filePath) || !Object.prototype.hasOwnProperty.call(loadAllClipsMetadata(), payload.clipId)) throw new Error('Clip was deleted during optimization')
      const replaced = await safeReplaceFile(tempOptPath, filePath)
      try { fs.unlinkSync(tempOptPath) } catch {}

      if (!replaced) {
        return { success: false, error: 'Konnte Datei nicht ersetzen, da sie von einem anderen Prozess gesperrt ist.' }
      }

      const sidecarBytes = audioBytes(dir, meta)
      const savedPercent = Math.round(((originalStat.size - newStat.size) / (originalStat.size+sidecarBytes)) * 100)
      const currentMeta = loadAllClipsMetadata()
      const updatedMeta = { ...currentMeta[payload.clipId], fileSize: newStat.size+sidecarBytes, videoFileSize: newStat.size,
        audioFileSize: sidecarBytes, width: measured.width, height: measured.height, duration: measured.duration,
        resolution: `${measured.width}×${measured.height}`, fps: measured.fps||measured.averageFps, averageFps: measured.averageFps,
        bitrate: `${(measured.bitrate/1_000_000).toFixed(2)} Mbps` }
      currentMeta[payload.clipId] = updatedMeta
      saveAllClipsMetadata(currentMeta)
      analysisCache.delete(payload.clipId)

      const normalizedPath = filePath.replace(/\\/g, '/')
      const cacheBust = Date.now()
      return {
        success: true,
        oldSize: originalStat.size+sidecarBytes,
        newSize: newStat.size+sidecarBytes,
        savedPercent,
        clip: {
          ...updatedMeta,
          videoUrl: 'local-media://file/' + encodeURIComponent(normalizedPath) + '?v=' + cacheBust,
          filePath,
        }
      }
    } catch (err: any) {
      console.error('[Clips] Optimize error:', err)
      return { success: false, error: err?.message || 'Fehler beim Optimieren.' }
    } finally {
      if (pendingOptimization) {
        try { fs.unlinkSync(pendingOptimization) } catch {}
      }
    }
  })

  ipcMain.handle('clips:get-settings', async () => {
    return loadClipSettings()
  })

  ipcMain.handle('clips:save-settings', async (_, settings: Partial<ClipSettingsRecord>) => {
    const updated = saveClipSettings(settings)
    if ('enabled' in settings || 'hotkey' in settings) registerClipsGlobalHotkey(mainWindow)
    if (Object.keys(settings).some(key => key === 'enabled' || key.startsWith('autoClip'))) refreshAutoClipSettings()
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
