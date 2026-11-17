import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { writeJsonAtomicSync } from './jsonStorage'

export interface GamePlaytimeRecord {
  name: string
  playTimeMinutes: number
  lastPlayed: number
  platform?: string
  steamId?: number
}

export type PlaytimeDatabase = Record<string, GamePlaytimeRecord>

const normalize = (str?: string) => typeof str === 'string' ? str.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : ''

function validatePlaytimeDb(value: unknown): PlaytimeDatabase {
  const result: PlaytimeDatabase = Object.create(null)
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [key, record] of Object.entries(value)) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.name !== 'string') continue
    if (!Number.isFinite(record.playTimeMinutes) || record.playTimeMinutes < 0) continue
    result[key] = {
      name: record.name,
      playTimeMinutes: record.playTimeMinutes,
      lastPlayed: Number.isFinite(record.lastPlayed) ? Math.max(0, record.lastPlayed) : 0,
      ...(typeof record.platform === 'string' ? { platform: record.platform } : {}),
      ...(Number.isSafeInteger(record.steamId) && record.steamId > 0 ? { steamId: record.steamId } : {}),
    }
  }
  return result
}

function getPlaytimeFilePath(): string {
  try {
    return path.join(app.getPath('userData'), 'playtime.json')
  } catch {
    return path.join(process.cwd(), 'playtime.json')
  }
}

export function loadPlaytimeDb(): PlaytimeDatabase {
  try {
    const filePath = getPlaytimeFilePath()
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(data)
      return validatePlaytimeDb(parsed)
    }
  } catch (err) {
    console.error('[PlaytimeService] Failed to read playtime.json:', err)
  }
  return {}
}

export function savePlaytimeDb(db: PlaytimeDatabase): boolean {
  try {
    const filePath = getPlaytimeFilePath()
    writeJsonAtomicSync(filePath, validatePlaytimeDb(db))
    return true
  } catch (err) {
    console.error('[PlaytimeService] Failed to write playtime.json:', err)
    return false
  }
}

function findExistingRecord(db: PlaytimeDatabase, normalizedName: string, explicitKey?: string, steamId?: number): GamePlaytimeRecord | undefined {
  const canonicalKey = explicitKey || (steamId ? `steam_${steamId}` : undefined)
  if (!canonicalKey) return db[normalizedName]
  if (db[canonicalKey]) return db[canonicalKey]
  const namespace = explicitKey ? /^roblox_(?:exp_)?\d+$/ : /^steam_\d+$/
  // Placeholder titles can be shared by different experiences. Their IDs retain ownership.
  const belongsToAnotherId = Object.entries(db).some(([key, record]) =>
    namespace.test(key) && key !== canonicalKey && normalize(record.name) === normalizedName,
  )
  return belongsToAnotherId ? undefined : db[normalizedName]
}

export function addPlaytimeRecord(gameIdOrName: string, name: string, minutes: number, steamId?: number): PlaytimeDatabase {
  const db = loadPlaytimeDb()
  if (!Number.isFinite(minutes) || minutes <= 0) return db
  const cleanName = name || gameIdOrName
  const normKey = normalize(cleanName)
  
  if (!normKey) return db

  const explicitKey = /^roblox_(?:exp_)?\d+$/.test(gameIdOrName) ? gameIdOrName.replace(/^roblox_(?:exp_)?/, 'roblox_exp_') : undefined
  const existing = findExistingRecord(db, normKey, explicitKey, steamId) || {
    name: cleanName,
    playTimeMinutes: 0,
    lastPlayed: Date.now(),
    steamId
  }

  existing.playTimeMinutes = Math.max(0, (existing.playTimeMinutes || 0) + minutes)
  existing.lastPlayed = Date.now()
  if (cleanName) existing.name = cleanName
  if (steamId) existing.steamId = steamId

  db[normKey] = existing
  if (steamId) {
    db[`steam_${steamId}`] = existing
  }

  // Preserve explicit Roblox experience place keys for fast lookup
  if (gameIdOrName && (gameIdOrName.startsWith('roblox_exp_') || gameIdOrName.startsWith('roblox_'))) {
    db[gameIdOrName] = existing
    const cleanId = gameIdOrName.replace(/^roblox_exp_|^roblox_/, '')
    if (cleanId) {
      db[`roblox_exp_${cleanId}`] = existing
    }
  }

  savePlaytimeDb(db)
  return db
}

export function setPlaytimeRecord(gameIdOrName: string, name: string, minutes: number, steamId?: number, lastPlayed?: number): PlaytimeDatabase {
  const db = loadPlaytimeDb()
  if (!Number.isFinite(minutes) || minutes < 0) return db
  const cleanName = name || gameIdOrName
  const normKey = normalize(cleanName)
  
  if (!normKey) return db

  const explicitKey = /^roblox_(?:exp_)?\d+$/.test(gameIdOrName) ? gameIdOrName.replace(/^roblox_(?:exp_)?/, 'roblox_exp_') : undefined
  const existing = findExistingRecord(db, normKey, explicitKey, steamId) || {
    name: cleanName,
    playTimeMinutes: 0,
    lastPlayed: lastPlayed || Date.now(),
    steamId
  }

  existing.playTimeMinutes = minutes
  if (Number.isFinite(lastPlayed) && lastPlayed! >= 0) {
    existing.lastPlayed = lastPlayed!
  } else {
    existing.lastPlayed = Date.now()
  }
  if (cleanName) existing.name = cleanName
  if (steamId) existing.steamId = steamId

  db[normKey] = existing
  if (steamId) {
    db[`steam_${steamId}`] = existing
  }

  // Preserve explicit Roblox experience place keys for fast lookup
  if (gameIdOrName && (gameIdOrName.startsWith('roblox_exp_') || gameIdOrName.startsWith('roblox_'))) {
    db[gameIdOrName] = existing
    const cleanId = gameIdOrName.replace(/^roblox_exp_|^roblox_/, '')
    if (cleanId) {
      db[`roblox_exp_${cleanId}`] = existing
    }
  }

  savePlaytimeDb(db)
  return db
}

export interface RecentGameItem {
  name: string
  displayName: string
  platform: 'Steam' | 'Roblox' | 'Epic Games' | 'Rockstar' | 'Custom' | 'Game'
  lastPlayed: number
  playTimeMinutes: number
  steamId?: number
  placeId?: string
  launchUrl?: string
}

const KNOWN_STEAM_TITLES: Record<string, number> = {
  'steamvr': 250820,
  'warthunder': 236390,
  'phasmophobia': 739630,
  'deadbydaylight': 381210,
  'shiftatmidnight': 3722330,
  'howtofish': 2933750,
  'googleearthvr': 348250,
  'wewerehere': 582500,
  'playgtav': 271590,
  'rocketleague': 252950,
  'terraria': 105600,
  'wallpaperengine': 431960,
  'counterstrike2': 730,
  'garrysmod': 4000
}

const cleanAndNorm = (str?: string): string => {
  if (!str) return ''
  return str
    .replace(/\[\s*[^\]]*\]/g, '') // remove bracket tags like [UPD], [X2], [beta]
    .replace(/[\uFFFD\uD800-\uDFFF]/g, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function getDeduplicatedRecentGames(limit: number = 6): RecentGameItem[] {
  const db = loadPlaytimeDb()
  const map = new Map<string, RecentGameItem>()

  // 1. Identify all Roblox entries and track aggregate Roblox playtime/lastPlayed
  const robloxNormNames = new Set<string>()
  let maxRobloxLastPlayed = 0
  const robloxExperiences = new Map<string, number>()
  const robloxTotal = Math.max(db.roblox?.playTimeMinutes || 0, db.steam_999001?.playTimeMinutes || 0)

  for (const [key, val] of Object.entries(db)) {
    if (!val) continue
    const isRoblox = key.startsWith('roblox') ||
                     key.startsWith('roblox_exp_') ||
                     (val.name && val.name.toLowerCase().includes('roblox')) ||
                     val.steamId === 999001
    if (isRoblox) {
      if (val.name) {
        robloxNormNames.add(cleanAndNorm(val.name))
        robloxNormNames.add(normalize(val.name))
      }
      maxRobloxLastPlayed = Math.max(maxRobloxLastPlayed, val.lastPlayed || 0)
      const place = key.match(/^roblox_(?:exp_)?(\d+)$/)?.[1]
      if (place) robloxExperiences.set(place, Math.max(robloxExperiences.get(place) || 0, val.playTimeMinutes || 0))
    }
  }

  // Load steam app cache if present to identify Steam games by title
  let steamCacheMap: Map<string, number> | null = null
  try {
    const cachePath = path.join(app.getPath('userData'), 'steam_app_cache.json')
    if (fs.existsSync(cachePath)) {
      const raw = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
      steamCacheMap = new Map<string, number>()
      for (const [appId, val] of Object.entries(raw)) {
        if (val && typeof val === 'string') {
          steamCacheMap.set(cleanAndNorm(val), Number(appId))
        }
      }
    }
  } catch {}

  for (const [key, val] of Object.entries(db)) {
    if (!val || !val.name) continue
    const rawName = String(val.name).trim()

    // Clean broken unicode/emojis and bracket noise (e.g. [UPD], [🧲], etc.)
    let cleanName = rawName.replace(/[\uFFFD\uD800-\uDFFF]/g, '').trim()
    cleanName = cleanName.replace(/^\[[^a-zA-Z0-9]*\]\s*/, '').trim()
    cleanName = cleanName.replace(/^\[\]\s*/, '').trim()
    if (!cleanName) cleanName = rawName

    const normKey = cleanAndNorm(cleanName)
    if (!normKey) continue

    // COLLAPSE ALL ROBLOX EXPERIENCES: Skip individual Roblox games!
    if (robloxNormNames.has(normKey) || key.startsWith('roblox') || normKey.includes('roblox')) {
      continue
    }

    let platform: RecentGameItem['platform'] = 'Game'
    let steamId: number | undefined = val.steamId

    if (steamId || key.startsWith('steam_')) {
      platform = 'Steam'
      if (!steamId && key.startsWith('steam_')) {
        steamId = Number(key.replace('steam_', '')) || undefined
      }
    } else if (steamCacheMap?.has(normKey)) {
      platform = 'Steam'
      steamId = steamCacheMap.get(normKey)
    } else if (KNOWN_STEAM_TITLES[normKey]) {
      platform = 'Steam'
      steamId = KNOWN_STEAM_TITLES[normKey]
    } else if (val.platform) {
      if (val.platform.toLowerCase().includes('epic')) platform = 'Epic Games'
      else if (val.platform.toLowerCase().includes('rockstar')) platform = 'Rockstar'
      else if (val.platform.toLowerCase().includes('steam')) platform = 'Steam'
      else platform = 'Custom'
    }

    const existing = map.get(normKey)
    if (!existing) {
      map.set(normKey, {
        name: rawName,
        displayName: cleanName,
        platform,
        steamId,
        lastPlayed: val.lastPlayed || 0,
        playTimeMinutes: val.playTimeMinutes || 0
      })
    } else {
      existing.lastPlayed = Math.max(existing.lastPlayed, val.lastPlayed || 0)
      existing.playTimeMinutes = Math.max(existing.playTimeMinutes, val.playTimeMinutes || 0)
      if (steamId) existing.steamId = steamId
      if (cleanName && cleanName.length > existing.displayName.length && !cleanName.includes('?')) {
        existing.displayName = cleanName
      }
    }
  }

  const result = Array.from(map.values()).filter(g => g.lastPlayed > 0)

  // Add the single consolidated Roblox entry if the user has played Roblox
  if (maxRobloxLastPlayed > 0) {
    result.push({
      name: 'Roblox',
      displayName: 'Roblox',
      platform: 'Roblox',
      lastPlayed: maxRobloxLastPlayed,
      playTimeMinutes: Math.max(robloxTotal, [...robloxExperiences.values()].reduce((sum, minutes) => sum + minutes, 0)),
      launchUrl: 'roblox://'
    })
  }

  return result
    .sort((a, b) => b.lastPlayed - a.lastPlayed)
    .slice(0, limit)
}
