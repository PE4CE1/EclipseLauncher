import { useClipStore } from '../store/clipStore'
import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'

// ─── State Management ────────────────────────────────────────────────────────
let activeStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let isInitialized = false

// Unbroken, contiguous session chunks
let currentSessionChunks: Blob[] = []
let previousSessionBlob: Blob | null = null
let sessionTimer: any = null

function getBitrateBps(bitrate?: string): number {
  switch (bitrate) {
    case '20M': case 'ultra': return 20_000_000
    case '15M': return 15_000_000
    case '10M': case 'high': return 10_000_000
    case '8M':  case 'medium': return 8_000_000
    case '5M':  case 'low': return 5_000_000
    default: return 10_000_000
  }
}

function getQualityDimensions(quality?: string): { width: number; height: number } {
  switch (quality) {
    case '4k': return { width: 3840, height: 2160 }
    case '1440p': return { width: 2560, height: 1440 }
    case '720p': return { width: 1280, height: 720 }
    case '480p': return { width: 854, height: 480 }
    case '360p': return { width: 640, height: 360 }
    case '1080p':
    default: return { width: 1920, height: 1080 }
  }
}

function getBestMimeType(preferH264: boolean): string {
  const candidates = preferH264
    ? ['video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=h264,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function captureThumbnail(stream: MediaStream): Promise<string> {
  return new Promise(resolve => {
    try {
      const vid = document.createElement('video')
      vid.muted = true
      vid.playsInline = true
      vid.srcObject = stream
      vid.onloadedmetadata = () => {
        vid.play().then(() => {
          setTimeout(() => {
            try {
              const c = document.createElement('canvas')
              c.width  = vid.videoWidth  || 1280
              c.height = vid.videoHeight || 720
              c.getContext('2d')?.drawImage(vid, 0, 0)
              resolve(c.toDataURL('image/jpeg', 0.85))
            } catch { resolve('') }
            vid.srcObject = null
          }, 200)
        }).catch(() => resolve(''))
      }
    } catch { resolve('') }
  })
}

function _cleanup() {
  if (sessionTimer) {
    clearTimeout(sessionTimer)
    sessionTimer = null
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop() } catch {}
  }
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop())
    activeStream = null
  }
  mediaRecorder = null
  currentSessionChunks = []
  previousSessionBlob = null
}

function _startRecorderSession() {
  if (!activeStream) return

  const settings = useClipStore.getState().settings
  const mimeType = getBestMimeType(settings.codec === 'h264')

  try {
    const recorder = new MediaRecorder(activeStream, {
      mimeType,
      videoBitsPerSecond: getBitrateBps(settings.bitrate),
    })

    currentSessionChunks = []

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        currentSessionChunks.push(ev.data)
      }
    }

    recorder.onerror = (e) => {
      console.error('[ClipEngine] MediaRecorder error:', e)
    }

    recorder.start(1000) // 1-second chunks
    mediaRecorder = recorder

    // Seamlessly cycle session every (wantedDuration * 2) seconds (min 90s) to keep contiguous files bounded
    const cycleIntervalMs = Math.max((settings.replayDurationSeconds || 30) * 2000, 90000)
    if (sessionTimer) clearTimeout(sessionTimer)
    sessionTimer = setTimeout(() => {
      if (activeStream && mediaRecorder && mediaRecorder.state === 'recording') {
        if (currentSessionChunks.length > 0) {
          previousSessionBlob = new Blob(currentSessionChunks, { type: mimeType })
        }
        try {
          mediaRecorder.stop()
        } catch {}
        _startRecorderSession()
      }
    }, cycleIntervalMs)

  } catch (err) {
    console.error('[ClipEngine] _startRecorderSession error:', err)
  }
}

// ─── Start Continuous Replay Buffer ───────────────────────────────────────────
export async function startReplayBuffer(): Promise<boolean> {
  if (mediaRecorder && mediaRecorder.state === 'recording' && activeStream) {
    return true
  }

  _cleanup()

  try {
    const settings = useClipStore.getState().settings
    if (!settings.enabled) return false

    // 1. Resolve source ID
    let sourceId: string | null = settings.selectedMonitorId || null
    if (window.electronAPI?.clips?.getSources) {
      const sources = await window.electronAPI.clips.getSources()
      if (sourceId) {
        const found = sources.find((s: any) => s.id === sourceId)
        if (!found) sourceId = null
      }
      if (!sourceId && sources.length > 0) {
        const screenSource = sources.find((s: any) => s.id.startsWith('screen:') || s.name.toLowerCase().includes('entire screen') || s.name.toLowerCase().includes('bildschirm') || s.name.toLowerCase().includes('screen')) || sources[0]
        if (screenSource) {
          sourceId = screenSource.id
        }
      }
    }

    const { width, height } = getQualityDimensions(settings.quality)

    // 2. Request desktop video & system audio stream via Electron desktopCapturer
    const stream = await (navigator.mediaDevices as any).getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: 'desktop' },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId || undefined,
          maxWidth: width,
          maxHeight: height,
          maxFrameRate: settings.fps || 60,
        },
      },
    })

    // 3. Optional Microphone & Audio Mixing
    if (settings.captureMic) {
      try {
        const micConstraints: MediaTrackConstraints = {
          channelCount: settings.monoAudioInput ? 1 : 2,
        }
        if (settings.micDeviceId && settings.micDeviceId !== 'auto') {
          micConstraints.deviceId = { exact: settings.micDeviceId }
        }

        const micStream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints, video: false })
        const audioCtx = new AudioContext()
        const dest = audioCtx.createMediaStreamDestination()
        
        // System / Game audio
        if (stream.getAudioTracks().length > 0) {
          const sysSource = audioCtx.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]]))
          const sysGain = audioCtx.createGain()
          sysGain.gain.value = (settings.gameAudioVolume ?? 100) / 100
          sysSource.connect(sysGain)
          sysGain.connect(dest)
        }
        
        // Microphone audio with gain
        const micSource = audioCtx.createMediaStreamSource(micStream)
        const micGain = audioCtx.createGain()
        micGain.gain.value = (settings.micVolume || 80) / 100
        micSource.connect(micGain)
        micGain.connect(dest)

        if (stream.getAudioTracks().length > 0) stream.removeTrack(stream.getAudioTracks()[0])
        if (dest.stream.getAudioTracks().length > 0) stream.addTrack(dest.stream.getAudioTracks()[0])
      } catch (micErr) {
        console.warn('[ClipEngine] Microphone access error:', micErr)
      }
    }

    activeStream = stream
    previousSessionBlob = null
    currentSessionChunks = []

    _startRecorderSession()
    useClipStore.getState().setIsReplayBufferActive(true)
    console.log('[ClipEngine] Continuous replay buffer active')
    return true

  } catch (err) {
    console.error('[ClipEngine] startReplayBuffer failed:', err)
    _cleanup()
    useClipStore.getState().setIsReplayBufferActive(false)
    return false
  }
}

export function stopReplayBuffer() {
  _cleanup()
  useClipStore.getState().setIsReplayBufferActive(false)
}

// ─── Trigger Instant Clip (Medal.tv Style) ────────────────────────────────────
export async function triggerInstantClip(): Promise<boolean> {
  const settings = useClipStore.getState().settings
  const activeGame = useGameStore.getState().activeGame
  const gameTitle = activeGame?.name || 'Gameplay'
  const durationSeconds = settings.replayDurationSeconds || 30

  // 1. If buffer is not running, start it
  if (!mediaRecorder || mediaRecorder.state !== 'recording' || !activeStream) {
    await startReplayBuffer()
    sendAppNotification({
      title: 'Replay-Buffer gestartet 🎬',
      body: `Eclipse Replay-Buffer ist aktiv. Drücke ${settings.hotkey || 'F8'} im Spiel, um die letzten ${durationSeconds}s zu clippen.`,
      type: 'info',
      duration: 5000,
    })
    return true
  }

  try {
    const currentCount = currentSessionChunks.length
    if (currentCount < 2 && !previousSessionBlob) {
      sendAppNotification({
        title: 'Buffer füllt sich ⏳',
        body: `Bitte warte ein paar Sekunden, damit der Puffer gefüllt ist.`,
        type: 'info',
        duration: 4000,
      })
      return false
    }

    const mimeType = mediaRecorder.mimeType || 'video/webm'
    const currentBlob = new Blob(currentSessionChunks, { type: mimeType })
    const base64 = await blobToBase64(currentBlob)
    
    let prevBase64: string | undefined = undefined
    if (currentCount < durationSeconds && previousSessionBlob) {
      prevBase64 = await blobToBase64(previousSessionBlob)
    }

    const thumbnail = await captureThumbnail(activeStream)

    if (window.electronAPI?.clips?.saveClip) {
      const res = await window.electronAPI.clips.saveClip({
        videoBase64: base64,
        prevVideoBase64: prevBase64,
        title: `${gameTitle} – ${durationSeconds}s Highlight`,
        gameTitle: gameTitle,
        gameId: (activeGame as any)?.appId || activeGame?.id,
        duration: durationSeconds,
        thumbnailDataUrl: thumbnail,
        resolution: settings.quality || '1080p',
        fps: settings.fps || 60,
        format: settings.format || 'mp4',
        tags: [gameTitle.toLowerCase(), 'replay'],
      })

      if (res.success && res.clip) {
        useClipStore.getState().addClip(res.clip)
        if (settings.notifyOnClip !== false) {
          sendAppNotification({
            title: 'Clip gespeichert! 🎮',
            body: `${gameTitle} (${durationSeconds} Sek.) wurde in Eclipse Clips gespeichert.`,
            type: 'success',
            duration: 5000,
          })
        }
        return true
      }
    }
  } catch (err) {
    console.error('[ClipEngine] triggerInstantClip error:', err)
  }
  return false
}

// ─── Initialization ──────────────────────────────────────────────────────────
export function initClipEngine() {
  if (isInitialized) return
  isInitialized = true

  // 1. Load saved settings from disk
  if (window.electronAPI?.clips?.getSettings) {
    window.electronAPI.clips.getSettings().then((saved: any) => {
      if (saved) {
        useClipStore.getState().setSettings(saved)
        // Auto-start buffer if enabled
        if (saved.enabled) {
          startReplayBuffer()
        }
      }
    }).catch(() => {})
  }

  // 2. Load existing clips
  useClipStore.getState().refreshClips()

  // 3. Listen for global hotkey trigger
  if (window.electronAPI?.clips?.onHotkeyTriggered) {
    window.electronAPI.clips.onHotkeyTriggered(() => {
      triggerInstantClip()
    })
  }

  // 4. Auto-start replay buffer when a game starts
  if (window.electronAPI?.onGameStarted) {
    window.electronAPI.onGameStarted(() => {
      const settings = useClipStore.getState().settings
      if (settings.enabled && settings.autoStartOnGame !== false) {
        startReplayBuffer()
      }
    })
  }

  // Auto-stop replay buffer when game stops
  if (window.electronAPI?.onGameStopped) {
    window.electronAPI.onGameStopped(() => {
      const settings = useClipStore.getState().settings
      if (!settings.screenRecordingOnAppStart) {
        stopReplayBuffer()
      }
    })
  }
}
