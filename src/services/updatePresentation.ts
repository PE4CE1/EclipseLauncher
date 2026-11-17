export function updateNotes(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 200_000)
  if (!Array.isArray(value)) return ''
  return value.slice(0, 20).map(item => typeof item?.note === 'string' ? item.note : '').filter(Boolean).join('\n\n').slice(0, 200_000)
}

export function updatePercent(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

export function mergeUpdateInfo(previous: unknown, status: string, incoming: unknown): Record<string, unknown> | null {
  const before = previous && typeof previous === 'object' ? previous : {}
  if (status === 'available') return incoming && typeof incoming === 'object' ? { ...incoming, error: undefined } : null
  if (status === 'error') return { ...before, error: typeof incoming === 'string' ? incoming : 'Update failed' }
  if (incoming && typeof incoming === 'object') return { ...before, ...incoming, error: undefined }
  return previous && typeof previous === 'object' ? { ...previous } : null
}
