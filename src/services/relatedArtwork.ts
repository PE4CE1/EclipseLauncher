import { searchSteamGames } from './steamService'
import { getSteamArtwork, type SteamArtwork } from './steamArtwork'

interface RelatedArtwork { appId: number; artwork: SteamArtwork | null }
const cache = new Map<string, { appId: number | null; expires: number }>()
const pending = new Map<string, Promise<number | null>>()
const normalize = (name: string) => name.replace(/[™®]/g, '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()

export function getDemoBaseName(name: string): string | null {
  const base = name.replace(/\s*(?:[-:–—]\s*)?(?:\((?:demo|playtest)\)|\b(?:demo|playtest))\s*$/i, '').trim()
  return base.length >= 2 && base !== name.trim() ? base : null
}

export async function getRelatedArtwork(name: string, originalAppId?: number): Promise<RelatedArtwork | null> {
  const base = getDemoBaseName(name)
  if (!base) return null
  const key = normalize(base)
  let entry = cache.get(key)
  if (!entry || entry.expires <= Date.now()) {
    let lookup = pending.get(key)
    if (!lookup) {
      lookup = searchSteamGames(base, { lang: 'english', cc: 'US' }).then(items => {
        // Never use a fuzzy first result: sequels and similarly named games have different art.
        const match = items.find(item => normalize(item.name) === key && Number.isSafeInteger(item.id) && item.id > 0)
        const appId = match?.id || null
        cache.set(key, { appId, expires: Date.now() + (appId ? 86400000 : 300000) })
        while (cache.size > 512) cache.delete(cache.keys().next().value!)
        return appId
      }).catch(() => null).finally(() => pending.delete(key))
      pending.set(key, lookup)
    }
    const appId = await lookup
    entry = { appId, expires: 0 }
  }
  return entry.appId && entry.appId !== originalAppId
    ? { appId: entry.appId, artwork: await getSteamArtwork(entry.appId) }
    : null
}
