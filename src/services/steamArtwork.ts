import { desktopFetch } from './httpClient'

export interface SteamArtwork { poster?: string; vertical?: string; hero?: string; header?: string }
const entries = new Map<number, { artwork: SteamArtwork | null; expires: number }>()
const pending = new Map<number, Promise<SteamArtwork | null>>()
const queued = new Map<number, (artwork: SteamArtwork | null) => void>()
const STORAGE_KEY = 'eclipse_steam_artwork_v1'
const MAX_ENTRIES = 2048
let loaded = false
let scheduled = false
let active = 0
let saveTimer: ReturnType<typeof setTimeout> | undefined

export function isSteamArtworkUrl(url: string, appId: number): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && ['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com'].includes(parsed.hostname)
      && parsed.pathname.startsWith(`/store_item_assets/steam/apps/${appId}/`)
      && /\.(?:jpg|jpeg|png|webp|avif)$/i.test(parsed.pathname)
  } catch { return false }
}

export function parseSteamArtwork(appId: number, assets: unknown): SteamArtwork | null {
  if (!assets || typeof assets !== 'object') return null
  const data = assets as Record<string, unknown>
  const format = data.asset_url_format
  if (typeof format !== 'string' || !format.startsWith(`steam/apps/${appId}/`) || !format.includes('${FILENAME}')) return null
  const resolve = (field: string) => {
    const filename = data[field]
    if (typeof filename !== 'string' || filename.length > 512 || !/^[a-zA-Z0-9_./-]+$/.test(filename) || filename.includes('..')) return undefined
    const url = `https://shared.fastly.steamstatic.com/store_item_assets/${format.replace('${FILENAME}', filename)}`
    return isSteamArtworkUrl(url, appId) ? url : undefined
  }
  const artwork = { poster: resolve('library_capsule'), vertical: resolve('hero_capsule'), hero: resolve('library_hero'), header: resolve('header') }
  return Object.values(artwork).some(Boolean) ? artwork : null
}

function loadCache(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw || raw.length > 2 * 1024 * 1024) return
    const saved: unknown = JSON.parse(raw)
    if (!Array.isArray(saved)) return
    for (const row of saved.slice(-MAX_ENTRIES)) {
      if (!Array.isArray(row) || row.length !== 3) continue
      const [id, artwork, expires] = row
      if (!Number.isSafeInteger(id) || id <= 0 || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 7 * 86400000) continue
      if (!artwork || typeof artwork !== 'object') continue
      const filtered: SteamArtwork = {}
      for (const field of ['poster', 'vertical', 'hero', 'header'] as const) {
        if (typeof artwork[field] === 'string' && isSteamArtworkUrl(artwork[field], id)) filtered[field] = artwork[field]
      }
      if (Object.keys(filtered).length) entries.set(id, { artwork: filtered, expires })
    }
  } catch { /* Browsing must work even when storage is unavailable. */ }
}

function saveCache(): void {
  clearTimeout(saveTimer)
  saveTimer = undefined
  try {
    const rows = [...entries].filter(([, entry]) => entry.artwork && entry.expires > Date.now())
      .slice(-MAX_ENTRIES).map(([id, entry]) => [id, entry.artwork, entry.expires])
    let saved = JSON.stringify(rows)
    while (saved.length > 2 * 1024 * 1024 && rows.length) { rows.shift(); saved = JSON.stringify(rows) }
    localStorage.setItem(STORAGE_KEY, saved)
  } catch { /* Disk quota failures must not reject image loading. */ }
}

async function fetchBatch(batch: Array<[number, (artwork: SteamArtwork | null) => void]>): Promise<void> {
  active++
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4500)
  const results = new Map<number, SteamArtwork>()
  try {
    const input = { ids: batch.map(([appid]) => ({ appid })), context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } }
    const response = await desktopFetch(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`, { signal: controller.signal })
    if (response.ok) {
      const body = await response.json()
      if (Array.isArray(body?.response?.store_items)) {
        for (const item of body.response.store_items) {
          const artwork = parseSteamArtwork(Number(item?.appid), item?.assets)
          if (artwork) results.set(Number(item.appid), artwork)
        }
      }
    }
  } catch { /* Legacy CDN URLs remain available if the Store API is offline. */ }
  finally {
    clearTimeout(timer)
    for (const [id, resolve] of batch) {
      const artwork = results.get(id) || null
      entries.delete(id)
      entries.set(id, { artwork, expires: Date.now() + (artwork ? 7 * 86400000 : 5 * 60000) })
      pending.delete(id)
      resolve(artwork)
    }
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)
    if (!saveTimer && results.size) saveTimer = setTimeout(saveCache, 500)
    active--
    drain()
  }
}

function drain(): void {
  scheduled = false
  while (active < 2 && queued.size) {
    const batch = [...queued].slice(0, 32)
    batch.forEach(([id]) => queued.delete(id))
    void fetchBatch(batch)
  }
}

export function getSteamArtwork(appId: number): Promise<SteamArtwork | null> {
  if (!Number.isSafeInteger(appId) || appId <= 0 || appId === 999001) return Promise.resolve(null)
  loadCache()
  const cached = entries.get(appId)
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.artwork)
  const existing = pending.get(appId)
  if (existing) return existing
  const task = new Promise<SteamArtwork | null>(resolve => queued.set(appId, resolve))
  pending.set(appId, task)
  if (!scheduled) { scheduled = true; setTimeout(drain, 16) }
  return task
}
