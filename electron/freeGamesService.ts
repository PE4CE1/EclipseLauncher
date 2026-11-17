import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { showDesktopNotification } from './nativeNotifications'
import type { FreeGameItem } from '../src/types/freeGames'
export type { FreeGameItem } from '../src/types/freeGames'

let checkTimer: NodeJS.Timeout | null = null
let initialCheckTimer: NodeJS.Timeout | null = null
let isChecking = false
let onGamesUpdated: () => void = () => {}
let onOpenFreeGames: () => void = () => {}

export function configureFreeGameNotifications(callbacks: { updated: () => void; open: () => void }): void {
  onGamesUpdated = callbacks.updated
  onOpenFreeGames = callbacks.open
}

function getNotifiedCachePath(): string {
  try {
    return path.join(app.getPath('userData'), 'notified_free_games.json')
  } catch {
    return path.join(process.cwd(), 'notified_free_games.json')
  }
}

function loadNotifiedGames(): Set<string> {
  try {
    const filePath = getNotifiedCachePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (Array.isArray(data)) {
        return new Set(data)
      }
    }
  } catch {}
  return new Set()
}

function saveNotifiedGames(ids: Set<string>) {
  try {
    const filePath = getNotifiedCachePath()
    const arr = Array.from(ids).slice(-200) // Keep last 200 items
    fs.writeFileSync(filePath, JSON.stringify(arr, null, 2), 'utf-8')
  } catch {}
}

function readAlertSettings(): { enabled: boolean; english: boolean } {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json')
    if (fs.existsSync(settingsPath)) {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return { enabled: s.freeGamesNotifications !== false, english: s.language === 'en' }
    }
  } catch {}
  return { enabled: true, english: false }
}

/**
 * Queries Epic Games Store Free Promotions API
 */
async function fetchEpicFreeGames(): Promise<FreeGameItem[]> {
  const results: FreeGameItem[] = []
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(
      'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=de-DE&country=DE&allowCountries=DE',
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      }
    )
    clearTimeout(timeout)
    if (!res.ok) return results

    const json = await res.json()
    const elements: any[] = json?.data?.Catalog?.searchStore?.elements || []

    for (const elem of elements) {
      // Must have active promotional offers
      const promoOffers = elem?.promotions?.promotionalOffers?.[0]?.promotionalOffers || []
      const isCurrentlyFree = promoOffers.some((offer: any) => {
        const discountPercentage = offer?.discountSetting?.discountPercentage
        return discountPercentage === 0
      }) || (elem?.price?.totalPrice?.discountPrice === 0 && elem?.price?.totalPrice?.originalPrice > 0)

      if (isCurrentlyFree && elem.title) {
        // Construct verified Epic store page URL (direct and working)
        const slug = elem.catalogNs?.mappings?.[0]?.pageSlug || elem.offerMappings?.[0]?.pageSlug || elem.productSlug || elem.urlSlug || ''
        const cleanSlug = String(slug).replace('/home', '').trim()
        const storeUrl = cleanSlug 
          ? `https://store.epicgames.com/de/p/${cleanSlug}`
          : 'https://store.epicgames.com/de/free-games'
        
        let imageUrl: string | undefined = undefined
        if (Array.isArray(elem.keyImages)) {
          const thumb = elem.keyImages.find((img: any) => img.type === 'OfferImageWide' || img.type === 'Thumbnail' || img.type === 'DieselStoreFrontWide')
          imageUrl = thumb?.url || elem.keyImages[0]?.url
        }

        const clientUrl = cleanSlug 
          ? `com.epicgames.launcher://store/p/${cleanSlug}` 
          : 'com.epicgames.launcher://store/freegames'

        const id = `epic-${elem.id || elem.title.toLowerCase().replace(/[^a-z0-9]/g, '')}`
        results.push({
          id,
          title: elem.title.trim(),
          platform: 'Epic Games',
          url: storeUrl,
          clientUrl,
          slug: cleanSlug,
          imageUrl,
          originalPrice: elem?.price?.totalPrice?.fmtPrice?.originalPrice || undefined
        })
      }
    }
  } catch (err) {
    console.warn('[FreeGamesRadar] Epic check failed:', err)
  }
  return results
}

const KNOWN_FREE_APP_IDS: Record<string, number> = {
  'crystalcrisis': 447700
}

/**
 * Queries GamerPower Giveaways API for Steam & Epic Giveaways
 */
async function fetchGamerPowerGiveaways(): Promise<FreeGameItem[]> {
  const results: FreeGameItem[] = []
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch('https://www.gamerpower.com/api/giveaways?type=game', {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    })
    clearTimeout(timeout)
    if (!res.ok) return results

    const json = await res.json()
    if (!Array.isArray(json)) return results

    for (const item of json) {
      if (item.status !== 'Active') continue
      const platformStr = String(item.platforms || '').toLowerCase()
      let platform: 'Steam' | 'Epic Games' | 'GOG' | 'Other' = 'Other'

      if (platformStr.includes('steam')) {
        platform = 'Steam'
      } else if (platformStr.includes('epic')) {
        platform = 'Epic Games'
      } else if (platformStr.includes('gog')) {
        platform = 'GOG'
      } else {
        continue // Focus on Steam, Epic, GOG
      }

      // Ignore generic F2P games (e.g. worth N/A)
      const worth = String(item.worth || '').trim()
      if (worth.toLowerCase() === 'n/a' || worth.toLowerCase() === 'free') continue

      // Clean title
      const rawTitle = String(item.title || '')
      const cleanTitle = rawTitle
        .replace(/\s*\((Steam|Epic Games|PC|GOG)[^)]*\)\s*(Key\s*)?Giveaway/i, '')
        .replace(/\s*(Key\s*)?Giveaway/i, '')
        .trim()

      const normTitle = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '')

      let webUrl = item.open_giveaway_url || item.gamerpower_url || 'https://store.steampowered.com'
      let clientUrl: string | undefined = undefined
      let steamAppId: number | undefined = KNOWN_FREE_APP_IDS[normTitle]
      let slug: string | undefined = undefined

      // Resolve redirect destination to extract real store URL and application IDs
      if (item.open_giveaway_url) {
        try {
          const headRes = await fetch(item.open_giveaway_url, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(3000)
          })
          const loc = headRes.headers.get('location')
          if (loc) {
            webUrl = loc
            const sMatch = loc.match(/\/app\/(\d+)/)
            if (sMatch) {
              steamAppId = Number(sMatch[1])
            }
            const eMatch = loc.match(/\/p\/([^/?#]+)/)
            if (eMatch) {
              slug = eMatch[1]
            }
          }
        } catch {}
      }

      // CRITICAL CHECK FOR STEAM: Must be directly on Steam AND verified 100% free!
      if (platform === 'Steam') {
        if (!steamAppId) {
          // Reject external third-party raffles / key sites (e.g. Alienware Arena) that are not free on Steam
          continue
        }

        try {
          const sRes = await fetch(`https://store.steampowered.com/api/appdetails?appids=${steamAppId}&cc=de&l=german`, {
            signal: AbortSignal.timeout(3000)
          })
          if (sRes.ok) {
            const sData = await sRes.json()
            const appData = sData[steamAppId]?.data
            if (!appData) continue

            const isTrulyFree = (appData.is_free && appData.price_overview?.discount_percent === 100) ||
                               (appData.price_overview?.final === 0 && appData.price_overview?.initial > 0) ||
                               (appData.is_free && !appData.price_overview)
            
            if (!isTrulyFree) {
              // Exclude games that actually cost money on Steam (like Dwarven Realms)
              continue
            }

            if (appData.price_overview?.initial_formatted) {
              item.worth = appData.price_overview.initial_formatted
            }
          }
        } catch {}

        clientUrl = `steam://store/${steamAppId}`
        webUrl = `https://store.steampowered.com/app/${steamAppId}`
      }

      if (platform === 'Epic Games' && slug) {
        webUrl = `https://store.epicgames.com/de/p/${slug}`
        clientUrl = `com.epicgames.launcher://store/p/${slug}`
      }

      const id = `gp-${item.id || normTitle}`
      results.push({
        id,
        title: cleanTitle || rawTitle,
        platform,
        url: webUrl,
        clientUrl,
        steamAppId,
        slug,
        imageUrl: item.image,
        originalPrice: item.worth,
        endDate: item.end_date
      })
    }
  } catch (err) {
    console.warn('[FreeGamesRadar] GamerPower check failed:', err)
  }
  return results
}


let cachedFreeGames: FreeGameItem[] = []

function getFreeGamesCachePath(): string {
  try {
    return path.join(app.getPath('userData'), 'free_games_cache.json')
  } catch {
    return path.join(process.cwd(), 'free_games_cache.json')
  }
}

export function getCachedFreeGames(): FreeGameItem[] {
  if (cachedFreeGames.length > 0) return cachedFreeGames
  try {
    const filePath = getFreeGamesCachePath()
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      if (Array.isArray(data)) {
        cachedFreeGames = data
        return cachedFreeGames
      }
    }
  } catch {}
  return []
}

export function saveCachedFreeGames(games: FreeGameItem[]) {
  try {
    cachedFreeGames = games
    const filePath = getFreeGamesCachePath()
    fs.writeFileSync(filePath, JSON.stringify(games, null, 2), 'utf-8')
  } catch {}
}

/**
 * Main function to check for free games and send Windows notifications
 */
export async function checkFreeGames(forceRefresh: boolean = false): Promise<{ success: boolean; found: number; newAlerts: number; games: FreeGameItem[] }> {
  if (isChecking) return { success: false, found: 0, newAlerts: 0, games: getCachedFreeGames() }
  isChecking = true

  try {
    const { enabled: alertsEnabled, english } = readAlertSettings()
    if (!alertsEnabled && !forceRefresh) {
      return { success: true, found: 0, newAlerts: 0, games: getCachedFreeGames() }
    }

    const [epicGames, gpGames] = await Promise.all([
      fetchEpicFreeGames(),
      fetchGamerPowerGiveaways()
    ])

    // Deduplicate by title
    const allGamesMap = new Map<string, FreeGameItem>()
    epicGames.forEach(g => allGamesMap.set(g.title.toLowerCase(), g))
    gpGames.forEach(g => {
      const key = g.title.toLowerCase()
      if (!allGamesMap.has(key)) {
        allGamesMap.set(key, g)
      }
    })

    const allGames = Array.from(allGamesMap.values())
    saveCachedFreeGames(allGames)

    const notifiedIds = loadNotifiedGames()
    const newlyDiscovered: FreeGameItem[] = []

    for (const game of allGames) {
      const isAlreadyNotified = notifiedIds.has(game.id) || notifiedIds.has(game.title.toLowerCase())
      if (!isAlreadyNotified) {
        newlyDiscovered.push(game)
      }
    }

    // Refresh tray menu with latest games list
    try {
      onGamesUpdated()
    } catch {}

    let newAlerts = 0
    if (alertsEnabled && newlyDiscovered.length) {
      const first = newlyDiscovered[0]
      const single = newlyDiscovered.length === 1
      const title = single
        ? (english ? `Free on ${first.platform}: ${first.title}` : `Gratis auf ${first.platform}: ${first.title}`)
        : (english ? `${newlyDiscovered.length} new free games` : `${newlyDiscovered.length} neue Gratis-Spiele`)
      const body = single
        ? (english ? 'Available for free now. Open Free Games in Eclipse to claim it.' : 'Jetzt kostenlos verfügbar. Öffne Free Games in Eclipse, um es dir zu sichern.')
        : newlyDiscovered.slice(0, 4).map(game => `${game.title} (${game.platform})`).join('\n')
      const shown = await showDesktopNotification({ title, body, silent: false }, onOpenFreeGames)
      // A disabled/failed Windows delivery must remain eligible for the next check.
      if (shown) {
        for (const game of newlyDiscovered) { notifiedIds.add(game.id); notifiedIds.add(game.title.toLowerCase()) }
        saveNotifiedGames(notifiedIds)
        newAlerts = newlyDiscovered.length
      }
    }

    return {
      success: true,
      found: allGames.length,
      newAlerts,
      games: allGames
    }
  } catch (err) {
    console.warn('[FreeGamesRadar] Check failed:', err)
    return { success: false, found: 0, newAlerts: 0, games: getCachedFreeGames() }
  } finally {
    isChecking = false
  }
}

/**
 * Initializes the background Free Games Radar timer
 */
export function startFreeGamesRadar() {
  if (checkTimer) return

  // Run initial check 12 seconds after launch so startup is 100% instant
  initialCheckTimer = setTimeout(() => {
    initialCheckTimer = null
    checkFreeGames().catch(() => {})
  }, 12000)
  initialCheckTimer.unref()

  // Check every 4 hours (4 * 60 * 60 * 1000 ms)
  const FOUR_HOURS = 4 * 60 * 60 * 1000
  checkTimer = setInterval(() => {
    checkFreeGames().catch(() => {})
  }, FOUR_HOURS)
  checkTimer.unref()
}

export function stopFreeGamesRadar(): void {
  if (initialCheckTimer) clearTimeout(initialCheckTimer)
  if (checkTimer) clearInterval(checkTimer)
  initialCheckTimer = null
  checkTimer = null
}
