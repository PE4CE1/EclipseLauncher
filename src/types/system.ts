export interface MemoryBudgetStatus {
  targetMB: number
  workingSetMB: number
  privateMB: number
  residentMB?: number | null
  committedMB?: number
  measurement?: 'private-working-set' | 'working-set-estimate'
  pressure: boolean
  lastReliefAt: number | null
}
export interface AutoLaunchStatus {
  supported: boolean
  registered: boolean
  enabled: boolean
  blocked: boolean
  minimized: boolean
}

export interface MainWindowState { visible: boolean; minimized: boolean; focused: boolean }
