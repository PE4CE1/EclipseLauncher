import { useClipStore } from '../store/clipStore'
import { triggerInstantClip } from './clipEngine'

let isVoiceActive = false
let unsubHotword: (() => void) | null = null

export function initVoiceEngine() {
  if (window.electronAPI?.voice?.onHotwordDetected) {
    unsubHotword = window.electronAPI.voice.onHotwordDetected((data: { text: string; confidence: number }) => {
      console.log(`[VoiceEngine] Hotword "${data.text}" detected! Triggering instant clip...`)
      triggerInstantClip()
    })
  }

  useClipStore.subscribe((state, prevState) => {
    if (state.settings.voiceCaptureEnabled !== prevState.settings.voiceCaptureEnabled ||
        state.settings.voiceCapturePhrase !== prevState.settings.voiceCapturePhrase ||
        state.isReplayBufferActive !== prevState.isReplayBufferActive) {
      if (state.settings.voiceCaptureEnabled && state.isReplayBufferActive) {
        startVoiceEngine()
      } else {
        stopVoiceEngine()
      }
    }
  })

  const state = useClipStore.getState()
  if (state.settings.voiceCaptureEnabled && state.isReplayBufferActive) {
    startVoiceEngine()
  }
}

export function startVoiceEngine() {
  const state = useClipStore.getState()
  if (!state.settings.voiceCaptureEnabled || !state.isReplayBufferActive) {
    return
  }

  const phrase = state.settings.voiceCapturePhrase || 'clip that'

  if (window.electronAPI?.voice?.start) {
    window.electronAPI.voice.start(phrase)
    isVoiceActive = true
  }
}

export function stopVoiceEngine() {
  isVoiceActive = false
  if (window.electronAPI?.voice?.stop) {
    window.electronAPI.voice.stop()
  }
}
