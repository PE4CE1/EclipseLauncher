import { desktopFetch } from './httpClient'
import { parseSteamArtwork } from './steamArtwork'
import { isHomeGameCandidate } from './homeGameFilter'
import type { SteamGame } from './steamService'

export interface ReleaseCalendarGame extends SteamGame {
  releaseDay: string | null
  releaseState: 'released' | 'upcoming'
  releaseWindow: string
  earlyAccess: boolean
  priority: number
}
export interface ReleaseCalendarFeed { games: ReleaseCalendarGame[]; partial: boolean }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const validId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 0xffffffff

export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
}
export function calendarDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  // Noon avoids missing/repeated local midnights during timezone transitions.
  return new Date(year, month-1, day, 12)
}
export function calendarWeek(today: Date, offset = 0): Date[] {
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  monday.setDate(monday.getDate() - (monday.getDay()+6)%7 + Math.trunc(offset)*7)
  return Array.from({length:7},(_,index) => { const date = new Date(monday); date.setDate(date.getDate()+index); return date })
}
export function groupCalendarWeek(games: readonly ReleaseCalendarGame[], days: readonly Date[]): ReleaseCalendarGame[][] {
  return days.map(day => games.filter(game => game.releaseDay === calendarDayKey(day))
    .sort((a,b) => a.priority-b.priority || a.steamId-b.steamId))
}

/** Search markup supplies IDs only. Never insert provider HTML into the DOM. */
export function parseCalendarSearch(raw: unknown): number[] {
  const html = record(raw).results_html
  if (record(raw).success !== 1 || typeof html !== 'string' || html.length > 2_000_000) return []
  return [...new Set([...html.matchAll(/<a\b[^>]*\bdata-ds-appid=["'](\d+)["'][^>]*>/g)]
    .filter(match => /\bdata-ds-itemkey=["']App_\d+["']/.test(match[0]))
    .map(match => Number(match[1])).filter(validId))].slice(0,100)
}

export function parseCalendarItems(raw: unknown, order: ReadonlyMap<number, number>, language: string, now = Date.now()/1000): ReleaseCalendarGame[] {
  const items = record(record(raw).response).store_items
  if (!Array.isArray(items)) return []
  const seen = new Set<number>(), locale = language === 'de' ? 'de-DE' : 'en-US'
  return items.slice(0,100).flatMap(value => {
    const item = record(value), id = item.appid
    if (!validId(id) || !order.has(id) || seen.has(id) || item.success !== 1 || item.visible !== true || item.item_type !== 0 || item.type !== 0 || typeof item.name !== 'string' || !isHomeGameCandidate(id,item.name)) return []
    seen.add(id)
    const release = record(item.release), timestamp = release.steam_release_date
    const validTime = typeof timestamp === 'number' && Number.isSafeInteger(timestamp) && timestamp > 0 && timestamp <= 7_258_118_400
    const upcoming = release.is_coming_soon === true
    // A timestamp may encode a private date or the end of an approximate
    // month/quarter. Only the public exact-date style may occupy a calendar day.
    const exact = validTime && !release.is_abridged_release_date && (!upcoming || release.coming_soon_display === 'date_full')
    if (!upcoming && (!validTime || timestamp > now)) return []
    const date = validTime ? new Date(timestamp*1000) : null
    let window = ''
    if (typeof release.custom_release_date_message === 'string') window = release.custom_release_date_message.replace(/<[^>]*>/g,'').slice(0,160)
    if (!window && date && !exact) {
      if (release.coming_soon_display === 'date_month') window = date.toLocaleDateString(locale,{month:'long',year:'numeric'})
      else if (release.coming_soon_display === 'date_year') window = String(date.getFullYear())
      else if (release.coming_soon_display === 'date_quarter') window = `Q${Math.floor(date.getMonth()/3)+1} ${date.getFullYear()}`
    }
    const artwork = parseSteamArtwork(id,item.assets)
    return [{ steamId:id,name:item.name.trim().slice(0,200),headerImage:artwork?.header || artwork?.hero,
      releaseDay:exact && date ? calendarDayKey(date) : null,
      releaseDate:exact && date ? date.toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'}) : undefined,
      releaseState:upcoming ? 'upcoming' as const : 'released' as const,releaseWindow:window,
      earlyAccess:release.is_early_access === true,priority:order.get(id)!,
    } satisfies ReleaseCalendarGame]
  })
}

export async function fetchReleaseCalendar(language: string, seeds: readonly SteamGame[] = [], signal?: AbortSignal): Promise<ReleaseCalendarFeed> {
  const deadline = AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(15_000)])
  const json = async (url: string) => {
    deadline.throwIfAborted()
    const response = await desktopFetch(url,{signal:deadline})
    if (!response.ok) throw new Error('Steam calendar unavailable')
    const body: unknown = await response.json()
    deadline.throwIfAborted()
    return body
  }
  const search = (filter: string, sort: string) => json('https://store.steampowered.com/search/results/?'+new URLSearchParams({
    filter,sort_by:sort,category1:'998',start:'0',count:'100',cc:'DE',l:language === 'de' ? 'german' : 'english',infinite:'1',
  })).then(parseCalendarSearch)
  const searches = await Promise.allSettled([search('popularnew','Released_DESC'),search('popularcomingsoon','')])
  deadline.throwIfAborted()
  const lists = searches.map(result => result.status === 'fulfilled' ? result.value : [])
  const ids = [...new Set([...lists[0],...lists[1],...seeds.map(game => game.steamId).filter(validId)])].slice(0,240)
  if (!ids.length) throw new Error('Steam calendar contains no games')
  const order = new Map(ids.map((id,index) => [id,index]))
  // Two concurrent metadata requests at most; no request per visible cover.
  const results: Array<PromiseSettledResult<ReleaseCalendarGame[]>> = []
  for (let start = 0; start < ids.length; start += 200) {
    const batches = [ids.slice(start,start+100),ids.slice(start+100,start+200)].filter(batch => batch.length)
    results.push(...await Promise.allSettled(batches.map(async batch => {
      const input = {ids:batch.map(appid => ({appid})),context:{language:language === 'de' ? 'german' : 'english',country_code:'DE'},data_request:{include_assets:true,include_release:true}}
      return parseCalendarItems(await json('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json='+encodeURIComponent(JSON.stringify(input))),order,language)
    })))
  }
  deadline.throwIfAborted()
  const games = results.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  if (!games.length) throw new Error('Steam calendar metadata unavailable')
  return {games,partial:searches.some((result,index) => result.status === 'rejected' || !lists[index].length) || results.some(result => result.status === 'rejected')}
}
