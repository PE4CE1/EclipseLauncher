type Position = { xPct: number; yPct: number }

export function normalizeOverlayPositions<T extends Record<string, Position>>(defaults: T, incoming: unknown): T {
  const source = incoming && typeof incoming === 'object' ? incoming as Record<string, any> : {}
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, {
    xPct: Number.isFinite(source[key]?.xPct) ? Math.max(0, Math.min(1, source[key].xPct)) : fallback.xPct,
    yPct: Number.isFinite(source[key]?.yPct) ? Math.max(0, Math.min(1, source[key].yPct)) : fallback.yPct,
  }])) as T
}

export function sameOverlayPositions(a: Record<string, Position>, b: Record<string, Position>): boolean {
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => a[key]?.xPct === b[key]?.xPct && a[key]?.yPct === b[key]?.yPct)
}
