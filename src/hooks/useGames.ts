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
const HERO_FEATURED_IDS = [
  1091500, // Cyberpunk 2077
  1245620, // Elden Ring
  2358720, // Black Myth: Wukong
  1086940, // Baldur's Gate 3
  1174180, // Red Dead Redemption 2
  553850,  // Helldivers 2
  271590,  // Grand Theft Auto V
  2138710, // God of War
  1817190, // Marvel's Spider-Man Remastered
  292030,  // The Witcher 3: Wild Hunt
  1551360, // Forza Horizon 5
  990080,  // Hogwarts Legacy
  1145350, // Hades II
  1888160, // Palworld
  814380,  // Sekiro: Shadows Die Twice
  2379780, // Starfield
  730,     // Counter-Strike 2
  252490,  // Rust
]

// ─── Home carousels ───────────────────────────────────────────────────────────

/**
 * Popular Games — fetches details for our curated popular list.
 * Falls back gracefully if some app details fail.
 */
export function usePopularGames() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'popular', 'v4'],
    queryFn: async () => {
      const ids = uniqueIds(POPULAR_STEAM_IDS, 20)
      const detailsMap = await getSteamAppsDetailsFromStore(ids)
      const games: SteamGame[] = []
      for (const id of ids) {
        const d = detailsMap.get(id)
        if (d) games.push(detailsToGame(d))
        else {
          games.push({ steamId: id, name: `Game ${id}` })
        }
      }
      return games.filter(g => g.name && !g.name.startsWith('Game ') && !g.name.toLowerCase().includes('steam machine'))
    },
    staleTime: 1000 * 60 * 30,
    gcTime:    1000 * 60 * 60,
    retry: 1,
  })
}

/**
 * Trending Games
 */
export function useTrendingGames() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'trending', 'v4'],
    queryFn: async () => {
      const ids = uniqueIds(TRENDING_IDS, 15)
      const detailsMap = await getSteamAppsDetailsFromStore(ids)
      return ids
        .map(id => detailsMap.get(id))
        .filter((d): d is SteamAppDetails => !!d)
        .map(detailsToGame)
        .filter(g => !g.name.toLowerCase().includes('steam machine') && !g.name.toLowerCase().includes('steam controller'))
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
  })
}

/**
 * New Releases
 */
export function useNewReleases() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'newReleases', 'v4'],
    queryFn: async () => {
      // Try live featured categories first
      const featured = await getSteamFeaturedCategories()
      if (featured && featured.new_releases.length > 0) {
        const ids = uniqueIds(featured.new_releases.map(g => g.id), 15)
        const detailsMap = await getSteamAppsDetailsFromStore(ids)
        const games = ids
          .map(id => detailsMap.get(id))
          .filter((d): d is SteamAppDetails => !!d)
          .map(detailsToGame)
          .filter(g => !g.name.toLowerCase().includes('steam machine') && !g.name.toLowerCase().includes('steam controller'))
        if (games.length > 0) return games
      }
      // Fallback to curated list
      const ids = uniqueIds(NEW_RELEASE_IDS, 15)
      const detailsMap = await getSteamAppsDetailsFromStore(ids)
      return ids
        .map(id => detailsMap.get(id))
        .filter((d): d is SteamAppDetails => !!d)
        .map(detailsToGame)
        .filter(g => !g.name.toLowerCase().includes('steam machine') && !g.name.toLowerCase().includes('steam controller'))
    },
    staleTime: 1000 * 60 * 30,
    retry: 1,
  })
}

/**
 * Featured / Top Sellers (for HeroSection)
 */
export function useFeaturedGames() {
  return useQuery<SteamGame[]>({
    queryKey: ['steam', 'featured', 'v5'],
    queryFn: async () => {
      const featured = await getSteamFeaturedCategories()
      let ids: number[] = []
      
      if (featured && featured.top_sellers.length > 0) {
        // Filter out hardware IDs or non-game products like Steam Machine, Controller, Deck etc.
        const validTopSellers = featured.top_sellers
          .filter(g => g.id && g.id > 1000 && !g.name?.toLowerCase().includes('steam machine') && !g.name?.toLowerCase().includes('steam controller') && !g.name?.toLowerCase().includes('steam link'))
          .map(g => g.id)
        
        ids = uniqueIds([...validTopSellers, ...HERO_FEATURED_IDS], 15)
      } else {
        ids = uniqueIds(HERO_FEATURED_IDS, 15)
      }

      const detailsMap = await getSteamAppsDetailsFromStore(ids)
      const games: SteamGame[] = []

      for (const id of ids) {
        const d = detailsMap.get(id)
        if (d) {
          games.push(detailsToGame(d))
        } else {
          // If detailed store API was throttled, construct fallback with direct Steam CDN banner
          games.push({
            steamId: id,
            name: `Game ${id}`,
            headerImage: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`
          })
        }
      }

      return games.filter(g => g.name && !g.name.startsWith('Game ') && !g.name.toLowerCase().includes('steam machine') && !g.name.toLowerCase().includes('steam controller'))
    },
    staleTime: 1000 * 60 * 20,
    retry: 1,
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
export function useSteamGameDetail(steamId: number | null) {
  return useQuery<SteamAppDetails | null>({
    queryKey: ['steam', 'detail', steamId],
    queryFn: () => steamId ? getSteamAppDetails(steamId) : null,
    enabled: steamId !== null,
    staleTime: 1000 * 60 * 60,
  })
}

// ─── Re-export types so consumers don't need to import from steamService ──────
export type { SteamGame, SteamSearchItem, SteamAppDetails }
