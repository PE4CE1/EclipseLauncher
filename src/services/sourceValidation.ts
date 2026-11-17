import type { HydraDownload, HydraSourceData } from '../types/source'

export function parseHydraSource(value: unknown, fallbackName?: string): HydraSourceData {
  if (!value || typeof value !== 'object' || !Array.isArray((value as HydraSourceData).downloads)) {
    throw new Error('Source JSON must contain a downloads array.')
  }
  const source = value as Record<string, unknown>
  const name = typeof source.name === 'string' ? source.name.trim() : fallbackName?.trim()
  if (!name) throw new Error('Source JSON must contain a valid name.')

  const downloads: HydraDownload[] = []
  for (const item of source.downloads as unknown[]) {
    if (!item || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    if (typeof entry.title !== 'string' || !entry.title.trim() || !Array.isArray(entry.uris)) continue
    const uris = [...new Set(entry.uris.filter((uri): uri is string => {
      if (typeof uri !== 'string') return false
      try {
        const url = new URL(uri.trim())
        if (url.protocol === 'magnet:') return url.searchParams.getAll('xt').some(value => /^urn:bt(?:ih:(?:[a-f0-9]{40}|[a-z2-7]{32})|mh:1220[a-f0-9]{64})$/i.test(value))
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      } catch { return false }
    }).map(uri => uri.trim()))]
    if (uris.length === 0) continue
    downloads.push({
      title: entry.title.trim(),
      uris,
      fileSize: typeof entry.fileSize === 'string' ? entry.fileSize : '',
      uploadDate: typeof entry.uploadDate === 'string' ? entry.uploadDate : '',
    })
  }
  return { name, downloads }
}
