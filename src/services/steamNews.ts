import { desktopFetch } from './httpClient'

export interface SteamNewsItem {
  id: string
  title: string
  contents: string
  date: number
  url: string
}

export interface SteamNewsEvent { id: string; image?: string; capsule?: string; type: number }

export function parseSteamNewsEvents(data: unknown, appId: number, language: string): SteamNewsEvent[] {
  const events = (data as { events?: unknown[] })?.events
  if (!Array.isArray(events)) return []
  return events.slice(0, 30).flatMap(raw => {
    try {
      const event = raw as Record<string, unknown>
      const body = event.announcement_body as Record<string, unknown> | undefined
      if (event.appid !== appId || event.published !== 1 || event.hidden || event.unlisted || !body || typeof body.gid !== 'string' || !/^\d{1,32}$/.test(body.gid)) return []
      const clan = String(body.clanid || (BigInt(String(event.clan_steamid)) - 103582791429521408n))
      if (!/^\d{1,12}$/.test(clan) || typeof event.jsondata !== 'string' || event.jsondata.length > 200_000) return []
      const meta = JSON.parse(event.jsondata)
      const image = (field: string) => {
        const values = meta[field]
        if (!Array.isArray(values)) return undefined
        const file = values[language === 'de' ? 1 : 0] || values[0]
        return typeof file === 'string' && /^[a-f\d]{40}\.(png|jpg|jpeg|webp)$/i.test(file) ? `https://clan.fastly.steamstatic.com/images/${clan}/${file}` : undefined
      }
      return [{ id: body.gid, image: image('localized_title_image') || image('localized_capsule_image'), capsule: image('localized_capsule_image'), type: Number(event.event_type) || 0 }]
    } catch { return [] }
  })
}

export async function fetchSteamNewsEvents(appId: number, language: string, signal?: AbortSignal): Promise<SteamNewsEvent[]> {
  if (!Number.isSafeInteger(appId) || appId <= 0 || appId > 0xffffffff) return []
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(5000)])
  const query = new URLSearchParams({ appid: String(appId), offset: '0', count: '30', l: language === 'de' ? 'german' : 'english' })
  const response = await desktopFetch(`https://store.steampowered.com/events/ajaxgetpartnereventspageable/?${query}`, { signal: combined })
  if (!response.ok) throw new Error('Steam event artwork unavailable')
  return parseSteamNewsEvents(await response.json(), appId, language)
}

export function parseSteamNews(data: unknown, appId: number): SteamNewsItem[] {
  const news = (data as { appnews?: { appid?: number; newsitems?: unknown[] } })?.appnews
  if (news?.appid !== appId || !Array.isArray(news.newsitems)) return []
  const seen = new Set<string>()
  return news.newsitems.slice(0, 12).flatMap(raw => {
    if (!raw || typeof raw !== 'object') return []
    const item = raw as Record<string, unknown>
    if (typeof item.gid !== 'string' || !/^\d{1,32}$/.test(item.gid) || seen.has(item.gid) || typeof item.title !== 'string'
      || typeof item.contents !== 'string' || typeof item.date !== 'number' || !Number.isFinite(item.date) || item.date <= 0 || item.date > 8_640_000_000_000
      || item.feedname !== 'steam_community_announcements') return []
    seen.add(item.gid)
    // Keep the original link on Steam even if an upstream feed supplies a redirect.
    const url = `https://store.steampowered.com/news/app/${appId}/view/${encodeURIComponent(item.gid)}`
    return [{ id: item.gid, title: item.title.slice(0, 300), contents: item.contents.slice(0, 150_000), date: item.date, url }]
  }).sort((a, b) => b.date - a.date)
}

export async function fetchSteamNews(appId: number, language: string, signal?: AbortSignal): Promise<SteamNewsItem[]> {
  if (!Number.isSafeInteger(appId) || appId <= 0 || appId > 0xffffffff) return []
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 10_000)
  try {
    const query = new URLSearchParams({ appid: String(appId), count: '12', maxlength: '0', feeds: 'steam_community_announcements', l: language === 'de' ? 'german' : 'english' })
    const response = await desktopFetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?${query}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Steam news: HTTP ${response.status}`)
    return parseSteamNews(await response.json(), appId)
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}
