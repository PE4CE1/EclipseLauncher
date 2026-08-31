import { useClipStore } from '../store/clipStore'
import { useGameStore } from '../store/gameStore'
import { sendAppNotification } from './notificationService'

let mediaRecorder: MediaRecorder | null = null
let activeStream: MediaStream | null = null
let activeMicStream: MediaStream | null = null
let audioContext: AudioContext | null = null

let previousSessionBlob: Blob | null = null
let currentSessionChunks: Blob[] = []

let sessionTimer: NodeJS.Timeout | null = null
let isInitialized = false

function getQualityDimensions(quality: string | undefined): { width: number, height: number } {
  switch (quality) {
    case '720p': return { width: 1280, height: 720 }
    case '1080p': return { width: 1920, height: 1080 }
    case '1440p': return { width: 2560, height: 1440 }
    case '4k': return { width: 3840, height: 2160 }
    default: return { width: 1920, height: 1080 }
  }
}

function getBitrateBps(bitrate: string | number | undefined): number {
  if (typeof bitrate === 'number') return bitrate * 1000000
  if (typeof bitrate === 'string') {
    const parsed = parseInt(bitrate.replace(/\D/g, ''), 10)
    if (!isNaN(parsed)) return parsed * 1000000
  }
  return 8000000
}

function getBestMimeType(preferH264: boolean): string {
  const types = preferH264 
    ? ['video/webm;codecs=h264,opus', 'video/webm;codecs=h264', 'video/webm']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t
  }
  return 'video/webm'
}

let extraAudioTracks: MediaStreamTrack[] = []

function _cleanup() {
  if (sessionTimer) clearTimeout(sessionTimer)
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop() } catch {}
  }
  if (activeStream) {
    activeStream.getTracks().forEach(t => t.stop())
  }
  if (activeMicStream) {
    activeMicStream.getTracks().forEach(t => t.stop())
  }
  extraAudioTracks.forEach(t => {
    try { t.stop() } catch {}
  })
  extraAudioTracks = []
  if (audioContext) {
    try { audioContext.close() } catch {}
    audioContext = null
  }
  mediaRecorder = null
  activeStream = null
  activeMicStream = null
  currentSessionChunks = []
  previousSessionBlob = null
}

export async function getDesktopStream(sourceId: string | null | undefined, fps: number = 60, width: number = 1920, height: number = 1080): Promise<MediaStream> {
  const targetFps = Math.min(60, Math.max(24, fps || 60))
  let targetSourceId = sourceId
  let fallbackAudioSourceId = sourceId
  try {
    if (window.electronAPI?.clips?.getSources) {
      const sources = await window.electronAPI.clips.getSources()
      const validSource = sources.find((s: any) => s.id === targetSourceId)
      if (!validSource) {
        const screen = sources.find((s: any) => s.id.startsWith('screen:')) || sources[0]
        if (screen) targetSourceId = screen.id
      }
      
      // If capturing a window, audio capture usually fails. Fallback audio to the primary screen.
      if (targetSourceId && targetSourceId.startsWith('window:')) {
        const screen = sources.find((s: any) => s.id.startsWith('screen:')) || sources[0]
        if (screen) fallbackAudioSourceId = screen.id
      } else {
        fallbackAudioSourceId = targetSourceId
      }
    }
  } catch (e) {
    console.warn('[ClipEngine] Failed to get sources:', e)
  }

  const baseVideoConstraints = {
    mandatory: {
      maxWidth: width,
      maxHeight: height,
      maxFrameRate: targetFps,
      chromeMediaSource: 'desktop',
      chromeMediaSourceId: targetSourceId
    }
  }

  const finalStream = new MediaStream()

  // 1. Fetch Video
  if (targetSourceId) {
    try {
      const videoStream = await (navigator.mediaDevices as any).getUserMedia({
        audio: false,
        video: baseVideoConstraints
      })
      const vTrack = videoStream.getVideoTracks()[0]
      if (vTrack) finalStream.addTrack(vTrack)
    } catch (err) {
      console.warn('[ClipEngine] Failed to get video track:', err)
    }
  }

  // 2. Fetch Audio (separately to bypass window constraints)
  try {
    const audioStream = await (navigator.mediaDevices as any).getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: fallbackAudioSourceId
        }
      },
      video: {
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: fallbackAudioSourceId, maxWidth: 640, maxHeight: 480, maxFrameRate: 5 }
      }
    })
    const aTrack = audioStream.getAudioTracks()[0]
    if (aTrack) {
      finalStream.addTrack(aTrack)
      audioStream.getVideoTracks().forEach((t: any) => t.stop()) // clean up dummy video track
    }
  } catch (err) {
    console.warn('[ClipEngine] Failed to get fallback desktop audio track:', err)
  }

  if (finalStream.getTracks().length === 0) {
    throw new Error('No desktop capture source available')
  }

  return finalStream
}

async function getMicrophoneStream(settings: any): Promise<MediaStream | null> {
  if (settings.captureMic === false) return null

  const micConstraints: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: true,
  }

  if (settings.micDeviceId && settings.micDeviceId !== 'auto') {
    micConstraints.deviceId = { exact: settings.micDeviceId }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints, video: false })
    if (stream && stream.getAudioTracks().length > 0) {
      stream.getAudioTracks().forEach(t => { t.enabled = true })
      return stream
    }
  } catch (err1) {
    console.warn('[ClipEngine] Specific mic constraints failed, attempting fallback:', err1)
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    if (stream && stream.getAudioTracks().length > 0) {
      stream.getAudioTracks().forEach(t => { t.enabled = true })
      return stream
    }
  } catch (err2) {
    console.warn('[ClipEngine] General microphone fallback failed:', err2)
    return null
  }
  return null
}

function _startRecorderSession(streamToRecord: MediaStream) {
  if (!streamToRecord) return
  const settings = useClipStore.getState().settings
  const mimeType = getBestMimeType(settings.codec === 'h264')

  try {
    const recorder = new MediaRecorder(streamToRecord, {
      mimeType,
      videoBitsPerSecond: getBitrateBps(settings.bitrate),
      audioBitsPerSecond: 192000,
    })
    currentSessionChunks = []
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) currentSessionChunks.push(ev.data as Blob)
    }
    recorder.start(1000)
    mediaRecorder = recorder

    const cycleIntervalMs = Math.max((settings.replayDurationSeconds || 30) * 2000, 90000)
    if (sessionTimer) clearTimeout(sessionTimer)
    sessionTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        if (currentSessionChunks.length > 0) previousSessionBlob = new Blob(currentSessionChunks, { type: mimeType })
        try { mediaRecorder.stop() } catch {}
        _startRecorderSession(streamToRecord)
      }
    }, cycleIntervalMs)
  } catch (err) {
    console.error('[ClipEngine] _startRecorderSession error:', err)
  }
}

let startAttemptId = 0

export async function startReplayBuffer(forceRestart = false): Promise<boolean> {
  if (!forceRestart && mediaRecorder && mediaRecorder.state === 'recording' && activeStream) return true
  
  const currentAttempt = ++startAttemptId
  _cleanup()
  
  try {
    const settings = useClipStore.getState().settings
    if (!settings.enabled) return false
    const { width, height } = getQualityDimensions(settings.quality)
    const targetFps = Math.min(144, Math.max(24, settings.fps || 60))
    
    // 1. Desktop video & audio
    const desktopStream = await getDesktopStream(settings.selectedMonitorId, targetFps, width, height)
    activeStream = desktopStream

    // 2. Microphone audio
    const micStream = await getMicrophoneStream(settings)
    activeMicStream = micStream

    // 3. Build single unified MediaStream with audio mixing
    const masterStream = new MediaStream()
    const videoTrack = desktopStream.getVideoTracks()[0]
    if (videoTrack) masterStream.addTrack(videoTrack)

    const desktopAudioTracks = desktopStream.getAudioTracks()
    const micAudioTracks = micStream ? micStream.getAudioTracks() : []

    const shouldCaptureGameAudio = (settings.audioRecordingOption as string) !== 'none'
    const opt = settings.audioRecordingOption || 'all'

    let customGameAudioTracks: MediaStreamTrack[] = []
    let customDiscordAudioTracks: MediaStreamTrack[] = []

    if (shouldCaptureGameAudio && (opt === 'game_only' || opt === 'game_and_discord')) {
      if (window.electronAPI?.clips?.getSources) {
        const sources = await window.electronAPI.clips.getSources()
        
        const discordWindow = sources.find((s: any) => s.id.startsWith('window:') && s.name.toLowerCase().includes('discord'))
        const gameWindow = sources.find((s: any) => 
          s.id.startsWith('window:') && 
          !s.name.toLowerCase().includes('eclipse') && 
          !s.name.toLowerCase().includes('discord') &&
          !s.name.toLowerCase().includes('spotify') &&
          !s.name.toLowerCase().includes('steam') &&
          !s.name.toLowerCase().includes('obs')
        )

        const captureWindowAudio = async (sourceId: string) => {
          try {
            const stream = await (navigator.mediaDevices as any).getUserMedia({
              audio: {
                mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId }
              },
              video: {
                mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: 640, maxHeight: 480, maxFrameRate: 5 }
              }
            })
            stream.getVideoTracks().forEach((t: any) => t.stop())
            return stream.getAudioTracks()
          } catch (err) { 
            console.warn('[ClipEngine] Failed to capture window audio:', err)
            return [] 
          }
        }

        if (gameWindow) customGameAudioTracks = await captureWindowAudio(gameWindow.id)
        if (opt === 'game_and_discord' && discordWindow) customDiscordAudioTracks = await captureWindowAudio(discordWindow.id)
      }
    }

    // Determine the base game tracks (either specific window or whole desktop)
    let validDesktopTracks: MediaStreamTrack[] = []
    if (shouldCaptureGameAudio) {
      if (opt === 'game_only' || opt === 'game_and_discord') {
         if (customGameAudioTracks.length > 0) {
           validDesktopTracks = customGameAudioTracks
         } else {
           validDesktopTracks = desktopStream.getAudioTracks()
         }
      } else {
        validDesktopTracks = desktopStream.getAudioTracks()
      }
    }

    const validMicTracks = micAudioTracks

    if (validDesktopTracks.length > 0 && validMicTracks.length > 0) {
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          latencyHint: 'interactive'
        })
        
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }
        const dest = audioContext.createMediaStreamDestination()
        
        const deskSource = audioContext.createMediaStreamSource(new MediaStream([validDesktopTracks[0]]))
        const deskGain = audioContext.createGain()
        deskGain.gain.value = (settings.audioOutputVolume ?? 100) / 100
        deskSource.connect(deskGain).connect(dest)
        
        const micSource = audioContext.createMediaStreamSource(new MediaStream([validMicTracks[0]]))
        const micGain = audioContext.createGain()
        micGain.gain.value = (settings.micVolume ?? 100) / 100
        
        if (settings.monoAudioInput) {
          micSource.channelCount = 1
          micSource.channelCountMode = 'explicit'
        }
        
        micSource.connect(micGain).connect(dest)

        if (customDiscordAudioTracks.length > 0) {
          try {
            const discordSource = audioContext.createMediaStreamSource(new MediaStream([customDiscordAudioTracks[0]]))
            const discordGain = audioContext.createGain()
            discordGain.gain.value = 1.0
            discordSource.connect(discordGain).connect(dest)
          } catch (err) {
            console.warn('[ClipEngine] Failed to mix discord audio:', err)
          }
        }

        // Fix Chrome MediaRecorder silent track bug by keeping destination continuously active
        const dummyOsc = audioContext.createOscillator()
        const dummyGain = audioContext.createGain()
        dummyGain.gain.value = 0.00001
        dummyOsc.connect(dummyGain).connect(dest)
        dummyOsc.start()

        const mixedAudioTrack = dest.stream.getAudioTracks()[0]
        if (mixedAudioTrack) {
          mixedAudioTrack.enabled = true
          masterStream.addTrack(mixedAudioTrack)
        }
      } catch (e) {
        console.warn('[ClipEngine] AudioContext mixing failed, falling back to desktop track:', e)
        validDesktopTracks[0].enabled = true
        masterStream.addTrack(validDesktopTracks[0])
      }
    } else if (validDesktopTracks.length > 0) {
      validDesktopTracks[0].enabled = true
      masterStream.addTrack(validDesktopTracks[0])
    } else if (validMicTracks.length > 0) {
      validMicTracks[0].enabled = true
      masterStream.addTrack(validMicTracks[0])
    }

    if (currentAttempt !== startAttemptId) {
      // Another start request came in while we were awaiting streams
      _cleanup()
      return false
    }

    _startRecorderSession(masterStream)
    useClipStore.getState().setIsReplayBufferActive(true)
    return true
  } catch (err) {
    console.error('[ClipEngine] startReplayBuffer error:', err)
    if (currentAttempt === startAttemptId) _cleanup()
    return false
  }
}

export function stopReplayBuffer() {
  _cleanup()
  useClipStore.getState().setIsReplayBufferActive(false)
}

function captureThumbnail(stream: MediaStream | null): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!stream || stream.getVideoTracks().length === 0) return resolve(undefined)
    const video = document.createElement('video')
    video.srcObject = stream
    video.muted = true
    video.play().then(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const ctx = canvas.getContext('2d')
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
      video.pause()
      video.srcObject = null
    }).catch(() => resolve(undefined))
  })
}
let isSavingClip = false

export async function triggerInstantClip(options?: { customTitle?: string; customTags?: string[]; isAutoClip?: boolean }): Promise<boolean> {
  if (isSavingClip) {
    console.log('[ClipEngine] Already saving a clip, ignoring request.')
    return false
  }

  const settings = useClipStore.getState().settings
  const activeGame = useGameStore.getState().activeGame
  const gameTitle = activeGame?.name || 'Gameplay'
  const durationSeconds = settings.replayDurationSeconds || 30

  if (!mediaRecorder || mediaRecorder.state !== 'recording' || !activeStream) {
    const started = await startReplayBuffer(true)
    if (!started) return false
    return false
  }

  isSavingClip = true
  try {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.requestData() } catch {}
      await new Promise(r => setTimeout(r, 150))
    }

    const currentBytes = currentSessionChunks.reduce((acc, c) => acc + c.size, 0)
    const prevBytes = previousSessionBlob ? previousSessionBlob.size : 0
    if (currentBytes + prevBytes < 1000) {
      if (!options?.isAutoClip) {
        sendAppNotification({ title: 'Puffer leer ⏳', body: 'Bitte warte etwas länger.', type: 'info', duration: 4000 })
      }
      isSavingClip = false
      return false
    }

    const mimeType = mediaRecorder?.mimeType || 'video/webm'
    const videoBuffer = new Uint8Array(await new Blob(currentSessionChunks, { type: mimeType }).arrayBuffer())
    let prevVideoBuffer: Uint8Array | undefined = undefined
    if (currentSessionChunks.length < durationSeconds && previousSessionBlob) {
      prevVideoBuffer = new Uint8Array(await previousSessionBlob.arrayBuffer())
    }

    const thumbnail = await captureThumbnail(activeStream)
    if (window.electronAPI?.clips?.saveClip) {
      const clipTitle = options?.customTitle || `${gameTitle} – ${durationSeconds}s Highlight`
      const clipTags = options?.customTags || [gameTitle.toLowerCase(), 'replay']
      
      const res = await window.electronAPI.clips.saveClip({
        videoBuffer, prevVideoBuffer,
        title: clipTitle,
        gameTitle, gameId: (activeGame as any)?.appId || activeGame?.id,
        duration: durationSeconds, thumbnailDataUrl: thumbnail,
        resolution: settings.quality || '1080p', fps: settings.fps || 60,
        format: settings.format || 'mp4', tags: clipTags,
      })
      if (!res.success) {
        sendAppNotification({ title: 'FEHLER', body: res.error || 'Fehler', type: 'error', duration: 5000 })
      } else {
        await useClipStore.getState().refreshClips()
        const store = useClipStore.getState()
        if (store.clips.length > 0 && res.clip && !options?.isAutoClip) {
          const newClip = store.clips.find(c => c.id === res.clip?.id) || res.clip
          store.setActiveClip(newClip)
          store.setIsTrimmerOpen(true)
        }
        sendAppNotification({
          title: options?.isAutoClip ? '🎬 Smart Auto-Clip gespeichert!' : 'Clip gespeichert! 🎬',
          body: options?.isAutoClip 
            ? `${clipTitle} (${durationSeconds}s) wurde automatisch aufgenommen.` 
            : `${durationSeconds}s Clip von ${gameTitle} wurde erfolgreich gespeichert.`,
          type: 'success',
          duration: 4500
        })
      }
      isSavingClip = false
      return res.success
    }
  } catch (err) {
    console.error('[ClipEngine] triggerInstantClip error:', err)
  }
  isSavingClip = false
  return false
}

export function initClipEngine() {
  if (isInitialized) return
  isInitialized = true
  if (window.electronAPI?.clips?.getSettings) {
    window.electronAPI.clips.getSettings().then((saved: any) => {
      if (saved) {
        useClipStore.getState().setSettings(saved)
        if (saved.enabled && saved.screenRecordingOnAppStart) startReplayBuffer()
      }
    }).catch(() => {})
  }

  let prevSettings = useClipStore.getState().settings
  useClipStore.subscribe((state) => {
    const s = state.settings
    const changed = 
      s.audioRecordingOption !== prevSettings.audioRecordingOption ||
      s.captureMic !== prevSettings.captureMic ||
      s.selectedMonitorId !== prevSettings.selectedMonitorId ||
      s.fps !== prevSettings.fps ||
      s.quality !== prevSettings.quality

    prevSettings = s

    if (changed && state.isReplayBufferActive) {
      console.log('[ClipEngine] Critical setting changed, restarting buffer...')
      startReplayBuffer(true)
    }
  })

  useClipStore.getState().refreshClips()
  if (window.electronAPI?.clips?.onHotkeyTriggered) window.electronAPI.clips.onHotkeyTriggered(() => triggerInstantClip())
  
  // Smart Auto-Clipping Event Listener
  if (window.electronAPI?.clips?.onAutoClipTriggered) {
    window.electronAPI.clips.onAutoClipTriggered((eventData) => {
      const s = useClipStore.getState().settings
      if (!s.enabled || !s.autoClipEnabled) return
      console.log('[ClipEngine] Received Auto-Clip trigger:', eventData)
      triggerInstantClip({
        customTitle: `${eventData.title} (${eventData.game})`,
        customTags: ['autoclip', eventData.game.toLowerCase(), eventData.eventType],
        isAutoClip: true
      })
    })
  }

  if (window.electronAPI?.onGameStarted) window.electronAPI.onGameStarted(() => {
    const s = useClipStore.getState().settings
    if (s.enabled && s.autoStartOnGame !== false) startReplayBuffer()
  })
  if (window.electronAPI?.onGameStopped) window.electronAPI.onGameStopped(() => {
    if (!useClipStore.getState().settings.screenRecordingOnAppStart) stopReplayBuffer()
  })
}
