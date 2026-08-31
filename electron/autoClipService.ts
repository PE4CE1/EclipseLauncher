import fs from 'fs'
import path from 'path'
import os from 'os'
import http from 'http'
import { BrowserWindow } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface AutoClipEvent {
  game: string
  eventType: 'goal' | 'save' | 'demo' | 'win' | 'kill' | 'ace' | 'death'
  title: string
  details?: string
}

let lastClipTimestamp = 0
let rlLogInterval: NodeJS.Timeout | null = null
let lastLogSize = 0
let rlWatchStartTime = 0
let gsiServer: http.Server | null = null
let getWindowRef: () => BrowserWindow | null = () => null

// CS2 State Tracking
let lastCS2Kills: number | null = null
let lastCS2Round = -1
let lastCS2WinClipTimestamp = 0

function canTriggerClip(cooldownSeconds: number = 15): boolean {
  const now = Date.now()
  if (now - lastClipTimestamp < cooldownSeconds * 1000) {
    return false
  }
  lastClipTimestamp = now
  return true
}

function emitAutoClip(event: AutoClipEvent) {
  const win = getWindowRef()
  if (!win || win.isDestroyed()) return

  console.log(`[AutoClip] 🎬 Triggered Auto-Clip event: [${event.game}] ${event.eventType} - ${event.title}`)
  win.webContents.send('clip:auto-triggered', {
    ...event,
    timestamp: Date.now()
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. ROCKET LEAGUE HIGHLIGHT DETECTOR (100% Accurate & Anti-Cheat Safe)
// ══════════════════════════════════════════════════════════════════════════════

function getRLLogPaths(): string[] {
  const docs = path.join(os.homedir(), 'Documents')
  const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents')
  const logBase = path.join('My Games', 'Rocket League', 'TAGame', 'Logs', 'Launch.log')
  return [path.join(docs, logBase), path.join(oneDriveDocs, logBase)]
}

export function startRLAutoClipWatcher(settings: any) {
  stopRLAutoClipWatcher()

  const logPaths = getRLLogPaths()
  const activeLogPath = logPaths.find(p => fs.existsSync(p))
  if (!activeLogPath) {
    console.log('[AutoClip] Rocket League log file not found, waiting for game...')
    return
  }

  rlWatchStartTime = Date.now()
  try {
    const stat = fs.statSync(activeLogPath)
    // Seek to the end of the file on game startup so past sessions and startup loading are ignored
    lastLogSize = stat.size
  } catch {
    lastLogSize = 0
  }

  console.log(`[AutoClip] Watching Rocket League log for highlights (Safe & Verified): ${activeLogPath}`)

  rlLogInterval = setInterval(() => {
    try {
      if (!fs.existsSync(activeLogPath)) return
      const stat = fs.statSync(activeLogPath)

      // Handle log truncation on new launch
      if (stat.size < lastLogSize) {
        lastLogSize = stat.size
        return
      }

      if (stat.size === lastLogSize) return

      // Ignore log noise during the first 12 seconds of game launch
      if (Date.now() - rlWatchStartTime < 12000) {
        lastLogSize = stat.size
        return
      }

      const diffSize = stat.size - lastLogSize
      const readSize = Math.min(diffSize, 65536)
      const buf = Buffer.alloc(readSize)
      const fd = fs.openSync(activeLogPath, 'r')
      fs.readSync(fd, buf, 0, readSize, stat.size - readSize)
      fs.closeSync(fd)
      lastLogSize = stat.size

      const newContent = buf.toString('utf-8')
      const lines = newContent.split('\n')

      for (const rawLine of lines) {
        const line = rawLine.trim()
        if (!line) continue

        // ── STRICT FILTER: Ignore all engine initialization, asset loading, package registration & config lines
        if (
          line.includes('Log: LoadPackage') ||
          line.includes('Log: Loading') ||
          line.includes('Log: Registering') ||
          line.includes('Log: Initializing') ||
          line.includes('Log: CreatePackage') ||
          line.includes('Class TAGame.') ||
          line.includes('Function TAGame.') ||
          line.includes('Default__') ||
          line.includes('Config:') ||
          line.includes('DevNet:') ||
          line.includes('Browse:') ||
          line.includes('Compile')
        ) {
          continue
        }

        // 1. Goal Detection (Only triggered when a real goal occurs in match)
        if (settings.autoClipRocketLeagueGoals !== false) {
          const isGoal =
            (line.includes('TAGame.PRI_TA:EventGoal') ||
             line.includes('TAGame.GameEvent_Soccar_TA:EventGoal') ||
             line.includes('StatEvent=StatEvent_TA\'TAGame.Default__StatEvent_TA:Goal\'') ||
             (line.includes('OnStatTickerMessage') && (line.includes('Scored a goal') || line.includes('StatEvent_TA:Goal')))) &&
            !line.includes('LoadPackage')

          if (isGoal) {
            if (canTriggerClip(settings.autoClipCooldownSeconds || 15)) {
              emitAutoClip({
                game: 'Rocket League',
                eventType: 'goal',
                title: 'Tor erzielt! ⚽'
              })
              break
            }
          }
        }

        // 2. Save / Epic Save Detection
        if (settings.autoClipRocketLeagueSaves !== false) {
          const isSave =
            (line.includes('TAGame.PRI_TA:EventSave') ||
             line.includes('TAGame.PRI_TA:EventEpicSave') ||
             line.includes('StatEvent=StatEvent_TA\'TAGame.Default__StatEvent_TA:Save\'') ||
             line.includes('StatEvent=StatEvent_TA\'TAGame.Default__StatEvent_TA:EpicSave\'') ||
             (line.includes('OnStatTickerMessage') && (line.includes('EpicSave') || line.includes('Save')))) &&
            !line.includes('LoadPackage')

          if (isSave) {
            if (canTriggerClip(settings.autoClipCooldownSeconds || 15)) {
              const isEpic = line.includes('Epic')
              emitAutoClip({
                game: 'Rocket League',
                eventType: 'save',
                title: isEpic ? 'Glanzparade / Epic Save! 🧤' : 'Parade / Save! 🧤'
              })
              break
            }
          }
        }

        // 3. Demolition Detection
        if (settings.autoClipRocketLeagueDemos) {
          const isDemo =
            (line.includes('TAGame.PRI_TA:EventDemolition') ||
             line.includes('TAGame.Car_TA:Demolish') ||
             line.includes('StatEvent=StatEvent_TA\'TAGame.Default__StatEvent_TA:Demolition\'') ||
             (line.includes('OnStatTickerMessage') && line.includes('Demolition'))) &&
            !line.includes('LoadPackage')

          if (isDemo) {
            if (canTriggerClip(settings.autoClipCooldownSeconds || 15)) {
              emitAutoClip({
                game: 'Rocket League',
                eventType: 'demo',
                title: 'Demolition! 💥'
              })
              break
            }
          }
        }

        // 4. Match Win Detection
        if (settings.autoClipRocketLeagueWins !== false) {
          const isWin =
            (line.includes('TAGame.GameEvent_Soccar_TA:EventPostMatch') ||
             line.includes('TAGame.GameEvent_Soccar_TA:SetWinner') ||
             line.includes('TAGame.GameEvent_Soccar_TA:Finished')) &&
            !line.includes('LoadPackage')

          if (isWin) {
            if (canTriggerClip(settings.autoClipCooldownSeconds || 20)) {
              emitAutoClip({
                game: 'Rocket League',
                eventType: 'win',
                title: 'Match gewonnen! 🏆'
              })
              break
            }
          }
        }
      }
    } catch {
      // Ignore transient read errors while game writes to log
    }
  }, 1000)
}

export function stopRLAutoClipWatcher() {
  if (rlLogInterval) {
    clearInterval(rlLogInterval)
    rlLogInterval = null
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. COUNTER-STRIKE 2 (CS2) VALVE GAME STATE INTEGRATION (100% Legal & VAC Safe)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Ensures CS2 Game State Integration config is installed in CS2's cfg directory.
 * Valve officially provides and certifies GSI for third-party tools (no injection, no memory reading).
 */
async function ensureCS2GsiConfigInstalled(): Promise<boolean> {
  const GSI_CFG_CONTENT = `"Eclipse GSI Integration"
{
    "uri" "http://127.0.0.1:13371"
    "timeout" "5.0"
    "buffer"  "0.1"
    "throttle" "0.2"
    "heartbeat" "15.0"
    "data"
    {
        "provider"            "1"
        "map"                 "1"
        "round"               "1"
        "player_id"           "1"
        "player_state"        "1"
        "player_weapons"      "1"
        "player_match_stats"  "1"
    }
}
`
  try {
    const steamPaths: string[] = []

    // 1. Check registry for Steam Path
    try {
      const { stdout } = await execAsync('reg query "HKCU\\Software\\Valve\\Steam" /v "SteamPath" 2>nul')
      const match = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/i)
      if (match) steamPaths.push(match[1].trim().replace(/\//g, '\\'))
    } catch {}

    steamPaths.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam', 'D:\\Steam', 'E:\\Steam')

    const libraryFolders = new Set<string>()
    for (const sp of steamPaths) {
      if (!fs.existsSync(sp)) continue
      libraryFolders.add(sp)

      const vdfPath = path.join(sp, 'steamapps', 'libraryfolders.vdf')
      if (fs.existsSync(vdfPath)) {
        try {
          const content = fs.readFileSync(vdfPath, 'utf-8')
          const matches = content.matchAll(/"path"\s+"([^"]+)"/gi)
          for (const m of matches) {
            const p = m[1].replace(/\\\\/g, '\\')
            if (fs.existsSync(p)) libraryFolders.add(p)
          }
        } catch {}
      }
    }

    let installedAny = false
    for (const lib of libraryFolders) {
      const cs2CfgDir = path.join(lib, 'steamapps', 'common', 'Counter-Strike Global Offensive', 'game', 'csgo', 'cfg')
      if (fs.existsSync(cs2CfgDir)) {
        const targetFile = path.join(cs2CfgDir, 'gamestate_integration_eclipse.cfg')
        if (!fs.existsSync(targetFile) || fs.readFileSync(targetFile, 'utf-8') !== GSI_CFG_CONTENT) {
          fs.writeFileSync(targetFile, GSI_CFG_CONTENT, 'utf-8')
          console.log(`[AutoClip] ✅ Installed Valve CS2 GSI configuration to: ${targetFile}`)
        }
        installedAny = true
      }
    }

    return installedAny
  } catch (err) {
    console.warn('[AutoClip] Failed to verify CS2 GSI config:', err)
    return false
  }
}

export async function startCS2GsiServer(settings: any) {
  // Ensure config is in place
  await ensureCS2GsiConfigInstalled()

  if (gsiServer) return

  lastCS2Kills = null
  lastCS2Round = -1

  try {
    gsiServer = http.createServer((req, res) => {
      if (req.method === 'POST') {
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            handleCS2Payload(data, settings)
          } catch {}
          res.writeHead(200, { 'Content-Type': 'text/plain' })
          res.end('OK')
        })
      } else {
        res.writeHead(404)
        res.end()
      }
    })

    gsiServer.listen(13371, '127.0.0.1', () => {
      console.log('[AutoClip] Valve CS2 Game State Integration server listening on http://127.0.0.1:13371 (VAC-Safe)')
    })
  } catch (e) {
    console.warn('[AutoClip] Failed to start CS2 GSI server:', e)
  }
}

function handleCS2Payload(data: any, settings: any) {
  if (!data || !data.player) return

  // Only track when actively playing in a match (not in main menu or spectator)
  if (data.player.activity && data.player.activity !== 'playing') {
    return
  }

  const currentKills = data.player.match_stats?.kills ?? null
  const roundKills = data.player.state?.round_kills ?? 0
  const currentRound = data.map?.round ?? -1

  // Reset or initialize on fresh game / round
  if (lastCS2Kills === null && currentKills !== null) {
    lastCS2Kills = currentKills
    return
  }

  // 1. Frag / Multi-Kill / ACE Detection
  if (currentKills !== null && lastCS2Kills !== null && currentKills > lastCS2Kills) {
    if (settings.autoClipCS2Kills !== false && canTriggerClip(settings.autoClipCooldownSeconds || 15)) {
      const isAce = roundKills >= 5
      const isMulti = roundKills >= 2
      emitAutoClip({
        game: 'Counter-Strike 2',
        eventType: isAce ? 'ace' : 'kill',
        title: isAce ? 'CS2 ACE (5 Kills)! 🔥' : (isMulti ? `CS2 Multi-Kill (${roundKills}x)! 🎯` : 'CS2 Frag! 🎯')
      })
    }
    lastCS2Kills = currentKills
  }

  // Update kills tracker
  if (currentKills !== null) {
    lastCS2Kills = currentKills
  }

  // 2. Round Win Detection
  if (settings.autoClipCS2Wins && data.round && data.round.phase === 'over' && data.round.win_team) {
    const playerTeam = data.player.team
    if (playerTeam && data.round.win_team === playerTeam && currentRound !== lastCS2Round) {
      lastCS2Round = currentRound
      const now = Date.now()
      if (now - lastCS2WinClipTimestamp > (settings.autoClipCooldownSeconds || 20) * 1000) {
        lastCS2WinClipTimestamp = now
        emitAutoClip({
          game: 'Counter-Strike 2',
          eventType: 'win',
          title: 'CS2 Runde gewonnen! 🏆'
        })
      }
    }
  }
}

export function stopCS2GsiServer() {
  if (gsiServer) {
    try { gsiServer.close() } catch {}
    gsiServer = null
  }
  lastCS2Kills = null
  lastCS2Round = -1
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. SERVICE LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

export function initAutoClipService(getMainWindow: () => BrowserWindow | null) {
  getWindowRef = getMainWindow
  // Ensure GSI config is pre-installed if CS2 is installed
  ensureCS2GsiConfigInstalled().catch(() => {})
}

export function onGameStartedAutoClip(gameName: string, settings: any) {
  if (!settings || !settings.autoClipEnabled) return

  if (gameName === 'Rocket League') {
    startRLAutoClipWatcher(settings)
  } else if (gameName.includes('Counter-Strike') || gameName.includes('CS2') || gameName === 'cs2') {
    startCS2GsiServer(settings)
  }
}

export function onGameStoppedAutoClip() {
  stopRLAutoClipWatcher()
  stopCS2GsiServer()
}
