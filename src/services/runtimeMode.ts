import { normalizeAppMode } from './appMode'

// Native startup decides the running mode. Saved preferences only take effect
// after restart, so changing a setting cannot partially dismantle a recording.
export const runtimeMode = normalizeAppMode(typeof window === 'undefined' ? undefined : window.electronAPI?.appMode)
