import { create } from 'zustand'
import type { EclipseClip, ClipSettings } from '../types/game'

interface ClipStore {
  clips: EclipseClip[]
  isLoading: boolean
  activeClip: EclipseClip | null
  isTrimmerOpen: boolean
  isSettingsOpen: boolean
  isRecording: boolean
  isReplayBufferActive: boolean
  selectedGameFilter: string
  searchQuery: string
  settings: ClipSettings

  setClips: (clips: EclipseClip[]) => void
  addClip: (clip: EclipseClip) => void
  removeClip: (clipId: string) => void
  updateClipMeta: (clipId: string, title: string, tags?: string[]) => void
  setActiveClip: (clip: EclipseClip | null) => void
  setIsTrimmerOpen: (open: boolean) => void
  setIsSettingsOpen: (open: boolean) => void
  setIsRecording: (recording: boolean) => void
  setIsReplayBufferActive: (active: boolean) => void
  setSelectedGameFilter: (game: string) => void
  setSearchQuery: (q: string) => void
  setSettings: (settings: Partial<ClipSettings>) => void
  refreshClips: () => Promise<void>
}

const DEFAULT_SETTINGS: ClipSettings = {
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
  audioRecordingOption: 'all',
  audioOutputDeviceId: 'auto',
  audioOutputVolume: 100,
  captureMic: true,
  monoAudioInput: false,
  micDeviceId: 'auto',
  micVolume: 80,
  gameAudioVolume: 100,

  voiceCaptureEnabled: false,
  voiceCapturePhrase: 'clip that',
  selectedMonitorId: 'screen:0:0',
  screenRecordingOnAppStart: false,
  notifyOnClip: true,
  playSoundOnClip: true,
  autoStartOnGame: true,
  maxStorageGB: 25,
}

export const useClipStore = create<ClipStore>((set, get) => ({
  clips: [],
  isLoading: false,
  activeClip: null,
  isTrimmerOpen: false,
  isSettingsOpen: false,
  isRecording: false,
  isReplayBufferActive: false,
  selectedGameFilter: 'all',
  searchQuery: '',
  settings: DEFAULT_SETTINGS,

  setClips: (clips) => set({ clips }),
  addClip: (clip) => set((state) => ({ clips: [clip, ...state.clips] })),
  removeClip: (clipId) => set((state) => ({
    clips: state.clips.filter((c) => c.id !== clipId),
    activeClip: state.activeClip?.id === clipId ? null : state.activeClip,
  })),
  updateClipMeta: (clipId, title, tags) => set((state) => ({
    clips: state.clips.map((c) => (c.id === clipId ? { ...c, title, tags: tags || c.tags } : c)),
    activeClip: state.activeClip?.id === clipId ? { ...state.activeClip, title, tags: tags || state.activeClip.tags } : state.activeClip,
  })),
  setActiveClip: (activeClip) => set({ activeClip }),
  setIsTrimmerOpen: (isTrimmerOpen) => set({ isTrimmerOpen }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setIsReplayBufferActive: (isReplayBufferActive) => set({ isReplayBufferActive }),
  setSelectedGameFilter: (selectedGameFilter) => set({ selectedGameFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSettings: (patch) => {
    const updated = { ...get().settings, ...patch }
    set({ settings: updated })
    if (window.electronAPI?.clips?.saveSettings) {
      window.electronAPI.clips.saveSettings(updated)
    }
  },
  refreshClips: async () => {
    if (!window.electronAPI?.clips?.listClips) return
    set({ isLoading: true })
    try {
      const clips = await window.electronAPI.clips.listClips()
      set({ clips: clips || [], isLoading: false })
    } catch (err) {
      console.warn('[Clips] refreshClips error:', err)
      set({ isLoading: false })
    }
  },
}))
