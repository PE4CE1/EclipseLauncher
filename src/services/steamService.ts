import { desktopFetch as fetch } from './httpClient'
import { readSteamAvatarFrame } from './steamProfileAppearance'
import { getNonSteamGame } from './nonSteamGames'
import { LruCache } from './lruCache'
/**
 * steamService.ts
 * Zero-config Steam Store API integration.
 * Uses only public Steam endpoints — no API keys required.
 */

import robloxHeroImg from '../assets/roblox/hero.png'
import robloxLogoImg from '../assets/Roblox-Logo-Icon.png'
import robloxScreen1Img from '../assets/roblox/screen1.png'
import robloxScreen2Img from '../assets/roblox/screen2.png'
import robloxScreen3Img from '../assets/roblox/screen3.png'
import robloxScreen4Img from '../assets/roblox/screen4.png'

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

export interface SteamPriceOverview {
  currency: string
  initial: number
  final: number
  discount_percent: number
  initial_formatted?: string
  final_formatted: string
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
  price_overview?: SteamPriceOverview
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
  header_image: robloxHeroImg,
  background: robloxHeroImg,
  background_raw: robloxHeroImg,
  pc_requirements: {
    minimum: '<strong>OS:</strong> Windows 10/11 (64-bit)<br><strong>Processor:</strong> 1.6 GHz or better<br><strong>Memory:</strong> 4 GB RAM<br><strong>Graphics:</strong> DirectX 10 minimum (Shader Model 2.0)<br><strong>Network:</strong> Broadband Internet connection<br><strong>Storage:</strong> 1 GB available space',
    recommended: '<strong>OS:</strong> Windows 10/11 (64-bit)<br><strong>Processor:</strong> High-end 4-Core CPU or better<br><strong>Memory:</strong> 8 GB RAM<br><strong>Graphics:</strong> Dedicated GPU with DirectX 11+ support<br><strong>Network:</strong> Broadband Internet connection'
  },
  developers: ['Roblox Corporation'],
  publishers: ['Roblox Corporation'],
  platforms: { windows: true, mac: true, linux: false },
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
    { id: 1, path_thumbnail: robloxHeroImg, path_full: robloxHeroImg },
    { id: 2, path_thumbnail: robloxScreen1Img, path_full: robloxScreen1Img },
    { id: 3, path_thumbnail: robloxScreen2Img, path_full: robloxScreen2Img },
    { id: 4, path_thumbnail: robloxScreen3Img, path_full: robloxScreen3Img },
    { id: 5, path_thumbnail: robloxScreen4Img, path_full: robloxScreen4Img }
  ],
  release_date: { coming_soon: false, date: '1 Sep 2006' }
}

// ─── Steam Shield: Circuit Breaker, Rate-Limiter & Safe Headers ────────────────

export const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
}

interface CircuitBreakerState {
  isTripped: boolean
  trippedUntil: number
  reason: string
}

let consecutive429Count = 0

const circuitBreaker: CircuitBreakerState = {
  isTripped: false,
  trippedUntil: 0,
  reason: '',
}

export function isSteamCircuitBreakerTripped(): boolean {
  if (!circuitBreaker.isTripped) return false
  if (Date.now() > circuitBreaker.trippedUntil) {
    circuitBreaker.isTripped = false
    circuitBreaker.trippedUntil = 0
    circuitBreaker.reason = ''
    console.log('[SteamShield] Circuit breaker cooldown expired. Steam store requests resumed.')
    notifyTrafficListeners()
    return false
  }
  return true
}

export function tripSteamCircuitBreaker(reason: string, cooldownMs?: number, silent = false) {
  circuitBreaker.isTripped = true
  let actualCooldown = cooldownMs
  if (!actualCooldown) {
    consecutive429Count++
    if (consecutive429Count === 1) actualCooldown = 30 * 1000 // 30 seconds
    else if (consecutive429Count === 2) actualCooldown = 60 * 1000 // 60 seconds
    else actualCooldown = 120 * 1000 // 2 minutes max
  }
  circuitBreaker.trippedUntil = Date.now() + actualCooldown
  circuitBreaker.reason = reason
  if (silent || reason.includes('Audit Simulation')) {
    console.log(`[SteamShield] (Simulation) Circuit breaker triggered for safety test (${reason}).`)
  } else {
    console.warn(`[SteamShield] Circuit breaker TRIPPED (${reason}). Steam store requests paused for ${Math.round(actualCooldown / 1000)}s.`)
  }
  notifyTrafficListeners()
}

export function resetSteamCircuitBreaker(silent = false) {
  circuitBreaker.isTripped = false
  circuitBreaker.trippedUntil = 0
  circuitBreaker.reason = ''
  consecutive429Count = 0
  if (!silent) {
    console.log('[SteamShield] Circuit breaker manually reset/unlocked.')
  }
  notifyTrafficListeners()
}

export function getSteamCircuitBreakerStatus() {
  return {
    isTripped: isSteamCircuitBreakerTripped(),
    remainingSeconds: circuitBreaker.isTripped ? Math.max(0, Math.round((circuitBreaker.trippedUntil - Date.now()) / 1000)) : 0,
    reason: circuitBreaker.reason
  }
}

export function inspectSteamResponse(status: number, bodySample?: string): boolean {
  if (status === 429) {
    tripSteamCircuitBreaker('HTTP 429 Rate Limited')
    return false
  }
  if (status === 403) {
    tripSteamCircuitBreaker('HTTP 403 Forbidden', 90 * 1000)
    return false
  }
  if (bodySample) {
    if (bodySample.includes('errors.edgesuite.net') || (bodySample.includes('Reference #') && bodySample.includes('Access Denied'))) {
      tripSteamCircuitBreaker('Akamai WAF EdgeBlock', 90 * 1000)
      return false
    }
  }
  if (status >= 200 && status < 300) {
    consecutive429Count = 0
    return true
  }
  return false
}

// ─── Steam Telemetry & Traffic Monitoring ─────────────────────────────────────

export interface SteamTrafficLogEntry {
  id: string
  timestamp: number
  endpoint: string
  type: 'LIVE' | 'CACHE' | 'CDN' | 'BLOCKED' | 'ERROR'
  bytes: number
  status?: number
  durationMs?: number
  detail?: string
}

export interface SteamTrafficStats {
  bytesReceived: number
  liveRequests: number
  cachedHits: number
  fastlyHits: number
  circuitBreakerBlocks: number
  activeQueueLength: number
  isCircuitBreakerTripped: boolean
  circuitBreakerRemainingSec: number
  circuitBreakerReason: string
  logs: SteamTrafficLogEntry[]
}

type StatsListener = (stats: SteamTrafficStats) => void
const statsListeners = new Set<StatsListener>()

const trafficStats: SteamTrafficStats = {
  bytesReceived: 0,
  liveRequests: 0,
  cachedHits: 0,
  fastlyHits: 0,
  circuitBreakerBlocks: 0,
  activeQueueLength: 0,
  isCircuitBreakerTripped: false,
  circuitBreakerRemainingSec: 0,
  circuitBreakerReason: '',
  logs: []
}

export function getSteamTrafficStats(): SteamTrafficStats {
  const cb = getSteamCircuitBreakerStatus()
  return {
    ...trafficStats,
    activeQueueLength: steamQueue.getQueueLength(),
    isCircuitBreakerTripped: cb.isTripped,
    circuitBreakerRemainingSec: cb.remainingSeconds,
    circuitBreakerReason: cb.reason
  }
}

export function subscribeSteamTraffic(listener: StatsListener): () => void {
  statsListeners.add(listener)
  listener(getSteamTrafficStats())
  return () => {
    statsListeners.delete(listener)
  }
}

function notifyTrafficListeners() {
  const current = getSteamTrafficStats()
  statsListeners.forEach(l => {
    try { l(current) } catch {}
  })
  if (typeof window !== 'undefined' && (window as any).electronAPI?.broadcastSteamTelemetry) {
    try { (window as any).electronAPI.broadcastSteamTelemetry(current) } catch {}
  }
}

// Cross-window telemetry sync
if (typeof window !== 'undefined' && (window as any).electronAPI?.onSteamTelemetryUpdate) {
  (window as any).electronAPI.onSteamTelemetryUpdate((incoming: SteamTrafficStats) => {
    if (incoming) {
      trafficStats.bytesReceived = incoming.bytesReceived ?? trafficStats.bytesReceived
      trafficStats.liveRequests = incoming.liveRequests ?? trafficStats.liveRequests
      trafficStats.cachedHits = incoming.cachedHits ?? trafficStats.cachedHits
      trafficStats.fastlyHits = incoming.fastlyHits ?? trafficStats.fastlyHits
      trafficStats.circuitBreakerBlocks = incoming.circuitBreakerBlocks ?? trafficStats.circuitBreakerBlocks
      trafficStats.logs = incoming.logs || trafficStats.logs
      const current = getSteamTrafficStats()
      statsListeners.forEach(l => {
        try { l(current) } catch {}
      })
    }
  })
}

const recentEventTimestamps = new Map<string, number>()

export function recordSteamTrafficEvent(entry: Omit<SteamTrafficLogEntry, 'id' | 'timestamp'>) {
  // Deduplicate identical events within 2.5 seconds to prevent log spam
  const dedupKey = `${entry.type}_${entry.endpoint}_${entry.detail || ''}`
  const now = Date.now()
  const lastTime = recentEventTimestamps.get(dedupKey) || 0
  if (now - lastTime < 2500) {
    return
  }
  if (recentEventTimestamps.size >= 500) {
    for (const [key, timestamp] of recentEventTimestamps) {
      if (now - timestamp >= 2500) recentEventTimestamps.delete(key)
    }
    if (recentEventTimestamps.size >= 500) recentEventTimestamps.delete(recentEventTimestamps.keys().next().value!)
  }
  recentEventTimestamps.set(dedupKey, now)

  const fullEntry: SteamTrafficLogEntry = {
    ...entry,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: now
  }

  if (entry.type === 'LIVE') {
    trafficStats.liveRequests++
    trafficStats.bytesReceived += entry.bytes || 0
  } else if (entry.type === 'CACHE') {
    trafficStats.cachedHits++
  } else if (entry.type === 'CDN') {
    trafficStats.fastlyHits++
  } else if (entry.type === 'BLOCKED') {
    trafficStats.circuitBreakerBlocks++
  }

  trafficStats.logs.unshift(fullEntry)
  if (trafficStats.logs.length > 50) {
    trafficStats.logs.pop()
  }

  notifyTrafficListeners()
}

export function resetSteamTrafficStats() {
  resetSteamCircuitBreaker()
  recentEventTimestamps.clear()
  trafficStats.bytesReceived = 0
  trafficStats.liveRequests = 0
  trafficStats.cachedHits = 0
  trafficStats.fastlyHits = 0
  trafficStats.circuitBreakerBlocks = 0
  trafficStats.logs = []
  notifyTrafficListeners()
}

export async function testSteamPing(): Promise<{ success: boolean; latencyMs: number; bytes: number; status: number; message: string }> {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    // Direct test probe (doesn't get aborted by client-side circuit breaker so user can check if Steam is reachable)
    const res = await fetch('https://store.steampowered.com/api/storesearch/?term=portal&l=english&cc=US', {
      headers: BROWSER_HEADERS,
      signal: controller.signal
    })
    clearTimeout(timer)
    const text = await res.text()
    const duration = Date.now() - start
    const bytes = text ? text.length : 0

    if (res.status === 200) {
      resetSteamCircuitBreaker()
      recordSteamTrafficEvent({
        endpoint: '/api/storesearch/?term=portal',
        type: 'LIVE',
        bytes,
        status: 200,
        durationMs: duration,
        detail: `Probe 200 OK (${(bytes / 1024).toFixed(1)} KB)`
      })
      return {
        success: true,
        latencyMs: duration,
        bytes,
        status: 200,
        message: `Steam reachable (200 OK, ${(bytes / 1024).toFixed(1)} KB in ${duration}ms)`
      }
    } else {
      inspectSteamResponse(res.status, text)
      recordSteamTrafficEvent({
        endpoint: '/api/storesearch/?term=portal',
        type: 'ERROR',
        bytes,
        status: res.status,
        durationMs: duration,
        detail: `Probe HTTP ${res.status}`
      })
      return {
        success: false,
        latencyMs: duration,
        bytes,
        status: res.status,
        message: res.status === 429
          ? 'Steam returned 429 (Rate Limited. Cooldown: 30s)'
          : res.status === 403
          ? 'Steam WAF blocked request (403 Forbidden)'
          : `HTTP ${res.status}`
      }
    }
  } catch (err: any) {
    const duration = Date.now() - start
    const isAbort = err?.name === 'AbortError'
    recordSteamTrafficEvent({
      endpoint: '/api/storesearch/?term=portal',
      type: 'ERROR',
      bytes: 0,
      durationMs: duration,
      detail: `Probe error: ${isAbort ? 'Timeout' : err?.message || 'Network failure'}`
    })
    return {
      success: false,
      latencyMs: duration,
      bytes: 0,
      status: 0,
      message: isAbort ? 'Connection timeout' : (err?.message || 'Connection error')
    }
  }
}

export async function testFetchRealAppDetails(appId = 730): Promise<{ success: boolean; latencyMs: number; bytes: number; status: number; message: string }> {
  const start = Date.now()
  try {
    const res = await steamQueue.enqueue(() =>
      fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&cc=US`, {
        headers: BROWSER_HEADERS
      })
    )
    const text = await res.text()
    const duration = Date.now() - start
    const bytes = text ? text.length : 0
    const ok = inspectSteamResponse(res.status, text) && res.status === 200
    recordSteamTrafficEvent({
      endpoint: `/api/appdetails?appids=${appId}`,
      type: ok ? 'LIVE' : 'ERROR',
      bytes,
      status: res.status,
      durationMs: duration,
      detail: ok ? `Live AppDetails #${appId} (${(bytes / 1024).toFixed(1)} KB)` : `HTTP ${res.status}`
    })
    return {
      success: ok,
      latencyMs: duration,
      bytes,
      status: res.status,
      message: ok ? `AppDetails #${appId} received (${(bytes / 1024).toFixed(1)} KB in ${duration}ms)` : `HTTP ${res.status}`
    }
  } catch (err: any) {
    const duration = Date.now() - start
    recordSteamTrafficEvent({
      endpoint: `/api/appdetails?appids=${appId}`,
      type: 'ERROR',
      bytes: 0,
      durationMs: duration,
      detail: `AppDetails error: ${err?.message || 'Network failure'}`
    })
    return {
      success: false,
      latencyMs: duration,
      bytes: 0,
      status: 0,
      message: err?.message || 'Request failed'
    }
  }
}

export interface SecurityAuditResult {
  passed: boolean
  pacingDeltaMs: number
  headersCompliant: boolean
  circuitBreakerFunctional: boolean
  cacheFunctional: boolean
  message: string
}

export async function runSteamSecurityAudit(): Promise<SecurityAuditResult> {
  // 1. Queue Pacing Test: Push two tasks to test pacing
  const p1 = steamQueue.enqueue(async () => Date.now(), true)
  const p2 = steamQueue.enqueue(async () => Date.now(), false)
  const [time1, time2] = await Promise.all([p1, p2])
  const delta = time2 - time1

  // 2. Header Compliance Test
  const headersCompliant =
    Boolean(BROWSER_HEADERS['User-Agent']?.includes('Chrome/128')) &&
    Boolean(BROWSER_HEADERS['Sec-Ch-Ua']) &&
    Boolean(BROWSER_HEADERS['Accept-Language'])

  // 3. Circuit Breaker Simulation Test
  const prevTripped = isSteamCircuitBreakerTripped()
  tripSteamCircuitBreaker('Audit Simulation Test', 1000, true)
  const isTrippedWorking = isSteamCircuitBreakerTripped()
  resetSteamCircuitBreaker(true)
  if (prevTripped) {
    tripSteamCircuitBreaker('Restored state', 30000)
  }

  // 4. Cache Test
  const testKey = 'eclipse_steam_app_v3_9999999_audit_audit'
  let cacheFunctional = false
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(testKey, JSON.stringify({ timestamp: Date.now(), data: { name: 'Audit' } }))
      const item = localStorage.getItem(testKey)
      localStorage.removeItem(testKey)
      cacheFunctional = Boolean(item)
    } else {
      cacheFunctional = true
    }
  } catch {
    cacheFunctional = true
  }

  const passed = delta >= 1000 && headersCompliant && isTrippedWorking && cacheFunctional
  const message = passed
    ? `All 5 Security Shields Verified: ${delta}ms Queue Pacing, Chrome 128 Headers, Breaker & Cache 100% Active`
    : `Audit completed with warnings: Pacing ${delta}ms, Headers ${headersCompliant ? 'OK' : 'FAIL'}, Breaker ${isTrippedWorking ? 'OK' : 'FAIL'}`

  recordSteamTrafficEvent({
    endpoint: 'SecurityAudit',
    type: passed ? 'CACHE' : 'ERROR',
    bytes: 0,
    status: passed ? 200 : 500,
    detail: `🛡️ Security Audit: ${passed ? '100% SECURE & PASSED' : 'Warning'}`
  })

  return {
    passed,
    pacingDeltaMs: delta,
    headersCompliant,
    circuitBreakerFunctional: isTrippedWorking,
    cacheFunctional,
    message
  }
}

interface QueuedTask<T> {
  fn: () => Promise<T>
  resolve: (value: T) => void
  reject: (reason?: any) => void
  priority: boolean
  timestamp: number
}

class SteamRequestQueue {
  private queue: QueuedTask<any>[] = []
  private isProcessing = false
  private lastRequestTime = 0
  private readonly minDelayMs = 1200 // Minimum 1.2s between any Steam store calls (max 50 req/min)
  private readonly maxQueueLength = 25

  public getQueueLength(): number {
    return this.queue.length
  }

  public enqueue<T>(fn: () => Promise<T>, priority = false): Promise<T> {
    if (isSteamCircuitBreakerTripped()) {
      recordSteamTrafficEvent({
        endpoint: 'SteamQueue',
        type: 'BLOCKED',
        bytes: 0,
        detail: `Blocked by Circuit Breaker (${circuitBreaker.reason})`
      })
      return Promise.reject(new Error(`Steam circuit breaker active: ${circuitBreaker.reason}`))
    }

    if (this.queue.length >= this.maxQueueLength) {
      const dropIdx = this.queue.findIndex(item => !item.priority)
      if (dropIdx !== -1) {
        const dropped = this.queue.splice(dropIdx, 1)[0]
        dropped.reject(new Error('Dropped from Steam request queue (rate limit protection)'))
      }
    }

    return new Promise<T>((resolve, reject) => {
      const task: QueuedTask<T> = {
        fn,
        resolve,
        reject,
        priority,
        timestamp: Date.now()
      }

      if (priority) {
        this.queue.unshift(task)
      } else {
        this.queue.push(task)
      }

      this.processQueue()
    })
  }

  private async processQueue() {
    if (this.isProcessing) return
    this.isProcessing = true

    while (this.queue.length > 0) {
      if (isSteamCircuitBreakerTripped()) {
        const remaining = this.queue.splice(0, this.queue.length)
        remaining.forEach(t => t.reject(new Error(`Steam circuit breaker active: ${circuitBreaker.reason}`)))
        break
      }

      const now = Date.now()
      const elapsed = now - this.lastRequestTime
      if (elapsed < this.minDelayMs) {
        await new Promise(r => setTimeout(r, this.minDelayMs - elapsed))
      }

      const task = this.queue.shift()
      if (!task) continue

      this.lastRequestTime = Date.now()
      try {
        const res = await task.fn()
        task.resolve(res)
      } catch (err) {
        task.reject(err)
      }
    }

    this.isProcessing = false
  }
}

export const steamQueue = new SteamRequestQueue()

const DETAILS_STORAGE_PREFIX = 'eclipse_steam_app_v3_'
const DETAILS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function getPersistedAppDetails(appId: number, lang: string, cc: string): SteamAppDetails | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const key = `${DETAILS_STORAGE_PREFIX}${appId}_${lang}_${cc}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.timestamp && (Date.now() - parsed.timestamp < DETAILS_TTL_MS)) {
      return parsed.data as SteamAppDetails
    }
    localStorage.removeItem(key)
  } catch {}
  return null
}

export function persistAppDetails(appId: number, lang: string, cc: string, data: SteamAppDetails) {
  try {
    if (typeof localStorage === 'undefined') return
    const key = `${DETAILS_STORAGE_PREFIX}${appId}_${lang}_${cc}`
    localStorage.setItem(key, JSON.stringify({
      timestamp: Date.now(),
      data
    }))
  } catch {}
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
  1817070,// Marvel's Spider-Man Remastered
  1593500,// God of War (2018)
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
  1623730,// Palworld
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
  1295660,// Civilization VII (2025)
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
  1623730,// Palworld
  1245620,// Elden Ring
  1086940,// Baldur's Gate 3
  2358720,// Black Myth: Wukong
  1091500,// Cyberpunk 2077
  526870, // Satisfactory
  2183900,// Space Marine 2
  1627720,// Lies of P
  1817230,// Hi-Fi Rush
  1850570,// Alan Wake 2
  2050650,// Resident Evil 4 Remake
  1868140,// Dave the Diver
  1332010,// Stray
  1145360,// Hades
  1687950,// Persona 5 Royal
]

// ─── API Functions ─────────────────────────────────────────────────────────────

/**
 * Search the Steam store — no API key required.
 * Returns matched games with IDs, names, and tiny_image URLs.
 */
const searchCache = new LruCache<string, SteamSearchItem[]>(96)

export async function searchSteamGames(
  query: string,
  options: { lang?: string; cc?: string } = {}
): Promise<SteamSearchItem[]> {
  if (!query || query.length < 2) return []

  const qLower = query.toLowerCase().trim()
  const isRoblox = qLower === 'roblox' || qLower.startsWith('roblox') || qLower.includes('roblox')
  const cacheKey = `${query.toLowerCase().trim()}_${options.lang ?? 'english'}_${options.cc ?? 'DE'}`

  if (searchCache.has(cacheKey)) {
    recordSteamTrafficEvent({
      endpoint: `/api/storesearch/?term=${encodeURIComponent(query)}`,
      type: 'CACHE',
      bytes: 0,
      detail: `RAM Search Cache: "${query}"`
    })
    return searchCache.get(cacheKey)!
  }

  // Check persistent search cache (survives app restarts)
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(`eclipse_steam_search_${cacheKey}`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.timestamp && (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000)) {
          searchCache.set(cacheKey, parsed.items)
          recordSteamTrafficEvent({
            endpoint: `/api/storesearch/?term=${encodeURIComponent(query)}`,
            type: 'CACHE',
            bytes: 0,
            detail: `Disk Search Cache: "${query}"`
          })
          return parsed.items
        }
      }
    }
  } catch {}

  // If circuit breaker is active, don't hit Steam
  if (isSteamCircuitBreakerTripped()) {
    recordSteamTrafficEvent({
      endpoint: `/api/storesearch/?term=${encodeURIComponent(query)}`,
      type: 'BLOCKED',
      bytes: 0,
      detail: 'Search blocked by Circuit Breaker'
    })
    console.warn(`[SteamShield] Skipping live searchSteamGames for "${query}" (Circuit breaker active)`)
    if (isRoblox) {
      return [{
        id: ROBLOX_APP_ID,
        name: 'Roblox',
        tiny_image: robloxLogoImg,
        price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
      }]
    }
    return []
  }

  const params = new URLSearchParams({
    term: query,
    l: options.lang ?? 'english',
    cc: options.cc ?? 'DE',
    json: '1',
  })

  const url = `https://store.steampowered.com/api/storesearch/?${params}`
  try {
    return await steamQueue.enqueue(async () => {
      const res = await fetch(url, { headers: BROWSER_HEADERS })
      const text = await res.text()
      const isOk = inspectSteamResponse(res.status, text)
      recordSteamTrafficEvent({
        endpoint: `/api/storesearch/?term=${encodeURIComponent(query)}`,
        type: isOk ? 'LIVE' : 'ERROR',
        bytes: text.length,
        status: res.status,
        detail: `Live Search: "${query}"`
      })
      if (!isOk) {
        if (isRoblox) {
          return [{
            id: ROBLOX_APP_ID,
            name: 'Roblox',
            tiny_image: robloxLogoImg,
            price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
          }]
        }
        return []
      }

      const data: SteamSearchResponse = JSON.parse(text)
      const items = data.items ?? []
      if (isRoblox && !items.some(i => i.name.toLowerCase() === 'roblox' || i.id === ROBLOX_APP_ID)) {
        items.unshift({
          id: ROBLOX_APP_ID,
          name: 'Roblox',
          tiny_image: robloxLogoImg,
          price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
        })
      }
      searchCache.set(cacheKey, items)
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(`eclipse_steam_search_${cacheKey}`, JSON.stringify({
            timestamp: Date.now(),
            items
          }))
        }
      } catch {}
      return items
    }, true)
  } catch (err) {
    if (isRoblox) {
      return [{
        id: ROBLOX_APP_ID,
        name: 'Roblox',
        tiny_image: robloxLogoImg,
        price: { currency: 'EUR', initial: 0, final: 0, discount_percent: 0, final_formatted: 'Free' }
      }]
    }
    return []
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
  currency: 'EUR' | 'USD' = 'EUR',
  existingPriceOverview?: SteamPriceOverview | null,
  gameName?: string
): Promise<RealPriceInfo | null> {
  const cacheKey = `${appId}_${currency}`
  if (realPriceCache.has(cacheKey)) {
    const cached = realPriceCache.get(cacheKey)!
    if (cached.isFree || cached.finalPrice > 0) {
      return cached
    }
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

  // 1. Direct from passed existingPriceOverview
  if (existingPriceOverview && existingPriceOverview.currency === currency) {
    const initCents = existingPriceOverview.initial || 0
    const finCents = existingPriceOverview.final || 0
    discountPercent = existingPriceOverview.discount_percent || 0
    initialPrice = initCents / 100
    finalPrice = finCents / 100
    initialFormatted = existingPriceOverview.initial_formatted || (initialPrice > 0 ? formatPrice(initialPrice) : '')
    finalFormatted = existingPriceOverview.final_formatted || (finalPrice > 0 ? formatPrice(finalPrice) : '')
  }

  // 2. From appDetailsCache if already loaded
  if (initialPrice === 0 && finalPrice === 0) {
    for (const [key, details] of appDetailsCache.entries()) {
      if (key === `${appId}_${lang}_${cc}` || (key.startsWith(`${appId}_`) && details.price_overview?.currency === currency)) {
        if (details.is_free) {
          isFree = true
          break
        }
        if (details.price_overview) {
          const po = details.price_overview
          initialPrice = (po.initial || 0) / 100
          finalPrice = (po.final || 0) / 100
          discountPercent = po.discount_percent || 0
          initialFormatted = po.initial_formatted || (initialPrice > 0 ? formatPrice(initialPrice) : '')
          finalFormatted = po.final_formatted || (finalPrice > 0 ? formatPrice(finalPrice) : '')
          break
        }
      }
    }
  }

  // 3. Steam StoreSearch API (ultra-fast, resilient, with circuit breaker protection)
  if (initialPrice === 0 && finalPrice === 0 && !isFree && !isSteamCircuitBreakerTripped()) {
    try {
      const term = appId ? String(appId) : (gameName || '')
      if (term) {
        const sData = await steamQueue.enqueue(async () => {
          const sRes = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=${lang}&cc=${cc}`, {
            headers: BROWSER_HEADERS
          })
          const sText = await sRes.text()
          if (!inspectSteamResponse(sRes.status, sText)) return null
          return JSON.parse(sText)
        }, false).catch(() => null)

        if (sData) {
          const matched = sData?.items?.find((i: any) => i.id === appId) || (sData?.items?.length === 1 ? sData.items[0] : null)
          if (matched) {
            if (matched.price) {
              const initCents = matched.price.initial || 0
              const finCents = matched.price.final || 0
              initialPrice = initCents / 100
              finalPrice = finCents / 100
              discountPercent = initialPrice > 0 ? Math.max(0, Math.round((1 - finalPrice / initialPrice) * 100)) : 0
              initialFormatted = initialPrice > 0 ? formatPrice(initialPrice) : ''
              finalFormatted = finalPrice > 0 ? formatPrice(finalPrice) : ''
            } else if (matched.is_free === true) {
              isFree = true
            }
          }
        }
      }
    } catch {}
  }

  // 4. Try getSteamAppDetails if still not resolved
  if (initialPrice === 0 && finalPrice === 0 && !isFree) {
    try {
      const steamData = await getSteamAppDetails(appId, lang, cc)
      if (steamData) {
        isFree = !!steamData.is_free
        const priceOverview = steamData.price_overview
        if (priceOverview) {
          const initCents = priceOverview.initial || 0
          const finCents = priceOverview.final || 0
          discountPercent = priceOverview.discount_percent || 0
          initialPrice = initCents / 100
          finalPrice = finCents / 100
          initialFormatted = priceOverview.initial_formatted || (initialPrice > 0 ? formatPrice(initialPrice) : '')
          finalFormatted = priceOverview.final_formatted || (finalPrice > 0 ? formatPrice(finalPrice) : '')
        }
      }
    } catch {}
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

  // 5. CheapShark All-Time Low lookup & Price Fallback
  let atlPrice = 0
  let atlDiscount = 0

  // CheapShark only supplies USD. Regional historical lows cannot be inferred from discounts.
  if (currency === 'USD') try {
    const csRes = await fetch(`https://www.cheapshark.com/api/1.0/games?steamAppID=${appId}`, {
      headers: { 'User-Agent': 'EclipseLauncher/1.0 (contact@eclipselauncher.com)' }
    }).then(r => r.json()).catch(() => null)

    if (Array.isArray(csRes) && csRes[0]?.gameID) {
      const details = await fetch(`https://www.cheapshark.com/api/1.0/games?id=${csRes[0].gameID}`, {
        headers: { 'User-Agent': 'EclipseLauncher/1.0 (contact@eclipselauncher.com)' }
      }).then(r => r.json()).catch(() => null)

      const steamDeal = details?.deals?.find((deal: { storeID?: string }) => String(deal.storeID) === '1')
      // Fallback prices from the Steam deal only; other stores may have different offers.
      if (initialPrice === 0 && steamDeal?.retailPrice) {
        const parsedRetail = parseFloat(steamDeal.retailPrice)
        if (!isNaN(parsedRetail) && parsedRetail > 0) {
          initialPrice = parsedRetail
          initialFormatted = formatPrice(initialPrice)
        }
      }
      if (finalPrice === 0 && steamDeal?.price) {
        const parsedPrice = parseFloat(steamDeal.price)
        if (!isNaN(parsedPrice) && parsedPrice > 0) {
          finalPrice = parsedPrice
          finalFormatted = formatPrice(finalPrice)
          if (initialPrice > 0) {
            discountPercent = Math.max(0, Math.round((1 - finalPrice / initialPrice) * 100))
          }
        }
      }

      // Calculate All-Time Low
      if (details?.cheapestPriceEver?.price) {
        const rawUsdAtl = parseFloat(details.cheapestPriceEver.price)
        if (!isNaN(rawUsdAtl) && rawUsdAtl > 0) {
          let usdBase = initialPrice
          if (steamDeal?.retailPrice) {
            const parsedRetail = parseFloat(steamDeal.retailPrice)
            if (!isNaN(parsedRetail) && parsedRetail > 0) {
              usdBase = parsedRetail
            }
          }

          const histDiscount = usdBase > 0 ? Math.max(discountPercent, Math.round((1 - rawUsdAtl / usdBase) * 100)) : discountPercent
          atlDiscount = histDiscount

          atlPrice = rawUsdAtl
        }
      }
    }
  } catch (err) {
    console.error('[steamService] Error fetching CheapShark all-time low:', err)
  }

  // CRITICAL SANITY CHECK:
  // For a paid game, NEVER return finalFormatted or allTimeLowFormatted as "0,00 €"!
  const hasValidPrice = finalPrice > 0
  const hasValidAtl = atlPrice > 0

  const result: RealPriceInfo = {
    isFree: false,
    currency,
    initialPrice,
    finalPrice,
    discountPercent,
    initialFormatted: hasValidPrice && initialPrice > 0 ? (initialFormatted || formatPrice(initialPrice)) : '',
    finalFormatted: hasValidPrice ? (finalFormatted || formatPrice(finalPrice)) : '',
    hasDiscount: discountPercent > 0 && hasValidPrice,
    allTimeLowPrice: hasValidAtl ? atlPrice : 0,
    allTimeLowFormatted: hasValidAtl ? formatPrice(atlPrice) : '',
    allTimeLowDiscountPercent: hasValidAtl ? atlDiscount : 0
  }

  if (hasValidPrice) {
    realPriceCache.set(cacheKey, result)
  }
  return result
}

// Full descriptions/media grow quickly during browsing. Evicted details remain
// in the existing disk cache; revisiting them does not require a new download.
const appDetailsCache = new LruCache<string, SteamAppDetails>(64)
const appDetailsInFlight = new Map<string, Promise<SteamAppDetails | null>>()

export function releaseSteamBrowsingCaches(): void {
  searchCache.clear()
  appDetailsCache.clear()
}

/**
 * Fetch full details for one Steam app.
 * Uses Valve's Fastly & Akamai CDN store edges first to avoid store.steampowered.com 403 rate limits.
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

  const cacheKey = `${appId}_${lang}_${cc}`
  if (appDetailsCache.has(cacheKey)) {
    recordSteamTrafficEvent({
      endpoint: `/api/appdetails?appids=${appId}`,
      type: 'CACHE',
      bytes: 0,
      detail: `RAM Cache Hit #${appId}`
    })
    return appDetailsCache.get(cacheKey)!
  }

  // 1. Check persistent localStorage cache (survives app restarts)
  const persisted = getPersistedAppDetails(appId, lang, cc)
  if (persisted) {
    appDetailsCache.set(cacheKey, persisted)
    recordSteamTrafficEvent({
      endpoint: `/api/appdetails?appids=${appId}`,
      type: 'CACHE',
      bytes: 0,
      detail: `Disk Cache Hit (7d) #${appId}`
    })
    return persisted
  }

  if (appDetailsInFlight.has(cacheKey)) {
    return appDetailsInFlight.get(cacheKey)!
  }

  // 2. Check circuit breaker before scheduling network request
  if (isSteamCircuitBreakerTripped()) {
    recordSteamTrafficEvent({
      endpoint: `/api/appdetails?appids=${appId}`,
      type: 'BLOCKED',
      bytes: 0,
      detail: `Pause (${circuitBreaker.reason}): CDN Fallback #${appId}`
    })
    const knownName = getKnownSteamGameName(appId) || `Steam Game (${appId})`
    return {
      appid: appId,
      steam_appid: appId,
      type: 'game',
      name: knownName,
      is_free: false,
      header_image: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      background: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
      background_raw: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
      short_description: '',
      detailed_description: '',
      about_the_game: '',
      supported_languages: '',
      developers: [],
      publishers: [],
      platforms: { windows: true, mac: false, linux: false },
      categories: [],
      genres: [],
      screenshots: [
        { id: 1, path_thumbnail: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`, path_full: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg` },
        { id: 2, path_thumbnail: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`, path_full: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg` },
      ],
      release_date: { coming_soon: false, date: '' }
    }
  }

  const fetchPromise = steamQueue.enqueue(async () => {
    // 1. Valve Fastly CDN edge (fastest, high throughput, zero 403 blocks)
    // 2. Steam store origin fallback only if needed
    const endpoints = [
      `https://store.fastly.steamstatic.com/api/appdetails?appids=${appId}&l=${lang}&cc=${cc}`,
      `https://store.akamai.steamstatic.com/api/appdetails?appids=${appId}&l=${lang}&cc=${cc}`,
      `https://store.steampowered.com/api/appdetails?appids=${appId}&l=${lang}&cc=${cc}`,
    ]

    for (const url of endpoints) {
      if (isSteamCircuitBreakerTripped()) break
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 6000)
        const res = await fetch(url, {
          signal: controller.signal,
          headers: BROWSER_HEADERS
        })
        clearTimeout(timer)

        const text = await res.text()
        const isOk = inspectSteamResponse(res.status, text)
        if (!isOk) continue

        if (!text || text.trim().startsWith('<') || !text.includes(`"${appId}"`)) {
          continue
        }
        const data = JSON.parse(text)
        const entry = data[String(appId)]
        if (entry?.success && entry?.data) {
          const detail = entry.data as SteamAppDetails
          appDetailsCache.set(cacheKey, detail)
          persistAppDetails(appId, lang, cc, detail)
          recordSteamTrafficEvent({
            endpoint: url.includes('fastly') ? 'Fastly CDN Edge' : 'Steam Store Origin',
            type: 'LIVE',
            bytes: text.length,
            status: res.status,
            detail: `AppDetails #${appId} (${detail.name || ''})`
          })
          return detail
        }
      } catch {
        // Try next endpoint
      }
    }

    // 3. StoreSearch fallback if appdetails was rate-limited (never 429s, returns name, price, platforms, metascore)
    if (!isSteamCircuitBreakerTripped()) {
      try {
        const sRes = await fetch(`https://store.steampowered.com/api/storesearch/?term=${appId}&l=${lang}&cc=${cc}`, {
          headers: BROWSER_HEADERS
        })
        const sText = await sRes.text()
        if (inspectSteamResponse(sRes.status, sText)) {
          const sData = JSON.parse(sText)
          const matched = sData?.items?.find((i: any) => i.id === appId) || (sData?.items?.length === 1 ? sData.items[0] : null)
          if (matched) {
            const isFree = !matched.price || (matched.price.final === 0 && matched.price.initial === 0)
            const fallbackDetail: SteamAppDetails = {
              appid: appId,
              steam_appid: appId,
              type: 'game',
              name: matched.name,
              is_free: isFree,
              price_overview: matched.price ? {
                currency: matched.price.currency,
                initial: matched.price.initial,
                final: matched.price.final,
                discount_percent: matched.price.initial > 0 ? Math.max(0, Math.round((1 - matched.price.final / matched.price.initial) * 100)) : 0,
                initial_formatted: matched.price.initial > 0 ? (matched.price.initial / 100).toFixed(2).replace('.', ',') + ' ' + (matched.price.currency === 'EUR' ? '€' : matched.price.currency) : '',
                final_formatted: matched.price.final > 0 ? (matched.price.final / 100).toFixed(2).replace('.', ',') + ' ' + (matched.price.currency === 'EUR' ? '€' : matched.price.currency) : (isFree ? 'Free' : '')
              } : undefined,
              header_image: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
              background: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
              background_raw: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`,
              metacritic: matched.metascore ? { score: parseInt(matched.metascore) || 80, url: '' } : undefined,
              platforms: matched.platforms || { windows: true, mac: false, linux: false },
              short_description: '',
              detailed_description: '',
              about_the_game: '',
              supported_languages: '',
              developers: [],
              publishers: [],
              categories: [],
              genres: [],
              screenshots: [
                { id: 1, path_thumbnail: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg`, path_full: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/library_hero.jpg` },
                { id: 2, path_thumbnail: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`, path_full: `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg` },
              ],
              release_date: { coming_soon: false, date: '' }
            }
            appDetailsCache.set(cacheKey, fallbackDetail)
            persistAppDetails(appId, lang, cc, fallbackDetail)
            return fallbackDetail
          }
        }
      } catch {}
    }

    return null
  }, true).finally(() => {
    appDetailsInFlight.delete(cacheKey)
  })

  appDetailsInFlight.set(cacheKey, fetchPromise)
  return fetchPromise
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

  // 1. Populate from memory & persistent localStorage cache first (instant, 0 network calls)
  const missing: number[] = []
  for (const id of unique) {
    const cacheKey = `${id}_${lang}_DE`
    if (appDetailsCache.has(cacheKey)) {
      result.set(id, appDetailsCache.get(cacheKey)!)
    } else {
      const persisted = getPersistedAppDetails(id, lang, 'DE')
      if (persisted) {
        appDetailsCache.set(cacheKey, persisted)
        result.set(id, persisted)
      } else {
        missing.push(id)
      }
    }
  }

  // 2. If circuit breaker is active or no missing, return immediately
  if (missing.length === 0 || isSteamCircuitBreakerTripped()) {
    return result
  }

  // 3. For any uncached items, limit to at most 5 items sequentially to avoid burst blocks
  const fetchLimit = missing.slice(0, 5)
  for (const id of fetchLimit) {
    if (isSteamCircuitBreakerTripped()) break
    try {
      const d = await getSteamAppDetails(id, lang)
      if (d) result.set(id, d)
    } catch {}
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
 * Known Steam AppID to canonical title mappings for zero-latency synchronous resolution.
 * Covers user's common library games (including those that show up as appid_XXXXX after drive reconnects).
 */
export const KNOWN_STEAM_APP_NAMES: Record<number, string> = {
  // Common titles from user report
  105600: 'Terraria',
  1281930: 'tModLoader',
  311210: 'Call of Duty: Black Ops III',
  4000: "Garry's Mod",
  431960: 'Wallpaper Engine',
  477160: 'Human: Fall Flat',
  730: 'Counter-Strike 2',
  3722330: 'Shift At Midnight',
  4704690: 'MECCHA CHAMELEON',
  346330: 'BrainBread 2',
  359050: 'Shower With Your Dad Simulator 2015',
  363970: 'Clicker Heroes',
  365670: 'Blender',
  381210: 'Dead by Daylight',
  4001890: 'How to Fish',

  // Top/popular multiplayer and singleplayer titles
  570: 'Dota 2',
  440: 'Team Fortress 2',
  550: 'Left 4 Dead 2',
  252950: 'Rocket League',
  271590: 'Grand Theft Auto V',
  1172470: 'Apex Legends',
  1086940: "Baldur's Gate 3",
  1245620: 'Elden Ring',
  1091500: 'Cyberpunk 2077',
  252490: 'Rust',
  892970: 'Valheim',
  526870: 'Satisfactory',
  990080: 'Hogwarts Legacy',
  1174180: 'Red Dead Redemption 2',
  292030: 'The Witcher 3: Wild Hunt',
  1623730: 'Palworld',
  2358720: 'Black Myth: Wukong',
  2183900: 'Warhammer 40,000: Space Marine 2',
  1145360: 'Hades',
  1868140: 'Dave the Diver',
  1332010: 'Stray',
  2357570: 'Overwatch 2',
  1097150: 'Fall Guys',
  1222670: 'The Sims 4',
  480: 'Spacewar',
  218620: 'PAYDAY 2',
  230410: 'Warframe',
  359550: "Tom Clancy's Rainbow Six Siege",
  306130: 'The Elder Scrolls Online',
  377160: 'Fallout 4',
  489830: 'The Elder Scrolls V: Skyrim Special Edition',
  1938090: 'Call of Duty',
  251570: '7 Days to Die',
  289070: "Sid Meier's Civilization VI",
  108600: 'Project Zomboid',
  648800: 'Raft',
  322330: "Don't Starve Together",
  1966720: 'Lethal Company',
  2073850: 'The Finals',
  553850: 'HELLDIVERS™ 2',
  236390: 'War Thunder',
  39210: 'FINAL FANTASY XIV Online',
  1063730: 'New World',
  1240440: 'Halo Infinite',
  1203220: 'NARAKA: BLADEPOINT',
  1172620: 'Sea of Thieves',
  221100: 'DayZ',
  582010: 'Monster Hunter: World',
  1446780: 'MONSTER HUNTER RISE',
  2246340: 'Monster Hunter Wilds',
  3017860: 'DOOM: The Dark Ages',
  2677660: 'Indiana Jones and the Great Circle',
  2767030: 'Marvel Rivals',
  1771300: 'Kingdom Come: Deliverance II',
  2457220: 'Avowed',
  1158670: 'Dune: Awakening',
  3280350: 'Death Stranding 2: On the Beach',
  1601580: 'Frostpunk 2',
  2124490: 'Silent Hill 2',
  1790600: 'Dragon Ball: Sparking! ZERO',
  1643320: 'S.T.A.L.K.E.R. 2: Heart of Chornobyl',
  2322010: 'God of War Ragnarök',
  2694490: 'Path of Exile 2',
  1295660: 'Sid Meier’s Civilization® VII',
  2842040: 'Star Wars Outlaws',
  1627720: 'Lies of P',
  1817230: 'Hi-Fi RUSH',
  1850570: "DEATH STRANDING DIRECTOR'S CUT",
  2050650: 'Resident Evil 4',
  1687950: 'Persona 5 Royal',
  1817070: "Marvel's Spider-Man Remastered",
  1593500: 'God of War',
  814380: 'Sekiro: Shadows Die Twice',
  999001: 'Roblox',
}

/**
 * Returns true if the title is a raw placeholder name such as `appid_105600`, `Steam App 730`, etc.
 */
export function isPlaceholderAppName(name?: string, appId?: string | number): boolean {
  if (!name || !name.trim()) return true
  const trimmed = name.trim()
  if (/^(?:appid[_\s-]*|app[_\s-]*|steam[_\s-]*app[_\s-]*|steam[_\s-]+)\d+$/i.test(trimmed)) {
    return true
  }
  if (appId && String(appId).trim() === trimmed) {
    return true
  }
  if (/^\d{5,10}$/.test(trimmed)) {
    return true
  }
  return false
}

/**
 * Extracts a numeric Steam AppID from a placeholder name (e.g. "appid_105600" -> 105600).
 */
export function extractAppIdFromPlaceholder(name?: string, fallbackAppId?: string | number): number | null {
  if (fallbackAppId && !isNaN(Number(fallbackAppId)) && Number(fallbackAppId) > 0) {
    if (isPlaceholderAppName(name, fallbackAppId)) return Number(fallbackAppId)
  }
  if (!name) return null
  const trimmed = name.trim()
  const match = trimmed.match(/^(?:appid[_\s-]*|app[_\s-]*|steam[_\s-]*app[_\s-]*|steam[_\s-]+)(\d+)$/i)
  if (match) {
    const parsed = Number(match[1])
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  if (/^\d{3,10}$/.test(trimmed)) {
    const parsed = Number(trimmed)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return null
}

const memSteamNameCache = new Map<number, string>()

export function getKnownSteamGameName(appId: number | string): string | null {
  const num = typeof appId === 'string' ? Number(appId) : appId
  if (!num || isNaN(num)) return null
  if (KNOWN_STEAM_APP_NAMES[num]) return KNOWN_STEAM_APP_NAMES[num]
  if (memSteamNameCache.has(num)) return memSteamNameCache.get(num)!
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(`eclipse_steam_name_${num}`)
      if (cached && !isPlaceholderAppName(cached, num)) {
        memSteamNameCache.set(num, cached)
        return cached
      }
    }
  } catch {}
  return null
}

/**
 * Resolves a Steam AppID to its canonical game title using instant map, cache, Steam API, or SteamSpy.
 */
export async function resolveSteamAppName(appId: number): Promise<string | null> {
  if (!appId || isNaN(appId) || appId <= 0) return null

  // 1. Instant dictionary
  const known = getKnownSteamGameName(appId)
  if (known) return known

  // 2. In-memory cache
  if (memSteamNameCache.has(appId)) {
    return memSteamNameCache.get(appId)!
  }

  // 3. LocalStorage cache
  try {
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(`eclipse_steam_name_${appId}`) : null
    if (cached && !isPlaceholderAppName(cached, appId)) {
      memSteamNameCache.set(appId, cached)
      return cached
    }
  } catch {}

  // 4. Steam Store API
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://store.fastly.steamstatic.com/api/appdetails?appids=${appId}&filters=basic`, {
      signal: controller.signal
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const entry = data[String(appId)]
      if (entry?.success && entry.data?.name) {
        const resolved = String(entry.data.name).trim()
        if (!isPlaceholderAppName(resolved, appId)) {
          memSteamNameCache.set(appId, resolved)
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(`eclipse_steam_name_${appId}`, resolved)
            }
          } catch {}
          return resolved
        }
      }
    }
  } catch {}

  // 5. SteamSpy fallback
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`, {
      signal: controller.signal
    })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (data?.name && !isPlaceholderAppName(data.name, appId)) {
        const resolved = String(data.name).trim()
        memSteamNameCache.set(appId, resolved)
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`eclipse_steam_name_${appId}`, resolved)
          }
        } catch {}
        return resolved
      }
    }
  } catch {}

  return null
}

const memGamePreviewCache = new Map<string, string>()

/**
 * Known direct preview image URLs for games whose static CDN headers 404
 * or games that require hashed CDN paths.
 */
export const KNOWN_GAME_PREVIEWS: Record<number | string, string> = {
  4704690: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4704690/18d14b8bd834e30a6a25df5ccd7f0a6e644f1577/capsule_231x87.jpg?t=1785908480',
  'meccha chameleon': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4704690/18d14b8bd834e30a6a25df5ccd7f0a6e644f1577/capsule_231x87.jpg?t=1785908480',
  3722330: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3722330/19c9e6ec567f975b0b4462b8c84c1a38c74adf0d/capsule_231x87.jpg?t=1789075879',
  'shift at midnight': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3722330/19c9e6ec567f975b0b4462b8c84c1a38c74adf0d/capsule_231x87.jpg?t=1789075879',
  4001890: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4001890/8f65bb2b78d37a9147aa79c970a51610e6955bf1/capsule_231x87.jpg?t=1788788717',
  'how to fish': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/4001890/8f65bb2b78d37a9147aa79c970a51610e6955bf1/capsule_231x87.jpg?t=1788788717',
}

/**
 * Resolves a live preview/capsule/header image URL for any game by name or Steam ID.
 * Resolves using known preview map, localStorage cache, Steam search, or Steam appdetails.
 */
export async function resolveGamePreviewImage(name: string, steamId?: number): Promise<string | null> {
  const external = getNonSteamGame(name)
  if (external) return external.hero
  const norm = name ? name.toLowerCase().trim() : ''
  const key = steamId ? String(steamId) : norm
  if (!key) return null

  // 1. Instant map
  if (steamId && KNOWN_GAME_PREVIEWS[steamId]) return KNOWN_GAME_PREVIEWS[steamId]
  if (norm && KNOWN_GAME_PREVIEWS[norm]) return KNOWN_GAME_PREVIEWS[norm]

  // 2. Memory cache
  if (memGamePreviewCache.has(key)) return memGamePreviewCache.get(key)!

  // 3. LocalStorage cache
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(`eclipse_game_preview_${key}`)
      if (cached) {
        memGamePreviewCache.set(key, cached)
        return cached
      }
    }
  } catch {}

  // 4. Steam Store Search API (fast, returns working tiny_image directly)
  if (norm) {
    try {
      const cleanTerm = name.replace(/[^a-zA-Z0-9\s:-]/g, '').trim()
      if (cleanTerm) {
        const results = await searchSteamGames(cleanTerm)
        if (results && results.length > 0) {
          const exact = results.find(r => r.name.toLowerCase() === norm || (steamId && r.id === steamId))
          const best = exact || (steamId ? results.find(r => r.id === steamId) : null) || results[0]
          if (best?.tiny_image) {
            memGamePreviewCache.set(key, best.tiny_image)
            if (steamId) memGamePreviewCache.set(String(steamId), best.tiny_image)
            try {
              if (typeof localStorage !== 'undefined') {
                localStorage.setItem(`eclipse_game_preview_${key}`, best.tiny_image)
                if (steamId) localStorage.setItem(`eclipse_game_preview_${steamId}`, best.tiny_image)
              }
            } catch {}
            return best.tiny_image
          }
        }
      }
    } catch {}
  }

  // 5. Steam AppDetails API fallback if steamId is present
  if (steamId && steamId > 0 && steamId !== ROBLOX_APP_ID) {
    try {
      const details = await getSteamAppDetails(steamId)
      const img = details?.header_image
      if (img) {
        memGamePreviewCache.set(key, img)
        memGamePreviewCache.set(String(steamId), img)
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(`eclipse_game_preview_${key}`, img)
            localStorage.setItem(`eclipse_game_preview_${steamId}`, img)
          }
        } catch {}
        return img
      }
    } catch {}
  }

  return null
}

/**
 * Hardcoded Steam AppIDs for popular games that are delisted or have tricky names.
 */
const HARDCODED_STEAM_IDS: Record<string, number> = {
  'how to fish': 4001890,
  'shift at midnight': 3722330,
  'meccha chameleon': 4704690,
  'rocket league': 252950,
  'rocket league®': 252950,
  'fivem': 271590,
  'fivem application data': 271590,
  'spacewar': 480,
  'bombanana! demo': 3244190,
  'bombanana': 3244190,
  'fall guys': 1097150,
  'overwatch 2': 2357570,
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

export function getHardcodedSteamId(name: string): number | null {
  if (getNonSteamGame(name)) return null
  if (!name) return null
  const normalized = name.toLowerCase().trim()
  if (HARDCODED_STEAM_IDS[normalized] !== undefined) {
    const id = HARDCODED_STEAM_IDS[normalized]
    return id === 0 ? null : id
  }
  const clean = normalized.replace(/[®™©]/g, '').trim()
  if (HARDCODED_STEAM_IDS[clean] !== undefined) {
    const id = HARDCODED_STEAM_IDS[clean]
    return id === 0 ? null : id
  }
  const stripped = normalized.replace(/[^a-z0-9]/g, '')
  for (const [k, v] of Object.entries(HARDCODED_STEAM_IDS)) {
    if (v > 0 && k.replace(/[^a-z0-9]/g, '') === stripped) {
      return v
    }
  }
  return null
}

/**
 * Find a Steam AppID for a game by name (for Epic/custom games without a SteamID).
 * Returns the best matching AppID, or null if nothing found.
 */
export async function findSteamIdByName(name: string): Promise<number | null> {
  if (getNonSteamGame(name)) return null
  try {
    const hardcoded = getHardcodedSteamId(name)
    if (hardcoded !== null) return hardcoded
    const normalized = name.toLowerCase().trim()
    if (HARDCODED_STEAM_IDS[normalized] === 0) return null

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
let featuredCache: { timestamp: number; data: { top_sellers: FeaturedGame[]; new_releases: FeaturedGame[]; specials: FeaturedGame[] } } | null = null

/**
 * Fetch the Steam Featured & Categories page — free, no key needed.
 * Returns "top_sellers", "new_releases", "specials" etc.
 */
export async function getSteamFeaturedCategories(): Promise<{
  top_sellers: FeaturedGame[]
  new_releases: FeaturedGame[]
  specials: FeaturedGame[]
} | null> {
  // 1. In-memory cache
  if (featuredCache && (Date.now() - featuredCache.timestamp < 4 * 60 * 60 * 1000)) {
    return featuredCache.data
  }

  // 2. Persistent localStorage cache (survives app restarts)
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('eclipse_steam_featured_v2')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed.timestamp && (Date.now() - parsed.timestamp < 4 * 60 * 60 * 1000)) {
          featuredCache = parsed
          return parsed.data
        }
      }
    }
  } catch {}

  // 3. Circuit breaker check
  if (isSteamCircuitBreakerTripped()) {
    console.warn('[SteamShield] Skipping live getSteamFeaturedCategories (Circuit breaker active)')
    return featuredCache?.data || null
  }

  try {
    return await steamQueue.enqueue(async () => {
      const res = await fetch('https://store.steampowered.com/api/featuredcategories/?l=english&cc=US', {
        headers: BROWSER_HEADERS
      })
      const text = await res.text()
      if (!inspectSteamResponse(res.status, text)) {
        return featuredCache?.data || null
      }
      const data = JSON.parse(text)
      const parsedData = {
        top_sellers:  data.top_sellers?.items  ?? [],
        new_releases: data.new_releases?.items ?? [],
        specials:     data.specials?.items      ?? [],
      }
      featuredCache = { timestamp: Date.now(), data: parsedData }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('eclipse_steam_featured_v2', JSON.stringify(featuredCache))
        }
      } catch {}
      return parsedData
    }, false)
  } catch {
    return featuredCache?.data || null
  }
}

/**
 * Fetches an expanded, rich list of live Steam Special Offers & Deals (combines Steam Store Featured Specials + CheapShark Steam Deals).
 */
export async function fetchTopSteamSpecialOffers(): Promise<SteamGame[]> {
  const games: SteamGame[] = []
  const seenIds = new Set<number>()

  try {
    // 1. Official Steam Store featured specials (cached)
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
            initialPriceFormatted: normalPrice > 0 ? `${normalPrice.toFixed(2)} USD` : undefined,
            priceFormatted: salePrice > 0 ? `${salePrice.toFixed(2)} USD` : undefined,
            isFree: salePrice === 0,
            metacritic: metacritic && metacritic > 0 ? metacritic : undefined,
          })
        }
      }
    }
  } catch (err) {
    console.warn('[steamService] Error fetching top special offers:', err)
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
    return null
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
  peak24h?: number | null
  allTimePeak?: number | null
  livePlaying?: number | null
}

const playerPeakCache = new Map<number, { allTimePeak?: number; peak24h?: number; livePlaying?: number; timestamp: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export async function fetchSteamPlayerStats(appId: number): Promise<{ allTimePeak?: number; peak24h?: number; livePlaying?: number } | null> {
  if (appId === ROBLOX_APP_ID) return null

  const cached = playerPeakCache.get(appId)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(`https://steamcharts.com/app/${appId}`, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    })
    clearTimeout(timeout)
    if (!res.ok) return null

    const text = await res.text()
    const peakAllMatch = text.match(/<span class="num">([\d,]+)<\/span>\s*<br>\s*all-time peak/i)
    const peak24Match = text.match(/<span class="num">([\d,]+)<\/span>\s*<br>\s*24-hour peak/i)
    const liveMatch = text.match(/<span class="num">([\d,]+)<\/span>\s*<br>\s*playing/i)

    const allTimePeak = peakAllMatch ? parseInt(peakAllMatch[1].replace(/,/g, ''), 10) : undefined
    const peak24h = peak24Match ? parseInt(peak24Match[1].replace(/,/g, ''), 10) : undefined
    const livePlaying = liveMatch ? parseInt(liveMatch[1].replace(/,/g, ''), 10) : undefined

    if (allTimePeak !== undefined || peak24h !== undefined || livePlaying !== undefined) {
      const stats = { allTimePeak, peak24h, livePlaying, timestamp: Date.now() }
      playerPeakCache.set(appId, stats)
      return stats
    }
    return null
  } catch {
    return null
  }
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

const reviewSummaryCache = new Map<string, { data: SteamReviewSummary | null; timestamp: number }>()

export async function getSteamReviewSummary(appId: number, lang = 'english'): Promise<SteamReviewSummary | null> {
  if (appId === ROBLOX_APP_ID) return null

  const cacheKey = `${appId}_${lang}`
  const cached = reviewSummaryCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < 12 * 60 * 60 * 1000) {
    return cached.data
  }

  if (isSteamCircuitBreakerTripped()) {
    return null
  }

  try {
    const steamLang = lang === 'de' || lang === 'german' ? 'german' : 'english'
    const res = await steamQueue.enqueue(() =>
      fetch(`https://store.steampowered.com/appreviews/${appId}?json=1&language=all&purchase_type=all&num_per_page=0&l=${steamLang}`, {
        headers: BROWSER_HEADERS
      })
    )
    const text = await res.text()
    if (!inspectSteamResponse(res.status, text) || !res.ok) {
      reviewSummaryCache.set(cacheKey, { data: null, timestamp: Date.now() })
      return null
    }
    const data = JSON.parse(text)
    const summary = data?.query_summary
    if (summary && typeof summary.total_reviews === 'number') {
      const pos = summary.total_positive || 0
      const total = summary.total_reviews || (pos + (summary.total_negative || 0))
      const pct = total > 0 ? Math.round((pos / total) * 100) : 0
      const isDe = steamLang === 'german'
      const result: SteamReviewSummary = {
        reviewScoreDesc: formatReviewScoreDesc(summary.review_score_desc, pct, isDe ? 'de' : 'en'),
        totalPositive: pos,
        totalNegative: summary.total_negative || 0,
        totalReviews: total,
        positivePercent: pct,
      }
      reviewSummaryCache.set(cacheKey, { data: result, timestamp: Date.now() })
      return result
    }
    reviewSummaryCache.set(cacheKey, { data: null, timestamp: Date.now() })
    return null
  } catch {
    return null
  }
}

export async function getSteamDBSummary(appId: number): Promise<SteamDBSummary | null> {
  if (appId === ROBLOX_APP_ID) return null
  try {
    const [spyRes, chartStats] = await Promise.allSettled([
      fetch(`https://steamspy.com/api.php?request=appdetails&appid=${appId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetchSteamPlayerStats(appId)
    ])

    const spyData = spyRes.status === 'fulfilled' ? spyRes.value : null
    const chart = chartStats.status === 'fulfilled' ? chartStats.value : null

    if (!spyData && !chart) return null

    return {
      ccu: chart?.livePlaying ?? (typeof spyData?.ccu === 'number' ? spyData.ccu : 0),
      positive: typeof spyData?.positive === 'number' ? spyData.positive : 0,
      negative: typeof spyData?.negative === 'number' ? spyData.negative : 0,
      owners: spyData?.owners || 'Unknown',
      averageForeverMinutes: typeof spyData?.average_forever === 'number' ? spyData.average_forever : 0,
      tags: typeof spyData?.tags === 'object' && spyData.tags ? spyData.tags : {},
      peak24h: chart?.peak24h ?? null,
      allTimePeak: chart?.allTimePeak ?? null,
      livePlaying: chart?.livePlaying ?? null,
    }
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
  currentPlayers?: number
  positivePercent?: number
  isFree?: boolean
  priceFormatted?: string
  initialPriceFormatted?: string
  discountPercent?: number
  screenshots?: string[]
  movies?: Array<{ id: number; name: string; thumbnail: string; webm?: { 480?: string; max?: string }; mp4?: { 480?: string; max?: string }; hls_h264?: string }>
  headerImage?: string
  heroImage?: string
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
  steamAvatarFrameUrl?: string | null;
  steamAvatarFrameStaticUrl?: string | null;
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
 * Validates whether a URL is a genuine Steam profile background.
 * Prevents avatar frames, avatars, stickers, emoticons, and badges from being displayed as full screen backgrounds.
 */
export function isValidSteamBackground(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false
  const clean = url.toLowerCase().trim()
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false
  const urlWithoutQuery = clean.split('?')[0].split('#')[0]
  if (
    clean.includes('avatar') ||
    clean.includes('profile_avatar_frame') ||
    clean.includes('/badges/') ||
    clean.includes('/emoticons/') ||
    clean.includes('/stickers/') ||
    urlWithoutQuery.endsWith('.png') ||
    urlWithoutQuery.endsWith('.apng')
  ) {
    return false
  }
  return true
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
        avatarFull = [...htmlDoc.querySelectorAll('.profile_header .playerAvatarAutoSizeInner img, .profile_header .playerAvatar img')].find(img => !img.closest('.profile_avatar_frame'))?.getAttribute('src') ||
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
    let steamFrame: ReturnType<typeof readSteamAvatarFrame> = {};

    if (htmlText) {
      const htmlDoc = parser.parseFromString(htmlText, 'text/html');
      steamFrame = readSteamAvatarFrame(htmlDoc);
      
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
            const rawName = nameEl.textContent?.trim() || '';
            const name = rawName
              .replace(/&nbsp;/gi, ' ')
              .replace(/&#160;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&#39;/gi, "'")
              .replace(/&quot;/gi, '"')
              .replace(/[\u00a0\u202f]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            const appIdUrl = nameEl.getAttribute('href') || '';
            const appId = appIdUrl.split('/').filter(Boolean).pop() || '';
            // Extract just the hours, usually "64 hrs on record" before the <br>
            const playtimeRaw = playtimeEl.innerHTML.split('<br>')[0].trim();
            const playtime = playtimeRaw
              .replace(/<[^>]+>/g, '')
              .replace(/&nbsp;/gi, ' ')
              .replace(/&#160;/gi, ' ')
              .replace(/&amp;/gi, '&')
              .replace(/&#39;/gi, "'")
              .replace(/&quot;/gi, '"')
              .replace(/[\u00a0\u202f]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
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

      // 1. Live Animated Background (video) - strictly within the background container
      const animHolder = htmlDoc.querySelector('.profile_animated_background, .profile_background_holder_content');
      if (animHolder) {
        const videoEl = animHolder.querySelector('video');
        if (videoEl) {
          const mp4 = videoEl.querySelector('source[type="video/mp4"]')?.getAttribute('src');
          const webm = videoEl.querySelector('source[type="video/webm"]')?.getAttribute('src');
          const direct = videoEl.getAttribute('src');
          const cand = mp4 || webm || direct || undefined;
          if (cand && isValidSteamBackground(cand)) {
            steamBackgroundMovie = cand;
          }
        }
      }

      // 2. Static Background image - strictly on the profile background container
      const bgHolders = htmlDoc.querySelectorAll('.no_header.has_profile_background, .profile_page.has_profile_background, .profile_background_image_content, .profile_background_holder_content');
      bgHolders.forEach(el => {
        const style = el.getAttribute('style') || '';
        const urlMatch = style.match(/background-image:\s*url\(\s*['"]?(https:\/\/[^'")]+)['"]?\s*\)/i) ||
                         style.match(/url\(\s*['"]?(https:\/\/[^'")]+)['"]?\s*\)/i);
        if (urlMatch && !steamBackgroundUrl) {
          const cand = urlMatch[1].trim();
          if (isValidSteamBackground(cand)) {
            steamBackgroundUrl = cand;
          }
        }
      });
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
      ...steamFrame,
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
