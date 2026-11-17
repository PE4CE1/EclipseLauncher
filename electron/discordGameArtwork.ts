import * as https from 'https'

export interface GameArtwork { appId: number; imageUrl: string }
const cache = new Map<string, { artwork: GameArtwork | null; expires: number }>()
const pending = new Map<string, Promise<GameArtwork | null>>()

export function steamIconUrl(appId: number, hash: unknown): string | undefined {
  return Number.isSafeInteger(appId) && appId > 0 && typeof hash === 'string' && /^[a-f0-9]{32,40}$/i.test(hash)
    ? `https://shared.fastly.steamstatic.com/community_assets/images/apps/${appId}/${hash}.jpg` : undefined
}

function requestJson(url: string): Promise<any | null> {
  return new Promise(resolve => {
    let done = false
    let request: ReturnType<typeof https.get> | undefined
    const finish = (value: any) => { if (!done) { done = true; clearTimeout(deadline); resolve(value) } }
    const deadline = setTimeout(() => { finish(null); request?.destroy() }, 4000)
    deadline.unref?.()
    const parsed = new URL(url)
    try {
      request = https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search,
        timeout: 3500, headers: { Accept: 'application/json', 'User-Agent': 'EclipseLauncher' } }, response => {
        if (response.statusCode !== 200) { response.resume(); finish(null); return }
        let raw = '', bytes = 0
        response.setEncoding?.('utf8')
        response.on('error', () => finish(null))
        response.on('aborted', () => finish(null))
        response.on('data', chunk => {
          if (done) return
          bytes += Buffer.byteLength(chunk)
          if (bytes > 2 * 1024 * 1024) { finish(null); response.destroy(); return }
          raw += chunk
        })
        response.on('end', () => { if (!done) { try { finish(JSON.parse(raw)) } catch { finish(null) } } })
      })
      request.on('error', () => finish(null))
      request.on('timeout', () => { finish(null); request?.destroy() })
    } catch { finish(null) }
  })
}

function cached(key: string, fetchArtwork: () => Promise<GameArtwork | null>): Promise<GameArtwork | null> {
  const found = cache.get(key)
  if (found && found.expires > Date.now()) return Promise.resolve(found.artwork)
  const running = pending.get(key)
  if (running) return running
  const task = fetchArtwork().catch(() => null).then(artwork => {
    cache.delete(key)
    cache.set(key, { artwork, expires: Date.now() + (artwork ? 6 * 60 * 60_000 : 30_000) })
    while (cache.size > 256) cache.delete(cache.keys().next().value!)
    return artwork
  }).finally(() => pending.delete(key))
  pending.set(key, task)
  return task
}

export function fetchSteamGameIcon(appId: number): Promise<GameArtwork | null> {
  if (!Number.isSafeInteger(appId) || appId <= 0) return Promise.resolve(null)
  return cached(`app:${appId}`, async () => {
    const input = { ids: [{ appid: appId }], context: { language: 'english', country_code: 'US' }, data_request: { include_assets: true } }
    const json = await requestJson(`https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`)
    const items = json?.response?.store_items
    const item = Array.isArray(items) ? items.find(item => item?.appid === appId) : undefined
    const imageUrl = steamIconUrl(appId, item?.assets?.community_icon)
    return imageUrl ? { appId, imageUrl } : null
  })
}

const titleKey = (value: string) => value.replace(/[™®©]/g, '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
export function searchSteamArtwork(name: string): Promise<GameArtwork | null> {
  const key = titleKey(name)
  if (!key) return Promise.resolve(null)
  return cached(`name:${key}`, async () => {
    const json = await requestJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`)
    const matched = Array.isArray(json?.items) ? json.items.find((item: any) => typeof item?.name === 'string' && titleKey(item.name) === key) : undefined
    // Store search capsules and library wordmarks are wide; Discord crops them.
    return Number.isSafeInteger(matched?.id) ? fetchSteamGameIcon(matched.id) : null
  })
}
