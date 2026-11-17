const STORAGE_KEY = 'eclipse_artwork_urls_v1'
const MAX_ENTRIES = 2048
const MAX_AGE = 30 * 24 * 60 * 60 * 1000
const history = new Map<string, { url: string; updatedAt: number }>()
let loaded = false
let dirty = false
let saveTimer: ReturnType<typeof setTimeout> | undefined

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || raw.length > 1024 * 1024) return
    const entries: unknown = JSON.parse(raw)
    if (!Array.isArray(entries)) return
    const oldest = Date.now() - MAX_AGE
    for (const entry of entries.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(entry) || entry.length !== 3) continue
      const [key, url, updatedAt] = entry
      if (typeof key !== 'string' || key.length > 2048 || typeof url !== 'string' || url.length > 2048
        || !/^https?:\/\//i.test(url) || !Number.isFinite(updatedAt) || updatedAt < oldest || updatedAt > Date.now()) continue
      history.set(key, { url, updatedAt })
    }
  } catch { /* Storage can be unavailable or full; artwork still works. */ }
}

export function getPreferredArtworkUrl(key: string): string | undefined {
  load()
  const entry = history.get(key)
  if (entry && Date.now() - entry.updatedAt <= MAX_AGE) return entry.url
  history.delete(key)
}

export function flushArtworkHistory(): void {
  clearTimeout(saveTimer)
  saveTimer = undefined
  if (!dirty) return
  dirty = false
  try {
    const rows: string[] = []
    let length = 2
    for (const [key, entry] of [...history].reverse()) {
      const row = JSON.stringify([key, entry.url, entry.updatedAt])
      if (length + row.length + 1 > 1024 * 1024) break
      rows.push(row)
      length += row.length + 1
    }
    localStorage.setItem(STORAGE_KEY, `[${rows.reverse().join(',')}]`)
  } catch { /* Reaching a storage quota must not block startup. */ }
}

export function rememberArtworkUrl(key: string, url: string): void {
  load()
  if (key.length > 2048 || url.length > 2048 || !/^https?:\/\//i.test(url)) return
  history.delete(key)
  history.set(key, { url, updatedAt: Date.now() })
  while (history.size > MAX_ENTRIES) history.delete(history.keys().next().value!)
  dirty = true
  // Batch writes instead of serializing the entire manifest for every poster.
  if (!saveTimer) saveTimer = setTimeout(flushArtworkHistory, 1000)
}

export function forgetArtworkUrl(key: string): void {
  load()
  if (history.delete(key)) {
    dirty = true
    if (!saveTimer) saveTimer = setTimeout(flushArtworkHistory, 1000)
  }
}
