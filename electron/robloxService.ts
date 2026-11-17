import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { BrowserWindow, app } from 'electron'
import { createRobloxCodesService } from './robloxCodesService'
import { cleanRobloxName, sameRobloxGame, robloxSlug } from '../src/services/robloxGames'
import type { RobloxGameCodesResult } from '../src/types/robloxCodes'
import { ipcMain } from './ipcSecurity'
import { addPlaytimeRecord, setPlaytimeRecord, loadPlaytimeDb } from './playtimeService'
import { isRobloxRunning } from './processMonitor'

export interface RobloxExperience {
  placeId: string
  universeId: string
  name: string
  iconUrl?: string
  creatorName?: string
}

export interface RobloxTrackedExperience {
  placeId: string
  universeId?: string
  name: string
  minutes: number
  lastPlayed: number
  iconUrl?: string
}

export type { RobloxCodeItem, RobloxGameCodesResult } from '../src/types/robloxCodes'

let isTracking = false
let pollInterval: NodeJS.Timeout | null = null
let currentExperience: RobloxExperience | null = null
const changeListeners: Array<(info: RobloxExperience | null) => void> = []
let registeredWindowsGetter: (() => BrowserWindow[]) | null = null
let lastDiscordHeartbeat = 0

let activeExperienceSession: {
  placeId: string
  universeId?: string
  name: string
  startTime: number
  lastMinuteTick: number
} | null = null

// Caches for API results
const experienceCache = new Map<string, RobloxExperience>()

// ─── Instant Resolution Map for Top Curated Experiences ─────────────────────
const KNOWN_ROBLOX_GAMES_BY_PLACE: Record<string, { name: string; universeId?: string }> = {
  '107778070777162': { name: 'Steal An Egg', universeId: '10563114921' },
  '4924922222': { name: 'Brookhaven RP', universeId: '1686885941' },
  '2753915549': { name: 'Blox Fruits', universeId: '994732206' },
  '142823291': { name: 'Murder Mystery 2', universeId: '66654135' },
  '920587237': { name: 'Adopt Me!', universeId: '383310974' },
  '17625359962': { name: 'Rivals', universeId: '6035872082' },
  '16732694052': { name: 'Fisch', universeId: '5750914919' },
  '8737899170': { name: 'Pet Simulator 99', universeId: '3317771874' },
  '15101393044': { name: 'Dress to Impress', universeId: '5203828273' },
  '6516141723': { name: 'Doors', universeId: '2440500124' },
  '189707': { name: 'Natural Disaster Survival', universeId: '1628178' },
  '155615604': { name: 'Prison Life', universeId: '66810237' },
  '606849621': { name: 'Jailbreak', universeId: '231652981' },
  '13772394625': { name: 'Blade Ball', universeId: '4777817887' },
  '3260590327': { name: 'Tower Defense Simulator', universeId: '1176784616' },
  '4520749081': { name: 'King Legacy', universeId: '1451439645' },
  '13775256536': { name: 'Toilet Tower Defense', universeId: '4778845442' },
  '2788229376': { name: 'Da Hood', universeId: '1008451066' },
}

const KNOWN_ROBLOX_GAMES_BY_UNIVERSE: Record<string, string> = {
  '10563114921': 'Steal An Egg',
  '1686885941': 'Brookhaven RP',
  '994732206': 'Blox Fruits',
  '66654135': 'Murder Mystery 2',
  '383310974': 'Adopt Me!',
  '6035872082': 'Rivals',
  '5750914919': 'Fisch',
  '3317771874': 'Pet Simulator 99',
  '5203828273': 'Dress to Impress',
  '2440500124': 'Doors',
  '1628178': 'Natural Disaster Survival',
  '66810237': 'Prison Life',
  '231652981': 'Jailbreak',
  '4777817887': 'Blade Ball',
  '1176784616': 'Tower Defense Simulator',
  '1451439645': 'King Legacy',
  '4778845442': 'Toilet Tower Defense',
  '1008451066': 'Da Hood',
}

let consecutiveMisses = 0

function getAllRobloxLogDirs(): string[] {
  const dirs: string[] = []
  const candidates = [
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Roblox', 'logs') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Roblox', 'logs') : null,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Bloxstrap', 'logs') : null,
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Bloxstrap', 'logs') : null,
    process.env.TEMP ? path.join(process.env.TEMP, 'Roblox', 'logs') : null,
    process.env.TEMP ? path.join(process.env.TEMP, 'Bloxstrap', 'logs') : null,
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c) && !dirs.includes(c)) {
      dirs.push(c)
    }
  }
  return dirs
}

export function findLatestPlayerLogFile(): string | null {
  const dirs = getAllRobloxLogDirs()
  if (dirs.length === 0) return null

  const allFiles: Array<{ fullPath: string; mtime: number }> = []

  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(dir)
      for (const f of files) {
        // Player log files (ignore crashes and installer logs)
        if (f.includes('Player') && f.endsWith('.log') && !f.toLowerCase().includes('installer') && !f.toLowerCase().includes('crash')) {
          const fullPath = path.join(dir, f)
          try {
            const stats = fs.statSync(fullPath)
            allFiles.push({ fullPath, mtime: stats.mtimeMs })
          } catch {}
        }
      }
    } catch {}
  }

  allFiles.sort((a, b) => b.mtime - a.mtime)
  return allFiles.length > 0 ? allFiles[0].fullPath : null
}

function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'EclipseLauncher/1.0',
          'Accept': 'application/json',
          ...headers
        },
        timeout: 4500
      }, (res) => {
        if (res.statusCode !== 200) {
          resolve(null)
          return
        }
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(null)
          }
        })
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    } catch {
      resolve(null)
    }
  })
}

export async function fetchRobloxExperienceDetails(placeId: string, universeIdHint?: string): Promise<RobloxExperience | null> {
  const cacheKey = universeIdHint || placeId
  if (experienceCache.has(cacheKey)) {
    const cached = experienceCache.get(cacheKey)!
    if (cached.name && cached.name !== 'Roblox Experience') {
      return cached
    }
  }

  let resolvedName: string | undefined = undefined
  let universeId: string | undefined = universeIdHint
  let iconUrl: string | undefined = undefined

  // 1. Check curated instant lookup
  if (KNOWN_ROBLOX_GAMES_BY_PLACE[placeId]) {
    resolvedName = KNOWN_ROBLOX_GAMES_BY_PLACE[placeId].name
    universeId = universeId || KNOWN_ROBLOX_GAMES_BY_PLACE[placeId].universeId
  }
  if (!resolvedName && universeId && KNOWN_ROBLOX_GAMES_BY_UNIVERSE[universeId]) {
    resolvedName = KNOWN_ROBLOX_GAMES_BY_UNIVERSE[universeId]
  }

  // 2. Resolve universeId from placeId if still missing
  if (!universeId) {
    const uRes = await fetchJson<{ universeId?: number }>(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`)
    if (uRes?.universeId) {
      universeId = String(uRes.universeId)
    }
  }

  if (!resolvedName && universeId && KNOWN_ROBLOX_GAMES_BY_UNIVERSE[universeId]) {
    resolvedName = KNOWN_ROBLOX_GAMES_BY_UNIVERSE[universeId]
  }

  // 3. Fetch details & icon in parallel from Roblox public API
  let creatorName: string | undefined = undefined

  if (universeId) {
    const [detailsRes, iconsRes] = await Promise.all([
      fetchJson<{ data?: Array<{ name: string; creator?: { name: string } }> }>(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
      fetchJson<{ data?: Array<{ imageUrl?: string }> }>(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`)
    ])

    if (detailsRes?.data?.[0]?.name) {
      resolvedName = detailsRes.data[0].name
    }
    creatorName = detailsRes?.data?.[0]?.creator?.name
    iconUrl = iconsRes?.data?.[0]?.imageUrl
  }

  // 4. Fallback to place gameicon if universe icon is missing
  if (!iconUrl) {
    const placeIconRes = await fetchJson<{ data?: Array<{ imageUrl?: string }> }>(`https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=512x512&format=Png&isCircular=false`)
    iconUrl = placeIconRes?.data?.[0]?.imageUrl
  }

  const finalName = resolvedName || 'Roblox Experience'
  const exp: RobloxExperience = {
    placeId,
    universeId: universeId || '',
    name: finalName,
    iconUrl,
    creatorName
  }

  if (finalName !== 'Roblox Experience') {
    experienceCache.set(cacheKey, exp)
    if (placeId) experienceCache.set(placeId, exp)
    if (universeId) experienceCache.set(universeId, exp)
  }

  return exp
}

function parseActiveGameFromContent(content: string): { placeId: string; universeId?: string } | null {
  if (!content) return null
  const lines = content.split(/\r?\n/)
  let active: { placeId: string; universeId?: string } | null = null
  let currentUniverseId: string | undefined = undefined
  let lastJoinIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 1. Teleport event (most common in modern Roblox sub-places & transitions)
    const teleportMatch = line.match(/(?:doTeleport|teleport).*?["%3a:=]+placeid["%3a:=]+([0-9]+)/i)
    if (teleportMatch && teleportMatch[1]) {
      const placeId = teleportMatch[1]
      const universeMatch = line.match(/["%3a:=]+universeid["%3a:=]+([0-9]+)/i)
      if (universeMatch && universeMatch[1]) {
        currentUniverseId = universeMatch[1]
      }
      active = { placeId, universeId: currentUniverseId }
      lastJoinIdx = i
      continue
    }

    // 2. Report game_join_loadtime or placeid/universeid pair
    const matchPair = line.match(/placeid:([0-9]+).*?universeid:([0-9]+)/i) ||
                      line.match(/universeid:([0-9]+).*?placeid:([0-9]+)/i)
    if (matchPair) {
      const placeId = line.match(/placeid:([0-9]+)/i)?.[1]
      const universeId = line.match(/universeid:([0-9]+)/i)?.[1]
      if (placeId) {
        if (universeId) currentUniverseId = universeId
        active = { placeId, universeId: currentUniverseId }
        lastJoinIdx = i
        continue
      }
    }

    // 3. Joining game 'guid' place 1234567
    const matchOutput = line.match(/Joining game '[^']+' place ([0-9]+)/i)
    if (matchOutput && matchOutput[1]) {
      active = { placeId: matchOutput[1], universeId: currentUniverseId }
      lastJoinIdx = i
      continue
    }

    // 4. Game join succeeded
    const matchJoinUtil = line.match(/Game join succeeded.*?placeId:\s*([0-9]+)/i)
    if (matchJoinUtil && matchJoinUtil[1]) {
      active = { placeId: matchJoinUtil[1], universeId: currentUniverseId }
      lastJoinIdx = i
      continue
    }

    // 5. Http trace filter for places API
    const matchHttpTrace = line.match(/\/places\/([0-9]+)\//i)
    if (matchHttpTrace && matchHttpTrace[1] && !active) {
      active = { placeId: matchHttpTrace[1], universeId: currentUniverseId }
      lastJoinIdx = i
      continue
    }

    // Explicit TRUE full game exits back to desktop or app shell:
    if (
      line.includes('finished destroying luaApp') ||
      line.includes('destroyLuaApp: (stage:UGCGame)... finished') ||
      line.includes('setStage: (stage:None)') ||
      line.includes('setStage: (stage:Native)') ||
      line.includes('Platform handler was destroyed') ||
      line.includes('AppPlatformQoSEmergencyHandler was destroyed')
    ) {
      if (i > lastJoinIdx) {
        active = null
      }
    }
  }

  return active
}

function notifyListeners(exp: RobloxExperience | null) {
  for (const listener of changeListeners) {
    try {
      listener(exp)
    } catch (_) {}
  }
}

export function notifyPlaytimeUpdated() {
  if (registeredWindowsGetter) {
    const wins = registeredWindowsGetter()
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('roblox:playtime-updated')
      }
    }
  }
}

/**
 * Verifies whether Roblox is genuinely active on the system right now.
 * Relies strictly on processMonitor's verified active-window state.
 * Background or windowless zombie Roblox processes are never considered active.
 */
export function isRobloxActive(): boolean {
  try {
    if (!isRobloxRunning()) return false
  } catch {
    return false
  }
  return true
}

let experienceSync: Promise<RobloxExperience | null> | null = null
let trackingGeneration = 0

export function syncRobloxExperience(): Promise<RobloxExperience | null> {
  if (experienceSync) return experienceSync
  const promise = performExperienceSync().finally(() => {
    if (experienceSync === promise) experienceSync = null
  })
  experienceSync = promise
  return promise
}

async function performExperienceSync(): Promise<RobloxExperience | null> {
  const generation = trackingGeneration
  // If Roblox is not actively running, terminate active session and notify null
  if (!isRobloxActive()) {
    consecutiveMisses = 0
    if (activeExperienceSession) {
      const dur = Math.max(0, (Date.now() - activeExperienceSession.lastMinuteTick) / 60000)
      if (dur > 0) {
        addPlaytimeRecord(`roblox_exp_${activeExperienceSession.placeId}`, activeExperienceSession.name, dur)
        notifyPlaytimeUpdated()
      }
      activeExperienceSession = null
    }
    if (currentExperience !== null) {
      currentExperience = null
      notifyListeners(null)
    }
    return null
  }

  const latestLog = findLatestPlayerLogFile()
  if (!latestLog) {
    return currentExperience
  }

  try {
    const content = fs.readFileSync(latestLog, 'utf-8')
    const active = parseActiveGameFromContent(content)

    if (active && active.placeId) {
      consecutiveMisses = 0
      const isNewGame = !currentExperience || currentExperience.placeId !== active.placeId

      if (isNewGame) {
        // Flush previous session if switching games
        if (activeExperienceSession && activeExperienceSession.placeId !== active.placeId) {
          flushRobloxExperiencePlaytime()
        }

        const exp = await fetchRobloxExperienceDetails(active.placeId, active.universeId)
        if (generation !== trackingGeneration || !isRobloxActive()) return currentExperience
        currentExperience = exp
        activeExperienceSession = {
          placeId: active.placeId,
          universeId: active.universeId || exp?.universeId,
          name: exp?.name || 'Roblox Experience',
          startTime: Date.now(),
          lastMinuteTick: Date.now()
        }
        notifyListeners(exp)
        return exp
      } else {
        // Already active in current game: periodic minute tick
        if (activeExperienceSession) {
          const now = Date.now()
          const deltaMins = Math.floor((now - activeExperienceSession.lastMinuteTick) / 60000)
          if (deltaMins >= 1) {
            addPlaytimeRecord(`roblox_exp_${activeExperienceSession.placeId}`, activeExperienceSession.name, deltaMins)
            activeExperienceSession.lastMinuteTick += deltaMins * 60000
            notifyPlaytimeUpdated()
          }
        }
        // Periodic Discord RPC heartbeat every 30s to keep presence fresh and active
        const now = Date.now()
        if (now - lastDiscordHeartbeat > 30000 && currentExperience) {
          lastDiscordHeartbeat = now
          notifyListeners(currentExperience)
        }
      }
      return currentExperience
    } else {
      // Debounce menu / leave detection to prevent micro-drops during area teleports
      consecutiveMisses++
      if (consecutiveMisses < 10) {
        return currentExperience
      }

      // 4 consecutive misses: player confirmed left game to Roblox menu
      if (activeExperienceSession) {
        const delta = Math.max(0, (Date.now() - activeExperienceSession.lastMinuteTick) / 60000)
        if (delta > 0) {
          addPlaytimeRecord(`roblox_exp_${activeExperienceSession.placeId}`, activeExperienceSession.name, delta)
          notifyPlaytimeUpdated()
        }
        activeExperienceSession = null
      }
      if (currentExperience !== null) {
        currentExperience = null
        notifyListeners(null)
      }
      return null
    }
  } catch {
    return currentExperience
  }
}

export function flushRobloxExperiencePlaytime(): void {
  if (activeExperienceSession) {
    const delta = Math.max(0, (Date.now() - activeExperienceSession.lastMinuteTick) / 60000)
    addPlaytimeRecord(`roblox_exp_${activeExperienceSession.placeId}`, activeExperienceSession.name, delta)
    notifyPlaytimeUpdated()
    activeExperienceSession = null
  }
}

export function startRobloxTracker(onChange?: (info: RobloxExperience | null) => void) {
  if (onChange && !changeListeners.includes(onChange)) {
    changeListeners.push(onChange)
    // Immediately invoke callback with cached experience if already resolved
    if (currentExperience) {
      try {
        onChange(currentExperience)
      } catch (_) {}
    }
  }

  if (isTracking) {
    // If already tracking, trigger a sync and notify the new listener
    syncRobloxExperience().then(exp => {
      if (onChange && exp && changeListeners.includes(onChange)) {
        try {
          onChange(exp)
        } catch (_) {}
      }
    }).catch(() => {})
    return
  }

  isTracking = true
  currentExperience = null

  // Immediate sync
  syncRobloxExperience().catch(() => {})

  // Poll log file every 1000ms
  pollInterval = setInterval(() => {
    syncRobloxExperience().catch(() => {})
  }, 1000)
}

export function stopRobloxTracker(onChange?: (info: RobloxExperience | null) => void) {
  if (onChange) {
    const idx = changeListeners.indexOf(onChange)
    if (idx !== -1) changeListeners.splice(idx, 1)
  } else {
    changeListeners.length = 0
  }
  if (onChange && changeListeners.length > 0) return
  trackingGeneration++

  // Unconditionally stop polling and reset experience when tracker stops
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  isTracking = false
  flushRobloxExperiencePlaytime()
  currentExperience = null
  notifyListeners(null)
}

export function getCurrentRobloxExperience(): RobloxExperience | null {
  return currentExperience
}

/**
 * Parses historical Roblox player log files on user's disk and backfills playtime
 */
export async function backfillRobloxExperiencesFromLogs(): Promise<RobloxTrackedExperience[]> {
  const dirs = getAllRobloxLogDirs()
  if (dirs.length === 0) return []

  try {
    const allFiles: Array<{ fullPath: string; mtime: number }> = []
    for (const dir of dirs) {
      try {
        const files = fs.readdirSync(dir)
          .filter(f => f.includes('Player') && f.endsWith('.log') && !f.toLowerCase().includes('installer') && !f.toLowerCase().includes('crash'))
          .map(f => {
            const fullPath = path.join(dir, f)
            try {
              return { fullPath, mtime: fs.statSync(fullPath).mtimeMs }
            } catch {
              return { fullPath, mtime: 0 }
            }
          })
        allFiles.push(...files)
      } catch {}
    }

    allFiles.sort((a, b) => b.mtime - a.mtime)

    const expMap: Record<string, { placeId: string; universeId?: string; minutes: number; lastPlayed: number }> = {}

    for (const file of allFiles.slice(0, 40)) {
      try {
        const content = fs.readFileSync(file.fullPath, 'utf-8')
        const lines = content.split(/\r?\n/)
        let curSession: { placeId: string; universeId?: string; startTime: number; lastTime: number } | null = null

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          const matchJoin = line.match(/placeid:([0-9]+).*?universeid:([0-9]+)/i) || 
                            line.match(/universeid:([0-9]+).*?placeid:([0-9]+)/i)
          if (matchJoin) {
            const placeId = line.match(/placeid:([0-9]+)/i)?.[1]
            const universeId = line.match(/universeid:([0-9]+)/i)?.[1]
            const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/)
            const startTime = timeMatch ? new Date(timeMatch[1]).getTime() : file.mtime
            if (placeId) {
              curSession = { placeId, universeId, startTime, lastTime: startTime }
            }
          }

          if (curSession) {
            const timeMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)/)
            if (timeMatch) {
              curSession.lastTime = new Date(timeMatch[1]).getTime()
            }
            if (
              line.includes('destroyLuaApp: (stage:UGCGame)') ||
              line.includes('sendAnalyticsBeforeLeave') ||
              line.includes('Disconnected - stop() called') ||
              line.includes('Disconnected from game')
            ) {
              const durMins = Math.max(1, Math.round((curSession.lastTime - curSession.startTime) / 60000))
              if (!expMap[curSession.placeId]) {
                expMap[curSession.placeId] = { placeId: curSession.placeId, universeId: curSession.universeId, minutes: 0, lastPlayed: curSession.lastTime }
              }
              expMap[curSession.placeId].minutes += durMins
              expMap[curSession.placeId].lastPlayed = Math.max(expMap[curSession.placeId].lastPlayed, curSession.lastTime)
              if (curSession.universeId) expMap[curSession.placeId].universeId = curSession.universeId
              curSession = null
            }
          }
        }

        if (curSession) {
          const durMins = Math.max(1, Math.round((curSession.lastTime - curSession.startTime) / 60000))
          if (!expMap[curSession.placeId]) {
            expMap[curSession.placeId] = { placeId: curSession.placeId, universeId: curSession.universeId, minutes: 0, lastPlayed: curSession.lastTime }
          }
          expMap[curSession.placeId].minutes += durMins
          expMap[curSession.placeId].lastPlayed = Math.max(expMap[curSession.placeId].lastPlayed, curSession.lastTime)
          if (curSession.universeId) expMap[curSession.placeId].universeId = curSession.universeId
        }
      } catch (_) {}
    }

    // Resolve titles and thumbnails in batches of 20
    const uniqueUniverses = Array.from(new Set(Object.values(expMap).map(e => e.universeId).filter(Boolean))) as string[]
    const nameMap: Record<string, string> = {}
    const iconMap: Record<string, string> = {}

    for (let i = 0; i < uniqueUniverses.length; i += 20) {
      const batch = uniqueUniverses.slice(i, i + 20)
      const [gamesRes, iconsRes] = await Promise.all([
        fetchJson<{ data?: Array<{ id: number; name: string; rootPlaceId?: number }> }>(`https://games.roblox.com/v1/games?universeIds=${batch.join(',')}`),
        fetchJson<{ data?: Array<{ targetId: number; imageUrl?: string }> }>(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${batch.join(',')}&size=150x150&format=Png&isCircular=false`)
      ])
      if (gamesRes?.data) {
        for (const g of gamesRes.data) {
          nameMap[String(g.id)] = g.name
          if (g.rootPlaceId) {
            nameMap[String(g.rootPlaceId)] = g.name
          }
        }
      }
      if (iconsRes?.data) {
        for (const ic of iconsRes.data) {
          if (ic.targetId && ic.imageUrl) {
            iconMap[String(ic.targetId)] = ic.imageUrl
          }
        }
      }
    }

    const results: RobloxTrackedExperience[] = []
    for (const [placeId, info] of Object.entries(expMap)) {
      const resolvedName = (info.universeId && nameMap[info.universeId]) || nameMap[placeId] || `Roblox Experience`
      const resolvedIcon = (info.universeId && iconMap[info.universeId]) || iconMap[placeId] || ''
      
      // Explicitly SET the calculated baseline minutes (never additively multiply)
      setPlaytimeRecord(`roblox_exp_${placeId}`, resolvedName, info.minutes, undefined, info.lastPlayed)

      results.push({
        placeId,
        universeId: info.universeId,
        name: resolvedName,
        minutes: info.minutes,
        lastPlayed: info.lastPlayed,
        iconUrl: resolvedIcon
      })
    }

    return results.sort((a, b) => b.minutes - a.minutes)
  } catch (err) {
    console.error('[RobloxTracker] Error during log backfill:', err)
    return []
  }
}

/**
 * Returns all tracked Roblox experiences combining disk playtime and live sessions
 */
export async function getRobloxExperiencePlaytime(): Promise<RobloxTrackedExperience[]> {
  const diskDb = loadPlaytimeDb()
  const expItems: Record<string, { placeId: string; name: string; minutes: number; lastPlayed: number }> = {}

  for (const [key, val] of Object.entries(diskDb)) {
    if (key.startsWith('roblox_exp_') || key.startsWith('roblox_')) {
      const placeId = key.replace(/^roblox_exp_|^roblox_/, '')
      if (placeId && !isNaN(Number(placeId)) && Number(placeId) > 1000) {
        if (!expItems[placeId] || (val.playTimeMinutes || 0) > expItems[placeId].minutes) {
          expItems[placeId] = {
            placeId,
            name: val.name || 'Roblox Experience',
            minutes: val.playTimeMinutes || 0,
            lastPlayed: val.lastPlayed || 0
          }
        }
      }
    }
  }

  // Only add unpersisted live delta (minutes elapsed since last disk tick) if a game is actively playing
  if (activeExperienceSession && activeExperienceSession.placeId) {
    const pId = activeExperienceSession.placeId
    const unpersistedDelta = Math.max(0, Math.floor((Date.now() - activeExperienceSession.lastMinuteTick) / 60000))
    if (!expItems[pId]) {
      const liveElapsed = Math.max(1, Math.round((Date.now() - activeExperienceSession.startTime) / 60000))
      expItems[pId] = {
        placeId: pId,
        name: activeExperienceSession.name || 'Roblox Experience',
        minutes: liveElapsed,
        lastPlayed: Date.now()
      }
    } else if (unpersistedDelta > 0) {
      expItems[pId].minutes = expItems[pId].minutes + unpersistedDelta
      expItems[pId].lastPlayed = Date.now()
    }
  }

  let list = Object.values(expItems).filter(item => item.minutes > 0)
  if (list.length === 0) {
    list = await backfillRobloxExperiencesFromLogs()
    return list
  }

  // Fetch icons for placeIds in batch
  const placeIds = list.map(x => x.placeId)
  if (placeIds.length > 0) {
    try {
      const url = `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeIds.slice(0, 50).join(',')}&returnPolicy=PlaceHolder&size=150x150&format=Png&isCircular=false`
      const thumbRes = await fetchJson<{ data?: Array<{ targetId: number; imageUrl?: string }> }>(url)
      const iconMap: Record<string, string> = {}
      if (thumbRes?.data) {
        for (const t of thumbRes.data) {
          if (t.targetId && t.imageUrl) {
            iconMap[String(t.targetId)] = t.imageUrl
          }
        }
      }
      return list.map(item => ({
        ...item,
        iconUrl: iconMap[item.placeId] || ''
      })).sort((a, b) => b.minutes - a.minutes)
    } catch (_) {}
  }

  return list.sort((a, b) => b.minutes - a.minutes)
}

export { decodeHtml, isValidCode, isValidReward, stripUnwantedHtml, parseCodesFromTitle, parseCodesFromHtmlOrText } from './robloxCodesParser'
export const cleanGameName = cleanRobloxName
export const isSameGame = sameRobloxGame
export const getCandidateSlugs = (name: string) => [robloxSlug(name)].filter(Boolean)

let codesService: ReturnType<typeof createRobloxCodesService> | undefined
function getCodesService() {
  return codesService ??= createRobloxCodesService({
    cacheFile: path.join(app.getPath('userData'), 'roblox-codes-v3.json'),
    onUpdate: data => {
      for (const win of registeredWindowsGetter?.() || []) {
        if (!win.isDestroyed()) win.webContents.send('roblox:codes-updated', data)
      }
    },
  })
}
export async function getRobloxGameCodes(gameName: string, placeId?: string, universeId?: string, forceRefresh = false): Promise<RobloxGameCodesResult> {
  const current = currentExperience && sameRobloxGame(gameName, currentExperience.name) ? currentExperience : null
  return getCodesService().getCodes(gameName, placeId || current?.placeId, universeId || current?.universeId, forceRefresh)
}

/**
 * Initializes IPC handlers and log-tracking for Roblox
 */
export function initRobloxIPC(getWindows: () => BrowserWindow[]) {
  registeredWindowsGetter = getWindows

  // Start tracker in background so renderer can get instant live updates
  startRobloxTracker((exp) => {
    const wins = getWindows()
    for (const win of wins) {
      if (win && !win.isDestroyed()) {
        win.webContents.send('roblox:experience-changed', exp)
      }
    }
  })

  // 1. Get active experience
  ipcMain.handle('roblox:get-active-experience', async () => {
    if (!isRobloxActive()) {
      currentExperience = null
      return null
    }
    let exp = getCurrentRobloxExperience()
    if (!exp) {
      exp = await syncRobloxExperience()
    }
    return exp
  })

  // 2. Fetch codes for a game
  ipcMain.handle('roblox:search-code-games', async (_event, query: string) => getCodesService().searchGames(query))
  ipcMain.handle('roblox:get-codes', async (_event, gameName: string, placeId?: string, universeId?: string, forceRefresh?: boolean) => {
    return await getRobloxGameCodes(gameName, placeId, universeId, forceRefresh)
  })

  // 3. Force refresh of active experience
  ipcMain.handle('roblox:refresh-experience', async () => {
    if (!isRobloxActive()) {
      currentExperience = null
      notifyListeners(null)
      return null
    }
    const exp = await syncRobloxExperience()
    return exp
  })

  // 4. Get all tracked Roblox experiences with playtime, icons and stats
  ipcMain.handle('roblox:get-experience-playtime', async () => {
    return await getRobloxExperiencePlaytime()
  })

  // 5. Force sync / backfill from Roblox player logs
  ipcMain.handle('roblox:sync-playtime', async () => {
    const results = await backfillRobloxExperiencesFromLogs()
    notifyPlaytimeUpdated()
    return results
  })

  // 6. Background historical backfill from player logs
  setTimeout(() => {
    backfillRobloxExperiencesFromLogs()
      .then(() => notifyPlaytimeUpdated())
      .catch(() => {})
  }, 1000)
}


