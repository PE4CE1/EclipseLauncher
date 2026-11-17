export type SpicetifyErrorCode = 'busy' | 'not_installed' | 'spotify_missing' | 'prefs_missing' | 'backup_required' | 'preprocess_outdated' | 'customization_missing' | 'permissions' | 'administrator' | 'network' | 'timeout' | 'start_failed' | 'folder_missing' | 'failed'
export interface SpicetifyResult {
  success: boolean
  error?: string
  errorCode?: SpicetifyErrorCode
  exitCode?: number
  details?: string
}
