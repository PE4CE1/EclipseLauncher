import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'

export interface RobloxExperience {
  placeId: string
  universeId: string
  name: string
  iconUrl?: string
  creatorName?: string
}

let isTracking = false
let pollInterval: NodeJS.Timeout | null = null
let activeLogFilePath: string | null = null
let lastReadOffset = 0
let currentExperience: RobloxExperience | null = null
let onExperienceChangeCallback: ((info: RobloxExperience | null) => void) | null = null

// Cache API results to avoid repeated network calls
const experienceCache = new Map<string, RobloxExperience>()

function getRobloxLogsDir(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (localAppData) {
    const p = path.join(localAppData, 'Roblox', 'logs')
    if (fs.existsSync(p)) return p
  }
  const tempDir = process.env.TEMP
  if (tempDir) {
    const p = path.join(tempDir, 'Roblox', 'logs')
    if (fs.existsSync(p)) return p
  }
  return null
}

export function findLatestPlayerLogFile(): string | null {
  const dir = getRobloxLogsDir()
  if (!dir || !fs.existsSync(dir)) return null

  try {
    const files = fs.readdirSync(dir)
    const logFiles = files
      .filter(f => f.includes('Player') && f.endsWith('.log'))
      .map(f => {
        const fullPath = path.join(dir, f)
        try {
          const stats = fs.statSync(fullPath)
          return { fullPath, mtime: stats.mtimeMs }
        } catch {
          return { fullPath, mtime: 0 }
        }
      })
      .sort((a, b) => b.mtime - a.mtime)

    return logFiles.length > 0 ? logFiles[0].fullPath : null
  } catch {
    return null
  }
}

function fetchJson<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { timeout: 3500 }, (res) => {
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
    return experienceCache.get(cacheKey)!
  }

  let universeId = universeIdHint

  // 1. Resolve universeId from placeId if not provided
  if (!universeId) {
    const uRes = await fetchJson<{ universeId?: number }>(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`)
    if (uRes?.universeId) {
      universeId = String(uRes.universeId)
    }
  }

  if (!universeId) {
    const fallback: RobloxExperience = { placeId, universeId: '', name: 'Roblox Experience' }
    experienceCache.set(cacheKey, fallback)
    return fallback
  }

  // 2. Fetch game details and icon thumbnail in parallel
  const [detailsRes, iconsRes] = await Promise.all([
    fetchJson<{ data?: Array<{ name: string; creator?: { name: string } }> }>(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
    fetchJson<{ data?: Array<{ imageUrl?: string }> }>(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${universeId}&size=512x512&format=Png&isCircular=false`)
  ])

  const name = detailsRes?.data?.[0]?.name || 'Roblox Experience'
  const creatorName = detailsRes?.data?.[0]?.creator?.name
  const iconUrl = iconsRes?.data?.[0]?.imageUrl

  const exp: RobloxExperience = {
    placeId,
    universeId,
    name,
    iconUrl,
    creatorName
  }

  experienceCache.set(cacheKey, exp)
  return exp
}

function parseActiveGameFromContent(content: string): { placeId: string; universeId?: string } | null {
  const lines = content.split(/\r?\n/)
  let active: { placeId: string; universeId?: string } | null = null

  for (const line of lines) {
    if (
      line.includes('Client:Disconnect') || 
      line.includes('Disconnected - stop() called') || 
      line.includes('Disconnection Notification') ||
      line.includes('Connection closed') ||
      line.includes('Disconnected from game')
    ) {
      active = null
      continue
    }

    const matchJoin = line.match(/placeid:([0-9]+).*?universeid:([0-9]+)/i) || 
                      line.match(/universeid:([0-9]+).*?placeid:([0-9]+)/i)
    if (matchJoin) {
      const placeId = line.match(/placeid:([0-9]+)/i)?.[1]
      const universeId = line.match(/universeid:([0-9]+)/i)?.[1]
      if (placeId) {
        active = { placeId, universeId }
        continue
      }
    }

    const matchOutput = line.match(/Joining game '[^']+' place ([0-9]+)/i)
    if (matchOutput && matchOutput[1]) {
      active = { placeId: matchOutput[1] }
      continue
    }

    const matchJoinUtil = line.match(/Game join succeeded.*?placeId:\s*([0-9]+)/i)
    if (matchJoinUtil && matchJoinUtil[1]) {
      active = { placeId: matchJoinUtil[1] }
      continue
    }
  }

  return active
}

export async function syncRobloxExperience(): Promise<RobloxExperience | null> {
  const latestLog = findLatestPlayerLogFile()
  if (!latestLog) {
    if (currentExperience !== null) {
      currentExperience = null
      onExperienceChangeCallback?.(null)
    }
    return null
  }

  activeLogFilePath = latestLog

  try {
    const content = fs.readFileSync(latestLog, 'utf-8')
    const active = parseActiveGameFromContent(content)

    if (active && active.placeId) {
      if (!currentExperience || currentExperience.placeId !== active.placeId) {
        const exp = await fetchRobloxExperienceDetails(active.placeId, active.universeId)
        currentExperience = exp
        onExperienceChangeCallback?.(exp)
        return exp
      }
      return currentExperience
    } else {
      if (currentExperience !== null) {
        currentExperience = null
        onExperienceChangeCallback?.(null)
      }
      return null
    }
  } catch {
    return currentExperience
  }
}

export function startRobloxTracker(onChange: (info: RobloxExperience | null) => void) {
  onExperienceChangeCallback = onChange
  if (isTracking) {
    // Already tracking, do an immediate sync
    syncRobloxExperience().catch(() => {})
    return
  }

  isTracking = true
  activeLogFilePath = null
  lastReadOffset = 0
  currentExperience = null

  // Immediate sync of active game
  syncRobloxExperience().catch(() => {})

  // Poll log file every 500ms for instant reaction
  pollInterval = setInterval(() => {
    syncRobloxExperience().catch(() => {})
  }, 500)
}

export function stopRobloxTracker() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  isTracking = false
  activeLogFilePath = null
  lastReadOffset = 0
  currentExperience = null
  onExperienceChangeCallback = null
}

export function getCurrentRobloxExperience(): RobloxExperience | null {
  return currentExperience
}
