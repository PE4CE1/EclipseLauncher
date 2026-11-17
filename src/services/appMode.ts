export type AppMode = 'launcher' | 'clips'
export const normalizeAppMode = (value: unknown): AppMode => value === 'clips' ? 'clips' : 'launcher'

export function clipsModeSettings<T extends Record<string, any>>(settings: T): T {
  const off = Object.fromEntries(['overlayPerformance', 'overlayCrosshair', 'overlayGeneralAlwaysOn', 'overlayCps', 'overlayController', 'overlayMedia', 'overlayRobloxTimer', 'overlayRobloxCps', 'overlayRobloxAntiAfk', 'overlayRLHud', 'overlayRLSteam', 'overlayRLController', 'overlayControllerStreamWindow', 'discordRpcShowDownloads', 'showDownloads'].map(key => [key, false]))
  return { ...settings, ...off }
}
