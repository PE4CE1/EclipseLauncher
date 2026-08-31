/**
 * steamService.ts
 * Zero-config Steam Store API integration.
 * Uses only public Steam endpoints — no API keys required.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SteamSearchItem {
  id: number
  name: string
  tiny_image: string
  price?: {
    currency: string
    initial: number
    final: number
    discount_percent: number
    final_formatted: string
  }
}

export interface SteamSearchResponse {
  total: number
  items: SteamSearchItem[]
}

export interface SteamAppDetails {
  appid?: number
  steam_appid?: number
  name: string
  short_description: string
  detailed_description: string
  about_the_game: string
  header_image: string
  background: string
  background_raw: string
  genres: Array<{ id: string; description: string }>
  release_date: { coming_soon: boolean; date: string }
  developers?: string[]
  publishers?: string[]
  platforms: { windows: boolean; mac: boolean; linux: boolean }
  metacritic?: { score: number; url: string }
  screenshots?: Array<{
    id: number
    path_thumbnail: string
    path_full: string
  }>
  movies?: Array<{
    id: number
    name: string
    thumbnail: string
    webm?: { 480?: string; max?: string }
    mp4?: { 480?: string; max?: string }
    hls_h264?: string
    dash_h264?: string
    dash_av1?: string
    highlight?: boolean
  }>
  pc_requirements?: {
    minimum?: string
    recommended?: string
  }
  price_overview?: {
    currency: string
    initial: number
    final: number
    discount_percent: number
    initial_formatted?: string
    final_formatted: string
  }
  categories?: Array<{ id: number; description: string }>
  supported_languages?: string
  legal_notice?: string
  ext_user_account_notice?: string
  drm_notice?: string
  is_free: boolean
  type: string
  achievements?: {
    total: number
    highlighted: Array<{ name: string; path: string }>
  }
}

export interface FeaturedGame {
  id: number
  name: string
  header_image: string
  discount_percent: number
  final_price: number
  original_price: number
  currency: string
}

export interface FeaturedCategory {
  id: string
  name: string
  items: FeaturedGame[]
}

// ─── Special Non-Steam App Definitions ────────────────────────────────────────
export const ROBLOX_APP_ID = 999001

export const ROBLOX_APP_DETAILS: SteamAppDetails = {
  appid: ROBLOX_APP_ID,
  steam_appid: ROBLOX_APP_ID,
  type: 'game',
  name: 'Roblox',
  is_free: true,
  short_description: 'Roblox is the ultimate virtual universe that lets you create, share experiences with friends, and be anything you can imagine. Join millions of people and discover an infinite variety of immersive experiences created by a global community!',
  detailed_description: 'Roblox is the ultimate virtual universe that lets you create, share experiences with friends, and be anything you can imagine. Explore millions of community-created 3D experiences, from epic adventures and competitive battles to hangout worlds with friends across PC, console, and mobile.',
  about_the_game: 'Roblox is the ultimate virtual universe that lets you create, share experiences with friends, and be anything you can imagine. Explore millions of community-created 3D experiences, from epic adventures and competitive battles to hangout worlds with friends across PC, console, and mobile.',
  supported_languages: 'English, German, French, Spanish, Japanese, Korean, Chinese, and 20+ more',
  header_image: '/roblox/hero.png',
  background: '/roblox/hero.png',
  background_raw: '/roblox/hero.png',
  pc_requirements: {
    minimum: '<strong>OS:</strong> Windows 10/11 (64-bit)<br><strong>Processor:</strong> 1.6 GHz or better<br><strong>Memory:</strong> 4 GB RAM<br><strong>Graphics:</strong> DirectX 10 minimum (Shader Model 2.0)<br><strong>Network:</strong> Broadband Internet connection<br><strong>Storage:</strong> 1 GB available space',
    recommended: '<strong>OS:</strong> Windows 10/11 (64-bit)<br><strong>Processor:</strong> High-end 4-Core CPU or better<br><strong>Memory:</strong> 8 GB RAM<br><strong>Graphics:</strong> Dedicated GPU with DirectX 11+ support<br><strong>Network:</strong> Broadband Internet connection'
  },
  developers: ['Roblox Corporation'],
  publishers: ['Roblox Corporation'],
  platforms: { windows: true, mac: true, linux: false },
  metacritic: { score: 92, url: 'https://www.roblox.com' },
  categories: [
    { id: 1, description: 'Multi-player' },
    { id: 2, description: 'Cross-Platform Multiplayer' },
    { id: 3, description: 'Online PvP' },
    { id: 4, description: 'Online Co-op' },
    { id: 5, description: 'In-App Purchases' }
  ],
  genres: [
    { id: '1', description: 'Massively Multiplayer' },
    { id: '2', description: 'Adventure' },
    { id: '3', description: 'Action' },
    { id: '4', description: 'Free to Play' },
    { id: '5', description: 'Sandbox' }
  ],
  screenshots: [
    { id: 1, path_thumbnail: '/roblox/hero.png', path_full: '/roblox/hero.png' },
    { id: 2, path_thumbnail: '/roblox/screen1.png', path_full: '/roblox/screen1.png' },
    { id: 3, path_thumbnail: '/roblox/screen2.png', path_full: '/roblox/screen2.png' },
    { id: 4, path_thumbnail: '/roblox/screen3.png', path_full: '/roblox/screen3.png' },
    { id: 5, path_thumbnail: '/roblox/screen4.png', path_full: '/roblox/screen4.png' }
  ],
  release_date: { coming_soon: false, date: '1 Sep 2006' }
}

// ─── Curated popular game IDs for the home carousel ──────────────────────────
// Evergreen top-sellers/popular titles — great assets, no obscure or mobile-style games.
export const POPULAR_STEAM_IDS = [
  730,    // CS2
  1086940,// Baldur's Gate 3
  1245620,// Elden Ring
  1091500,// Cyberpunk 2077 (2.0)
  2246340,// Monster Hunter Wilds
  2183900,// Warhammer 40K: Space Marine 2
  2358720,// Black Myth: Wukong
  1172470,// Apex Legends
  252490, // Rust
  892970, // Valheim
  526870, // Satisfactory 1.0
  990080, // Hogwarts Legacy
  1817190,// Marvel's Spider-Man Remastered
  2138710,// God of War (2018)
  1174180,// Red Dead Redemption 2
  271590, // GTA V
  292030, // Witcher 3 (Next-Gen)
  814380, // Sekiro
  1145360,// Hades
  2767030,// Marvel Rivals
  1771300,// Kingdom Come: Deliverance II
  2457220,// Avowed
  2677660,// Indiana Jones and the Great Circle
  3017860,// DOOM: The Dark Ages
  1158670,// Dune: Awakening
  3280350,// Death Stranding 2
  1888160,// Palworld
]

// Recently-released acclaimed titles (2024-2026). Curated — no obscure/mobile/asset-flip games.
export const NEW_RELEASE_IDS = [
  3280350,// Death Stranding 2 (2026)
  3017860,// DOOM: The Dark Ages (2025)
  2677660,// Indiana Jones and the Great Circle (2025)
  1158670,// Dune: Awakening (2025)
  2246340,// Monster Hunter Wilds (2025)
  2457220,// Avowed (2025)
  1771300,// Kingdom Come: Deliverance II (2025)
  2301850,// Civilization VII (2025)
  2842040,// Star Wars Outlaws (2025)
  2767030,// Marvel Rivals (2024)
  2358720,// Black Myth: Wukong (2024)
  2183900,// Warhammer 40K: Space Marine 2 (2024)
  1601580,// Frostpunk 2 (2024)
  2124490,// Silent Hill 2 Remake (2024)
  1790600,// Dragon Ball: Sparking! ZERO (2024)
  1643320,// S.T.A.L.K.E.R. 2 (2024)
  2322010,// God of War: Ragnarök (2024)
  2694490,// Path of Exile 2 (2024)
]

// Trending = critically acclaimed & widely played. High review scores and player counts.
export const TRENDING_IDS = [
  1888160,// Palworld
  1245620,// Elden Ring
  1086940,// Baldur's Gate 3
  2358720,// Black Myth: Wukong
  1091500,// Cyberpunk 2077
  526870, // Satisfactory
  2183900,// Space Marine 2
  1716740,// Lies of P
  2215430,// Hi-Fi Rush
  1850570,// Alan Wake 2
  2050650,// Resident Evil 4 Remake
  1840454,// Dave the Diver
  1332010,// Stray
  1145360,// Hades
  1388770,// Persona 5 Royal
]

// ─── API Functions ─────────────────────────────────────────────────────────────

/**
 * Search the Steam store — no API key required.
 * Returns matched games with IDs, names, and tiny_image URLs.
 */
export async function searchSteamGames(
  query: string,
  options: { lang?: string; cc?: string } = {}
): Promise<SteamSearchItem[]> {
  if (!query || query.length < 2) return []

  const qLower = query.toLowerCase().trim()
  const isRoblox = qLower === 'roblox' || qLower.startsWith('roblox') || qLower.includes('roblox')

  const params = new URLSearchParams({
    term: query,
    l: options.lang ?? 'english',
    cc: options.cc ?? 'US',
    json: '1',
  })

  const url = `https://store.steampowered.com/api/storesearch/?${params}`
  try {
    const res = await fetch(url)
    if (!res.ok) {
      if (isRoblox) {
        return [{
          id: ROBLOX_APP_ID,
          name: 'Roblox',
          tiny_image: '/Roblox-Logo-Icon.png',
          price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
        }]
      }
      throw new Error(`Steam search failed: ${res.status}`)
    }

    const data: SteamSearchResponse = await res.json()
    const items = data.items ?? []
    if (isRoblox && !items.some(i => i.name.toLowerCase() === 'roblox' || i.id === ROBLOX_APP_ID)) {
      items.unshift({
        id: ROBLOX_APP_ID,
        name: 'Roblox',
        tiny_image: '/Roblox-Logo-Icon.png',
        price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
      })
    }
    return items
  } catch (err) {
    if (isRoblox) {
      return [{
        id: ROBLOX_APP_ID,
        name: 'Roblox',
        tiny_image: '/Roblox-Logo-Icon.png',
        price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
      }]
    }
    throw err
  }
}

export interface RealPriceInfo {
  isFree: boolean
  currency: 'EUR' | 'USD'
  initialPrice: number
  finalPrice: number
  discountPercent: number
  initialFormatted: string
  finalFormatted: string
  hasDiscount: boolean
  allTimeLowPrice: number
  allTimeLowFormatted: string
  allTimeLowDiscountPercent: number
}

const realPriceCache = new Map<string, RealPriceInfo>()

/**
 * Fetch live current price, active discounts, and true All-Time Low price.
 */
export async function fetchRealPriceAndAllTimeLow(
  appId: number,
  currency: 'EUR' | 'USD' = 'EUR'
): Promise<RealPriceInfo | null> {
  const cacheKey = `${appId}_${currency}`
  if (realPriceCache.has(cacheKey)) {
    return realPriceCache.get(cacheKey)!
  }

  if (appId === ROBLOX_APP_ID) {
    const freeResult: RealPriceInfo = {
      isFree: true,
      currency,
      initialPrice: 0,
      finalPrice: 0,
      discountPercent: 0,
      initialFormatted: 'Free',
      finalFormatted: 'Free',
      hasDiscount: false,
      allTimeLowPrice: 0,
      allTimeLowFormatted: 'Free',
      allTimeLowDiscountPercent: 0
    }
    realPriceCache.set(cacheKey, freeResult)
    return freeResult
  }

  const cc = currency === 'EUR' ? 'DE' : 'US'
  const lang = currency === 'EUR' ? 'german' : 'english'
  const formatPrice = (p: number) => 
    currency === 'EUR' 
      ? p.toFixed(2).replace('.', ',') + ' €' 
      : '$' + p.toFixed(2)

  let isFree = false
  let initialPrice = 0
  let finalPrice = 0
  let discountPercent = 0
  let initialFormatted = ''
  let finalFormatted = ''

  try {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&cc=${cc}&l=${lang}`)
    if (res.ok) {
      const data = await res.json()
      const entry = data[String(appId)]
      if (entry?.success && entry?.data) {
        const steamData = entry.data
        isFree = !!steamData.is_free
        const priceOverview = steamData.price_overview
        if (priceOverview) {
          const initialCents = priceOverview.initial || 0
          const finalCents = priceOverview.final || 0
          discountPercent = priceOverview.discount_percent || 0
          initialPrice = initialCents / 100
          finalPrice = finalCents / 100
          initialFormatted = priceOverview.initial_formatted || (initialPrice > 0 ? formatPrice(initialPrice) : '')
          finalFormatted = priceOverview.final_formatted || (finalPrice > 0 ? formatPrice(finalPrice) : (isFree ? 'Free' : ''))
        }
      }
    }
  } catch (err) {
    console.error('[steamService] Error fetching Steam price:', err)
  }

  if (isFree) {
    const freeResult: RealPriceInfo = {
      isFree: true,
      currency,
      initialPrice: 0,
      finalPrice: 0,
      discountPercent: 0,
      initialFormatted: '',
      finalFormatted: 'Free',
      hasDiscount: false,
      allTimeLowPrice: 0,
      allTimeLowFormatted: 'Free',
      allTimeLowDiscountPercent: 0
    }
    realPriceCache.set(cacheKey, freeResult)
    return freeResult
  }

  // 2. CheapShark All-Time Low lookup
  let atlPrice = finalPrice
  let atlDiscount = discountPercent

  try {
    const csRes = await fetch(`https://www.cheapshark.com/api/1.0/games?steamAppID=${appId}`, {
      headers: { 'User-Agent': 'EclipseLauncher/1.0 (https://eclipselauncher.com)' }
    }).then(r => r.json())

    if (Array.isArray(csRes) && csRes[0]?.gameID) {
      const details = await fetch(`https://www.cheapshark.com/api/1.0/games?id=${csRes[0].gameID}`, {
        headers: { 'User-Agent': 'EclipseLauncher/1.0 (https://eclipselauncher.com)' }
      }).then(r => r.json())

      if (details?.cheapestPriceEver?.price) {
        const rawUsdAtl = parseFloat(details.cheapestPriceEver.price)
        if (!isNaN(rawUsdAtl) && rawUsdAtl > 0) {
          if (currency === 'USD') {
            atlPrice = rawUsdAtl
            if (initialPrice > 0) {
              atlDiscount = Math.max(discountPercent, Math.round((1 - atlPrice / initialPrice) * 100))
            }
          } else {
            // EUR: Match exact SteamDB lowest Euro price
            let usdBase = initialPrice
            if (details?.deals?.[0]?.retailPrice) {
              const parsedRetail = parseFloat(details.deals[0].retailPrice)
              if (!isNaN(parsedRetail) && parsedRetail > 0) {
                usdBase = parsedRetail
              }
            }

            const histDiscount = usdBase > 0 ? Math.max(discountPercent, Math.round((1 - rawUsdAtl / usdBase) * 100)) : discountPercent
            atlDiscount = histDiscount

            if (initialPrice > 0 && histDiscount > 0) {
              // Apply Steam's exact regional sale formula for Euro tier
              const initialCents = Math.round(initialPrice * 100)
              const rawEurCents = Math.floor(initialCents * (1 - histDiscount / 100))
              atlPrice = rawEurCents / 100
            } else {
              atlPrice = finalPrice
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[steamService] Error fetching CheapShark all-time low:', err)
  }

  const result: RealPriceInfo = {
    isFree: false,
    currency,
    initialPrice,
    finalPrice,
    discountPercent,
    initialFormatted: initialFormatted || (initialPrice > 0 ? formatPrice(initialPrice) : ''),
    finalFormatted: finalFormatted || (finalPrice > 0 ? formatPrice(finalPrice) : formatPrice(initialPrice)),
    hasDiscount: discountPercent > 0,
    allTimeLowPrice: atlPrice,
    allTimeLowFormatted: formatPrice(atlPrice),
    allTimeLowDiscountPercent: atlDiscount
  }

  realPriceCache.set(cacheKey, result)
  return result
}

/**
 * Fetch full details for one Steam app.
 * Returns null if not found or not a game.
 */
export async function getSteamAppDetails(
  appId: number,
  lang = 'english',
  cc = 'DE'
): Promise<SteamAppDetails | null> {
  if (appId === ROBLOX_APP_ID) {
    return ROBLOX_APP_DETAILS
  }

  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=${lang}&cc=${cc}`
  const res = await fetch(url)
  if (!res.ok) return null

  const data = await res.json()
  const entry = data[String(appId)]

  if (!entry?.success) return null
  return entry.data as SteamAppDetails
}

/**
 * Fetch details for multiple Steam apps in parallel using SteamSpy (avoids Steam's strict 200 req/5m ban).
 * SteamSpy limit: 4 requests per second.
 * Note: Only returns basic info (name, appid). Does NOT return full metadata like genres or price.
 */
export async function getSteamAppsDetails(
  appIds: number[],
  lang = 'english',
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<Map<number, SteamAppDetails>> {
  const unique = [...new Set(appIds)]
  const result = new Map<number, SteamAppDetails>()

  // Fetch in batches of 3 with 1 second delay to stay under 4 req/sec
  const BATCH_SIZE = 3
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    const promises = batch.map(id => 
      fetch(`https://steamspy.com/api.php?request=appdetails&appid=${id}`).then(res => res.json())
    )
    
    const results = await Promise.allSettled(promises)
    
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value && r.value.name) {
        // Mock SteamAppDetails structure with what we need (the name and appid)
        result.set(batch[idx], { 
          steam_appid: batch[idx],
          name: r.value.name 
        } as SteamAppDetails)
      }
    })
    
    if (onProgress) {
      onProgress(Math.min(i + BATCH_SIZE, unique.length), unique.length)
    }
    
    if (signal?.aborted) break;
    
    // 1000ms delay between batches of 3 (guarantees <= 3 req/sec)
    if (i + BATCH_SIZE < unique.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return result
}

/**
 * Fetch FULL details for multiple Steam apps using the OFFICIAL Steam API.
 * WARNING: Subject to strict 200 req/5m rate limit. Use ONLY for small batches (< 50).
 */
export async function getSteamAppsDetailsFromStore(
  appIds: number[],
  lang = 'english'
): Promise<Map<number, SteamAppDetails>> {
  const unique = [...new Set(appIds)]
  const result = new Map<number, SteamAppDetails>()

  // Fetch in small batches of 5 with 500ms delay to be gentle on the API
  const BATCH_SIZE = 5
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE)
    const promises = batch.map(id => getSteamAppDetails(id, lang))
    
    const results = await Promise.allSettled(promises)
    
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled' && r.value) {
        result.set(batch[idx], r.value)
      }
    })
    
    if (i + BATCH_SIZE < unique.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return result
}

let cachedSteamSpyNames: Map<number, string> | null = null

/**
 * Fetches the top 5000 games from SteamSpy to quickly resolve common app names
 * without hitting the Steam API rate limit.
 */
export async function getSteamSpyNames(): Promise<Map<number, string>> {
  if (cachedSteamSpyNames) return cachedSteamSpyNames
  
  const map = new Map<number, string>()
  try {
    // Fetch top 5 pages (5000 games) in parallel. This covers 99% of user libraries.
    const pages = [0, 1, 2, 3, 4]
    const promises = pages.map(page => 
      fetch(`https://steamspy.com/api.php?request=all&page=${page}`).then(r => r.json())
    )
    
    const results = await Promise.allSettled(promises)
    
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        const data = res.value
        for (const key in data) {
          if (data[key] && data[key].appid && data[key].name) {
            map.set(Number(data[key].appid), data[key].name)
          }
        }
      }
    }
    cachedSteamSpyNames = map
  } catch (err) {
    console.warn('[steamService] Failed to fetch SteamSpy names', err)
  }
  return map
}

/**
 * Hardcoded Steam AppIDs for popular games that are delisted or have tricky names.
 */
const HARDCODED_STEAM_IDS: Record<string, number> = {
  'rocket league': 252950,
  'rocket league®': 252950,
  'fivem': 271590,
  'fivem application data': 271590,
  'spacewar': 480,
  'bombanana! demo': 3244190,
  'bombanana': 3244190,
  'fall guys': 1097150,
  'overwatch 2': 2356550,
  'the sims 4': 1222670,
  'death stranding 2: on the beach': 3280350,
  'death stranding 2': 3280350,
  'gta 5': 271590,
  'grand theft auto v': 271590,
  'gta v': 271590,
  'roblox': ROBLOX_APP_ID,
  'roblox player': ROBLOX_APP_ID,
  'robloxplayerbeta': ROBLOX_APP_ID,
  'robloxplayerlauncher': ROBLOX_APP_ID,
  'minecraft': 0,
  'fortnite': 0,
  'valorant': 0,
  'league of legends': 0,
}

/**
 * Find a Steam AppID for a game by name (for Epic/custom games without a SteamID).
 * Returns the best matching AppID, or null if nothing found.
 */
export async function findSteamIdByName(name: string): Promise<number | null> {
  try {
    const normalized = name.toLowerCase().trim()
    if (HARDCODED_STEAM_IDS[normalized] !== undefined) {
      const id = HARDCODED_STEAM_IDS[normalized]
      return id === 0 ? null : id
    }

    // Strip trademarks and special chars for better search results
    const query = name.replace(/[^a-zA-Z0-9\s:-]/g, '').trim()
    if (!query) return null

    const results = await searchSteamGames(query)
    if (results.length === 0) return null

    // Find best match: exact or starts-with
    const exact = results.find(r => r.name.toLowerCase() === normalized)
    if (exact) return exact.id

    const queryLower = query.toLowerCase()
    const startsWith = results.find(r =>
      r.name.toLowerCase().startsWith(queryLower.slice(0, 6))
    )
    return startsWith?.id ?? results[0].id
  } catch {
    return null
  }
}

/**
 * Fetch the Steam Featured & Categories page — free, no key needed.
 * Returns "top_sellers", "new_releases", "specials" etc.
 */
export async function getSteamFeaturedCategories(): Promise<{
  top_sellers: FeaturedGame[]
  new_releases: FeaturedGame[]
  specials: FeaturedGame[]
} | null> {
  try {
    const res = await fetch('https://store.steampowered.com/api/featuredcategories/?l=english&cc=US')
    if (!res.ok) return null
    const data = await res.json()
    return {
      top_sellers:  data.top_sellers?.items  ?? [],
      new_releases: data.new_releases?.items ?? [],
      specials:     data.specials?.items      ?? [],
    }
  } catch {
    return null
  }
}

/**
 * Fetches an expanded, rich list of live Steam Special Offers & Deals (combines Steam Store Featured Specials + CheapShark Steam Deals).
 */
export async function fetchTopSteamSpecialOffers(): Promise<SteamGame[]> {
  const games: SteamGame[] = []
  const seenIds = new Set<number>()

  try {
    // 1. Official Steam Store featured specials
    const featured = await getSteamFeaturedCategories()
    if (featured?.specials?.length) {
      for (const item of featured.specials) {
        if (!item.id || seenIds.has(item.id)) continue
        seenIds.add(item.id)
        const sym = item.currency === 'EUR' ? '€' : '$'
        games.push({
          steamId: item.id,
          name: item.name,
          headerImage: item.header_image || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${item.id}/header.jpg`,
          discountPercent: item.discount_percent,
          initialPriceFormatted: item.original_price ? `${(item.original_price / 100).toFixed(2).replace('.', ',')} ${sym}` : undefined,
          priceFormatted: item.final_price ? `${(item.final_price / 100).toFixed(2).replace('.', ',')} ${sym}` : undefined,
          isFree: item.final_price === 0,
        })
      }
    }

    // 2. CheapShark top-rated Steam Store deals
    const csRes = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Deal%20Rating&pageSize=40', {
      headers: { 'User-Agent': 'EclipseLauncher/1.0' }
    })
    if (csRes.ok) {
      const deals = await csRes.json()
      if (Array.isArray(deals)) {
        for (const deal of deals) {
          const appId = Number(deal.steamAppID)
          if (!appId || isNaN(appId) || seenIds.has(appId)) continue
          seenIds.add(appId)
          const discount = Math.round(parseFloat(deal.savings) || 0)
          const salePrice = parseFloat(deal.salePrice) || 0
          const normalPrice = parseFloat(deal.normalPrice) || 0
          const metacritic = parseInt(deal.metacriticScore, 10) || undefined

          games.push({
            steamId: appId,
            name: deal.title,
            headerImage: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
            discountPercent: discount > 0 ? discount : undefined,
            initialPriceFormatted: normalPrice > 0 ? `${normalPrice.toFixed(2).replace('.', ',')} €` : undefined,
            priceFormatted: salePrice > 0 ? `${salePrice.toFixed(2).replace('.', ',')} €` : undefined,
            isFree: salePrice === 0,
            metacritic: metacritic && metacritic > 0 ? metacritic : undefined,
          })
        }
      }
    }
  } catch (err) {
    console.warn('[steamService] Error fetching top special offers:', err)
  }

  // 3. Batch-enrich top 25 deals with official store details if available
  if (games.length > 0) {
    try {
      const topIds = games.slice(0, 25).map(g => g.steamId)
      const detailsMap = await getSteamAppsDetailsFromStore(topIds)
      for (let i = 0; i < games.length; i++) {
        const d = detailsMap.get(games[i].steamId)
        if (d) {
          const enriched = detailsToGame(d)
          games[i] = {
            ...enriched,
            discountPercent: enriched.discountPercent || games[i].discountPercent,
            priceFormatted: enriched.priceFormatted || games[i].priceFormatted,
            initialPriceFormatted: enriched.initialPriceFormatted || games[i].initialPriceFormatted,
          }
        }
      }
    } catch (_) {}
  }

  return games.filter(g => 
    g.name && 
    !g.name.toLowerCase().includes('steam machine') && 
    !g.name.toLowerCase().includes('steam controller') &&
    (g.discountPercent ?? 0) > 0
  )
}

export async function getLivePlayerCount(appId: number): Promise<number | null> {
  if (appId === ROBLOX_APP_ID) {
    return 2841920
  }
  try {
    const res = await fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.response?.result === 1 && typeof data.response.player_count === 'number') {
      return data.response.player_count;
    }
    return null;
  } catch {
    return null;
  }
}

export async function getTopLiveCCU(): Promise<Record<number, number>> {
  try {
    const res = await fetch('https://api.steampowered.com/ISteamChartsService/GetGamesByConcurrentPlayers/v1/');
    if (!res.ok) return { [ROBLOX_APP_ID]: 2841920 };
    const data = await res.json();
    const map: Record<number, number> = { [ROBLOX_APP_ID]: 2841920 };
    if (data?.response?.ranks) {
      data.response.ranks.forEach((r: any) => {
        if (r.appid && r.concurrent_in_game) {
          map[r.appid] = r.concurrent_in_game;
        }
      });
    }
    return map;
  } catch {
    return { [ROBLOX_APP_ID]: 2841920 };
  }
}

export interface SteamReviewSummary {
  reviewScoreDesc: string
  totalPositive: number
  totalNegative: number
  totalReviews: number
  positivePercent: number
}

export interface SteamDBSummary {
  ccu: number
  positive: number
  negative: number
  owners: string
  averageForeverMinutes: number
  tags: Record<string, number>
}

export const REVIEW_SCORE_TRANSLATIONS: Record<string, { en: string; de: string }> = {
  'overwhelmingly positive': { en: 'Overwhelmingly Positive', de: 'Äußerst positiv' },
  'very positive': { en: 'Very Positive', de: 'Sehr positiv' },
  'positive': { en: 'Positive', de: 'Positiv' },
  'mostly positive': { en: 'Mostly Positive', de: 'Größtenteils positiv' },
  'mixed': { en: 'Mixed', de: 'Ausgeglichen' },
  'mostly negative': { en: 'Mostly Negative', de: 'Größtenteils negativ' },
  'negative': { en: 'Negative', de: 'Negativ' },
  'very negative': { en: 'Very Negative', de: 'Sehr negativ' },
  'overwhelmingly negative': { en: 'Overwhelmingly Negative', de: 'Äußerst negativ' },
  'äußerst positiv': { en: 'Overwhelmingly Positive', de: 'Äußerst positiv' },
  'sehr positiv': { en: 'Very Positive', de: 'Sehr positiv' },
  'größtenteils positiv': { en: 'Mostly Positive', de: 'Größtenteils positiv' },
  'ausgeglichen': { en: 'Mixed', de: 'Ausgeglichen' },
  'größtenteils negativ': { en: 'Mostly Negative', de: 'Größtenteils negativ' },
  'sehr negativ': { en: 'Very Negative', de: 'Sehr negativ' },
  'äußerst negativ': { en: 'Overwhelmingly Negative', de: 'Äußerst negativ' },
}

export function formatReviewScoreDesc(rawDesc: string | undefined, positivePercent: number, lang: 'en' | 'de' = 'en'): string {
  const norm = rawDesc?.toLowerCase().trim() || ''
  if (norm && REVIEW_SCORE_TRANSLATIONS[norm]) {
    return REVIEW_SCORE_TRANSLATIONS[norm][lang]
  }
  if (positivePercent >= 95) return lang === 'de' ? 'Äußerst positiv' : 'Overwhelmingly Positive'
  if (positivePercent >= 80) return lang === 'de' ? 'Sehr positiv' : 'Very Positive'
  if (positivePercent >= 70) return lang === 'de' ? 'Größtenteils positiv' : 'Mostly Positive'
  if (positivePercent >= 40) return lang === 'de' ? 'Ausgeglichen' : 'Mixed'
  if (positivePercent >= 20) return lang === 'de' ? 'Größtenteils negativ' : 'Mostly Negative'
  return lang === 'de' ? 'Sehr negativ' : 'Very Negative'
}

export async function getSteamReviewSummary(appId: number, lang = 'english'): Promise<SteamReviewSummary | null> {
  if (appId === ROBLOX_APP_ID) {
    const isDe = lang === 'de' || lang === 'german'
    return {
      reviewScoreDesc: isDe ? 'Sehr positiv' : 'Very Positive',
      totalPositive: 4500000,
      totalNegative: 250000,
      totalReviews: 4750000,
      positivePercent: 94,
    }
  }
  try {
    const steamLang = lang === 'de' || lang === 'german' ? 'german' : 'english'
    const res = await fetch(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0&l=${steamLang}`)
    if (!res.ok) return null
    const data = await res.json()
    const summary = data?.query_summary
    if (summary && typeof summary.total_reviews === 'number') {
      const pos = summary.total_positive || 0
      const total = summary.total_reviews || (pos + (summary.total_negative || 0))
      const pct = total > 0 ? Math.round((pos / total) * 100) : 0
      const isDe = steamLang === 'german'
      return {
        reviewScoreDesc: formatReviewScoreDesc(summary.review_score_desc, pct, isDe ? 'de' : 'en'),
        totalPositive: pos,
        totalNegative: summary.total_negative || 0,
        totalReviews: total,
        positivePercent: pct,
      }
    }
    return null
  } catch {
    return null
  }
}

export async function getSteamDBSummary(appId: number): Promise<SteamDBSummary | null> {
  if (appId === ROBLOX_APP_ID) {
    return {
      ccu: 2841920,
      positive: 4500000,
      negative: 250000,
      owners: '100,000,000 .. 200,000,000',
      averageForeverMinutes: 14200,
      tags: { 'Sandbox': 9500, 'Multiplayer': 9200, 'Free to Play': 8800, 'Adventure': 8400, 'Building': 7900 },
    }
  }
  try {
    const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`)
    if (!res.ok) return null
    const data = await res.json()
    if (data && data.appid) {
      return {
        ccu: typeof data.ccu === 'number' ? data.ccu : 0,
        positive: typeof data.positive === 'number' ? data.positive : 0,
        negative: typeof data.negative === 'number' ? data.negative : 0,
        owners: data.owners || 'Unknown',
        averageForeverMinutes: typeof data.average_forever === 'number' ? data.average_forever : 0,
        tags: typeof data.tags === 'object' && data.tags ? data.tags : {},
      }
    }
    return null
  } catch {
    return null
  }
}

// ─── Unified Game Type (Steam-based) ────────────────────────────────────────

export interface SteamGame {
  steamId: number
  name: string
  shortDescription?: string
  aboutTheGame?: string
  pcRequirements?: { minimum?: string, recommended?: string }
  genres?: string[]
  releaseDate?: string
  developers?: string[]
  publishers?: string[]
  metacritic?: number
  rating?: number
  isFree?: boolean
  priceFormatted?: string
  initialPriceFormatted?: string
  discountPercent?: number
  screenshots?: string[]
  movies?: Array<{ id: number; name: string; thumbnail: string; webm?: { 480?: string; max?: string }; mp4?: { 480?: string; max?: string }; hls_h264?: string }>
  headerImage?: string
  achievements?: {
    total: number
    list: Array<{ name: string; path: string }>
  }
  // populated from app details if loaded
  details?: SteamAppDetails
}

/**
 * Convert a SteamSearchItem to a SteamGame (lightweight, no detail fetch)
 */
export function searchItemToGame(item: SteamSearchItem): SteamGame {
  return {
    steamId: item.id,
    name: item.name,
    priceFormatted: item.price?.final_formatted,
    discountPercent: item.price?.discount_percent,
    isFree: item.price?.final === 0,
  }
}

/**
 * Convert SteamAppDetails to SteamGame (full detail)
 */
export function detailsToGame(details: SteamAppDetails): SteamGame {
  return {
    steamId: (details.steam_appid || details.appid) as number,
    name: details.name,
    shortDescription: details.short_description,
    aboutTheGame: details.about_the_game || details.detailed_description,
    pcRequirements: details.pc_requirements,
    genres: details.genres?.map(g => g.description),
    releaseDate: details.release_date?.date,
    developers: details.developers,
    publishers: details.publishers,
    metacritic: details.metacritic?.score,
    isFree: details.is_free,
    priceFormatted: details.price_overview?.final_formatted,
    initialPriceFormatted: details.price_overview?.initial_formatted,
    discountPercent: details.price_overview?.discount_percent,
    screenshots: details.screenshots?.map(s => s.path_full),
    movies: details.movies,
    headerImage: details.header_image,
    achievements: details.achievements ? {
      total: details.achievements.total,
      list: details.achievements.highlighted || []
    } : undefined,
    details,
  }
}

export interface SteamUserProfile {
  steamId64: string;
  username: string;
  avatarFull: string;
  onlineState?: string;
  stateMessage?: string;
  steamLevel?: number;
  steamGamesCount?: number;
  steamBadgesCount?: number;
  steamRecentGames?: any[];
  steamFavoriteBadge?: any;
  steamBadges?: Array<{ name: string; iconUrl: string; xp?: string; level?: string }>;
  steamGames?: Array<{ appId: string; name: string; iconUrl?: string; playtime?: string }>;
  steamBackgroundUrl?: string;
  steamBackgroundMovie?: string;
}

export function constructSteamProfileUrl(input: string): string {
  let val = input.trim();
  if (val.includes('steamcommunity.com')) {
    if (!val.startsWith('http')) val = `https://${val}`;
    return val.endsWith('/') ? val : `${val}/`;
  }
  if (/^\d{17}$/.test(val)) {
    return `https://steamcommunity.com/profiles/${val}/`;
  }
  return `https://steamcommunity.com/id/${val}/`;
}

/**
 * Fetch public Steam profile data (Avatar, Username, Badges, Games, and Stats) bypassing CORS via main process.
 */
export async function fetchSteamUserProfile(profileUrl: string): Promise<SteamUserProfile | null> {
  try {
    const baseUrl = constructSteamProfileUrl(profileUrl);
    const xmlUrl = `${baseUrl}?xml=1`;
    const badgesUrl = `${baseUrl}badges/?l=english`;
    const gamesXmlUrl = `${baseUrl}games/?tab=all&xml=1`;
    
    let xmlText: string | null = null;
    let htmlText: string | null = null;
    let badgesHtmlText: string | null = null;
    let gamesXmlText: string | null = null;

    // Use electronAPI to bypass CORS if available
    if (typeof window !== 'undefined' && window.electronAPI?.utilFetch) {
      const [resXml, resHtml, resBadges, resGames] = await Promise.allSettled([
        window.electronAPI.utilFetch(xmlUrl),
        window.electronAPI.utilFetch(baseUrl),
        window.electronAPI.utilFetch(badgesUrl),
        window.electronAPI.utilFetch(gamesXmlUrl)
      ]);
      if (resXml.status === 'fulfilled') xmlText = resXml.value;
      if (resHtml.status === 'fulfilled') htmlText = resHtml.value;
      if (resBadges.status === 'fulfilled') badgesHtmlText = resBadges.value;
      if (resGames.status === 'fulfilled') gamesXmlText = resGames.value;
    } else {
      const [resXml, resHtml, resBadges, resGames] = await Promise.allSettled([
        fetch(xmlUrl).then(r => r.text()),
        fetch(baseUrl).then(r => r.text()),
        fetch(badgesUrl).then(r => r.text()),
        fetch(gamesXmlUrl).then(r => r.text())
      ]);
      if (resXml.status === 'fulfilled') xmlText = resXml.value;
      if (resHtml.status === 'fulfilled') htmlText = resHtml.value;
      if (resBadges.status === 'fulfilled') badgesHtmlText = resBadges.value;
      if (resGames.status === 'fulfilled') gamesXmlText = resGames.value;
    }
    
    if (!xmlText && !htmlText) return null;
    
    const parser = new DOMParser();
    let steamId64 = '';
    let username = '';
    let avatarFull = '';
    let onlineState = 'offline';
    let stateMessage = '';

    if (xmlText) {
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const error = doc.querySelector('error');
      if (!error) {
        steamId64 = doc.querySelector('steamID64')?.textContent || '';
        username = doc.querySelector('steamID')?.textContent || '';
        avatarFull = doc.querySelector('avatarFull')?.textContent || '';
        onlineState = doc.querySelector('onlineState')?.textContent || 'offline';
        stateMessage = doc.querySelector('stateMessage')?.textContent || '';
      }
    }

    if (htmlText && (!steamId64 || !username || !avatarFull)) {
      const htmlDoc = parser.parseFromString(htmlText, 'text/html');
      if (!username) {
        username = htmlDoc.querySelector('.actual_persona_name')?.textContent?.trim() ||
                   htmlDoc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
      }
      if (!avatarFull) {
        avatarFull = htmlDoc.querySelector('.playerAvatarAutoSizeInner img')?.getAttribute('src') ||
                     htmlDoc.querySelector('.playerAvatar img')?.getAttribute('src') ||
                     htmlDoc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
      }
      if (!steamId64) {
        const scriptMatch = htmlText.match(/"steamid":"(\d{17})"/);
        if (scriptMatch) steamId64 = scriptMatch[1];
        else {
          const miniMatch = htmlText.match(/data-miniprofile="(\d+)"/);
          if (miniMatch) steamId64 = miniMatch[1];
        }
      }
      if (htmlDoc.querySelector('.profile_in_game_header')) {
        onlineState = 'in-game';
      } else if (htmlDoc.querySelector('.online')) {
        onlineState = 'online';
      }
    }
    
    // Guard: Reject Steam error pages (e.g. "Steam Community :: Error")
    const isErrorPage = !username ||
      username.toLowerCase().includes('error') ||
      username.toLowerCase().includes('steam community') ||
      (htmlText ? htmlText.includes('class="error_ctn"') || htmlText.includes('The specified profile could not be found.') : false);

    if (isErrorPage || (!steamId64 && !username)) return null;

    let steamLevel: number | undefined = undefined;
    let steamGamesCount: number | undefined = undefined;
    let steamBadgesCount: number | undefined = undefined;
    let steamRecentGames: any[] = [];
    let steamFavoriteBadge: any = undefined;
    const steamBadges: Array<{ name: string; iconUrl: string; xp?: string; level?: string }> = [];
    const steamGames: Array<{ appId: string; name: string; iconUrl?: string; playtime?: string }> = [];

    if (htmlText) {
      const htmlDoc = parser.parseFromString(htmlText, 'text/html');
      
      const levelEl = htmlDoc.querySelector('.friendPlayerLevelNum');
      if (levelEl && levelEl.textContent) {
        steamLevel = parseInt(levelEl.textContent.replace(/,/g, ''), 10);
      }
      
      const countLinks = htmlDoc.querySelectorAll('.profile_item_links a');
      countLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const countEl = link.querySelector('.profile_count_link_total');
        if (countEl && countEl.textContent) {
          const num = parseInt(countEl.textContent.trim().replace(/,/g, ''), 10);
          if (href.includes('/games/')) steamGamesCount = num;
          if (href.includes('/badges/')) steamBadgesCount = num;
        }
      });

      const recentGameDivs = htmlDoc.querySelectorAll('.recent_games .recent_game');
      recentGameDivs.forEach(div => {
        const nameEl = div.querySelector('.game_name a');
        const playtimeEl = div.querySelector('.game_info_details');
        const iconEl = div.querySelector('.game_info_cap img');
        
        if (nameEl && playtimeEl && iconEl) {
          const name = nameEl.textContent?.trim() || '';
          const appIdUrl = nameEl.getAttribute('href') || '';
          const appId = appIdUrl.split('/').filter(Boolean).pop() || '';
          // Extract just the hours, usually "64 hrs on record" before the <br>
          const playtimeRaw = playtimeEl.innerHTML.split('<br>')[0].trim();
          const playtime = playtimeRaw.replace(/<[^>]+>/g, '').trim(); 
          const iconUrl = iconEl.getAttribute('src') || '';
          
          if (name && iconUrl) {
            steamRecentGames.push({ name, playtime, iconUrl, appId });
          }
        }
      });

      const favBadgeEl = htmlDoc.querySelector('.favorite_badge');
      if (favBadgeEl) {
        const nameEl = favBadgeEl.querySelector('.favorite_badge_description .name');
        const xpEl = favBadgeEl.querySelector('.favorite_badge_description .xp');
        const iconEl = favBadgeEl.querySelector('.favorite_badge_icon img');
        if (nameEl && xpEl && iconEl) {
          steamFavoriteBadge = {
            name: nameEl.textContent?.trim() || '',
            xp: xpEl.textContent?.trim() || '',
            iconUrl: iconEl.getAttribute('src') || '',
            url: favBadgeEl.getAttribute('href') || ''
          };
          steamBadges.push({
            name: nameEl.textContent?.trim() || '',
            iconUrl: iconEl.getAttribute('src') || '',
            xp: xpEl.textContent?.trim() || ''
          });
        }
      }
    }

    // Parse Live Animated Background or Static Background
    let steamBackgroundMovie: string | undefined = undefined;
    let steamBackgroundUrl: string | undefined = undefined;

    if (htmlText) {
      const htmlDoc = parser.parseFromString(htmlText, 'text/html');

      // 1. Live Animated Background (video)
      const videoEl = htmlDoc.querySelector('.profile_animated_background video, video.profile_animated_background, .profile_background_holder_content video, video');
      if (videoEl) {
        const mp4 = videoEl.querySelector('source[type="video/mp4"]')?.getAttribute('src');
        const webm = videoEl.querySelector('source[type="video/webm"]')?.getAttribute('src');
        const direct = videoEl.getAttribute('src');
        steamBackgroundMovie = mp4 || webm || direct || undefined;
      }
      
      // Fallback regex for animated movie (Fastly, Cloudflare, Akamai)
      if (!steamBackgroundMovie) {
        const videoMatch = htmlText.match(/https:\/\/[^"'\s<>]+\/(?:items|community_assets|public\/images\/items)\/\d+\/[a-zA-Z0-9_\-\.]+\.(?:mp4|webm)/i) ||
                           htmlText.match(/https:\/\/[^"'\s<>]*(?:fastly|steamstatic|steamcommunity)[^"'\s<>]*\.(?:mp4|webm)/i);
        if (videoMatch) {
          steamBackgroundMovie = videoMatch[0];
        }
      }

      // 2. Static Background image
      const bgHolders = htmlDoc.querySelectorAll('.has_profile_background, .profile_background_image_content, .profile_background_holder_content, .no_header, .profile_header_bg, .profile_animated_background');
      bgHolders.forEach(el => {
        const style = el.getAttribute('style') || '';
        const urlMatch = style.match(/url\(\s*['"]?(https:\/\/[^'")]+)['"]?\s*\)/i);
        if (urlMatch && !steamBackgroundUrl) {
          steamBackgroundUrl = urlMatch[1];
        }
      });

      // Fallback regex for steam item background image
      if (!steamBackgroundUrl) {
        const bgUrlMatches = htmlText.match(/background-image:\s*url\(\s*['"]?(https:\/\/[^'")]+items\/\d+\/[^'")]+)['"]?\s*\)/i) ||
                             htmlText.match(/https:\/\/[^"'\s<>]+\/(?:items|community_assets|public\/images\/items)\/\d+\/[a-zA-Z0-9_\-\.]+\.(?:jpg|png|jpeg)/i);
        if (bgUrlMatches) {
          steamBackgroundUrl = bgUrlMatches[1] || bgUrlMatches[0];
        }
      }
    }

    // Parse Badges from badges HTML page
    if (badgesHtmlText) {
      const badgesDoc = parser.parseFromString(badgesHtmlText, 'text/html');
      const badgeRows = badgesDoc.querySelectorAll('.badge_row');
      badgeRows.forEach(row => {
        const img = row.querySelector('.badge_icon img') || row.querySelector('img.badge_icon') || row.querySelector('.badge_row_inner img');
        const titleEl = row.querySelector('.badge_title') || row.querySelector('.badge_info_title');
        const xpEl = row.querySelector('.badge_info_description .badge_xp') || row.querySelector('.badge_xp') || row.querySelector('.badge_info_stats');
        const iconUrl = img?.getAttribute('src') || '';
        
        if (iconUrl && !steamBadges.some(b => b.iconUrl === iconUrl)) {
          const rawTitle = titleEl?.textContent?.replace(/\s+/g, ' ').trim() || 'Steam Badge';
          const xp = xpEl?.textContent?.replace(/\s+/g, ' ').trim() || '';
          steamBadges.push({
            name: rawTitle,
            iconUrl,
            xp: xp || undefined
          });
        }
      });
    }

    // Parse Games from games XML
    if (gamesXmlText) {
      const gDoc = parser.parseFromString(gamesXmlText, 'text/xml');
      const gameNodes = gDoc.querySelectorAll('games > game');
      gameNodes.forEach(gNode => {
        const appId = gNode.querySelector('appID')?.textContent || '';
        const name = gNode.querySelector('name')?.textContent || '';
        const logo = gNode.querySelector('logo')?.textContent || '';
        const hours = gNode.querySelector('hoursOnRecord')?.textContent || '';
        if (name && appId && !steamGames.some(g => g.appId === appId)) {
          steamGames.push({
            appId,
            name,
            iconUrl: logo || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
            playtime: hours ? `${hours} hrs` : undefined
          });
        }
      });
    }

    // Fallback: If gamesXml is empty, copy from recent games
    if (steamGames.length === 0 && steamRecentGames.length > 0) {
      steamRecentGames.forEach(rg => {
        steamGames.push({
          appId: rg.appId,
          name: rg.name,
          iconUrl: rg.iconUrl,
          playtime: rg.playtime
        });
      });
    }
    
    return { 
      steamId64, 
      username, 
      avatarFull, 
      onlineState, 
      stateMessage, 
      steamLevel, 
      steamGamesCount: steamGamesCount || steamGames.length, 
      steamBadgesCount: steamBadgesCount || steamBadges.length, 
      steamRecentGames, 
      steamFavoriteBadge,
      steamBadges,
      steamGames,
      steamBackgroundUrl,
      steamBackgroundMovie
    };
  } catch (err) {
    console.error('[steamService] Error fetching steam profile:', err);
    return null;
  }
}
