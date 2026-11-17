export function commitSettings<T extends Record<string, unknown>>(current: T, patch: Record<string, unknown>, write: (next: T) => void): T {
  const next = { ...current, ...patch }
  write(next)
  return next
}
