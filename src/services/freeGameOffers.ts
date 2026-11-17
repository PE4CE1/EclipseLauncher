import type { FreeGameItem } from '../types/freeGames'

const platformOrder: Record<FreeGameItem['platform'], number> = {
  Steam: 0, 'Epic Games': 1, GOG: 2, Other: 3,
}

export function sortFreeGameOffers(games: readonly FreeGameItem[]): FreeGameItem[] {
  // Keep the feed order within each store and leave React Query's cached array intact.
  return [...games].sort((a, b) => (platformOrder[a.platform] ?? 3) - (platformOrder[b.platform] ?? 3))
}

export function freeGameClaimKey(game: FreeGameItem): string {
  let url: URL | undefined
  try { url = new URL(game.url) } catch { /* Some older cached offers only have a feed ID. */ }
  const path = url?.pathname.toLowerCase() ?? ''
  if (game.platform === 'Steam') {
    const appId = game.steamAppId || (url?.hostname === 'store.steampowered.com' ? Number(/^\/app\/(\d+)(?:\/|$)/.exec(path)?.[1]) : 0)
    if (Number.isSafeInteger(appId) && appId > 0) return `Steam:app:${appId}`
  }
  if (game.platform === 'Epic Games') {
    const slug = game.slug || (url?.hostname === 'store.epicgames.com' ? /\/p\/(.+)/.exec(path)?.[1] : '')
    if (slug) return `Epic Games:product:${slug.toLowerCase().replace(/\/(?:home)?\/?$/, '').trim()}`
  }
  if (game.platform === 'GOG' && /^(?:www\.)?gog\.com$/.test(url?.hostname ?? '')) {
    const slug = /\/game\/([^/]+)/.exec(path)?.[1]
    if (slug) return `GOG:product:${slug}`
  }
  // Feed IDs can change between sources; a store's title remains stable across refreshes.
  return `${game.platform}:title:${(game.title || game.id).normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()}`
}
