export const DEFAULT_MEMORY_TARGET_MB = 1024
export function normalizeMemoryTarget(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && (value === 0 || value >= 128 && value <= 8192) ? value : DEFAULT_MEMORY_TARGET_MB
}

export function memoryReliefDue(usageMB: number, targetMB: number, now: number, lastReliefAt: number | null): boolean {
  return targetMB > 0 && Number.isFinite(usageMB) && usageMB >= targetMB * 0.9 && (lastReliefAt === null || now - lastReliefAt >= 60_000)
}
