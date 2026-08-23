import { useClipStore } from '../store/clipStore'
import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'

interface BufferedChunk {
  blob: Blob
  timestamp: number
}

let activeStream: MediaStream | null = null
let mediaRecorder: MediaRecorder | null = null
let rollingChunks: BufferedChunk[] = []
let offscreenVideo: HTMLVideoElement | null = null
let isInitialized = false

/**
 * Generate a thumbnail from the active media stream or video element
 */
async function captureThumbnail(stream: MediaStream): Promise<string> {
  return new Promise((resolve) => {
    try {
      if (!offscreenVideo) {
        offscreenVideo = document.createElement('video')
        offscreenVideo.muted = true
        offscreenVideo.playsInline = true
        offscreenVideo.autoplay = true
      }
      offscreenVideo.srcObject = stream
      offscreenVideo.onloadedmetadata = () => {
        offscreenVideo?.play().then(() => {
          setTimeout(() => {
            try {
              const canvas = document.createElement('canvas')
              canvas.width = offscreenVideo?.videoWidth || 1280
              canvas.height = offscreenVideo?.videoHeight || 720
              const ctx = canvas.getContext('2d')
              if (ctx && offscreenVideo) {
                ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
                resolve(dataUrl)
                return
              }
            } catch (e) {
              console.warn('[ClipEngine] Canvas draw error:', e)
            }
            resolve('')
          }, 200)
        }).catch(() => resolve(''))
      }
    } catch {
      resolve('')
    }
  })
}

/**
 * Convert Blob to Base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to convert blob to base64'))
      }
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Start the low-overhead rolling Replay Buffer
 */
export async function startReplayBuffer(): Promise<boolean> {
  if (activeStream && mediaRecorder && mediaRecorder.state === 'recording') {
    return true
  }

  try {
    const settings = useClipStore.getState().settings
    if (!settings.enabled) return false

    // 1. Get desktop screen sources from Electron
    let sourceId: string | null = null
    if (window.electronAPI?.clips?.getSources) {
      const sources = await window.electronAPI.clips.getSources()
      // Prioritize primary screen or game window
      const screenSource = sources.find((s: any) => s.id.startsWith('screen:') || s.name.toLowerCase().includes('entire screen') || s.name.toLowerCase().includes('bildschirm')) || sources[0]
      if (screenSource) {
        sourceId = screenSource.id
      }
    }

    // 2. Request desktop video & system audio stream
    const videoConstraints: any = sourceId
      ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minFrameRate: settings.fps || 60,
            maxFrameRate: settings.fps || 60,
            maxWidth: settings.quality === '720p' ? 1280 : 1920,
            maxHeight: settings.quality === '720p' ? 720 : 1080,
          },
        }
      : {
          width: { ideal: settings.quality === '720p' ? 1280 : 1920 },
          height: { ideal: settings.quality === '720p' ? 720 : 1080 },
          frameRate: { ideal: settings.fps || 60 },
        }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // @ts-ignore
        mandatory: sourceId ? { chromeMediaSource: 'desktop' } : undefined,
      },
      video: videoConstraints,
    })

    // 3. Optional Microphone audio track mixing
    if (settings.captureMic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        const audioCtx = new AudioContext()
        const dest = audioCtx.createMediaStreamDestination()
        
        // System audio source
        if (stream.getAudioTracks().length > 0) {
          const sysSource = audioCtx.createMediaStreamSource(new MediaStream([stream.getAudioTracks()[0]]))
          sysSource.connect(dest)
        }
        
        // Mic audio source with volume gain
        const micSource = audioCtx.createMediaStreamSource(micStream)
        const micGain = audioCtx.createGain()
        micGain.gain.value = (settings.micVolume || 80) / 100
        micSource.connect(micGain)
        micGain.connect(dest)

        // Replace audio track
        if (dest.stream.getAudioTracks().length > 0) {
          stream.removeTrack(stream.getAudioTracks()[0])
          stream.addTrack(dest.stream.getAudioTracks()[0])
        }
      } catch (micErr) {
        console.warn('[ClipEngine] Microphone access error:', micErr)
      }
    }

    activeStream = stream
    rollingChunks = []

    // 4. Select supported mimeType
    let mimeType = 'video/webm;codecs=vp9,opus'
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=h264,opus'
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm'
    }

    // 5. Initialize MediaRecorder with 1-second timeslices
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: settings.quality === '720p' ? 6000000 : 12000000,
    })

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const now = Date.now()
        rollingChunks.push({ blob: event.data, timestamp: now })
        
        // Discard chunks older than replayDurationSeconds + 3s margin
        const maxAgeMs = (useClipStore.getState().settings.replayDurationSeconds + 3) * 1000
        const cutoff = now - maxAgeMs
        rollingChunks = rollingChunks.filter(c => c.timestamp >= cutoff)
      }
    }

    recorder.onstop = () => {
      useClipStore.getState().setIsReplayBufferActive(false)
    }

    recorder.start(1000) // Collect 1-second slices
    mediaRecorder = recorder
    useClipStore.getState().setIsReplayBufferActive(true)
    return true
  } catch (err) {
    console.warn('[ClipEngine] startReplayBuffer error:', err)
    useClipStore.getState().setIsReplayBufferActive(false)
    return false
  }
}

/**
 * Stop the rolling Replay Buffer
 */
export function stopReplayBuffer() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop()
    } catch {}
  }
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop())
    activeStream = null
  }
  mediaRecorder = null
  rollingChunks = []
  useClipStore.getState().setIsReplayBufferActive(false)
}

/**
 * Capture an instant gameplay clip (last N seconds from Replay Buffer)
 */
export async function triggerInstantClip(): Promise<boolean> {
  const settings = useClipStore.getState().settings
  const activeGame = useGameStore.getState().activeGame
  const gameTitle = activeGame?.name || 'Gameplay'
  const durationSeconds = settings.replayDurationSeconds || 30

  // 1. If buffer is active, gather slice
  if (rollingChunks.length > 0 && activeStream) {
    try {
      const now = Date.now()
      const cutoff = now - (durationSeconds * 1000)
      const validChunks = rollingChunks.filter(c => c.timestamp >= cutoff).map(c => c.blob)
      
      if (validChunks.length > 0) {
        const fullBlob = new Blob(validChunks, { type: 'video/webm' })
        const base64 = await blobToBase64(fullBlob)
        const thumbnail = await captureThumbnail(activeStream)

        if (window.electronAPI?.clips?.saveClip) {
          const res = await window.electronAPI.clips.saveClip({
            videoBase64: base64,
            title: `${gameTitle} - ${durationSeconds}s Highlight`,
            gameTitle: gameTitle,
            gameId: (activeGame as any)?.appId || activeGame?.id,
            duration: durationSeconds,
            thumbnailDataUrl: thumbnail,
            resolution: settings.quality || '1080p',
            fps: settings.fps || 60,
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
      }
    } catch (err) {
      console.error('[ClipEngine] Error capturing clip from buffer:', err)
    }
  }

  // 2. Fallback / Direct Sample Clip creation if screen capture wasn't actively streaming
  try {
    // Attempt to start buffer now for next time
    startReplayBuffer()

    sendAppNotification({
      title: 'Replay-Buffer gestartet! 🎬',
      body: 'Der Eclipse Replay-Buffer ist jetzt aktiv. Drücke F8 im Spiel, um Clips zu speichern.',
      type: 'info',
      duration: 5000,
    })
    return true
  } catch (err) {
    console.warn('[ClipEngine] triggerInstantClip fallback error:', err)
    return false
  }
}

/**
 * Initialize global clip engine listeners and load settings
 */
export function initClipEngine() {
  if (isInitialized) return
  isInitialized = true

  // 1. Load saved settings from disk
  if (window.electronAPI?.clips?.getSettings) {
    window.electronAPI.clips.getSettings().then((saved: any) => {
      if (saved) {
        useClipStore.getState().setSettings(saved)
      }
    }).catch(() => {})
  }

  // 2. Load existing clips
  useClipStore.getState().refreshClips()

  // 3. Listen for global hotkey trigger (F8)
  if (window.electronAPI?.clips?.onHotkeyTriggered) {
    window.electronAPI.clips.onHotkeyTriggered(() => {
      triggerInstantClip()
    })
  }

  // 4. Auto-start replay buffer when a game starts
  if (window.electronAPI?.onGameStarted) {
    window.electronAPI.onGameStarted(() => {
      const settings = useClipStore.getState().settings
      if (settings.enabled) {
        startReplayBuffer()
      }
    })
  }

  // Auto-stop replay buffer when game stops
  if (window.electronAPI?.onGameStopped) {
    window.electronAPI.onGameStopped(() => {
      stopReplayBuffer()
    })
  }
}
