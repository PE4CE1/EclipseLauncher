import type { ClipSettings } from '../types/game'

export const DEFAULT_CLIP_AUDIO_SETTINGS = {
  separateApplications: true,
  captureDesktop: true,
  captureDiscord: false,
  captureMic: true,
  monoAudioInput: true,
} satisfies Partial<ClipSettings>
