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

type ParsedPlaylists = Record<RLPlaylist, {
  rankName: string
  rankIcon: string
  mmr: number
  division: number
}>

type PlayerInfo = {
  platform: 'steam' | 'epic' | 'unknown'
  id: string
  name: string
}

const PLAYLIST_IDS: Record<RLPlaylist, number> = {
  '1v1': 10,
  '2v2': 11,
  '3v3': 13,
}

let updateCallback: ((data: RLRankData) => void) | null = null
let watchInterval: NodeJS.Timeout | null = null
let fetchInterval: NodeJS.Timeout | null = null
let replayWatchers: fs.FSWatcher[] = []
let logWatcher: fs.FSWatcher | null = null
let lastLogSize = 0

let lastMMR = 0
let sessionWins = 0
let sessionLosses = 0
let sessionMMRDelta = 0
let cachedPlayerInfo: PlayerInfo | null = null
let currentPlaylist: RLPlaylist = '2v2'
let trnApiKey = ''
let cachedPlaylists: ParsedPlaylists | null = null

// Persistent hidden BrowserWindow for zero-key web scraping
let scraperWin: BrowserWindow | null = null

// ─── Folder & File Paths ───────────────────────────────────────────────────────
function getDocsPaths(): { logPaths: string[]; demoPaths: string[] } {
  const docs = path.join(os.homedir(), 'Documents')
  const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents')
  const logBase = 'My Games\\Rocket League\\TAGame\\Logs\\Launch.log'
  const demoBases = [
    'My Games\\Rocket League\\TAGame\\DemosEpic',
    'My Games\\Rocket League\\TAGame\\Demos',
  ]

  const logPaths: string[] = [
    path.join(docs, logBase),
    path.join(oneDriveDocs, logBase),
  ]

  const demoPaths: string[] = []
  for (const db of demoBases) {
    demoPaths.push(path.join(docs, db))
    demoPaths.push(path.join(oneDriveDocs, db))
  }

  return { logPaths, demoPaths }
}

function getRocketStatsDir(): string | null {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const rsDir = path.join(appData, 'bakkesmod', 'bakkesmod', 'data', 'RocketStats')
  if (fs.existsSync(rsDir)) return rsDir
  return null
}

// ─── Auto-Extract Player Identity from Rocket League Launch.log ───────────────
export function extractPlayerFromLog(): PlayerInfo | null {
  const { logPaths } = getDocsPaths()
  for (const logPath of logPaths) {
    if (!fs.existsSync(logPath)) continue
    try {
      const stat = fs.statSync(logPath)
      const size = stat.size
      const readSize = Math.min(300000, size) // 300KB
      const buf = Buffer.alloc(readSize)
      const fd = fs.openSync(logPath, 'r')
      fs.readSync(fd, buf, 0, readSize, Math.max(0, size - readSize))
      fs.closeSync(fd)
      const content = buf.toString('utf-8')

      // 1. Epic Games username & ID
      const epicNameMatch = content.match(/-epicusername=([^\s\-&?]+)/i)
      const epicIdMatch = content.match(/-epicuserid=([a-f0-9]{32})/i)
      if (epicNameMatch) {
        const displayName = decodeURIComponent(epicNameMatch[1])
        return {
          platform: 'epic',
          id: displayName,
          name: displayName,
        }
      }

      // 2. Steam 64-bit ID
      const steamMatch = content.match(/Steam\|(\d{15,17})\|0/i)
      if (steamMatch) {
        return { platform: 'steam', id: steamMatch[1], name: 'Steam Player' }
      }
    } catch { /* skip */ }
  }
  return null
}

// ─── Scraper Window Singleton ─────────────────────────────────────────────────
function getScraperWin(): BrowserWindow {
  if (!scraperWin || scraperWin.isDestroyed()) {
    const persistSession = session.fromPartition('persist:rl-tracker')
    scraperWin = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: persistSession,
        backgroundThrottling: false,
      },
    })
    scraperWin.on('closed', () => {
      scraperWin = null
    })
  }
  return scraperWin
}

// ─── Smart Zero-Key Scraper (reads window.__INITIAL_STATE__) ───────────────────
async function fetchWithSmartScraper(playerInfo: PlayerInfo): Promise<ParsedPlaylists | null> {
  const win = getScraperWin()
  const platform = playerInfo.platform === 'steam' ? 'steam' : 'epic'
  const id = playerInfo.id
  const url = `https://rocketleague.tracker.network/rocket-league/profile/${platform}/${encodeURIComponent(id)}/overview`

  console.log(`[RLService] 🚀 Smart Tracker fetching profile: ${url}`)

  return new Promise((resolve) => {
    let resolved = false
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        console.log('[RLService] Tracker fetch timed out after 12s')
        resolve(null)
      }
    }, 12000)

    const finish = (result: ParsedPlaylists | null) => {
      if (!resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve(result)
      }
    }

    const checkState = async (attemptsLeft = 6) => {
      if (win.isDestroyed()) { finish(null); return }
      try {
        const data: any[] | null = await win.webContents.executeJavaScript(`
          (function() {
            const s = window.__INITIAL_STATE__;
            if (!s) return null;
            const profiles = s.stats?.standardProfiles || [];
            const res = [];
            for (const p of profiles) {
              for (const seg of (p.segments || [])) {
                if (seg.type === 'playlist') {
                  res.push({
                    name: seg.metadata?.name || '',
                    playlistId: Number(seg.attributes?.playlist),
                    rank: seg.stats?.tier?.metadata?.name || 'Unranked',
                    division: seg.stats?.division?.metadata?.name || '',
                    mmr: Math.round(seg.stats?.rating?.value || 0),
                    iconUrl: seg.stats?.tier?.metadata?.iconUrl || ''
                  });
                }
              }
            }
            return res.length > 0 ? res : null;
          })()
        `)

        if (data && data.length > 0) {
          const map: ParsedPlaylists = {
            '1v1': { rankName: 'Unranked', rankIcon: 'unranked', mmr: 0, division: 0 },
            '2v2': { rankName: 'Unranked', rankIcon: 'unranked', mmr: 0, division: 0 },
            '3v3': { rankName: 'Unranked', rankIcon: 'unranked', mmr: 0, division: 0 },
          }

          for (const item of data) {
            const divNum = parseInt(String(item.division).replace(/\D/g, '') || '0') || 0
            const rankName = item.rank || 'Unranked'
            const rankIcon = rankName.toLowerCase().replace(/\s+/g, '-')
            const entry = {
              rankName,
              rankIcon,
              mmr: item.mmr || 0,
              division: divNum,
            }

            if (item.playlistId === 10 || /duel|1v1/i.test(item.name)) {
              map['1v1'] = entry
            } else if (item.playlistId === 11 || /doubles|2v2/i.test(item.name)) {
              map['2v2'] = entry
            } else if (item.playlistId === 13 || /standard|3v3/i.test(item.name)) {
              map['3v3'] = entry
            }
          }

          console.log(`[RLService] ✅ Parsed all playlists: 1v1=${map['1v1'].mmr} | 2v2=${map['2v2'].mmr} | 3v3=${map['3v3'].mmr}`)
          finish(map)
          return
        }
      } catch (err: any) {
        console.log('[RLService] JavaScript evaluation waiting...', err?.message)
      }

      if (attemptsLeft > 0) {
        setTimeout(() => checkState(attemptsLeft - 1), 1000)
      } else {
        finish(null)
      }
    }

    win.webContents.once('did-stop-loading', () => {
      setTimeout(() => checkState(), 1000)
    })

    win.loadURL(url, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }).catch(() => finish(null))
  })
}

// ─── Local BakkesMod RocketStats Sync (Fastest 0ms local fallback) ────────────
function readLocalRocketStats(): Partial<RLRankData> | null {
  const rsDir = getRocketStatsDir()
  if (!rsDir) return null

  try {
    const mmrPath = path.join(rsDir, 'RocketStats_MMR.txt')
    const rankPath = path.join(rsDir, 'RocketStats_RankName.txt')
    const winPath = path.join(rsDir, 'RocketStats_Win.txt')
    const lossPath = path.join(rsDir, 'RocketStats_Loss.txt')

    if (!fs.existsSync(mmrPath)) return null

    const mmr = parseInt(fs.readFileSync(mmrPath, 'utf8').trim()) || 0
    const rankRaw = fs.existsSync(rankPath) ? fs.readFileSync(rankPath, 'utf8').trim() : 'Unranked'
    const wins = fs.existsSync(winPath) ? parseInt(fs.readFileSync(winPath, 'utf8').trim()) : sessionWins
    const losses = fs.existsSync(lossPath) ? parseInt(fs.readFileSync(lossPath, 'utf8').trim()) : sessionLosses

    if (mmr > 0) {
      return {
        mmr,
        rankName: rankRaw !== 'norank' ? rankRaw : 'Unranked',
        rankIcon: rankRaw.toLowerCase().replace(/\s+/g, '-'),
        sessionWins: Number.isFinite(wins) ? wins : sessionWins,
        sessionLosses: Number.isFinite(losses) ? losses : sessionLosses,
      }
    }
  } catch { /* skip */ }
  return null
}

// ─── Optional: Official TRN API Key Method (if user specified a key) ──────────
async function fetchWithTRNKey(playerInfo: PlayerInfo, playlist: RLPlaylist): Promise<Partial<RLRankData>> {
  const platform = playerInfo.platform
  const id = playerInfo.id
  const apiUrl = `https://api.tracker.gg/api/v2/rocket-league/standard/profile/${platform}/${encodeURIComponent(id)}`

  return new Promise((resolve) => {
    const https = require('https')
    const req = https.get(apiUrl, {
      headers: {
        'TRN-Api-Key': trnApiKey,
        'Accept': 'application/json',
        'User-Agent': 'Eclipse-Launcher/1.0',
      },
      timeout: 8000,
    }, (res: any) => {
      let data = ''
      res.on('data', (c: any) => { data += c })
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const json = JSON.parse(data)
            const segments: any[] = json?.data?.segments || []
            const targetId = PLAYLIST_IDS[playlist]
            const seg = segments.find((s: any) => s.type === 'playlist' && Number(s.attributes?.playlist) === targetId)
            if (seg) {
              const mmr = Math.round(seg.stats?.rating?.value || 0)
              const rankName: string = seg.stats?.tier?.metadata?.name || 'Unranked'
              const divRaw: string = String(seg.stats?.division?.metadata?.name || '')
              const divNum = parseInt(divRaw.replace(/\D/g, '') || '0') || 0
              resolve({
                rankName,
                rankIcon: rankName.toLowerCase().replace(/\s+/g, '-'),
                mmr,
                division: divNum,
              })
              return
            }
          }
          resolve({ error: `TRN API returned status ${res.statusCode}` })
        } catch (e: any) {
          resolve({ error: `Parse error: ${e.message}` })
        }
      })
    })
    req.on('error', (e: any) => resolve({ error: `Network: ${e.message}` }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ error: 'Timeout' }) })
  })
}

// ─── Match End & Replay Watchers ──────────────────────────────────────────────
function startReplayWatcher() {
  const { demoPaths } = getDocsPaths()
  const existingDirs = demoPaths.filter(p => fs.existsSync(p))

  if (existingDirs.length === 0) {
    console.log('[RLService] No replay directories found')
    return
  }

  let lastReplayTrigger = 0

  for (const dir of existingDirs) {
    try {
      console.log(`[RLService] Watching replay folder: ${dir}`)
      const watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
        if (!filename || !filename.endsWith('.replay')) return
        const now = Date.now()
        if (now - lastReplayTrigger < 4000) return
        lastReplayTrigger = now
        console.log(`[RLService] 🎮 Match Replay Saved: ${filename} - refreshing MMR in 5s...`)
        setTimeout(() => fetchAndEmit(), 5000)
      })
      replayWatchers.push(watcher)
    } catch { /* skip */ }
  }
}

function startLogWatcher() {
  const { logPaths } = getDocsPaths()
  const activeLog = logPaths.find(p => fs.existsSync(p))
  if (!activeLog) return

  try {
    lastLogSize = fs.statSync(activeLog).size
    let lastWinnerTrigger = 0

    logWatcher = fs.watch(activeLog, { persistent: false }, () => {
      try {
        const stat = fs.statSync(activeLog)
        if (stat.size > lastLogSize) {
          const readLen = stat.size - lastLogSize
          const buf = Buffer.alloc(readLen)
          const fd = fs.openSync(activeLog, 'r')
          fs.readSync(fd, buf, 0, readLen, lastLogSize)
          fs.closeSync(fd)
          lastLogSize = stat.size

          const newText = buf.toString('utf8')
          // GFX_WinnerMenu_SF.upk indicates match ending celebration menu
          if (newText.includes('GFX_WinnerMenu_SF') || newText.includes('PartyPostMatch')) {
            const now = Date.now()
            if (now - lastWinnerTrigger > 10000) {
              lastWinnerTrigger = now
              console.log('[RLService] 🏆 Match end celebration detected in log! Refreshing stats...')
              setTimeout(() => fetchAndEmit(), 5000)
            }
          }
        } else {
          lastLogSize = stat.size
        }
      } catch { /* skip */ }
    })
  } catch { /* skip */ }
}

// ─── Fetch and Emit Function ──────────────────────────────────────────────────
async function fetchAndEmit() {
  if (!updateCallback) return

  const playerInfo = cachedPlayerInfo || extractPlayerFromLog()

  if (!playerInfo) {
    updateCallback({
      playerName: '',
      platform: 'unknown',
      playerId: '',
      rankName: 'Warte auf Rocket League...',
      rankIcon: 'unranked',
      mmr: 0,
      division: 0,
      sessionWins,
      sessionLosses,
      sessionMMRDelta,
      playlist: currentPlaylist,
      isLoading: false,
      error: 'Kein Rocket League Profil erkannt. Starte das Spiel einmalig.',
    })
    return
  }
  cachedPlayerInfo = playerInfo

  // Emit loading state with previous known values
  updateCallback({
    playerName: playerInfo.name,
    platform: playerInfo.platform,
    playerId: playerInfo.id,
    rankName: lastMMR > 0 ? (cachedPlaylists?.[currentPlaylist]?.rankName || 'Aktualisiere...') : 'Lädt...',
    rankIcon: cachedPlaylists?.[currentPlaylist]?.rankIcon || 'loading',
    mmr: lastMMR,
    division: cachedPlaylists?.[currentPlaylist]?.division || 0,
    sessionWins,
    sessionLosses,
    sessionMMRDelta,
    playlist: currentPlaylist,
    isLoading: true,
  })

  let rankData: Partial<RLRankData> | null = null

  // Priority 1: Smart WebContext Scraper (100% Free, No API Key needed!)
  if (!trnApiKey || trnApiKey.length < 10) {
    const playlists = await fetchWithSmartScraper(playerInfo)
    if (playlists) {
      cachedPlaylists = playlists
      rankData = playlists[currentPlaylist]
    }
  }

  // Priority 2: TRN API Key (if provided by user)
  if (!rankData && trnApiKey && trnApiKey.length > 10) {
    rankData = await fetchWithTRNKey(playerInfo, currentPlaylist)
  }

  // Priority 3: BakkesMod RocketStats local files
  if (!rankData || !rankData.mmr) {
    const local = readLocalRocketStats()
    if (local && local.mmr) {
      rankData = {
        ...rankData,
        ...local,
      }
    }
  }

  // Fallback to cached playlist if available
  if ((!rankData || !rankData.mmr) && cachedPlaylists && cachedPlaylists[currentPlaylist]) {
    rankData = cachedPlaylists[currentPlaylist]
  }

  const finalMMR = rankData?.mmr || lastMMR || 0
  const finalRankName = rankData?.rankName || cachedPlaylists?.[currentPlaylist]?.rankName || 'Unranked'
  const finalRankIcon = rankData?.rankIcon || cachedPlaylists?.[currentPlaylist]?.rankIcon || 'unranked'
  const finalDiv = rankData?.division || cachedPlaylists?.[currentPlaylist]?.division || 0

  // Calculate Win / Loss via MMR Delta
  if (finalMMR > 0 && lastMMR > 0 && finalMMR !== lastMMR) {
    const delta = finalMMR - lastMMR
    sessionMMRDelta += delta
    if (delta > 0) {
      sessionWins++
      console.log(`[RLService] 🎉 VICTORY! MMR: ${lastMMR} → ${finalMMR} (+${delta}) | Total W: ${sessionWins} L: ${sessionLosses}`)
    } else if (delta < 0) {
      sessionLosses++
      console.log(`[RLService] 💔 DEFEAT! MMR: ${lastMMR} → ${finalMMR} (${delta}) | Total W: ${sessionWins} L: ${sessionLosses}`)
    }
  }
  if (finalMMR > 0) {
    lastMMR = finalMMR
  }

  if (!updateCallback) return

  updateCallback({
    playerName: playerInfo.name,
    platform: playerInfo.platform,
    playerId: playerInfo.id,
    rankName: finalRankName,
    rankIcon: finalRankIcon,
    mmr: finalMMR,
    division: finalDiv,
    sessionWins,
    sessionLosses,
    sessionMMRDelta,
    playlist: currentPlaylist,
    isLoading: false,
    error: rankData?.error,
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

  // Initial fetch
  fetchAndEmit()

  // Start watching replay folders & logs
  startReplayWatcher()
  startLogWatcher()

  // Periodic poll every 2 minutes
  if (!fetchInterval) {
    fetchInterval = setInterval(fetchAndEmit, 120000)
  }

  // Scan log every 10s if player not yet resolved
  if (!watchInterval) {
    watchInterval = setInterval(() => {
      if (!cachedPlayerInfo) {
        cachedPlayerInfo = extractPlayerFromLog()
        if (cachedPlayerInfo) fetchAndEmit()
      }
    }, 10000)
  }
}

export function stopRLService() {
  updateCallback = null
  if (watchInterval) { clearInterval(watchInterval); watchInterval = null }
  if (fetchInterval) { clearInterval(fetchInterval); fetchInterval = null }
  for (const w of replayWatchers) {
    try { w.close() } catch { /* skip */ }
  }
  replayWatchers = []
  if (logWatcher) {
    try { logWatcher.close() } catch { /* skip */ }
    logWatcher = null
  }
}

export function setRLPlaylist(playlist: RLPlaylist) {
  if (currentPlaylist !== playlist) {
    console.log(`[RLService] Playlist switched: ${currentPlaylist} → ${playlist}`)
    currentPlaylist = playlist
    lastMMR = 0
    if (cachedPlaylists && cachedPlaylists[playlist]) {
      const p = cachedPlaylists[playlist]
      lastMMR = p.mmr
      if (updateCallback && cachedPlayerInfo) {
        updateCallback({
          playerName: cachedPlayerInfo.name,
          platform: cachedPlayerInfo.platform,
          playerId: cachedPlayerInfo.id,
          rankName: p.rankName,
          rankIcon: p.rankIcon,
          mmr: p.mmr,
          division: p.division,
          sessionWins,
          sessionLosses,
          sessionMMRDelta,
          playlist: currentPlaylist,
          isLoading: false,
        })
      }
    } else {
      fetchAndEmit()
    }
  }
}

export function setRLApiKey(key: string) {
  trnApiKey = key
  if (cachedPlayerInfo) fetchAndEmit()
}

export function resetRLSession() {
  sessionWins = 0
  sessionLosses = 0
  sessionMMRDelta = 0
  if (updateCallback && cachedPlayerInfo) {
    updateCallback({
      playerName: cachedPlayerInfo.name,
      platform: cachedPlayerInfo.platform,
      playerId: cachedPlayerInfo.id,
      rankName: cachedPlaylists?.[currentPlaylist]?.rankName || 'Unranked',
      rankIcon: cachedPlaylists?.[currentPlaylist]?.rankIcon || 'unranked',
      mmr: lastMMR,
      division: cachedPlaylists?.[currentPlaylist]?.division || 0,
      sessionWins: 0,
      sessionLosses: 0,
      sessionMMRDelta: 0,
      playlist: currentPlaylist,
      isLoading: false,
    })
  }
}

export function destroyRLScraper() {
  if (scraperWin && !scraperWin.isDestroyed()) {
    scraperWin.destroy()
    scraperWin = null
  }
}
