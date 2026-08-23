import { useClipStore } from '../store/clipStore'
import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'

// ─── Module-level state ───────────────────────────────────────────────────────
let activeStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let isInitialized = false

// Ring buffer – we always keep the WebM init segment (first chunk) plus
// a sliding window of data chunks. Never removing the init chunk ensures
// that FFmpeg and every video player can parse the stream.
interface TimedChunk {
  blob: Blob
  ts: number       // absolute ms when this chunk arrived
  isInit: boolean  // true only for the very first chunk (EBML + Tracks)
}
let ringBuffer: TimedChunk[] = []

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getBitrateBps(bitrate?: string): number {
  switch (bitrate) {
    case '20M': case 'ultra': return 20_000_000
    case '15M': return 15_000_000
    case '10M': case 'high': return 10_000_000
    case '8M':  case 'medium': return 8_000_000
    case '5M':  case 'low': return 5_000_000
    default: return 8_000_000
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
          }, 300)
        }).catch(() => resolve(''))
      }
    } catch { resolve('') }
  })
}

function _cleanup() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop() } catch {}
  }
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop())
    activeStream = null
  }
  mediaRecorder = null
  ringBuffer = []
}

// ─── Start Replay Buffer ──────────────────────────────────────────────────────

export async function startReplayBuffer(): Promise<boolean> {
  // Already running
  if (mediaRecorder && mediaRecorder.state === 'recording' && activeStream) {
    return true
  }

  _cleanup()

  try {
    const settings = useClipStore.getState().settings
    if (!settings.enabled) return false

    // 1. Resolve source ID
    let sourceId: string | null = null
    if (window.electronAPI?.clips?.getSources) {
      const sources: { id: string; name: string }[] = await window.electronAPI.clips.getSources()
      const preferred = settings.selectedMonitorId
        ? sources.find(s => s.id === settings.selectedMonitorId)
        : null
      const fallback = sources.find(s =>
        s.id.startsWith('screen:') ||
        s.name.toLowerCase().includes('entire screen') ||
        s.name.toLowerCase().includes('bildschirm') ||
        s.name.toLowerCase().includes('screen')
      ) || sources[0]
      sourceId = preferred?.id ?? fallback?.id ?? null
    }

    if (!sourceId) {
      console.error('[ClipEngine] No capture source found')
      return false
    }

    // 2. Acquire desktop stream
    const stream = await (navigator.mediaDevices as any).getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: 'desktop' },
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1920,
          maxHeight: 1080,
          maxFrameRate: settings.fps || 60,
        },
      },
    })

    // 3. Optional mic mixing
    if (settings.captureMic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: settings.monoAudioInput ? 1 : 2,
            ...(settings.micDeviceId && settings.micDeviceId !== 'auto'
              ? { deviceId: { exact: settings.micDeviceId } }
              : {}),
          },
          video: false,
        })
        const ctx = new AudioContext()
        const dest = ctx.createMediaStreamDestination()
        if (stream.getAudioTracks().length > 0) {
          const g = ctx.createGain()
          g.gain.value = (settings.gameAudioVolume ?? 100) / 100
          ctx.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]])).connect(g)
          g.connect(dest)
        }
        const mg = ctx.createGain()
        mg.gain.value = (settings.micVolume ?? 80) / 100
        ctx.createMediaStreamSource(micStream).connect(mg)
        mg.connect(dest)
        if (stream.getAudioTracks().length > 0) stream.removeTrack(stream.getAudioTracks()[0])
        if (dest.stream.getAudioTracks().length > 0) stream.addTrack(dest.stream.getAudioTracks()[0])
      } catch (e) {
        console.warn('[ClipEngine] Mic mix error:', e)
      }
    }

    activeStream = stream
    ringBuffer = []

    // 4. Create MediaRecorder
    const mimeType = getBestMimeType(settings.codec === 'h264')
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: getBitrateBps(settings.bitrate),
    })

    let chunkCount = 0

    recorder.ondataavailable = (ev) => {
      if (!ev.data || ev.data.size < 50) return
      const isInit = chunkCount === 0
      chunkCount++
      ringBuffer.push({ blob: ev.data, ts: Date.now(), isInit })

      // Keep init chunk always + last (replayDurationSeconds + 5s) of data
      const keepMs = ((useClipStore.getState().settings.replayDurationSeconds ?? 30) + 5) * 1000
      const cutoff = Date.now() - keepMs
      ringBuffer = ringBuffer.filter(c => c.isInit || c.ts >= cutoff)
    }

    recorder.onerror = (e: Event) => {
      console.error('[ClipEngine] MediaRecorder error:', e)
    }

    recorder.onstop = () => {
      useClipStore.getState().setIsReplayBufferActive(false)
    }

    recorder.start(1000) // 1-second slices
    mediaRecorder = recorder
    useClipStore.getState().setIsReplayBufferActive(true)
    console.log('[ClipEngine] Buffer started – mime:', mimeType)
    return true

  } catch (err) {
    console.error('[ClipEngine] startReplayBuffer failed:', err)
    _cleanup()
    useClipStore.getState().setIsReplayBufferActive(false)
    return false
  }
}

// ─── Stop Buffer ──────────────────────────────────────────────────────────────

export function stopReplayBuffer() {
  _cleanup()
  useClipStore.getState().setIsReplayBufferActive(false)
}

// ─── Trigger Clip ─────────────────────────────────────────────────────────────

export async function triggerInstantClip(): Promise<boolean> {
  const settings   = useClipStore.getState().settings
  const activeGame = useGameStore.getState().activeGame
  const gameTitle  = activeGame?.name || 'Gameplay'
  const wantedSec  = settings.replayDurationSeconds || 30

  // Buffer not running → start it
  if (!mediaRecorder || mediaRecorder.state !== 'recording' || !activeStream) {
    await startReplayBuffer()
    sendAppNotification({
      title: 'Replay-Buffer gestartet 🎬',
      body: `Drücke F8 erneut nach ${wantedSec}s, um einen Clip zu speichern.`,
      type: 'info',
      duration: 5000,
    })
    return true
  }

  try {
    const initChunk  = ringBuffer.find(c => c.isInit)
    const now        = Date.now()
    const cutoff     = now - wantedSec * 1000
    const dataChunks = ringBuffer.filter(c => !c.isInit && c.ts >= cutoff)

    if (!initChunk || dataChunks.length < 2) {
      sendAppNotification({
        title: 'Noch nicht genug Puffer ⏳',
        body: `Bitte warte ${wantedSec}s nach dem Start des Buffers.`,
        type: 'info',
        duration: 4000,
      })
      return false
    }

    // WebM: init segment + data chunks
    const allBlobs = [initChunk.blob, ...dataChunks.map(c => c.blob)]
    const fullBlob = new Blob(allBlobs, { type: 'video/webm' })

    console.log(`[ClipEngine] Clip: ${dataChunks.length} chunks, ${Math.round(fullBlob.size / 1024)} KB`)

    const [base64, thumbnail] = await Promise.all([
      blobToBase64(fullBlob),
      captureThumbnail(activeStream!),
    ])

    if (!window.electronAPI?.clips?.saveClip) return false

    const res = await window.electronAPI.clips.saveClip({
      videoBase64: base64,
      title: `${gameTitle} – ${wantedSec}s Clip`,
      gameTitle,
      gameId: (activeGame as any)?.appId ?? activeGame?.id,
      duration: wantedSec,
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
          body: `${gameTitle} (${wantedSec}s) wurde gespeichert.`,
          type: 'success',
          duration: 5000,
        })
      }
      return true
    }

    return false
  } catch (err) {
    console.error('[ClipEngine] triggerInstantClip error:', err)
    return false
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initClipEngine() {
  if (isInitialized) return
  isInitialized = true

  window.electronAPI?.clips?.getSettings?.()
    .then((saved: any) => {
      if (saved) {
        useClipStore.getState().setSettings(saved)
        if (saved.enabled && saved.screenRecordingOnAppStart) {
          startReplayBuffer()
        }
      }
    })
    .catch(() => {})

  useClipStore.getState().refreshClips()

  window.electronAPI?.clips?.onHotkeyTriggered?.(() => {
    triggerInstantClip()
  })

  window.electronAPI?.onGameStarted?.(() => {
    const s = useClipStore.getState().settings
    if (s.enabled && s.autoStartOnGame !== false) startReplayBuffer()
  })

  window.electronAPI?.onGameStopped?.(() => {
    const s = useClipStore.getState().settings
    if (!s.screenRecordingOnAppStart) stopReplayBuffer()
  })
}
