const retiredSettings = ['homeLayout', 'memoryTargetMB', 'memoryHardLimitMB', 'memoryRamLimiter', 'memoryLimiterVersion'] as const

/** Old renderers and persisted preferences must not restore removed features. */
export function withoutRetiredSettings<T extends object>(settings: T): T {
  if (!retiredSettings.some(key => Object.prototype.hasOwnProperty.call(settings, key))) return settings
  const next = { ...settings }
  for (const key of retiredSettings) delete (next as Record<string, unknown>)[key]
  return next
}
