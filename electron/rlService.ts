import fs from 'fs'
import path from 'path'
import os from 'os'
import { BrowserWindow, session } from 'electron'

export type RLPlaylist = '1v1' | '2v2' | '3v3'

export type RLRankData = {
  playerName: string
  platform: 'steam' | 'epic' | 'unknown'
  playerId: string
  rankName: string
  rankIcon: string
  mmr: number
  division: number
  sessionWins: number
  sessionLosses: number
  sessionMMRDelta: number
  playlist: RLPlaylist
  isLoading: boolean
  error?: string
}

const PLAYLIST_IDS: Record<RLPlaylist, number> = {
  '1v1': 10,
  '2v2': 11,
  '3v3': 13,
}

type PlayerInfo = {
  platform: 'steam' | 'epic' | 'unknown'
  id: string
  name: string
}

let updateCallback: ((data: RLRankData) => void) | null = null
let watchInterval: NodeJS.Timeout | null = null
let fetchInterval: NodeJS.Timeout | null = null
let replayWatcher: fs.FSWatcher | null = null
let lastMMR = 0
let sessionWins = 0
let sessionLosses = 0
let sessionMMRDelta = 0
let cachedPlayerInfo: PlayerInfo | null = null
let currentPlaylist: RLPlaylist = '2v2'
let trnApiKey = ''

// ─── Persistent BrowserWindow (keeps Cloudflare cookies across restarts) ──────
let scraperWin: BrowserWindow | null = null
let cloudflareReady = false

// ─── Log File Paths ───────────────────────────────────────────────────────────
function getDocsPaths(): { logPaths: string[]; demoPaths: string[] } {
  const docs = path.join(os.homedir(), 'Documents')
  const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents')
  const logBase = 'My Games\\Rocket League\\TAGame\\Logs\\Launch.log'
  const demoBase = 'My Games\\Rocket League\\TAGame\\Demos'
  return {
    logPaths: [path.join(docs, logBase), path.join(oneDriveDocs, logBase)],
    demoPaths: [path.join(docs, demoBase), path.join(oneDriveDocs, demoBase)],
  }
}

// ─── Extract Player Info from Log ─────────────────────────────────────────────
function extractPlayerFromLog(): PlayerInfo | null {
  const { logPaths } = getDocsPaths()
  for (const logPath of logPaths) {
    if (!fs.existsSync(logPath)) continue
    try {
      const stat = fs.statSync(logPath)
      const size = stat.size
      const readSize = Math.min(204800, size) // 200KB
      const buf = Buffer.alloc(readSize)
      const fd = fs.openSync(logPath, 'r')
      fs.readSync(fd, buf, 0, readSize, size - readSize)
      fs.closeSync(fd)
      const content = buf.toString('utf-8')

      const epicIdMatch = content.match(/-epicuserid=([a-f0-9]{32})/i)
      const epicNameMatch = content.match(/-epicusername=([^\s\-&?]+)/i)
      if (epicIdMatch && epicNameMatch) {
        const displayName = decodeURIComponent(epicNameMatch[1])
        return {
          platform: 'epic',
          id: displayName, // tracker.gg needs the display name, NOT the account ID hash
          name: displayName,
        }
      }
      const steamMatch = content.match(/Steam\|(\d{15,17})\|0/i)
      if (steamMatch) {
        return { platform: 'steam', id: steamMatch[1], name: 'Steam Player' }
      }
    } catch { /* skip */ }
  }
  return null
}

// ─── Method 1: Official TRN API Key (best, no Cloudflare issues) ──────────────
async function fetchWithTRNKey(playerInfo: PlayerInfo, playlist: RLPlaylist): Promise<Partial<RLRankData>> {
  const platform = playerInfo.platform
  const id = playerInfo.id
  const apiUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(id)}`
  console.log(`[RLService] TRN API Key fetch: ${apiUrl}`)

  return new Promise((resolve) => {
    const https = require('https')
    const req = https.get(apiUrl, {
      headers: {
        'TRN-Api-Key': trnApiKey,
        'Accept': 'application/json',
        'User-Agent': 'Eclipse-Launcher/1.0',
      },
      timeout: 10000,
    }, (res: any) => {
      let data = ''
      res.on('data', (c: any) => { data += c })
      res.on('end', () => {
        try {
          console.log(`[RLService] TRN API status: ${res.statusCode}`)
          if (res.statusCode === 429) {
            resolve({ error: 'Rate limited (50 req/min exceeded)' }); return
          }
          if (res.statusCode === 403) {
            resolve({ error: 'Invalid TRN API Key' }); return
          }
          const json = JSON.parse(data)
          resolve(parseAPIResponse(json, playlist))
        } catch (e: any) {
          resolve({ error: `Parse error: ${e.message}` })
        }
      })
    })
    req.on('error', (e: any) => resolve({ error: `Network: ${e.message}` }))
    req.setTimeout(10000, () => { req.destroy(); resolve({ error: 'Timeout' }) })
  })
}

// ─── Method 2: Persistent Session BrowserWindow (fallback) ────────────────────
function getScraperWin(): BrowserWindow {
  if (!scraperWin || scraperWin.isDestroyed()) {
    // Use persist: prefix = cookies saved to disk between app restarts!
    const persistSession = session.fromPartition('persist:tracker-gg')

    scraperWin = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: false,
        javascript: true,
        session: persistSession,
        backgroundThrottling: true,   // throttle when hidden — saves CPU
        offscreen: false,             // must be false for executeJavaScript to work
      },
    })
    cloudflareReady = false
    scraperWin.on('closed', () => {
      scraperWin = null
      cloudflareReady = false
    })
  }
  return scraperWin
}

async function fetchWithPersistentSession(playerInfo: PlayerInfo, playlist: RLPlaylist): Promise<Partial<RLRankData>> {
  const win = getScraperWin()
  const platform = playerInfo.platform
  const id = playerInfo.id
  const homeUrl = 'https://rocketleague.tracker.network/'
  const apiUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(id)}`

  // Step 1: If Cloudflare not yet cleared, load homepage first
  if (!cloudflareReady) {
    console.log('[RLService] Loading homepage for Cloudflare clearance...')
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { cloudflareReady = true; resolve() }, 20000)

      const pollTitle = async () => {
        if (win.isDestroyed()) { clearTimeout(timeout); resolve(); return }
        try {
          const title: string = await win.webContents.executeJavaScript('document.title')
          if (!title.toLowerCase().includes('moment') && !title.toLowerCase().includes('cloudflare') && title.length > 0) {
            clearTimeout(timeout)
            cloudflareReady = true
            console.log(`[RLService] Cloudflare cleared! Title: "${title}"`)
            resolve()
            return
          }
        } catch { /* retry */ }
        setTimeout(pollTitle, 1500)
      }

      win.webContents.once('did-stop-loading', () => setTimeout(pollTitle, 2000))
      win.loadURL(homeUrl, {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      })
    })
  }

  if (win.isDestroyed()) return { error: 'Scraper window closed' }

  // Step 2: Use fetch() from within the page (has Cloudflare cookies!)
  console.log('[RLService] Making in-page API fetch with session cookies...')
  try {
    const rawResult: string = await win.webContents.executeJavaScript(`
      (async function() {
        try {
          const r = await fetch('${apiUrl}', {
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
              'Referer': 'https://rocketleague.tracker.network/',
            }
          });
          const t = await r.text();
          return JSON.stringify({ status: r.status, body: t });
        } catch(e) {
          return JSON.stringify({ status: 0, error: e.message });
        }
      })()
    `)

    const result = JSON.parse(rawResult)
    console.log(`[RLService] Session fetch status: ${result.status}`)

    if (result.status === 403 || result.status === 429) {
      cloudflareReady = false // Force re-auth next time
      return { error: `API blocked (${result.status}), will retry...` }
    }
    if (result.status !== 200) return { error: `HTTP ${result.status}` }
    if (result.error) return { error: result.error }

    return parseAPIResponse(JSON.parse(result.body), playlist)
  } catch (e: any) {
    return { error: `JS exec error: ${e.message}` }
  }
}

// ─── Parse tracker.gg API response ────────────────────────────────────────────
function parseAPIResponse(json: any, playlist: RLPlaylist): Partial<RLRankData> {
  const segments: any[] = json?.data?.segments || []
  const errors: any[] = json?.errors || []

  if (errors.length > 0) {
    const msg = errors[0]?.message || 'Unknown API error'
    console.log(`[RLService] API error: ${msg}`)
    return { error: msg }
  }

  console.log(`[RLService] Total segments: ${segments.length}`)
  const targetId = PLAYLIST_IDS[playlist]

  let seg = segments.find((s: any) =>
    s.type === 'playlist' && Number(s.attributes?.playlist) === targetId
  )
  if (!seg) {
    // Log available playlists for debugging
    segments.filter(s => s.type === 'playlist').forEach((s: any) => {
      console.log(`  playlist ${s.attributes?.playlist}: ${s.stats?.tier?.metadata?.name} (${s.stats?.rating?.value} MMR)`)
    })
    seg = segments.find((s: any) => s.type === 'playlist' && s.stats?.rating?.value > 0)
    if (seg) console.log(`[RLService] Used fallback playlist ${seg.attributes?.playlist}`)
  }

  if (!seg) {
    return { error: 'No ranked data found', rankName: 'Unranked', mmr: 0, division: 0 }
  }

  const mmr = Math.round(seg.stats?.rating?.value || 0)
  const rankName: string = seg.stats?.tier?.metadata?.name || 'Unranked'
  const divRaw: string = String(seg.stats?.division?.metadata?.name || '')
  const divNum = parseInt(divRaw.replace(/\D/g, '') || '0') || 0

  console.log(`[RLService] ✅ rank=${rankName}, mmr=${mmr}, div=${divNum}`)
  return {
    rankName,
    rankIcon: rankName.toLowerCase().replace(/\s+/g, '-'),
    mmr,
    division: divNum,
    error: undefined,
  }
}

// ─── Main Fetch (tries TRN key first, then session fallback) ──────────────────
async function fetchRankData(playerInfo: PlayerInfo, playlist: RLPlaylist): Promise<Partial<RLRankData>> {
  if (trnApiKey && trnApiKey.length > 10) {
    console.log('[RLService] Using TRN API Key method')
    return fetchWithTRNKey(playerInfo, playlist)
  }
  console.log('[RLService] Using persistent session method (no TRN key)')
  return fetchWithPersistentSession(playerInfo, playlist)
}

// ─── Replay File Watcher (detects match end for immediate W/L) ─────────────────
function startReplayWatcher() {
  const { demoPaths } = getDocsPaths()
  const demoDir = demoPaths.find(p => fs.existsSync(p))
  if (!demoDir) {
    console.log('[RLService] Replay folder not found, skipping watcher')
    return
  }

  console.log(`[RLService] Watching replay folder: ${demoDir}`)
  let lastCheck = Date.now()

  try {
    replayWatcher = fs.watch(demoDir, { persistent: false }, (eventType, filename) => {
      if (!filename || !filename.endsWith('.replay')) return
      const now = Date.now()
      if (now - lastCheck < 5000) return // Debounce 5s
      lastCheck = now
      console.log(`[RLService] New replay detected: ${filename} - fetching updated MMR...`)
      // Wait a few seconds for the server to update MMR
      setTimeout(() => fetchAndEmit(), 8000)
    })
  } catch (e) {
    console.log('[RLService] Could not watch replay folder:', e)
  }
}

// ─── Emit update to overlay ───────────────────────────────────────────────────
async function fetchAndEmit() {
  if (!updateCallback) return

  const playerInfo = cachedPlayerInfo || extractPlayerFromLog()

  if (!playerInfo) {
    updateCallback({
      playerName: '', platform: 'unknown', playerId: '',
      rankName: 'Waiting for RL...', rankIcon: 'unranked',
      mmr: 0, division: 0,
      sessionWins, sessionLosses, sessionMMRDelta,
      playlist: currentPlaylist, isLoading: true,
      error: 'RL log not found',
    })
    return
  }
  cachedPlayerInfo = playerInfo

  // Emit loading with cached data immediately
  updateCallback({
    playerName: playerInfo.name, platform: playerInfo.platform, playerId: playerInfo.id,
    rankName: lastMMR ? 'Refreshing...' : 'Loading...',
    rankIcon: 'loading',
    mmr: lastMMR, division: 0,
    sessionWins, sessionLosses, sessionMMRDelta,
    playlist: currentPlaylist, isLoading: true,
  })

  const rankData = await fetchRankData(playerInfo, currentPlaylist)

  // Track W/L via MMR delta
  if (rankData.mmr && rankData.mmr > 0 && lastMMR > 0 && rankData.mmr !== lastMMR) {
    const delta = rankData.mmr - lastMMR
    sessionMMRDelta += delta
    if (delta > 0) sessionWins++
    else sessionLosses++
    console.log(`[RLService] 📊 MMR: ${lastMMR} → ${rankData.mmr} (${delta > 0 ? '+' : ''}${delta}) W:${sessionWins} L:${sessionLosses}`)
  }
  if (rankData.mmr && rankData.mmr > 0) lastMMR = rankData.mmr

  if (!updateCallback) return

  updateCallback({
    playerName: playerInfo.name, platform: playerInfo.platform, playerId: playerInfo.id,
    rankName: rankData.rankName || 'Unranked',
    rankIcon: rankData.rankIcon || 'unranked',
    mmr: rankData.mmr || lastMMR || 0,
    division: rankData.division || 0,
    sessionWins, sessionLosses, sessionMMRDelta,
    playlist: currentPlaylist,
    isLoading: false,
    error: rankData.error,
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────
export function startRLService(
  onUpdate: (data: RLRankData) => void,
  playlist: RLPlaylist = '2v2',
  apiKey = ''
) {
  updateCallback = onUpdate
  currentPlaylist = playlist
  trnApiKey = apiKey
  sessionWins = 0
  sessionLosses = 0
  sessionMMRDelta = 0
  lastMMR = 0
  cachedPlayerInfo = null

  // Start fetching immediately
  fetchAndEmit()

  // Watch replay folder to detect match end
  startReplayWatcher()

  // Re-scan log every 10s if player not found
  watchInterval = setInterval(() => {
    if (!cachedPlayerInfo) {
      cachedPlayerInfo = extractPlayerFromLog()
      if (cachedPlayerInfo) fetchAndEmit()
    }
  }, 10000)

  // Periodic refresh every 3 min as backup
  fetchInterval = setInterval(fetchAndEmit, 180000)
}

export function stopRLService() {
  updateCallback = null
  if (watchInterval) { clearInterval(watchInterval); watchInterval = null }
  if (fetchInterval) { clearInterval(fetchInterval); fetchInterval = null }
  if (replayWatcher) { replayWatcher.close(); replayWatcher = null }
  sessionWins = 0
  sessionLosses = 0
  sessionMMRDelta = 0
  lastMMR = 0
  cachedPlayerInfo = null
  // Keep scraperWin alive — cookies must persist!
}

export function setRLPlaylist(playlist: RLPlaylist) {
  if (currentPlaylist !== playlist) {
    console.log(`[RLService] Playlist: ${currentPlaylist} → ${playlist}`)
    currentPlaylist = playlist
    lastMMR = 0
    sessionWins = 0
    sessionLosses = 0
    sessionMMRDelta = 0
    fetchAndEmit()
  }
}

export function setRLApiKey(key: string) {
  trnApiKey = key
  console.log(`[RLService] TRN API Key ${key ? 'set' : 'cleared'}`)
  if (cachedPlayerInfo) fetchAndEmit()
}

export function destroyRLScraper() {
  if (scraperWin && !scraperWin.isDestroyed()) {
    scraperWin.destroy()
    scraperWin = null
  }
}
