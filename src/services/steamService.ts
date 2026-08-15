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
    webm?: { 480: string; max: string }
    mp4?: { 480: string; max: string }
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

// ─── Curated popular game IDs for the home carousel ──────────────────────────
// These are evergreen top-sellers/popular titles that always have great assets.
export const POPULAR_STEAM_IDS = [
  730,    // CS2
  570,    // Dota 2
  1086940,// Baldur's Gate 3
  1245620,// Elden Ring
  1091500,// Cyberpunk 2077
  1172470,// Apex Legends
  578080, // PUBG
  252490, // Rust
  374320, // Dark Souls 3
  1145360,// Hades
  1172620,// Sea of Thieves
  892970, // Valheim
  1938090,// Call of Duty HQ
  526870, // Satisfactory
  881100, // Noita
  990080, // Hogwarts Legacy
  1817190,// Marvel's Spider-Man Remastered
  2138710,// God of War
  1332010,// Stray
  990080, // Hogwarts Legacy (dedupe handled client-side)
  2379780,// Starfield
  105600, // Terraria
  1174180,// Red Dead Redemption 2
  271590, // GTA V
  489830, // Skyrim SE
  292030, // Witcher 3
  1091500,// Cyberpunk 2077
  814380, // Sekiro
  739630, // Disco Elysium
  1517290,// Returnal
]

export const NEW_RELEASE_IDS = [
  2379780,// Starfield
  2420510,// Sons of the Forest
  1716740,// Lies of P
  1426210,// It Takes Two
  1888160,// Palworld
  2379780,// Monster Hunter Wilds
  1840454,// Dave the Diver
  1850570,// Alan Wake 2
  2413570,// Dredge
  1922900,// Like a Dragon: Ishin
  2050650,// Resident Evil 4 Remake
  1877840,// Sonic Superstars
  1714350,// Warhammer 40K Darktide
  1971650,// Ori and the Will of the Wisps
  2183900,// Jagged Alliance 3
]

export const TRENDING_IDS = [
  1888160,// Palworld
  1245620,// Elden Ring
  1091500,// Cyberpunk 2077
  1145360,// Hades
  892970, // Valheim
  526870, // Satisfactory
  1086940,// Baldur's Gate 3
  2138710,// God of War
  1332010,// Stray
  1388770,// Persona 5 Royal
  2215430,// Hi-Fi Rush
  1817190,// Marvel's Spider-Man Remastered
  1716740,// Lies of P
  1850570,// Alan Wake 2
  1888160,// Palworld
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

  const params = new URLSearchParams({
    term: query,
    l: options.lang ?? 'english',
    cc: options.cc ?? 'US',
    json: '1',
  })

  const url = `https://store.steampowered.com/api/storesearch/?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Steam search failed: ${res.status}`)

  const data: SteamSearchResponse = await res.json()
  return data.items ?? []
}

/**
 * Fetch full details for one Steam app.
 * Returns null if not found or not a game.
 */
export async function getSteamAppDetails(
  appId: number,
  lang = 'english'
): Promise<SteamAppDetails | null> {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=${lang}&cc=US`
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
  'roblox': 0,
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

export async function getLivePlayerCount(appId: number): Promise<number | null> {
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
    if (!res.ok) return {};
    const data = await res.json();
    const map: Record<number, number> = {};
    if (data?.response?.ranks) {
      data.response.ranks.forEach((r: any) => {
        if (r.appid && r.concurrent_in_game) {
          map[r.appid] = r.concurrent_in_game;
        }
      });
    }
    return map;
  } catch {
    return {};
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

export async function getSteamReviewSummary(appId: number): Promise<SteamReviewSummary | null> {
  try {
    const res = await fetch(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0`)
    if (!res.ok) return null
    const data = await res.json()
    const summary = data?.query_summary
    if (summary && typeof summary.total_reviews === 'number') {
      const pos = summary.total_positive || 0
      const total = summary.total_reviews || (pos + (summary.total_negative || 0))
      const pct = total > 0 ? Math.round((pos / total) * 100) : 0
      return {
        reviewScoreDesc: summary.review_score_desc || (pct >= 80 ? 'Very Positive' : pct >= 70 ? 'Mostly Positive' : 'Mixed'),
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
  discountPercent?: number
  screenshots?: string[]
  movies?: Array<{ id: number; name: string; thumbnail: string; webm?: { 480: string; max: string }; mp4?: { 480: string; max: string } }>
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
 * Fetch public Steam profile data (Avatar, Username, and Stats) bypassing CORS via main process.
 */
export async function fetchSteamUserProfile(profileUrl: string): Promise<SteamUserProfile | null> {
  try {
    const baseUrl = constructSteamProfileUrl(profileUrl);
    const xmlUrl = `${baseUrl}?xml=1`;
    
    let xmlText: string | null = null;
    let htmlText: string | null = null;

    // Use electronAPI to bypass CORS if available
    if (typeof window !== 'undefined' && window.electronAPI?.utilFetch) {
      xmlText = await window.electronAPI.utilFetch(xmlUrl);
      htmlText = await window.electronAPI.utilFetch(baseUrl);
    } else {
      const [resXml, resHtml] = await Promise.all([fetch(xmlUrl), fetch(baseUrl)]);
      if (resXml.ok) xmlText = await resXml.text();
      if (resHtml.ok) htmlText = await resHtml.text();
    }
    
    if (!xmlText) return null;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'text/xml');
    
    const error = doc.querySelector('error');
    if (error) return null;
    
    const steamId64 = doc.querySelector('steamID64')?.textContent || '';
    const username = doc.querySelector('steamID')?.textContent || '';
    const avatarFull = doc.querySelector('avatarFull')?.textContent || '';
    const onlineState = doc.querySelector('onlineState')?.textContent || 'offline';
    const stateMessage = doc.querySelector('stateMessage')?.textContent || '';
    
    if (!steamId64) return null;

    let steamLevel: number | undefined = undefined;
    let steamGamesCount: number | undefined = undefined;
    let steamBadgesCount: number | undefined = undefined;
    let steamRecentGames: any[] = [];
    let steamFavoriteBadge: any = undefined;

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
        }
      }

    }
    
    return { steamId64, username, avatarFull, onlineState, stateMessage, steamLevel, steamGamesCount, steamBadgesCount, steamRecentGames, steamFavoriteBadge };
  } catch (err) {
    console.error('[steamService] Error fetching steam profile:', err);
    return null;
  }
}
