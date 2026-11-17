import { desktopFetch } from './httpClient'
import { parseSteamArtwork } from './steamArtwork'
import type { SteamGame } from './steamService'
import type { HomeStoreFeed } from './homeDiscovery'
import { isHomeGameCandidate } from './homeGameFilter'
import { parseCalendarSearch } from './releaseCalendar'

export interface HomeRecommendation extends SteamGame {
  currentPlayers: number
  reviewCount: number
  positivePercent: number
  releasedAt: number
}
export interface HomeRecommendations { releases: HomeRecommendation[]; highlights: HomeRecommendation[] }
type RecordValue = Record<string, unknown>
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}
const appId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 0xffffffff
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
const RECENT_DAYS = 180

export function parseHomePlayerCharts(raw: unknown): Map<number, number> {
  const ranks = record(record(raw).response).ranks
  const counts = new Map<number, number>()
  if (!Array.isArray(ranks)) return counts
  for (const entry of ranks.slice(0, 100)) {
    const row = record(entry)
    if (appId(row.appid) && integer(row.concurrent_in_game) && !counts.has(row.appid)) counts.set(row.appid, row.concurrent_in_game)
  }
  return counts
}

export function parseHomeStoreItems(raw: unknown, requested: ReadonlySet<number>, locale: string): HomeRecommendation[] {
  const items = record(record(raw).response).store_items
  if (!Array.isArray(items)) return []
  const seen = new Set<number>()
  return items.slice(0, 100).flatMap(value => {
    const item = record(value), id = item.appid
    if (!appId(id) || !requested.has(id) || seen.has(id) || item.success !== 1 || item.type !== 0 || item.item_type !== 0 || item.visible !== true || typeof item.name !== 'string' || !isHomeGameCandidate(id,item.name)) return []
    seen.add(id)
    const reviews = record(record(item.reviews).summary_filtered), release = record(item.release), basic = record(item.basic_info)
    const price = record(item.best_purchase_option)
    const artwork = parseSteamArtwork(id, item.assets)
    const names = (rows: unknown): string[] | undefined => Array.isArray(rows) ? rows.slice(0, 5).flatMap(row => {
      const name = record(row).name
      return typeof name === 'string' ? [name.slice(0, 150)] : []
    }) : undefined
    const formatPrice = (value: unknown): string | undefined => {
      const amount = Number(value)
      // Home uses the DE store. Format its actual EUR cents for the UI locale.
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !integer(amount)) return
      return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(amount / 100)
    }
    return [{ steamId: id, name: item.name.trim().slice(0, 200),
      shortDescription: typeof basic.short_description === 'string' ? basic.short_description.slice(0, 1500).replace(/<[^>]*>/g, '') : undefined,
      headerImage: artwork?.header || artwork?.hero,
      heroImage: artwork?.hero,
      developers: names(basic.developers), publishers: names(basic.publishers),
      releasedAt: integer(release.steam_release_date) ? release.steam_release_date : 0,
      releaseDate: integer(release.steam_release_date) && release.steam_release_date > 0 ? new Date(release.steam_release_date * 1000).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' }) : undefined,
      reviewCount: integer(reviews.review_count) ? reviews.review_count : 0,
      positivePercent: integer(reviews.percent_positive) && reviews.percent_positive <= 100 ? reviews.percent_positive : 0,
      currentPlayers: 0,
      isFree: item.is_free === true || (typeof price.final_price_in_cents === 'string' && /^0+$/.test(price.final_price_in_cents)),
      priceFormatted: formatPrice(price.final_price_in_cents), initialPriceFormatted: formatPrice(price.original_price_in_cents),
      discountPercent: integer(price.discount_pct) ? Math.min(100, price.discount_pct) : undefined,
    } satisfies HomeRecommendation]
  })
}

export function selectHomeRecommendations(items: HomeRecommendation[], players: ReadonlyMap<number, number>, sellerIds: readonly number[], now = Date.now() / 1000): HomeRecommendations {
  const eligible = items.filter(game => isHomeGameCandidate(game.steamId,game.name) && game.releasedAt > 0 && game.releasedAt <= now && game.reviewCount >= 100 && game.positivePercent >= 70 && (players.get(game.steamId) ?? 0) >= 100)
    .map(game => ({ ...game, currentPlayers: players.get(game.steamId)! }))
    .sort((a, b) => b.currentPlayers - a.currentPlayers || b.positivePercent - a.positivePercent || a.steamId - b.steamId)
  const releases = eligible.filter(game => game.releasedAt >= now - RECENT_DAYS * 86400).slice(0, 24)
  const sellerOrder = new Map(sellerIds.map((id, index) => [id, index]))
  const sellers = eligible.filter(game => sellerOrder.has(game.steamId)).sort((a, b) => sellerOrder.get(a.steamId)! - sellerOrder.get(b.steamId)!)
  const storefrontGames = (games: HomeRecommendation[]) => games.filter(game => game.priceFormatted && !game.isFree)
  const highlights = [...new Map([...releases.slice(0, 6), ...storefrontGames(sellers), ...storefrontGames(eligible), ...sellers, ...eligible].map(game => [game.steamId, game])).values()].slice(0, 8)
  return { releases, highlights }
}

export async function fetchHomeRecommendations(language: string, feed: HomeStoreFeed | undefined, signal?: AbortSignal): Promise<HomeRecommendations> {
  const requestSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15_000)])
  const json = async (url: string) => {
    requestSignal.throwIfAborted()
    const response = await desktopFetch(url, { signal: requestSignal })
    if (!response.ok) throw new Error('Steam recommendations unavailable')
    const body: unknown = await response.json()
    requestSignal.throwIfAborted()
    return body
  }
  const [chart, popular] = await Promise.allSettled([
    json('https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/'),
    json('https://store.steampowered.com/search/results/?'+new URLSearchParams({filter:'popularnew',sort_by:'Released_DESC',category1:'998',count:'60',start:'0',cc:'DE',l:language==='de'?'german':'english',infinite:'1'})),
  ])
  const players = parseHomePlayerCharts(chart.status === 'fulfilled' ? chart.value : null)
  if (!players.size) throw new Error('Steam activity data unavailable')
  const popularIds = popular.status === 'fulfilled' ? parseCalendarSearch(popular.value).slice(0,60) : []
  const ids = [...new Set([...players.keys(),...popularIds, ...(feed?.releases || []).map(game => game.steamId), ...(feed?.sellers || []).map(game => game.steamId)])].filter(appId).slice(0, 200)
  const batches = [ids.slice(0, 100), ids.slice(100)].filter(batch => batch.length)
  const results = await Promise.allSettled(batches.map(async batch => {
    const input = { ids: batch.map(appid => ({ appid })), context: { language: language === 'de' ? 'german' : 'english', country_code: 'DE' }, data_request: { include_assets: true, include_basic_info: true, include_reviews: true, include_release: true } }
    return parseHomeStoreItems(await json(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`), new Set(batch), language === 'de' ? 'de-DE' : 'en-US')
  }))
  requestSignal.throwIfAborted()
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (!items.length) throw new Error('Steam game metadata unavailable')
  // The charts cover the 100 most active games. Check promising smaller new
  // releases individually, with a bounded worker pool instead of one request per card.
  const now = Date.now() / 1000
  const unranked = items.filter(game => !players.has(game.steamId) && game.releasedAt <= now && game.releasedAt >= now - RECENT_DAYS * 86400 && game.reviewCount >= 100 && game.positivePercent >= 70).sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 24)
  const extraSignal = AbortSignal.any([requestSignal, AbortSignal.timeout(4000)])
  let next = 0
  await Promise.all(Array.from({ length: Math.min(3, unranked.length) }, async () => {
    while (next < unranked.length && !extraSignal.aborted) {
      const game = unranked[next++]
      try {
        const response = await desktopFetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${game.steamId}`, { signal: AbortSignal.any([extraSignal, AbortSignal.timeout(3000)]) })
        const data = response.ok ? record(record(await response.json()).response) : {}
        if (data.result === 1 && integer(data.player_count)) players.set(game.steamId, data.player_count)
      } catch { /* An unavailable count is unknown, never fabricated activity. */ }
    }
  }))
  requestSignal.throwIfAborted()
  const result = selectHomeRecommendations(items, players, (feed?.sellers || []).map(game => game.steamId), now)
  if (!result.highlights.length) throw new Error('No verified recommendations available')
  return result
}
