import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import { ipcMain, BrowserWindow } from 'electron'

export interface RobloxExperience {
  placeId: string
  universeId: string
  name: string
  iconUrl?: string
  creatorName?: string
}

export interface RobloxCodeItem {
  code: string
  reward: string
  isExpired?: boolean
}

export interface RobloxGameCodesResult {
  gameName: string
  placeId?: string
  universeId?: string
  iconUrl?: string
  activeCodes: RobloxCodeItem[]
  expiredCodes: RobloxCodeItem[]
  source?: string
  lastUpdated: number
}

let isTracking = false
let pollInterval: NodeJS.Timeout | null = null
let currentExperience: RobloxExperience | null = null
const changeListeners: Array<(info: RobloxExperience | null) => void> = []

// Caches for API results
const experienceCache = new Map<string, RobloxExperience>()
const codesCache = new Map<string, RobloxGameCodesResult>()

// ─── Curated Working Codes Database for Top Roblox Games ────────────────────
const CURATED_CODES: Record<string, { active: RobloxCodeItem[]; expired: RobloxCodeItem[] }> = {
  'steal an egg': {
    active: [
      { code: 'EASTER', reward: 'Free Boost & Speed' },
      { code: 'RELEASE', reward: 'Free Starter Eggs & Cash' },
      { code: 'PETS', reward: 'Free Pet Boost' },
      { code: 'FREEGEMS', reward: '500 Free Gems' },
      { code: 'SPEED', reward: '+15 Min Speed Boost' },
    ],
    expired: [
      { code: 'BETA', reward: '100 Gems', isExpired: true },
      { code: 'TEST1', reward: 'Free Egg', isExpired: true }
    ]
  },
  'blox fruits': {
    active: [
      { code: 'KITT_RESET', reward: 'Free Stat Reset' },
      { code: 'SUB2GAMERROBOT_RESET1', reward: 'Free Stat Reset' },
      { code: 'SUB2GAMERROBOT_EXP1', reward: '30 Minutes of 2x Experience' },
      { code: 'Sub2CaptainMaui', reward: '20 Minutes of 2x Experience' },
      { code: 'Sub2OfficialNoobie', reward: '20 Minutes of 2x Experience' },
      { code: 'TheGreatAce', reward: '20 Minutes of 2x Experience' },
      { code: 'Sub2NoobMaster123', reward: '20 Minutes of 2x Experience' },
      { code: 'Sub2Daigrock', reward: '20 Minutes of 2x Experience' },
      { code: 'Axiore', reward: '20 Minutes of 2x Experience' },
      { code: 'StrawHatMaine', reward: '20 Minutes of 2x Experience' },
      { code: 'TantaiGaming', reward: '20 Minutes of 2x Experience' },
      { code: 'Bluxxy', reward: '20 Minutes of 2x Experience' },
      { code: 'fudd10_V2', reward: '2 Beli' },
      { code: 'BIGNEWS', reward: "Title: 'Big News'" },
    ],
    expired: [
      { code: 'ADMINFIGHT', reward: '20 Min 2x EXP', isExpired: true },
      { code: 'SEATROLLING', reward: '20 Min 2x EXP', isExpired: true },
      { code: 'DRAGONABUSE', reward: '20 Min 2x EXP', isExpired: true },
      { code: 'JULYUPDATE_RESET', reward: 'Stat Reset', isExpired: true },
      { code: 'NOOB2PRO', reward: '20 Min 2x EXP', isExpired: true },
    ]
  },
  'blade ball': {
    active: [
      { code: 'GOODLUCK', reward: '1x Free Wheel Spin' },
      { code: 'DRAGONS', reward: 'Dragon Sword Skin' },
      { code: 'DELAYBALL', reward: 'Special Sword Skin' },
      { code: 'FREESPINS', reward: '1x Free Spin' },
      { code: 'SHARKATTACK', reward: '1x Free Spin' },
      { code: 'SUMMER', reward: 'Free Summer Crate' },
    ],
    expired: [
      { code: 'WINTER', reward: 'Free Crate', isExpired: true },
      { code: '1000LIKES', reward: '100 Coins', isExpired: true },
    ]
  },
  'pet simulator 99': {
    active: [
      { code: 'PETS99', reward: 'Free Huge Pet Boost' },
      { code: 'RELEASE', reward: '1,000 Free Diamonds' },
    ],
    expired: [
      { code: 'LUCKY', reward: 'Lucky Potion', isExpired: true }
    ]
  },
  'king legacy': {
    active: [
      { code: 'DinoxLive', reward: '+100,000 Beli Cash' },
      { code: 'Peodiz', reward: '+100,000 Beli Cash' },
      { code: '<3LEEPUNGG', reward: '30 Minutes of 2x Experience' },
      { code: 'WELCOMETOKINGLEGACY', reward: '30 Minutes of 2x Experience' },
      { code: '2MFAV', reward: '30 Minutes of 2x Experience' },
      { code: 'UPDATE6', reward: 'Free Stat Reset' },
    ],
    expired: [
      { code: '1BVISITS', reward: '30 Min 2x EXP', isExpired: true },
      { code: 'THX4WAITING', reward: 'Stat Reset', isExpired: true }
    ]
  },
  'anime defenders': {
    active: [
      { code: 'RELEASE', reward: '500 Free Gems' },
      { code: 'DEFENDERS', reward: '800 Gems + 1 Wish Ticket' },
      { code: 'SUB2KARAKORUM', reward: '300 Free Gems' },
    ],
    expired: [
      { code: 'SORRYFORSHUTDOWN', reward: '500 Gems', isExpired: true }
    ]
  },
  'da hood': {
    active: [
      { code: 'FIREWORKS2026', reward: '250,000 Da Hood Cash' },
      { code: 'TRADEME', reward: '100,000 Da Hood Cash' },
      { code: 'DAHOOD', reward: '100,000 Da Hood Cash' },
    ],
    expired: [
      { code: 'SUMMER2025', reward: '100k Cash', isExpired: true }
    ]
  },
  'doors': {
    active: [
      { code: 'SCREECHSUCKS', reward: '25 Free Knobs' },
      { code: 'THEHUNT', reward: '1x Free Revive' },
      { code: '4B', reward: '144 Knobs + 1 Revive' },
    ],
    expired: [
      { code: 'THREE', reward: 'Free Revive', isExpired: true },
      { code: '2BILLIONVISITS', reward: '100 Knobs', isExpired: true }
    ]
  },
  'rivals': {
    active: [
      { code: 'COMMUNITY', reward: 'Free Community Wrap' },
      { code: 'RELEASE', reward: '100 Free Keys' },
    ],
    expired: [
      { code: 'TESTING', reward: '50 Keys', isExpired: true }
    ]
  },
  'dress to impress': {
    active: [
      { code: 'D1NDOTEE', reward: 'Exclusive Designer Top' },
      { code: 'TEKKYOO26', reward: 'Special Runway Dress' },
      { code: 'LANATUDOR', reward: 'Lana Tudor Designer Dress' },
      { code: 'CHOPPING', reward: 'Special Accessory Handbag' },
    ],
    expired: [
      { code: 'FASHION', reward: 'Dress', isExpired: true }
    ]
  },
  'toilet tower defense': {
    active: [
      { code: 'SpeakerUpgrade', reward: '200 Free Coins' },
      { code: 'CameraGuy', reward: '100 Free Coins' },
      { code: 'AutoSkip', reward: '200 Free Coins' },
    ],
    expired: [
      { code: 'Parasite', reward: 'Coins', isExpired: true }
    ]
  }
}

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
  let lastJoinIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Join indicators: placeid and universeid
    const matchJoin = line.match(/placeid:([0-9]+).*?universeid:([0-9]+)/i) || 
                      line.match(/universeid:([0-9]+).*?placeid:([0-9]+)/i)
    if (matchJoin) {
      const placeId = line.match(/placeid:([0-9]+)/i)?.[1]
      const universeId = line.match(/universeid:([0-9]+)/i)?.[1]
      if (placeId) {
        active = { placeId, universeId }
        lastJoinIdx = i
        continue
      }
    }

    const matchOutput = line.match(/Joining game '[^']+' place ([0-9]+)/i)
    if (matchOutput && matchOutput[1]) {
      active = { placeId: matchOutput[1] }
      lastJoinIdx = i
      continue
    }

    const matchJoinUtil = line.match(/Game join succeeded.*?placeId:\s*([0-9]+)/i)
    if (matchJoinUtil && matchJoinUtil[1]) {
      active = { placeId: matchJoinUtil[1] }
      lastJoinIdx = i
      continue
    }

    // Leave indicators - only if occurring strictly AFTER the join event
    if (
      line.includes('destroyLuaApp: (stage:UGCGame)') ||
      line.includes('sendAnalyticsBeforeLeave') ||
      line.includes('Disconnected - stop() called') ||
      line.includes('Disconnected from game')
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

export async function syncRobloxExperience(): Promise<RobloxExperience | null> {
  const latestLog = findLatestPlayerLogFile()
  if (!latestLog) {
    if (currentExperience !== null) {
      currentExperience = null
      notifyListeners(null)
    }
    return null
  }

  try {
    const content = fs.readFileSync(latestLog, 'utf-8')
    const active = parseActiveGameFromContent(content)

    if (active && active.placeId) {
      if (!currentExperience || currentExperience.placeId !== active.placeId) {
        const exp = await fetchRobloxExperienceDetails(active.placeId, active.universeId)
        currentExperience = exp
        notifyListeners(exp)
        return exp
      }
      return currentExperience
    } else {
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
      if (onChange && exp) {
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
    // If called without arguments, clear all listeners
    changeListeners.length = 0
  }

  if (changeListeners.length === 0) {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
    isTracking = false
    currentExperience = null
    notifyListeners(null)
  }
}

export function getCurrentRobloxExperience(): RobloxExperience | null {
  return currentExperience
}

// ─── Roblox Codes Scraper & Intelligent Resolver ────────────────────────────

export function cleanGameName(raw: string): string {
  let s = raw
    // Strip unicode emojis
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}/gu, ' ')
    // Strip common bracketed tags like [💎], [UPDATE 2], [1.5], [EVENT]
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    // Strip version numbers like "1.5", "v2.0"
    .replace(/\b\d+(\.\d+)+\b/g, ' ')
    // Strip standalone noise words
    .replace(/\b(code|codes|update|release|event)\b/gi, ' ')
    // Keep alphanumeric, apostrophe, hyphens, spaces
    .replace(/[^\w\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s || raw.trim()
}

export function getCandidateSlugs(rawName: string): string[] {
  const slugs = new Set<string>()
  const cleaned = cleanGameName(rawName)

  // 1. Primary slug from cleaned name
  const primarySlug = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (primarySlug && primarySlug.length >= 2) slugs.add(primarySlug)

  // 2. Slug without apostrophe s (e.g. "hot's rng" -> "hots-rng")
  const noAposSlug = cleaned.toLowerCase().replace(/'s\b/g, 's').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (noAposSlug && noAposSlug.length >= 2) slugs.add(noAposSlug)

  // 3. Sub-parts split by separators or emojis
  const parts = rawName.split(/[💀|•\-:\/🌋🔥🚨⚡💎✨🎉⛏️]/)
  for (const part of parts) {
    const cp = cleanGameName(part)
    if (cp && cp.length >= 3) {
      const ps = cp.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (ps && ps.length >= 2) slugs.add(ps)
      const ps2 = cp.toLowerCase().replace(/'s\b/g, 's').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      if (ps2 && ps2.length >= 2) slugs.add(ps2)
    }
  }

  // 4. Raw name cleaned
  const rawClean = rawName
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji}/gu, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const rawSlug = rawClean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (rawSlug && rawSlug.length >= 2) slugs.add(rawSlug)

  return Array.from(slugs).filter(s => s && s.length >= 2 && !['game', 'roblox', 'update', 'codes'].includes(s))
}

export function parseCodesFromTitle(title: string): RobloxCodeItem[] {
  const codes: RobloxCodeItem[] = []
  if (!title) return codes

  // Pattern: code[AoC], code: FOO, [Code: BAR], code (LUCKY)
  const reg = /(?:code|codes)\s*[:\[\({]\s*([A-Za-z0-9_!.\-+]{2,25})\s*[:\]\)}]?/gi
  let m: RegExpExecArray | null
  while ((m = reg.exec(title)) !== null) {
    const candidate = m[1].trim()
    if (isValidCode(candidate)) {
      codes.push({ code: candidate, reward: 'Special Title Code' })
    }
  }
  return codes
}

export function decodeHtml(str: string): string {
  if (!str) return ''
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;|&mdash;|&#8211;/g, '-')
    .replace(/&nbsp;/g, ' ')
    .replace(/&times;/g, 'x')
    .replace(/&#8217;/g, "'")
    .trim()
}

const STOP_WORDS = new Set([
  'list', 'click', 'here', 'below', 'code', 'codes', 'active', 'expired',
  'how', 'roblox', 'twitter', 'discord', 'step', 'steps', 'note', 'update',
  'image', 'img', 'link', 'guide', 'game', 'games', 'free', 'and', 'for',
  'new', 'all', 'more', 'check', 'follow', 'join', 'page', 'video', 'channel',
  'redeem', 'enter', 'working', 'reward', 'rewards', 'button', 'screen', 'icon',
  'menu', 'box', 'tap', 'press', 'type', 'copy', 'paste', 'claim', 'gift',
  'the', 'with', 'from', 'this', 'that', 'they', 'what', 'when', 'where',
  'script', 'function', 'return', 'var', 'const', 'let', 'true', 'false',
  'null', 'undefined', 'id', 'data', 'data-next', 'status', 'value', 'width',
  'height', 'updated', 'created', 'version', 'payload', 'callback', 'error',
  'success', 'listener', 'event', 'parameter', 'name', 'slotid', 'cmpid',
  'retvalue', 'callid', 'pingdata', 'gppstring', 'sectionlist', 'item', 'items',
  'settings', 'gear', 'cog'
])

export function isValidCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false
  const c = code.trim()
  if (c.length < 2 || c.length > 32) return false
  if (/^\d+x\d+$/i.test(c)) return false
  if (STOP_WORDS.has(c.toLowerCase())) return false
  if (/^https?:\/\//i.test(c)) return false
  if (!/^[A-Za-z0-9_!.\-+?]+$/.test(c)) return false
  if (c.includes(' ') || c.includes('<') || c.includes('>') || c.includes('=') || c.includes('/') || c.includes('\\')) return false
  if (c.startsWith('_') || c.startsWith('-') || c.startsWith('.')) return false
  return true
}

export function isValidReward(reward: string): boolean {
  if (!reward || typeof reward !== 'string') return false
  const r = reward.trim()
  if (r.length < 2 || r.length > 130) return false
  // Reject JavaScript constructs
  if (/[{};]/.test(r)) return false
  if (/\/\//.test(r)) return false // comments
  if (/\b(function|return|var|const|let|window|document|typeof|instanceof|class=|href=)\b/i.test(r)) return false
  if (/(payload\.|data-prev|\.parentElement|\.classList|=>|===|!==)/i.test(r)) return false
  if (/^(true|false|null|undefined),?$/i.test(r)) return false
  if (/^['"][^'"]*['"],?$/.test(r)) return false // quoted JS strings
  if (r.endsWith(',') && !r.includes(' ')) return false
  if (/^[a-z0-9_$-]+:[a-z0-9_$-]+$/i.test(r)) return false
  return true
}

export function stripUnwantedHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
}

export function parseCodesFromHtmlOrText(rawInput: string): { active: RobloxCodeItem[]; expired: RobloxCodeItem[] } {
  const active: RobloxCodeItem[] = []
  const expired: RobloxCodeItem[] = []
  if (!rawInput) return { active, expired }

  const isHtml = /<[a-z][\s\S]*>/i.test(rawInput)
  const cleanInput = isHtml ? stripUnwantedHtml(rawInput) : rawInput

  const lower = cleanInput.toLowerCase()
  const expIdx = lower.indexOf('expired')
  const workingSection = expIdx !== -1 ? cleanInput.substring(0, expIdx) : cleanInput
  const expiredSection = expIdx !== -1 ? cleanInput.substring(expIdx) : ''

  const parseSection = (section: string, isExpired: boolean) => {
    if (isHtml) {
      // 1. Process <li> elements cleanly
      const liBlockRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
      let liMatch: RegExpExecArray | null
      while ((liMatch = liBlockRegex.exec(section)) !== null) {
        let inner = liMatch[1]
        // Strip copy buttons (e.g. on Beebom)
        inner = inner.replace(/<button[\s\S]*?<\/button>/gi, ' ')

        // Ignore redemption tutorial steps
        if (/^(?:click|tap|press|select|open|launch|go to|head to|look for)\b/i.test(inner.replace(/<[^>]+>/g, ' ').trim())) {
          continue
        }

        let code = ''
        let reward = ''

        const strongMatch = inner.match(/<(?:strong|b|code)[^>]*>\s*([A-Za-z0-9_!.\-+?]{2,32})\s*<\/(?:strong|b|code)>/i)
        if (strongMatch) {
          code = strongMatch[1].trim()
          const rest = inner.substring(inner.indexOf(strongMatch[0]) + strongMatch[0].length)
          const cleanRest = decodeHtml(rest.replace(/<[^>]+>/g, ' ')).replace(/Copy\s*$/i, '').trim()
          const sepMatch = cleanRest.match(/^[:=\-–—&ndash;&mdash;]+\s*(.+)$/i)
          reward = sepMatch ? sepMatch[1].trim() : cleanRest
        } else {
          const cleanLine = decodeHtml(inner.replace(/<[^>]+>/g, ' ')).replace(/Copy\s*$/i, '').trim()
          const lineM = cleanLine.match(/^([A-Za-z0-9_!.\-+?]{2,32})\s*[:=\-–—]\s*(.+)$/)
          if (lineM) {
            code = lineM[1].trim()
            reward = lineM[2].trim()
          }
        }

        if (code) {
          reward = reward
            .replace(/\s*[\(\[]\s*(?:NEW!?|HOT|LATEST|EXPIRED|WORKING|UPDATED)\s*[\)\]]/gi, '')
            .replace(/\s*[-–—:]\s*$/, '')
            .trim()

          if (isValidCode(code) && isValidReward(reward)) {
            const item: RobloxCodeItem = { code, reward: reward || 'Free Reward', isExpired }
            const target = isExpired ? expired : active
            if (!target.some(i => i.code.toLowerCase() === code.toLowerCase())) {
              target.push(item)
            }
          }
        }
      }

      // 2. Table rows: <tr><td>CODE</td><td>REWARD</td></tr>
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
      let trMatch: RegExpExecArray | null
      while ((trMatch = trRegex.exec(section)) !== null) {
        const cells: string[] = []
        const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
        let tdMatch: RegExpExecArray | null
        while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
          cells.push(decodeHtml(tdMatch[1].replace(/<[^>]+>/g, '')).trim())
        }
        if (cells.length >= 2) {
          const c = cells[0].trim()
          const r = cells[1].trim()
          if (isValidCode(c) && isValidReward(r)) {
            const item: RobloxCodeItem = { code: c, reward: r || 'Free Reward', isExpired }
            const target = isExpired ? expired : active
            if (!target.some(i => i.code.toLowerCase() === c.toLowerCase())) {
              target.push(item)
            }
          }
        }
      }
    } else {
      // 3. Plain text line parser (strictly for game descriptions without HTML)
      const lines = section.split(/\r?\n/)
      for (let line of lines) {
        line = line.trim()
        if (!line) continue

        // Format: CODE - REWARD (e.g. "tyfor300likes - 2,500 MogPoints")
        const lineMatch = line.match(/^[-*•]?\s*([A-Za-z0-9_!.\-+]{2,30})\s*[-–—:]\s*(.+)$/)
        if (lineMatch) {
          const c = lineMatch[1].trim()
          let r = decodeHtml(lineMatch[2].trim())
          if (isValidCode(c) && isValidReward(r)) {
            const target = isExpired ? expired : active
            if (!target.some(i => i.code.toLowerCase() === c.toLowerCase())) {
              target.push({ code: c, reward: r, isExpired })
            }
          }
        }

        // Format: "Use Code: RELEASE, EXPANSION"
        const useCodeMatch = line.match(/(?:use\s+)?code[s]?\s*[:=\-–—]\s*(.+)/i)
        if (useCodeMatch) {
          const rest = useCodeMatch[1]
          const parts = rest.split(/[,/|&]|\s+and\s+/i)
          for (const p of parts) {
            const clean = p.replace(/["'“”`[\]()!*✨🔥⚡💎⛏️🎁🎉\\]/g, '').trim()
            if (isValidCode(clean)) {
              const target = isExpired ? expired : active
              if (!target.some(i => i.code.toLowerCase() === clean.toLowerCase())) {
                target.push({ code: clean, reward: 'Free In-Game Rewards', isExpired })
              }
            }
          }
        }
      }
    }
  }

  parseSection(workingSection, false)
  if (expiredSection) parseSection(expiredSection, true)

  return { active, expired }
}

export function isSameGame(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  const na = a.toLowerCase().trim()
  const nb = b.toLowerCase().trim()
  if (na === nb) return true
  const ca = cleanGameName(a).toLowerCase().trim()
  const cb = cleanGameName(b).toLowerCase().trim()
  if (ca === cb) return true
  if (ca && cb && (ca.includes(cb) || cb.includes(ca))) return true
  return false
}

function fetchWebPage(url: string, timeout = 4000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        timeout
      }, (res) => {
        const code = res.statusCode || 0
        if (code >= 300 && code < 400 && res.headers.location) {
          let loc = res.headers.location
          if (loc.startsWith('/')) loc = new URL(loc, url).href
          return fetchWebPage(loc, timeout).then(resolve)
        }
        if (code !== 200) return resolve(null)
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => resolve(data))
      })
      req.on('error', () => resolve(null))
      req.on('timeout', () => { req.destroy(); resolve(null) })
    } catch {
      resolve(null)
    }
  })
}

/**
 * Resolves codes for any Roblox game by name or ID
 */
export async function getRobloxGameCodes(
  gameName: string,
  placeId?: string,
  universeId?: string,
  forceRefresh = false
): Promise<RobloxGameCodesResult> {
  const cleaned = cleanGameName(gameName)
  const normKey = cleaned.toLowerCase()

  if (forceRefresh) {
    codesCache.delete(normKey)
    codesCache.delete(gameName.toLowerCase().trim())
  }

  // Auto-resolve universeId from currentExperience if matching
  let resolvedUniverseId = universeId
  let resolvedPlaceId = placeId
  if (!resolvedUniverseId && currentExperience) {
    if (isSameGame(currentExperience.name, gameName)) {
      resolvedUniverseId = currentExperience.universeId
      resolvedPlaceId = resolvedPlaceId || currentExperience.placeId
    }
  }

  // 1. Check in-memory cache (TTL: 30 minutes) - only if we have active codes
  if (!forceRefresh) {
    const cached = codesCache.get(normKey) || codesCache.get(gameName.toLowerCase().trim())
    if (cached && (Date.now() - cached.lastUpdated < 30 * 60 * 1000) && cached.activeCodes.length > 0) {
      return cached
    }
  }

  // 2. Check Curated Database for instant high-confidence results
  let curatedMatch: { active: RobloxCodeItem[]; expired: RobloxCodeItem[] } | null = null
  for (const [key, data] of Object.entries(CURATED_CODES)) {
    if (normKey === key || normKey.includes(key) || key.includes(normKey)) {
      curatedMatch = data
      break
    }
  }

  let activeCodes: RobloxCodeItem[] = curatedMatch ? [...curatedMatch.active] : []
  let expiredCodes: RobloxCodeItem[] = curatedMatch ? [...curatedMatch.expired] : []
  let resolvedSource = curatedMatch ? 'Verified Database' : undefined

  // 3. Title Codes (Developers frequently put codes directly into the game title)
  const titleCodes = parseCodesFromTitle(gameName)
  for (const tc of titleCodes) {
    if (!activeCodes.some(c => c.code.toLowerCase() === tc.code.toLowerCase())) {
      activeCodes.unshift(tc)
    }
    resolvedSource = resolvedSource ? `${resolvedSource} + Game Title` : 'Game Title'
  }

  // 4. Candidate Slugs Generation
  const candidateSlugs = getCandidateSlugs(gameName)

  // 5. Official Roblox Game API: Check Game Description & Canonical URL Path
  if (resolvedUniverseId) {
    try {
      const gRes = await fetchJson<{ data?: Array<{ description?: string; canonicalUrlPath?: string }> }>(
        `https://games.roblox.com/v1/games?universeIds=${resolvedUniverseId}`
      )
      const gData = gRes?.data?.[0]
      if (gData?.description) {
        const descResult = parseCodesFromHtmlOrText(gData.description)
        for (const it of descResult.active) {
          if (!activeCodes.some(c => c.code.toLowerCase() === it.code.toLowerCase())) {
            activeCodes.push(it)
          }
        }
        for (const it of descResult.expired) {
          if (!expiredCodes.some(c => c.code.toLowerCase() === it.code.toLowerCase())) {
            expiredCodes.push(it)
          }
        }
        if (descResult.active.length > 0) {
          resolvedSource = resolvedSource ? `${resolvedSource} + Roblox Description` : 'Roblox Official'
        }
      }

      // Add canonical URL path slug if available (e.g. "/games/123/Sell-Ores" -> "sell-ores")
      if (gData?.canonicalUrlPath) {
        const pathMatch = gData.canonicalUrlPath.match(/\/games\/\d+\/([a-zA-Z0-9_-]+)/)
        if (pathMatch && pathMatch[1]) {
          const canonSlug = pathMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          if (canonSlug && canonSlug.length >= 2 && !candidateSlugs.includes(canonSlug)) {
            candidateSlugs.unshift(canonSlug)
          }
        }
      }
    } catch (_) {}
  }

  // 6. Multi-Source Web Scraper across all candidate slugs
  for (const slug of candidateSlugs) {
    const urls: string[] = [
      `https://tryhardguides.com/${slug}-codes/`,
      `https://beebom.com/${slug}-codes/`,
      `https://progameguides.com/roblox/${slug}-codes/`,
      `https://${slug.replace(/-/g, '')}.fandom.com/api.php?action=parse&page=Codes&prop=text&format=json`,
      `https://roblox.fandom.com/api.php?action=parse&page=${encodeURIComponent(cleaned)}/Codes&prop=text&format=json`
    ]

    for (const url of urls) {
      try {
        if (url.includes('fandom.com/api.php')) {
          const fRes = await fetchJson<{ parse?: { text?: { '*'?: string } } }>(url)
          const html = fRes?.parse?.text?.['*']
          if (html) {
            const parsed = parseCodesFromHtmlOrText(html)
            if (parsed.active.length > 0) {
              for (const item of parsed.active) {
                if (!activeCodes.some(c => c.code.toLowerCase() === item.code.toLowerCase())) {
                  activeCodes.push(item)
                }
              }
              for (const item of parsed.expired) {
                if (!expiredCodes.some(c => c.code.toLowerCase() === item.code.toLowerCase())) {
                  expiredCodes.push(item)
                }
              }
              resolvedSource = resolvedSource ? `${resolvedSource} + Fandom` : 'Roblox Wiki'
              break
            }
          }
        } else {
          const html = await fetchWebPage(url, 3800)
          if (html && (html.toLowerCase().includes('code') || html.includes('wp-block-list'))) {
            const parsed = parseCodesFromHtmlOrText(html)
            if (parsed.active.length > 0) {
              for (const item of parsed.active) {
                if (!activeCodes.some(c => c.code.toLowerCase() === item.code.toLowerCase())) {
                  activeCodes.push(item)
                }
              }
              for (const item of parsed.expired) {
                if (!expiredCodes.some(c => c.code.toLowerCase() === item.code.toLowerCase())) {
                  expiredCodes.push(item)
                }
              }
              const host = new URL(url).hostname.replace('www.', '')
              resolvedSource = resolvedSource ? `${resolvedSource} + ${host}` : host
              break
            }
          }
        }
      } catch (_) {}
    }

    if (activeCodes.length >= 3) break
  }

  // 7. Site Search Fallback: If still no codes, search TryHardGuides and Beebom
  if (activeCodes.length === 0) {
    const searchTerms = [cleaned, gameName].filter(Boolean)
    for (const term of searchTerms) {
      if (activeCodes.length > 0) break
      try {
        const searchHtml = await fetchWebPage(`https://tryhardguides.com/?s=${encodeURIComponent(term + ' codes')}`, 4000)
        if (searchHtml) {
          const match = searchHtml.match(/href="(https:\/\/tryhardguides\.com\/[a-z0-9-]+-codes\/)"/i)
          if (match && match[1]) {
            const articleHtml = await fetchWebPage(match[1], 4000)
            if (articleHtml) {
              const parsed = parseCodesFromHtmlOrText(articleHtml)
              if (parsed.active.length > 0) {
                for (const item of parsed.active) {
                  if (!activeCodes.some(c => c.code.toLowerCase() === item.code.toLowerCase())) {
                    activeCodes.push(item)
                  }
                }
                for (const item of parsed.expired) {
                  if (!expiredCodes.some(c => c.code.toLowerCase() === item.code.toLowerCase())) {
                    expiredCodes.push(item)
                  }
                }
                resolvedSource = 'tryhardguides.com'
                break
              }
            }
          }
        }
      } catch (_) {}
    }
  }

  // 8. Build final result
  const result: RobloxGameCodesResult = {
    gameName: cleaned || gameName,
    placeId: resolvedPlaceId,
    universeId: resolvedUniverseId,
    activeCodes,
    expiredCodes,
    source: resolvedSource || 'Community Codes Engine',
    lastUpdated: Date.now()
  }

  // Only cache if we actually found active codes!
  if (activeCodes.length > 0) {
    codesCache.set(normKey, result)
  }

  return result
}

/**
 * Initializes IPC handlers and log-tracking for Roblox
 */
export function initRobloxIPC(getWindows: () => BrowserWindow[]) {
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
    let exp = getCurrentRobloxExperience()
    if (!exp) {
      exp = await syncRobloxExperience()
    }
    return exp
  })

  // 2. Fetch codes for a game
  ipcMain.handle('roblox:get-codes', async (_event, gameName: string, placeId?: string, universeId?: string, forceRefresh?: boolean) => {
    return await getRobloxGameCodes(gameName, placeId, universeId, forceRefresh)
  })

  // 3. Force refresh of active experience
  ipcMain.handle('roblox:refresh-experience', async () => {
    const exp = await syncRobloxExperience()
    return exp
  })
}


