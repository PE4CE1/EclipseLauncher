import { getPlaceholderCover, getPlaceholderHero, ROBLOX_POSTER } from './assetHelper'
import { extractAppIdFromPlaceholder, KNOWN_GAME_PREVIEWS } from './steamService'
import type { InstalledGame, LibraryGame } from '../types/game'
import { getPreferredArtworkUrl, rememberArtworkUrl, forgetArtworkUrl, flushArtworkHistory } from './libraryArtworkHistory'
import { getSteamArtwork, isSteamArtworkUrl } from './steamArtwork'
import { getRelatedArtwork } from './relatedArtwork'
import { getNonSteamGame } from './nonSteamGames'
import { getNonSteamArtwork } from './nonSteamArtwork'

export type ArtworkGame = Pick<InstalledGame, 'id' | 'name' | 'platform' | 'steamId' | 'appId' | 'iconUrl' | 'lastPlayed'> & Pick<Partial<LibraryGame>, 'coverImage' | 'isFavorite'>
export interface LibraryArtwork { url: string; isWide: boolean; fallback: boolean; crossOrigin?: 'anonymous' }
export type ArtworkShape = 'poster' | 'landscape'
const cache = new Map<string, { artwork: LibraryArtwork; expires: number }>()
const pending = new Map<string, Promise<LibraryArtwork | null>>()
const pendingSignals = new Map<string, AbortSignal | undefined>()
const rejected = new Map<string, Set<string>>()
let prefetchId = 0

export function getLibrarySteamId(game: ArtworkGame): number | undefined {
  if (getNonSteamGame(game.name)) return undefined
  const id = Number(game.steamId || (game.platform === 'steam' ? game.appId : undefined) || (/^steam[-_](\d+)$/.exec(game.id)?.[1]) || (game.platform === 'steam' && /^\d+$/.test(game.id) ? game.id : 0))
  return Number.isSafeInteger(id) && id > 0 ? id : extractAppIdFromPlaceholder(game.name) || undefined
}

export function getLibraryArtworkKey(game: ArtworkGame, shape: ArtworkShape = 'poster'): string {
  const id = getLibrarySteamId(game)
  return `${shape === 'landscape' ? 'landscape:' : ''}${id ? `steam:${id}` : `${game.platform}:${game.id}:${game.name}`}:${'coverImage' in game ? game.coverImage || '' : ''}${id ? '' : `:${game.iconUrl || ''}`}`
}

export function getCachedLibraryArtwork(game: ArtworkGame, shape: ArtworkShape = 'poster'): LibraryArtwork | undefined {
  const key = getLibraryArtworkKey(game, shape)
  const entry = cache.get(key)
  if (!entry) return
  if (entry.expires < Date.now()) { cache.delete(key); return }
  cache.delete(key)
  cache.set(key, entry)
  return entry.artwork
}

export function invalidateLibraryArtwork(game: ArtworkGame, failedUrl?: string, shape: ArtworkShape = 'poster'): void {
  const key = getLibraryArtworkKey(game, shape)
  cache.delete(key)
  forgetArtworkUrl(key)
  if (failedUrl) {
    const urls = rejected.get(key) || new Set<string>()
    urls.add(failedUrl)
    while (urls.size > 32) urls.delete(urls.values().next().value!)
    rejected.set(key, urls)
    while (rejected.size > 4096) rejected.delete(rejected.keys().next().value!)
  }
}

export function getLibraryArtworkCandidates(game: ArtworkGame, shape: ArtworkShape = 'poster'): Array<{ url: string; isWide: boolean }> {
  const id = getLibrarySteamId(game)
  if (id === 999001 || game.name.toLowerCase() === 'roblox' || game.id === 'roblox') return [{ url: ROBLOX_POSTER, isWide: true }]
  const custom = 'coverImage' in game ? game.coverImage : undefined
  const external = getNonSteamGame(game.name)
  const bundled = getNonSteamArtwork(game.name)
  const known = (id && KNOWN_GAME_PREVIEWS[id]) || KNOWN_GAME_PREVIEWS[game.name.toLowerCase().trim()]
  const candidates = [
    ...(custom && !(external && (/^data:image\/svg/i.test(custom) || /steamstatic\.com\//i.test(custom))) ? [{ url: custom, isWide: false }] : []),
    ...(bundled ? [{ url: shape === 'landscape' ? bundled.hero : bundled.poster, isWide: shape === 'landscape' }] : []),
    ...(external ? [{ url: shape === 'landscape' ? external.hero : external.poster, isWide: shape === 'landscape' }, { url: external.hero, isWide: true }] : []),
    ...(id && shape === 'landscape' ? [
      { url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`, isWide: true },
      { url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`, isWide: true },
    ] : []),
    // Use real posters before the scanner's wide header/icon URLs.
    ...(id ? [
      { url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`, isWide: false },
      { url: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`, isWide: false },
    ] : []),
    ...(known ? [{ url: known, isWide: true }] : []),
    ...(game.iconUrl ? [{ url: game.iconUrl, isWide: true }] : []),
    ...(id ? [
      { url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`, isWide: true },
      { url: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`, isWide: true },
    ] : []),
  ]
  return candidates.filter((entry, index) => candidates.findIndex(other => other.url === entry.url) === index)
}

function probeImage(url: string, signal: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  return new Promise(resolve => {
    const image = new Image()
    image.decoding = 'async'
    let finished = false
    const finish = (success: boolean) => {
      if (finished) return
      finished = true
      signal?.removeEventListener('abort', abort)
      image.onload = null
      image.onerror = null
      if (!success) { try { image.src = '' } catch {} }
      resolve(success)
    }
    const abort = () => finish(false)
    signal?.addEventListener('abort', abort, { once: true })
    image.onload = () => finish(image.naturalWidth > 0)
    image.onerror = () => finish(false)
    try { image.src = url } catch { finish(false) }
  })
}

async function loadImage(url: string, signal?: AbortSignal): Promise<'anonymous' | 'native' | null> {
  if (signal?.aborted) return null
  const controller = new AbortController()
  const abort = () => controller.abort()
  // HTTP/1.1 allows fewer connections than our HTTP/2 download pool. Include
  // one queued wave in the deadline instead of timing out healthy covers.
  const timer = setTimeout(abort, 6000)
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (api?.prefetchArtwork && /^https:\/\/(?:shared\.(?:fastly|akamai)|cdn\.cloudflare)\.steamstatic\.com\//i.test(url)) {
      const id = `artwork-${++prefetchId}`
      const cancel = () => api.cancelRequest?.(id)
      controller.signal.addEventListener('abort', cancel, { once: true })
      try { return await api.prefetchArtwork({ id, url }) && !controller.signal.aborted ? 'native' : null }
      finally { controller.signal.removeEventListener('abort', cancel) }
    }
    // Ordinary <img> requests can display remote images without CORS permission.
    // Browser fetch() probes incorrectly reported missing Steam assets as CORS errors.
    return await probeImage(url, controller.signal) ? 'native' : null
  } catch { return null }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export function resolveLibraryArtwork(game: ArtworkGame, signal?: AbortSignal, shape: ArtworkShape = 'poster'): Promise<LibraryArtwork | null> {
  if (signal?.aborted) return Promise.resolve(null)
  const cached = getCachedLibraryArtwork(game, shape)
  if (cached) return Promise.resolve(cached)
  const key = getLibraryArtworkKey(game, shape)
  const existing = pending.get(key)
  if (existing) {
    const owner = pendingSignals.get(key)
    // The visible library may join startup work just before its deadline cancels it.
    if (owner && owner !== signal) return existing.then(result => result || signal?.aborted ? result : resolveLibraryArtwork(game, signal, shape))
    return existing
  }
  const task = (async () => {
    const blocked = rejected.get(key)
    const candidates = getLibraryArtworkCandidates(game, shape).filter(candidate => !blocked?.has(candidate.url))
    const preferred = getPreferredArtworkUrl(key)
    const steamId = getLibrarySteamId(game)
    const preferredSource = Number(preferred?.match(/\/steam\/apps\/(\d+)\//)?.[1])
    if (preferred && preferredSource && preferredSource !== steamId && isSteamArtworkUrl(preferred, preferredSource)
      && !blocked?.has(preferred)) {
      const related = await getRelatedArtwork(game.name, steamId)
      if (related?.appId === preferredSource) candidates.unshift({ url: preferred, isWide: preferred === related.artwork?.header || preferred === related.artwork?.hero })
    }
    if (preferred && steamId && isSteamArtworkUrl(preferred, steamId) && !candidates.some(candidate => candidate.url === preferred)
      && /\/(?:library_capsule|library_600x900|hero_capsule)(?:_2x)?\./.test(new URL(preferred).pathname)) {
      candidates.unshift({ url: preferred, isWide: false })
    }
    const preferredIndex = candidates.findIndex(candidate => candidate.url === preferred)
    // A cached wide header must not hide a newly available official portrait.
    if (preferredIndex > 0) candidates.unshift(...candidates.splice(preferredIndex, 1))
    let checkedStore = false
    const discoverPosters = async (at: number) => {
      if (checkedStore || !steamId || steamId === 999001) return 0
      checkedStore = true
      const assets = await getSteamArtwork(steamId)
      const extra = (shape === 'landscape' ? [assets?.header, assets?.hero, assets?.poster, assets?.vertical] : [assets?.poster, assets?.vertical])
        .filter((url): url is string => !!url && !blocked?.has(url) && !candidates.some(entry => entry.url === url))
        .map(url => ({ url, isWide: url === assets?.header || url === assets?.hero }))
      if (!extra.length && !signal?.aborted) {
        const related = await getRelatedArtwork(game.name, steamId)
        if (related) {
          const relatedPosters = [...(shape === 'landscape' ? [related.artwork?.header, related.artwork?.hero] : []), related.artwork?.poster, related.artwork?.vertical,
            `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${related.appId}/library_600x900.jpg`]
          extra.push(...relatedPosters.filter((url): url is string => !!url).map(url => ({ url, isWide: url === related.artwork?.header || url === related.artwork?.hero })))
        }
      }
      // Some games publish only hash-addressed landscape assets, not legacy filenames.
      for (const url of [assets?.header, assets?.hero]) {
        if (url && !candidates.some(entry => entry.url === url)) candidates.push({ url, isWide: true })
      }
      const available = extra.filter(entry => !blocked?.has(entry.url) && !candidates.some(candidate => candidate.url === entry.url))
      candidates.splice(at, 0, ...available)
      return available.length
    }
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]
      if (blocked?.has(candidate.url)) continue
      if (shape === 'poster' && candidate.isWide && !checkedStore && await discoverPosters(index)) { index--; continue }
      if (signal?.aborted) return null
      const transport = await loadImage(candidate.url, signal)
      if (transport) {
        const artwork: LibraryArtwork = { ...candidate, fallback: false, ...(transport === 'anonymous' ? { crossOrigin: 'anonymous' as const } : {}) }
        cache.set(key, { artwork, expires: Infinity })
        rememberArtworkUrl(key, artwork.url)
        return artwork
      }
      if (signal?.aborted) return null
      if (candidate.url === preferred) forgetArtworkUrl(key)
      await discoverPosters(index + 1)
    }
    const artwork = { url: shape === 'landscape' ? getPlaceholderHero(game.name) : getPlaceholderCover(game.name), isWide: shape === 'landscape', fallback: true }
    // Failed network lookups are retryable, rather than permanently replacing art.
    cache.set(key, { artwork, expires: Date.now() + 30000 })
    return artwork
  })().finally(() => {
    pending.delete(key)
    pendingSignals.delete(key)
    while (cache.size > 4096) cache.delete(cache.keys().next().value!)
  })
  pending.set(key, task)
  pendingSignals.set(key, signal)
  return task
}

export interface CoverProgress { completed: number; total: number; loaded: number; failed: number }

export async function warmLibraryArtwork(games: ArtworkGame[], signal: AbortSignal, onProgress: (progress: CoverProgress) => void): Promise<CoverProgress> {
  const unique = [...new Map(games.map(game => [getLibraryArtworkKey(game), game])).values()]
  const progress: CoverProgress = { completed: 0, total: unique.length, loaded: 0, failed: 0 }
  // Cache hits do not need a worker. Prioritize favorites and recently played
  // games so the cards users are most likely to open are prepared first.
  const remaining = unique.filter(game => {
    const artwork = getCachedLibraryArtwork(game)
    if (!artwork) return true
    progress.completed++
    if (artwork.fallback) progress.failed++
    else progress.loaded++
    return false
  }).sort((a, b) => Number('isFavorite' in b && b.isFavorite) - Number('isFavorite' in a && a.isFavorite)
    || (b.lastPlayed || 0) - (a.lastPlayed || 0))
  let next = 0
  let lastUpdate = Date.now()
  onProgress({ ...progress })
  await Promise.all(Array.from({ length: Math.min(12, remaining.length) }, async () => {
    while (!signal.aborted && next < remaining.length) {
      const game = remaining[next++]
      const artwork = await resolveLibraryArtwork(game, signal)
      if (!artwork || signal.aborted) break
      progress.completed++
      if (artwork.fallback) progress.failed++
      else progress.loaded++
      if (progress.completed === progress.total || Date.now() - lastUpdate >= 50) {
        lastUpdate = Date.now()
        onProgress({ ...progress })
      }
    }
  }))
  flushArtworkHistory()
  return { ...progress }
}
