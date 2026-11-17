import { create } from 'zustand'
import type { EclipseClip, ClipSettings, ClipCaptureStatus } from '../types/game'
import { DEFAULT_CLIP_AUDIO_SETTINGS } from '../services/clipAudioDefaults'

export interface PendingClip { id: string; title: string; gameTitle: string; createdAt: number; thumbnailUrl?: string; phase?: 'preparing'|'saving' }

interface ClipStore {
  clips: EclipseClip[]
  pendingClip: PendingClip | null
  pendingClips: PendingClip[]
  setPendingClip: (clip: PendingClip) => void
  updatePendingThumbnail: (id: string, thumbnailUrl: string) => void
  updatePendingPhase: (id: string, phase: 'preparing'|'saving') => void
  clearPendingClip: (id: string) => void
  isLoading: boolean
  activeClip: EclipseClip | null
  isTrimmerOpen: boolean
  isSettingsOpen: boolean
  isRecording: boolean
  isReplayBufferActive: boolean
  isSavingClip: boolean
  setIsSavingClip: (saving: boolean) => void
  captureStatus: ClipCaptureStatus
  setCaptureStatus: (status: ClipCaptureStatus) => void
  selectedGameFilter: string
  searchQuery: string
  settings: ClipSettings

  setClips: (clips: EclipseClip[]) => void
  addClip: (clip: EclipseClip, pendingId?: string) => void
  removeClip: (clipId: string) => void
  updateClipMeta: (clipId: string, title: string, tags?: string[]) => void
  updateClipDraft: (clipId: string, draft: import('../services/clipEdits').ClipEditDraft | null, title: string) => void
  setActiveClip: (clip: EclipseClip | null) => void
  setIsTrimmerOpen: (open: boolean) => void
  setIsSettingsOpen: (open: boolean) => void
  setIsRecording: (recording: boolean) => void
  setIsReplayBufferActive: (active: boolean) => void
  setSelectedGameFilter: (game: string) => void
  setSearchQuery: (q: string) => void
  setSettings: (settings: Partial<ClipSettings>) => void
  refreshClips: () => Promise<void>
  optimizeClip: (clipId: string, quality?: 'balanced' | 'discord') => Promise<{ success: boolean; oldSize?: number; newSize?: number; savedPercent?: number; clip?: EclipseClip; error?: string }>
}

const DEFAULT_SETTINGS: ClipSettings = {
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
  audioRecordingOption: 'all',
  audioOutputDeviceId: 'auto',
  audioOutputVolume: 100,
  ...DEFAULT_CLIP_AUDIO_SETTINGS,
  micDeviceId: 'auto',
  micVolume: 80,
  micSensitivity: -40,
  gameAudioVolume: 100,
  gameAudioProcess: 'auto',

  voiceCaptureEnabled: false,
  voiceCapturePhrase: 'clip that',
  selectedMonitorId: 'screen:0:0',
  screenRecordingOnAppStart: false,
  notifyOnClip: true,
  playSoundOnClip: true,
  autoStartOnGame: true,
  maxStorageGB: 25,
  
  // Smart Auto-Clipping (Off by default)
  autoClipEnabled: false,
  autoClipRocketLeagueEnabled: false,
  autoClipCS2Enabled: true,
  autoClipDota2Enabled: false,
  autoClipLoLEnabled: false,
  autoClipRocketLeagueGoals: true,
  autoClipRocketLeagueSaves: true,
  autoClipRocketLeagueDemos: false,
  autoClipRocketLeagueWins: true,
  autoClipCS2Kills: true,
  autoClipCS2Wins: false,
  autoClipCooldownSeconds: 15,
}

export const useClipStore = create<ClipStore>((set, get) => ({
  clips: [],
  pendingClip: null,
  pendingClips: [],
  setPendingClip: clip => set(state => {
    const pendingClips = [...state.pendingClips.filter(item => item.id !== clip.id), clip]
    return { pendingClips, pendingClip: pendingClips[0] || null }
  }),
  updatePendingThumbnail: (id, thumbnailUrl) => set(state => {
    if (!state.pendingClips.some(clip => clip.id === id)) return state
    const pendingClips = state.pendingClips.map(clip => clip.id === id ? { ...clip, thumbnailUrl } : clip)
    return { pendingClips, pendingClip: pendingClips[0] || null }
  }),
  updatePendingPhase: (id, phase) => set(state => {
    if (!state.pendingClips.some(clip => clip.id === id)) return state
    const pendingClips = state.pendingClips.map(clip => clip.id === id ? { ...clip, phase } : clip)
    return { pendingClips, pendingClip: pendingClips[0] || null }
  }),
  clearPendingClip: id => set(state => {
    const pendingClips = state.pendingClips.filter(clip => clip.id !== id)
    return { pendingClips, pendingClip: pendingClips[0] || null }
  }),
  isLoading: false,
  activeClip: null,
  isTrimmerOpen: false,
  isSettingsOpen: false,
  isRecording: false,
  isReplayBufferActive: false,
  isSavingClip: false,
  setIsSavingClip: isSavingClip => set({ isSavingClip }),
  captureStatus: {},
  setCaptureStatus: captureStatus => set({ captureStatus }),
  selectedGameFilter: 'all',
  searchQuery: '',
  settings: DEFAULT_SETTINGS,

  setClips: (clips) => set({ clips }),
  addClip: (clip, pendingId) => set(state => {
    const pendingClips = pendingId ? state.pendingClips.filter(item => item.id !== pendingId) : state.pendingClips
    return { clips: [clip, ...state.clips.filter(item => item.id !== clip.id)], pendingClips, pendingClip: pendingClips[0] || null }
  }),
  removeClip: (clipId) => set((state) => ({
    clips: state.clips.filter((c) => c.id !== clipId),
    activeClip: state.activeClip?.id === clipId ? null : state.activeClip,
  })),
  updateClipMeta: (clipId, title, tags) => set((state) => ({
    clips: state.clips.map((c) => (c.id === clipId ? { ...c, title, tags: tags || c.tags } : c)),
    activeClip: state.activeClip?.id === clipId ? { ...state.activeClip, title, tags: tags || state.activeClip.tags } : state.activeClip,
  })),
  setActiveClip: (activeClip) => set({ activeClip }),
  updateClipDraft: (clipId, draft, title) => set(state => ({
    clips: state.clips.map(clip => clip.id === clipId ? { ...clip, title, editDraft: draft || undefined } : clip),
    activeClip: state.activeClip?.id === clipId ? { ...state.activeClip, title, editDraft: draft || undefined } : state.activeClip,
  })),
  setIsTrimmerOpen: (isTrimmerOpen) => set({ isTrimmerOpen }),
  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setIsReplayBufferActive: (isReplayBufferActive) => set({ isReplayBufferActive }),
  setSelectedGameFilter: (selectedGameFilter) => set({ selectedGameFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSettings: (patch) => {
    const sanitized = { ...patch }
    delete (sanitized as Record<string,unknown>).captureEngine
    if (typeof sanitized.micSensitivity === 'number' && sanitized.micSensitivity > 0) {
      sanitized.micSensitivity = -40
    }
    const changed = Object.fromEntries(Object.entries(sanitized).filter(([key, value]) => !Object.is(get().settings[key as keyof ClipSettings], value))) as Partial<ClipSettings>
    if (!Object.keys(changed).length) return
    const updated = { ...get().settings, ...changed }
    set({ settings: updated })
    if (window.electronAPI?.clips?.saveSettings) {
      void window.electronAPI.clips.saveSettings(changed).catch(error => {
        console.warn('[Clips] Settings could not be saved:', error)
        set({ captureStatus: { ...get().captureStatus, error: error instanceof Error ? error.message : String(error) } })
      })
    }
  },
  refreshClips: async () => {
    if (!window.electronAPI?.clips?.listClips) return
    set({ isLoading: true })
    const existingIds = new Set(get().clips.map(clip => clip.id))
    try {
      const clips = await window.electronAPI.clips.listClips()
      set(state => {
        const fetched = Array.isArray(clips) ? clips : [], fetchedIds = new Set(fetched.map(clip => clip.id))
        const savedDuringLoad = state.clips.filter(clip => !existingIds.has(clip.id) && !fetchedIds.has(clip.id))
        return { clips: [...savedDuringLoad, ...fetched], isLoading: false }
      })
    } catch (err) {
      console.warn('[Clips] refreshClips error:', err)
      set({ isLoading: false })
    }
  },
  optimizeClip: async (clipId: string, quality: 'balanced' | 'discord' = 'balanced') => {
    if (!window.electronAPI?.clips?.optimizeClip) return { success: false, error: 'Not supported' }
    try {
      const res = await window.electronAPI.clips.optimizeClip({ clipId, quality })
      if (res.success && res.clip) {
        const updated = get().clips.map(c => c.id === clipId ? res.clip! : c)
        set({ clips: updated })
        if (get().activeClip?.id === clipId) {
          set({ activeClip: res.clip })
        }
      }
      return res
    } catch (err: any) {
      return { success: false, error: err?.message || 'Optimization failed' }
    }
  },
}))
