import { desktopFetch as fetch } from '../services/httpClient'
/**
 * useGames.ts — Steam-based game data hooks (no API key required)
 * Replaces the previous RAWG-based hooks.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import {
  searchSteamGames,
  getSteamAppDetails,
  getSteamAppsDetailsFromStore,
  getSteamFeaturedCategories,
  fetchTopSteamSpecialOffers,
  detailsToGame,
  POPULAR_STEAM_IDS,
  NEW_RELEASE_IDS,
  TRENDING_IDS,
  type SteamGame,
  type SteamSearchItem,
  type SteamAppDetails,
} from '../services/steamService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Deduplicate IDs and take first N */
function uniqueIds(ids: number[], limit = 20): number[] {
  return [...new Set(ids.filter(id => typeof id === 'number' && id > 0))].slice(0, limit)
}

// Curated Top AAA Blockbusters with guaranteed 4K/HD hero artwork
export const CURATED_HERO_GAMES: SteamGame[] = [
  {
    steamId: 1091500,
    name: 'Cyberpunk 2077',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1091500/library_hero.jpg',
    genres: ['Action', 'RPG', 'Open World'],
    releaseDate: '10 Dec, 2020',
    shortDescription: 'Cyberpunk 2077 is an open-world, action-adventure RPG set in the megalopolis of Night City.',
  },
  {
    steamId: 1245620,
    name: 'ELDEN RING',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1245620/library_hero.jpg',
    genres: ['Action', 'RPG', 'Dark Fantasy'],
    releaseDate: '25 Feb, 2022',
    shortDescription: 'THE NEW FANTASY ACTION RPG. Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring.',
  },
  {
    steamId: 2358720,
    name: 'Black Myth: Wukong',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2358720/library_hero.jpg',
    genres: ['Action', 'RPG', 'Adventure'],
    releaseDate: '20 Aug, 2024',
    shortDescription: 'Black Myth: Wukong is an action RPG rooted in Chinese mythology.',
  },
  {
    steamId: 1086940,
    name: "Baldur's Gate 3",
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/library_hero.jpg',
    genres: ['RPG', 'Strategy', 'Turn-Based'],
    releaseDate: '3 Aug, 2023',
    shortDescription: 'Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal.',
  },
  {
    steamId: 1174180,
    name: 'Red Dead Redemption 2',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1174180/library_hero.jpg',
    genres: ['Action', 'Adventure', 'Open World'],
    releaseDate: '5 Dec, 2019',
    shortDescription: 'America, 1899. Arthur Morgan and the Van der Linde gang are outlaws on the run.',
  },
  {
    steamId: 553850,
    name: 'HELLDIVERS™ 2',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/553850/library_hero.jpg',
    genres: ['Action', 'Shooter', 'Co-op'],
    releaseDate: '8 Feb, 2024',
    shortDescription: 'The Galaxy’s Last Line of Offence. Enlist in the Helldivers and join the fight for freedom.',
  },
  {
    steamId: 271590,
    name: 'Grand Theft Auto V',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/271590/library_hero.jpg',
    genres: ['Action', 'Open World', 'Multiplayer'],
    releaseDate: '14 Apr, 2015',
    shortDescription: 'When a young street hustler, a retired bank robber and a terrifying psychopath find themselves entangled...',
  },
  {
    steamId: 1593500,
    name: 'God of War',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1593500/library_hero.jpg',
    genres: ['Action', 'Adventure', 'Singleplayer'],
    releaseDate: '14 Jan, 2022',
    shortDescription: 'His vengeance against the Gods of Olympus years behind him, Kratos now lives as a man in the realm of Norse Gods.',
  },
  {
    steamId: 1817070,
    name: "Marvel's Spider-Man Remastered",
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1817070/library_hero.jpg',
    genres: ['Action', 'Superhero', 'Open World'],
    releaseDate: '12 Aug, 2022',
    shortDescription: 'In Marvel’s Spider-Man Remastered, the worlds of Peter Parker and Spider-Man collide.',
  },
  {
    steamId: 292030,
    name: 'The Witcher 3: Wild Hunt',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/292030/library_hero.jpg',
    genres: ['RPG', 'Open World', 'Fantasy'],
    releaseDate: '18 May, 2015',
    shortDescription: 'You are Geralt of Rivia, mercenary monster slayer. Before you stands a war-torn, monster-infested continent.',
  },
]

const KNOWN_GAME_MAP: Record<number, Partial<SteamGame>> = {}
CURATED_HERO_GAMES.forEach(g => {
  KNOWN_GAME_MAP[g.steamId] = g
})

const HERO_FEATURED_IDS = CURATED_HERO_GAMES.map(g => g.steamId)

const CURATED_CAROUSEL_GAMES: Record<number, Partial<SteamGame>> = {
  730: { name: 'Counter-Strike 2', genres: ['Action', 'Shooter', 'Competitive'], isFree: true },
  1086940: { name: "Baldur's Gate 3", genres: ['RPG', 'Strategy', 'Adventure'], releaseDate: '3 Aug, 2023' },
  1245620: { name: 'ELDEN RING', genres: ['Action', 'RPG', 'Open World'], releaseDate: '25 Feb, 2022' },
  1091500: { name: 'Cyberpunk 2077', genres: ['Action', 'RPG', 'Cyberpunk'], releaseDate: '10 Dec, 2020' },
  2246340: { name: 'Monster Hunter Wilds', genres: ['Action', 'RPG', 'Hunting'], releaseDate: '28 Feb, 2025' },
  2183900: { name: 'Warhammer 40,000: Space Marine 2', genres: ['Action', 'Shooter', 'Third-Person'], releaseDate: '9 Sep, 2024' },
  2358720: { name: 'Black Myth: Wukong', genres: ['Action', 'RPG', 'Mythology'], releaseDate: '20 Aug, 2024' },
  1172470: { name: 'Apex Legends', genres: ['Action', 'Free to Play', 'Battle Royale'], isFree: true },
  252490: { name: 'Rust', genres: ['Survival', 'Crafting', 'Multiplayer'], releaseDate: '8 Feb, 2018' },
  892970: { name: 'Valheim', genres: ['Survival', 'Open World', 'Co-op'], releaseDate: '2 Feb, 2021' },
  526870: { name: 'Satisfactory', genres: ['Automation', 'Building', 'Open World'], releaseDate: '10 Sep, 2024' },
  990080: { name: 'Hogwarts Legacy', genres: ['Action', 'RPG', 'Open World'], releaseDate: '10 Feb, 2023' },
  1817070: { name: "Marvel's Spider-Man Remastered", genres: ['Action', 'Open World', 'Superhero'], releaseDate: '12 Aug, 2022' },
  1593500: { name: 'God of War', genres: ['Action', 'Adventure', 'Singleplayer'], releaseDate: '14 Jan, 2022' },
  1174180: { name: 'Red Dead Redemption 2', genres: ['Action', 'Adventure', 'Open World'], releaseDate: '5 Dec, 2019' },
  271590: { name: 'Grand Theft Auto V', genres: ['Action', 'Open World', 'Multiplayer'], releaseDate: '14 Apr, 2015' },
  292030: { name: 'The Witcher 3: Wild Hunt', genres: ['RPG', 'Open World', 'Fantasy'], releaseDate: '18 May, 2015' },
  814380: { name: 'Sekiro™: Shadows Die Twice', genres: ['Action', 'Souls-like', 'Singleplayer'], releaseDate: '21 Mar, 2019' },
  1145360: { name: 'Hades', genres: ['Action', 'Rogue-like', 'Indie'], releaseDate: '17 Sep, 2020' },
  2767030: { name: 'Marvel Rivals', genres: ['Action', 'Shooter', 'Free to Play'], isFree: true, releaseDate: '6 Dec, 2024' },
  1771300: { name: 'Kingdom Come: Deliverance II', genres: ['RPG', 'Open World', 'Medieval'], releaseDate: '4 Feb, 2025' },
  2457220: { name: 'Avowed', genres: ['RPG', 'Action', 'First-Person'], releaseDate: '18 Feb, 2025' },
  2677660: { name: 'Indiana Jones and the Great Circle™', genres: ['Action', 'Adventure', 'First-Person'], releaseDate: '9 Dec, 2024' },
  3017860: { name: 'DOOM: The Dark Ages', genres: ['Action', 'Shooter', 'First-Person'], releaseDate: '2025' },
  1158670: { name: 'Dune: Awakening', genres: ['Survival', 'MMO', 'Open World'], releaseDate: '2025' },
  3280350: { name: 'Death Stranding 2: On the Beach', genres: ['Action', 'Adventure', 'Sci-Fi'], releaseDate: '2025' },
  1623730: { name: 'Palworld', genres: ['Creature Collector', 'Survival', 'Open World'], releaseDate: '19 Jan, 2024' },
  1295660: { name: "Sid Meier's Civilization® VII", genres: ['Strategy', 'Turn-Based', 'Historical'], releaseDate: '11 Feb, 2025' },
  2842040: { name: 'Star Wars Outlaws', genres: ['Action', 'Adventure', 'Open World'], releaseDate: '27 Aug, 2024' },
  1601580: { name: 'Frostpunk 2', genres: ['Strategy', 'City Builder', 'Survival'], releaseDate: '20 Sep, 2024' },
  2124490: { name: 'SILENT HILL 2', genres: ['Horror', 'Action', 'Atmospheric'], releaseDate: '8 Oct, 2024' },
  1790600: { name: 'DRAGON BALL: Sparking! ZERO', genres: ['Action', 'Fighting', 'Anime'], releaseDate: '11 Oct, 2024' },
  1643320: { name: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl', genres: ['Action', 'Post-apocalyptic', 'Shooter'], releaseDate: '20 Nov, 2024' },
  2322010: { name: 'God of War Ragnarök', genres: ['Action', 'Adventure', 'Mythology'], releaseDate: '19 Sep, 2024' },
  2694490: { name: 'Path of Exile 2', genres: ['Action RPG', 'Hack and Slash', 'Free to Play'], isFree: true, releaseDate: '6 Dec, 2024' },
  1627720: { name: 'Lies of P', genres: ['Action', 'Souls-like', 'Dark Fantasy'], releaseDate: '18 Sep, 2023' },
  553850: { name: 'HELLDIVERS™ 2', genres: ['Action', 'Shooter', 'Co-op'], releaseDate: '8 Feb, 2024' },
}

let cheapSharkDealsCache: { timestamp: number; map: Map<number, any> } | null = null

let cheapSharkDealsInFlight: Promise<Map<number, any>> | null = null

function getCachedCheapSharkDeals(): Promise<Map<number, any>> {
  if (cheapSharkDealsCache && Date.now() - cheapSharkDealsCache.timestamp < 30 * 60 * 1000) {
    return Promise.resolve(cheapSharkDealsCache.map)
  }
  if (!cheapSharkDealsInFlight) {
    cheapSharkDealsInFlight = fetchCheapSharkDeals().finally(() => { cheapSharkDealsInFlight = null })
  }
  return cheapSharkDealsInFlight
}

async function fetchCheapSharkDeals(): Promise<Map<number, any>> {
  if (cheapSharkDealsCache && (Date.now() - cheapSharkDealsCache.timestamp < 30 * 60 * 1000)) {
    return cheapSharkDealsCache.map
  }
  const map = new Map<number, any>()
  try {
    const res = await fetch('https://www.cheapshark.com/api/1.0/deals?storeID=1&sortBy=Deal%20Rating&pageSize=60', {
      headers: { 'User-Agent': 'EclipseLauncher/1.0' }
    })
    if (res.ok) {
      const deals = await res.json()
      if (Array.isArray(deals)) {
        for (const d of deals) {
          const appId = Number(d.steamAppID)
          if (appId && !isNaN(appId)) {
            map.set(appId, d)
          }
        }
      }
    }
  } catch {}
  if (map.size > 0) cheapSharkDealsCache = { timestamp: Date.now(), map }
  return map
}

function createCarouselGame(id: number, dealsMap?: Map<number, any>): SteamGame {
  const known = CURATED_CAROUSEL_GAMES[id] || KNOWN_GAME_MAP[id]
  const deal = dealsMap?.get(id)

  const name = known?.name || deal?.title || `Steam Game ${id}`
  const headerImage = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`
  const genres = known?.genres || ['Game']
  const releaseDate = known?.releaseDate
  const isFree = known?.isFree ?? (deal?.salePrice === '0.00')

  const discountPercent = deal ? Math.round(parseFloat(deal.savings) || 0) : undefined
  const priceFormatted = deal && parseFloat(deal.salePrice) > 0 ? `${parseFloat(deal.salePrice).toFixed(2)} USD` : (isFree ? 'Free' : undefined)
  const initialPriceFormatted = deal && parseFloat(deal.normalPrice) > 0 && discountPercent && discountPercent > 0 ? `${parseFloat(deal.normalPrice).toFixed(2)} USD` : undefined

  return {
    steamId: id,
    name,
    headerImage,
    genres,
    releaseDate,
    shortDescription: known?.shortDescription,
    isFree,
    discountPercent: discountPercent && discountPercent > 0 ? discountPercent : undefined,
    priceFormatted,
    initialPriceFormatted,
  }
}

// ─── Home carousels (Zero-API: Pure Fastly CDN & Batched CheapShark) ─────────

/**
 * Popular Games — instant load via Fastly CDN & CheapShark discounts.
 * Zero requests to store.steampowered.com.
 */
export function usePopularGames() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'popular', 'v5'],
    queryFn: async () => {
      const ids = uniqueIds(POPULAR_STEAM_IDS, 20)
      const dealsMap = await getCachedCheapSharkDeals().catch(() => new Map())
      return ids.map(id => createCarouselGame(id, dealsMap))
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
  })
}

/**
 * Trending Games — instant load via Fastly CDN & CheapShark discounts.
 * Zero requests to store.steampowered.com.
 */
export function useTrendingGames() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'trending', 'v5'],
    queryFn: async () => {
      const ids = uniqueIds(TRENDING_IDS, 15)
      const dealsMap = await getCachedCheapSharkDeals().catch(() => new Map())
      return ids.map(id => createCarouselGame(id, dealsMap))
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  })
}

/**
 * New Releases — instant load via Fastly CDN & CheapShark discounts.
 * Zero requests to store.steampowered.com.
 */
export function useNewReleases() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'newReleases', 'v5'],
    queryFn: async () => {
      const ids = uniqueIds(NEW_RELEASE_IDS, 15)
      const dealsMap = await getCachedCheapSharkDeals().catch(() => new Map())
      return ids.map(id => createCarouselGame(id, dealsMap))
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  })
}

/**
 * Featured / Top Sellers (for HeroSection)
 * Uses high-resolution library_hero artwork + CheapShark deals.
 * Zero requests to store.steampowered.com.
 */
export function useFeaturedGames() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'featured', 'v6'],
    queryFn: async () => {
      const dealsMap = await getCachedCheapSharkDeals().catch(() => new Map())
      return CURATED_HERO_GAMES.map(g => {
        const deal = dealsMap.get(g.steamId)
        if (deal) {
          const discount = Math.round(parseFloat(deal.savings) || 0)
          return {
            ...g,
            discountPercent: discount > 0 ? discount : g.discountPercent,
            priceFormatted: parseFloat(deal.salePrice) > 0 ? `${parseFloat(deal.salePrice).toFixed(2)} USD` : g.priceFormatted,
            initialPriceFormatted: parseFloat(deal.normalPrice) > 0 ? `${parseFloat(deal.normalPrice).toFixed(2)} USD` : g.initialPriceFormatted,
          }
        }
        return g
      })
    },
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  })
}

/**
 * Featured Categories from Steam Store API (Top Sellers, New Releases, Specials, Coming Soon)
 */
export function useFeaturedCategories() {
  return useQuery({
    queryKey: ['steam', 'featuredCategories', 'v1'],
    queryFn: () => getSteamFeaturedCategories(),
    staleTime: 1000 * 60 * 15,
  })
}

/**
 * Top Special Offers / Discounts from Steam (Auto-updating in background)
 */
export function useSpecialOffers() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'specials', 'v3'],
    queryFn: () => fetchTopSteamSpecialOffers(),
    staleTime: 1000 * 60 * 10,       // 10 minutes cache
    refetchInterval: 1000 * 60 * 15, // Automatically re-fetch every 15 minutes in background
    refetchOnWindowFocus: true,      // Automatically refresh when returning to launcher
    retry: 2,
  })
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search Steam games with infinite pagination.
 * Returns SteamSearchItem[] (lightweight — no detail fetching on search).
 */
export function useSearchGames(query: string) {
  return useInfiniteQuery<SteamSearchItem[]>({
    queryKey: ['steam', 'search', query],
    queryFn: async () => {
      if (!query || query.length < 2) return []
      return searchSteamGames(query)
    },
    initialPageParam: 0,
    getNextPageParam: () => undefined,
    enabled: query.length >= 2,
    staleTime: 1000 * 60 * 5,
  })
}

// ─── Game Detail ──────────────────────────────────────────────────────────────

/**
 * Full details for a single Steam game.
 */
export function useSteamGameDetail(steamId: number | null, lang: string = 'english', cc: string = 'DE') {
  return useQuery<SteamAppDetails | null>({
    queryKey: ['steam', 'detail', steamId, lang, cc],
    queryFn: () => steamId ? getSteamAppDetails(steamId, lang, cc) : null,
    enabled: steamId !== null,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 2,
  })
}

// ─── Re-export types so consumers don't need to import from steamService ──────
export type { SteamGame, SteamSearchItem, SteamAppDetails }
