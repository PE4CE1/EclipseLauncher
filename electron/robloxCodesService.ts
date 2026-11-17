import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { APP_VERSION } from '../src/services/appVersion'
import { ROBLOX_CODE_GAMES, cleanRobloxName, robloxNameKey, robloxPlaceId, robloxSlug } from '../src/services/robloxGames'
import type { RobloxCodeGame, RobloxCodeItem, RobloxCodeSource, RobloxGameCodesResult } from '../src/types/robloxCodes'
import { articleMatchesGame, isValidCode, parseCodesFromHtmlOrText, parseCodesFromTitle, parseCodesIndex } from './robloxCodesParser'

const INDEX_SOURCES = [
  { name: 'Pocket Tactics', url: 'https://www.pockettactics.com/roblox/game-codes' },
  { name: 'Roblox Den', url: 'https://robloxden.com/game-codes' },
]
const hosts = new Set(['www.pockettactics.com', 'robloxden.com', 'beebom.com', 'apis.roblox.com', 'games.roblox.com', 'thumbnails.roblox.com'])
export function allowedRobloxCodesUrl(value: string): boolean {
  try { const u = new URL(value); return u.protocol === 'https:' && hosts.has(u.hostname) && !u.username && !u.password && !u.port } catch { return false }
}

export async function fetchRobloxCodesText(url: string): Promise<string | null> {
  if (!allowedRobloxCodesUrl(url)) return null
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 2600)
  try {
    for (let redirects = 0; redirects < 3; redirects++) {
      const response = await fetch(url, { signal: controller.signal, redirect: 'manual', credentials: 'omit', headers: { Accept: 'application/json,text/html;q=0.9', 'User-Agent': `EclipseLauncher/${APP_VERSION}` } })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location) return null
        url = new URL(location, url).href
        if (!allowedRobloxCodesUrl(url)) return null
        continue
      }
      if (!response.ok || !response.body || Number(response.headers.get('content-length')) > 2_000_000) { await response.body?.cancel(); return null }
      const reader = response.body.getReader(), chunks: Uint8Array[] = []
      let size = 0
      while (true) {
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        if (size > 2_000_000) { await reader.cancel(); return null }
        chunks.push(next.value)
      }
      return Buffer.concat(chunks).toString('utf8')
    }
  } catch { return null }
  finally { clearTimeout(timeout) }
  return null
}

type Options = { cacheFile?: string; fetchText?: (url: string) => Promise<string | null>; now?: () => number; onUpdate?: (value: RobloxGameCodesResult) => void }
type IndexEntry = { name: string; source: RobloxCodeSource }
const validId = (value?: string) => typeof value === 'string' && /^\d{1,18}$/.test(value) ? value : undefined
const identityKey = (name: string, placeId?: string, universeId?: string) => universeId ? `universe:${universeId}` : placeId ? `place:${placeId}` : `name:${robloxNameKey(name)}`

export function createRobloxCodesService(options: Options = {}) {
  const now = options.now || Date.now, request = options.fetchText || fetchRobloxCodesText
  const cache = new Map<string, RobloxGameCodesResult>(), pending = new Map<string, Promise<RobloxGameCodesResult>>()
  const searches = new Map<string, { expires: number; data: RobloxCodeGame[] }>(), searching = new Map<string, Promise<RobloxCodeGame[]>>()
  let index: IndexEntry[] = [], indexUpdated = 0, indexRequest: Promise<IndexEntry[]> | undefined, loaded: Promise<void> | undefined
  let indexAttempt = 0
  let saveTimer: ReturnType<typeof setTimeout> | undefined, saveQueue = Promise.resolve()
  let active = 0
  const waiting: Array<() => void> = []
  const sessionId = randomUUID()
  const get = async (url: string) => {
    if (!allowedRobloxCodesUrl(url)) return null
    if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve))
    else active++
    try { return await request(url) } catch { return null }
    finally { const next = waiting.shift(); if (next) next(); else active-- }
  }
  const json = async (url: string) => { try { const value = await get(url); return value ? JSON.parse(value) : null } catch { return null } }
  const read = () => loaded ??= (async () => {
    if (!options.cacheFile) return
    try {
      if ((await fs.stat(options.cacheFile)).size > 4_000_000) return
      const data = JSON.parse(await fs.readFile(options.cacheFile, 'utf8'))
      if (data.version !== 3) return
      if (Array.isArray(data.index)) index = data.index.filter((entry: IndexEntry) => typeof entry.name === 'string' && entry.name.length <= 160 && entry.source && allowedRobloxCodesUrl(entry.source.url)).slice(0, 4000)
      if (Number.isFinite(data.indexUpdated) && data.indexUpdated <= now()) indexUpdated = data.indexUpdated
      for (const entry of Array.isArray(data.results) ? data.results.slice(-80) : []) {
        if (typeof entry.key !== 'string' || typeof entry.value?.gameName !== 'string' || !Array.isArray(entry.value.activeCodes) || !Array.isArray(entry.value.expiredCodes) || !Number.isFinite(entry.value.lastUpdated) || entry.value.lastUpdated > now()) continue
        const filter = (items: RobloxCodeItem[]) => items.filter(item => isValidCode(item.code) && typeof item.reward === 'string').slice(0, 300)
        cache.set(entry.key, { ...entry.value, activeCodes: filter(entry.value.activeCodes), expiredCodes: filter(entry.value.expiredCodes) })
      }
    } catch {}
  })()
  const save = () => {
    if (!options.cacheFile || saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = undefined
      const value = JSON.stringify({ version: 3, index, indexUpdated, results: [...cache].slice(-80).map(([key, value]) => ({ key, value })) })
      if (value.length > 4_000_000) return
      saveQueue = saveQueue.then(async () => {
        const file = options.cacheFile!, temporary = `${file}.${randomUUID()}.tmp`
        try { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(temporary, value, { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, file) }
        catch {} finally { await fs.unlink(temporary).catch(() => {}) }
      })
    }, 100)
    saveTimer.unref?.()
  }
  const getIndex = async (): Promise<IndexEntry[]> => {
    await read()
    if (index.length && now() - indexUpdated < 24 * 60 * 60 * 1000) return index
    if (indexRequest) return indexRequest
    if (indexAttempt && now() - indexAttempt < 30_000) return index
    indexAttempt = now()
    indexRequest = Promise.all(INDEX_SOURCES.map(async source => {
      const html = await get(source.url)
      return { source: source.name, entries: html ? parseCodesIndex(html, source) : [] }
    })).then(lists => {
      const found = lists.flatMap(list => list.entries)
      const replaced = new Set(lists.filter(list => list.entries.length).map(list => list.source))
      if (found.length) { index = [...index.filter(entry => !replaced.has(entry.source.name)), ...found]; indexUpdated = now(); save() }
      return index
    }).finally(() => { indexRequest = undefined })
    return indexRequest
  }
  const publicSearch = async (query: string): Promise<RobloxCodeGame[]> => {
    const result = await json(`https://apis.roblox.com/search-api/omni-search?searchQuery=${encodeURIComponent(query)}&pageType=games&sessionId=${sessionId}`)
    const contents = (Array.isArray(result?.searchResults) ? result.searchResults : []).filter((group: any) => group.contentGroupType === 'Game').flatMap((group: any) => Array.isArray(group.contents) ? group.contents : [])
    return contents.filter((game: any) => game.name && validId(String(game.universeId)) && validId(String(game.rootPlaceId)) && !game.isSponsored).slice(0, 12).map((game: any) => ({ name: game.name, placeId: String(game.rootPlaceId), universeId: String(game.universeId), creatorName: game.creatorName, players: Number.isFinite(game.playerCount) ? game.playerCount : undefined }))
  }
  const resolve = async (name: string, place?: string, universe?: string): Promise<RobloxCodeGame & { description?: string; official?: boolean }> => {
    const seed = ROBLOX_CODE_GAMES.find(game => robloxNameKey(game.name) === robloxNameKey(name))
    let placeId = validId(place) || robloxPlaceId(name) || seed?.placeId, universeId = validId(universe) || (!place || place === seed?.placeId ? seed?.universeId : undefined)
    if (!universeId && placeId) universeId = validId(String((await json(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`))?.universeId || ''))
    if (!universeId && !placeId) {
      const matches = await publicSearch(name)
      const exact = matches.find(game => robloxNameKey(game.name) === robloxNameKey(name))
      placeId = exact?.placeId; universeId = exact?.universeId
    }
    if (universeId) {
      const data = (await json(`https://games.roblox.com/v1/games?universeIds=${universeId}`))?.data?.[0]
      if (data && String(data.id) === universeId && typeof data.name === 'string') return { name: data.name, placeId: String(data.rootPlaceId || placeId || ''), universeId, description: data.description, creatorName: data.creator?.name, players: data.playing, official: true }
    }
    return { name: cleanRobloxName(name), placeId, universeId }
  }
  const icons = async (games: RobloxCodeGame[]) => {
    const ids = games.map(game => game.universeId).filter(Boolean)
    if (!ids.length) return games
    const result = await json(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`)
    const images = new Map((result?.data || []).filter((item: any) => item.state === 'Completed' && /^https:\/\/[a-z0-9-]+\.rbxcdn\.com\//i.test(item.imageUrl)).map((item: any) => [String(item.targetId), item.imageUrl]))
    return games.map(game => ({ ...game, iconUrl: images.get(game.universeId) as string | undefined }))
  }

  const searchGames = async (raw: string): Promise<RobloxCodeGame[]> => {
    if (typeof raw !== 'string' || raw.length > 180) throw new Error('Invalid game search')
    const query = raw.trim(), key = query.toLowerCase()
    await read()
    if (searches.get(key)?.expires! > now()) return searches.get(key)!.data
    if (searching.has(key)) return searching.get(key)!
    const task = (async () => {
      if (robloxPlaceId(query)) return icons([await resolve(query)])
      const defaults = async () => {
        const details = await json(`https://games.roblox.com/v1/games?universeIds=${ROBLOX_CODE_GAMES.map(game => game.universeId).join(',')}`)
        return ROBLOX_CODE_GAMES.map(game => {
          const current = details?.data?.find((item: any) => String(item.id) === game.universeId)
          return current ? { ...game, name: current.name, creatorName: current.creator?.name, players: Number.isFinite(current.playing) ? current.playing : undefined } : { ...game }
        })
      }
      const [entries, official] = await Promise.all([getIndex(), query.length >= 2 ? publicSearch(query) : defaults()])
      const target = robloxNameKey(query)
      const matches = entries.filter(entry => !target || robloxNameKey(entry.name).includes(target)).sort((a, b) => Number(robloxNameKey(b.name) === target) - Number(robloxNameKey(a.name) === target))
      const byName = new Map<string, RobloxCodeGame>()
      for (const game of official) byName.set(robloxNameKey(game.name), { ...game, sources: entries.filter(entry => robloxNameKey(entry.name) === robloxNameKey(game.name)).map(entry => entry.source) })
      for (const entry of matches) {
        const name = robloxNameKey(entry.name), prior = byName.get(name)
        if (prior) { if (!prior.sources?.some(source => source.url === entry.source.url)) prior.sources = [...prior.sources || [], entry.source] }
        else if (byName.size < 20) byName.set(name, { name: entry.name, sources: [entry.source] })
      }
      const games = await icons([...byName.values()].sort((a, b) => Number(robloxNameKey(b.name) === target) - Number(robloxNameKey(a.name) === target)).slice(0, 16))
      searches.set(key, { expires: now() + 5 * 60_000, data: games })
      while (searches.size > 64) searches.delete(searches.keys().next().value!)
      return games
    })().finally(() => searching.delete(key))
    searching.set(key, task)
    return task
  }

  const fetchCodes = async (name: string, placeId?: string, universeId?: string): Promise<RobloxGameCodesResult> => {
    const catalogue = getIndex()
    const game = await resolve(name, placeId, universeId)
    const lookupName = cleanRobloxName(game.name)
    const articles = (async () => {
      const entries = await catalogue, key = robloxNameKey(lookupName), slug = robloxSlug(lookupName)
      const sources = [
        ...entries.filter(entry => robloxNameKey(entry.name) === key).map(entry => entry.source),
        ...(slug ? [{ name: 'Roblox Den', url: `https://robloxden.com/game-codes/${slug}` }, { name: 'Beebom', url: `https://beebom.com/roblox-${slug}-codes/` }] : []),
      ].filter((source, i, all) => all.findIndex(other => other.url === source.url) === i).slice(0, 3)
      return Promise.all(sources.map(async source => {
        const html = await get(source.url)
        if (!html || !articleMatchesGame(html, lookupName)) return null
        return { source, ...parseCodesFromHtmlOrText(html) }
      }))
    })()
    const results = await articles
    const active = new Map<string, RobloxCodeItem>(), expired = new Map<string, RobloxCodeItem>(), sources: RobloxCodeSource[] = []
    const merge = (items: RobloxCodeItem[], isExpired: boolean, source: RobloxCodeSource, verification: 'developer' | 'community') => {
      for (const item of items) {
        const target = isExpired ? expired : active
        const key = item.code.toLowerCase(), prior = target.get(key)
        if (!prior) target.set(key, { ...item, isExpired, sourceUrl: source.url, sourceName: source.name, verification })
        else if (prior.code !== item.code && !prior.alternatives?.includes(item.code)) prior.alternatives = [...prior.alternatives || [], item.code]
      }
    }
    if (game.official) {
      const source = { name: 'Roblox developer', url: `https://www.roblox.com/games/${game.placeId}` }
      const parsed = parseCodesFromHtmlOrText(game.description || '')
      merge([...parseCodesFromTitle(game.name), ...parsed.active], false, source, 'developer')
      merge(parsed.expired, true, source, 'developer'); sources.push(source)
    }
    for (const result of results) if (result) {
      merge(result.active, false, result.source, 'community'); merge(result.expired, true, result.source, 'community'); sources.push(result.source)
    }
    for (const [code, item] of active) if (expired.has(code)) { item.conflicting = true; expired.delete(code) }
    return { name: cleanRobloxName(game.name), gameName: cleanRobloxName(game.name), placeId: game.placeId, universeId: game.universeId, creatorName: game.creatorName,
      activeCodes: [...active.values()], expiredCodes: [...expired.values()], sources, source: sources.map(source => source.name).join(' · '),
      status: active.size ? 'ready' : results.some(Boolean) ? 'empty' : 'unavailable', lastUpdated: now() }
  }
  const getCodes = async (name: string, placeId?: string, universeId?: string, force = false): Promise<RobloxGameCodesResult> => {
    if (typeof name !== 'string' || !name.trim() || name.length > 180 || (placeId !== undefined && !validId(placeId)) || (universeId !== undefined && !validId(universeId))) throw new Error('Invalid Roblox game identity')
    await read()
    const key = identityKey(name, placeId, universeId), cached = cache.get(key)
    const ttl = cached?.status === 'unavailable' ? 30_000 : cached?.activeCodes.length ? 15 * 60_000 : 2 * 60_000
    if (!force && cached && now() - cached.lastUpdated < ttl) return cached
    let task = pending.get(key)
    if (!task) {
      task = fetchCodes(name, placeId, universeId).then(result => {
        if (result.status === 'unavailable' && cached) result = { ...cached, stale: true }
        else {
          cache.set(key, result)
          if (result.universeId) cache.set(identityKey(result.gameName, result.placeId, result.universeId), result)
          cache.set(identityKey(result.gameName), result)
          while (cache.size > 128) cache.delete(cache.keys().next().value!)
          save()
        }
        options.onUpdate?.(result)
        return result
      }).finally(() => pending.delete(key))
      pending.set(key, task)
    }
    if (!force && cached) { void task.catch(() => {}); return { ...cached, stale: true } }
    return task
  }
  return { getCodes, searchGames }
}
