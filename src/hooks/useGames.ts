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
    steamId: 2138710,
    name: 'God of War',
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2138710/library_hero.jpg',
    genres: ['Action', 'Adventure', 'Singleplayer'],
    releaseDate: '14 Jan, 2022',
    shortDescription: 'His vengeance against the Gods of Olympus years behind him, Kratos now lives as a man in the realm of Norse Gods.',
  },
  {
    steamId: 1817190,
    name: "Marvel's Spider-Man Remastered",
    headerImage: 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1817190/library_hero.jpg',
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
        else if (KNOWN_GAME_MAP[id]) {
          games.push({
            steamId: id,
            name: KNOWN_GAME_MAP[id].name || `Game ${id}`,
            headerImage: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
            genres: KNOWN_GAME_MAP[id].genres,
          })
        }
      }
      const filtered = games.filter(g => g.name && !g.name.startsWith('Game ') && !g.name.toLowerCase().includes('steam machine'))
      return filtered.length > 0 ? filtered : CURATED_HERO_GAMES
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
        } else if (KNOWN_GAME_MAP[id]) {
          games.push({
            steamId: id,
            name: KNOWN_GAME_MAP[id].name || `Game ${id}`,
            headerImage: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`,
            genres: KNOWN_GAME_MAP[id].genres,
            releaseDate: KNOWN_GAME_MAP[id].releaseDate,
            shortDescription: KNOWN_GAME_MAP[id].shortDescription,
          })
        }
      }

      const filtered = games.filter(g => g.name && !g.name.startsWith('Game ') && !g.name.toLowerCase().includes('steam machine') && !g.name.toLowerCase().includes('steam controller'))
      return filtered.length > 0 ? filtered : CURATED_HERO_GAMES
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
