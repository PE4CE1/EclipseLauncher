import { desktopFetch } from './httpClient'
import type { SteamGame } from './steamService'
import type { SteamNewsItem, SteamNewsEvent } from './steamNews'
import { isHomeGameCandidate } from './homeGameFilter'
import { parseCalendarSearch } from './releaseCalendar'
import { parseHomeStoreItems } from './homeRecommendations'

export function pickHomeNews(news: SteamNewsItem[], events: SteamNewsEvent[], now = Date.now()/1000): SteamNewsItem | undefined {
  const recent = news.filter(item => item.date <= now + 300 && item.date >= now - 90*86400).sort((a,b) => b.date-a.date)
  return recent.find(item => events.find(event => event.id === item.id)?.type === 14) || recent[0]
}

export interface HomeStoreFeed { releases: SteamGame[]; specials: SteamGame[]; upcoming: SteamGame[]; sellers: SteamGame[] }
const keys = { releases: 'new_releases', specials: 'specials', upcoming: 'coming_soon', sellers: 'top_sellers' } as const
const asset = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && (url.hostname === 'steamstatic.com' || url.hostname.endsWith('.steamstatic.com'))) return url.href
  } catch {}
}
export function parseHomeStoreFeed(raw: unknown, locale: string): HomeStoreFeed {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const parse = (category: string) => {
    const items = (data[category] as { items?: unknown[] })?.items
    if (!Array.isArray(items)) return []
    const seen = new Set<number>()
    return items.slice(0, 60).flatMap(raw => {
      if (!raw || typeof raw !== 'object') return []
      const item = raw as Record<string, unknown>, id = item.id
      if (typeof id !== 'number' || seen.has(id) || item.type !== 0 || typeof item.name !== 'string' || !isHomeGameCandidate(id,item.name)) return []
      seen.add(id)
      const price = (cents: unknown) => {
        if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0 || typeof item.currency !== 'string' || !/^[A-Z]{3}$/.test(item.currency)) return
        try { return new Intl.NumberFormat(locale, { style: 'currency', currency: item.currency }).format(cents / 100) } catch { return }
      }
      return [{ steamId: id, name: item.name.slice(0, 200), headerImage: asset(item.header_image) || asset(item.large_capsule_image),
        priceFormatted: price(item.final_price), initialPriceFormatted: price(item.original_price),
        // A zero price on an unreleased game is not evidence that it is free.
        isFree: category !== 'coming_soon' && item.final_price === 0 && item.original_price === 0,
        discountPercent: typeof item.discount_percent === 'number' ? Math.max(0, Math.min(100, item.discount_percent)) : 0,
      } satisfies SteamGame]
    }).slice(0, category === 'new_releases' ? 30 : 40)
  }
  return Object.fromEntries(Object.entries(keys).map(([key, category]) => [key, parse(category)])) as unknown as HomeStoreFeed
}

export async function fetchHomeStoreFeed(language: string, signal?: AbortSignal): Promise<HomeStoreFeed> {
  // Match the existing detail-page region; a language switch must not silently
  // change the store's country or currency.
  const query = new URLSearchParams({ l: language === 'de' ? 'german' : 'english', cc: 'DE' })
  const response = await desktopFetch(`https://store.steampowered.com/api/featuredcategories/?${query}`, { signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(12_000)]) })
  if (!response.ok) throw new Error('Steam discovery feed unavailable')
  const result = parseHomeStoreFeed(await response.json(), language === 'de' ? 'de-DE' : 'en-US')
  if (!result.releases.length && !result.specials.length && !result.upcoming.length && !result.sellers.length) throw new Error('Steam discovery feed is empty')
  const signalWithDeadline = AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(10_000)])
  const search = async (filter:Record<string,string>,limit:number) => {
    const query = new URLSearchParams({...filter,category1:'998',count:String(limit),start:'0',cc:'DE',l:language==='de'?'german':'english',infinite:'1'})
    const response = await desktopFetch('https://store.steampowered.com/search/results/?'+query,{signal:signalWithDeadline})
    return response.ok ? parseCalendarSearch(await response.json()).slice(0,limit) : []
  }
  const searches = await Promise.allSettled([search({specials:'1'},60),search({filter:'topsellers'},40)])
  signal?.throwIfAborted()
  const saleIds = searches[0].status==='fulfilled' ? searches[0].value : []
  const sellerIds = [...new Set([...(searches[1].status==='fulfilled' ? searches[1].value : []),...result.sellers.map(game => game.steamId)])].slice(0,40)
  const candidates = [...new Set([...sellerIds,...saleIds,...result.specials.map(game => game.steamId)])].slice(0,140)
  if (!candidates.length) return result
  try {
    const batches = [candidates.slice(0,100),candidates.slice(100)].filter(batch => batch.length)
    const metadata = await Promise.allSettled(batches.map(async batch => {
      const input = {ids:batch.map(appid => ({appid})),context:{language:language==='de'?'german':'english',country_code:'DE'},data_request:{include_assets:true,include_basic_info:true,include_release:true,include_reviews:true}}
      const response = await desktopFetch('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json='+encodeURIComponent(JSON.stringify(input)),{signal:signalWithDeadline})
      return response.ok ? parseHomeStoreItems(await response.json(),new Set(batch),language==='de'?'de-DE':'en-US') : []
    }))
    signal?.throwIfAborted()
    const verified = metadata.flatMap(result => result.status==='fulfilled' ? result.value : [])
    const byId = new Map(verified.map(({currentPlayers:_,...game}) => [game.steamId,game]))
    const saleGames = [...result.specials.map(game => byId.get(game.steamId)),...saleIds.map(id => byId.get(id))].filter((game):game is NonNullable<typeof game> => !!game && (game.discountPercent || 0)>0)
    const sales = [...new Map(saleGames.map(game => [game.steamId,game])).values()]
    return {...result,sellers:sellerIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []),specials:sales}
  } catch { signal?.throwIfAborted(); return {...result,sellers:[],specials:[]} }
}
