import fs from 'fs'
import path from 'path'
import os from 'os'
import http from 'http'
import { BrowserWindow } from 'electron'

interface AutoClipEvent {
  game: string
  eventType: 'goal' | 'save' | 'demo' | 'win' | 'kill' | 'ace' | 'death'
  title: string
  details?: string
}

let lastClipTimestamp = 0
let rlLogInterval: NodeJS.Timeout | null = null
let lastLogSize = 0
let gsiServer: http.Server | null = null
let getWindowRef: () => BrowserWindow | null = () => null

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

  console.log('[AutoClip] Triggered Auto-Clip event: [' + event.game + '] ' + event.eventType + ' - ' + event.title)
  win.webContents.send('clip:auto-triggered', {
    ...event,
    timestamp: Date.now()
  })
}

// Rocket League Log Watcher
function getRLLogPaths(): string[] {
  const docs = path.join(os.homedir(), 'Documents')
  const oneDriveDocs = path.join(os.homedir(), 'OneDrive', 'Documents')
  const logBase = 'My Games\\Rocket League\\TAGame\\Logs\\Launch.log'
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

  try {
    const stat = fs.statSync(activeLogPath)
    lastLogSize = stat.size
  } catch {
    lastLogSize = 0
  }

  console.log('[AutoClip] Watching Rocket League log for highlights: ' + activeLogPath)

  rlLogInterval = setInterval(() => {
    try {
      if (!fs.existsSync(activeLogPath)) return
      const stat = fs.statSync(activeLogPath)
      if (stat.size <= lastLogSize) {
        if (stat.size < lastLogSize) lastLogSize = stat.size
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

      for (const line of lines) {
        // 1. Goal Detection
        if (settings.autoClipRocketLeagueGoals !== false) {
          if (line.includes('TAGame.GRI_TA:EventGoal') || line.includes('Scored a goal') || line.includes('EventGoal') || line.includes('EventHitGoalTarget')) {
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

        // 2. Save Detection
        if (settings.autoClipRocketLeagueSaves !== false) {
          if (line.includes('EventSave') || line.includes('EventEpicSave') || line.includes('Save_TA')) {
            if (canTriggerClip(settings.autoClipCooldownSeconds || 15)) {
              emitAutoClip({
                game: 'Rocket League',
                eventType: 'save',
                title: 'Glanzparade / Epic Save! 🧤'
              })
              break
            }
          }
        }

        // 3. Demolition Detection
        if (settings.autoClipRocketLeagueDemos) {
          if (line.includes('EventDemolition') || line.includes('Demolition_TA')) {
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
          if (line.includes('EventPostMatch') || line.includes('Winner_TA') || line.includes('MatchWinner')) {
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
    } catch (e) {
      // Skip read errors
    }
  }, 1000)
}

export function stopRLAutoClipWatcher() {
  if (rlLogInterval) {
    clearInterval(rlLogInterval)
    rlLogInterval = null
  }
}

// CS2 Game State Integration (GSI)
let lastCS2Kills = 0

export function startCS2GsiServer(settings: any) {
  if (gsiServer) return

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
      console.log('[AutoClip] CS2 Game State Integration server listening on http://127.0.0.1:13371')
    })
  } catch (e) {
    console.warn('[AutoClip] Failed to start CS2 GSI server:', e)
  }
}

function handleCS2Payload(data: any, settings: any) {
  if (!data || !data.player) return

  const kills = data.player.match_stats?.kills ?? 0
  const roundKills = data.player.state?.round_kills ?? 0

  if (kills > lastCS2Kills && lastCS2Kills > 0) {
    if (settings.autoClipCS2Kills !== false && canTriggerClip(settings.autoClipCooldownSeconds || 15)) {
      const isAce = roundKills >= 5
      emitAutoClip({
        game: 'Counter-Strike 2',
        eventType: isAce ? 'ace' : 'kill',
        title: isAce ? 'CS2 ACE (5 Kills)! 🔥' : (roundKills > 1 ? 'CS2 Multi-Kill (' + roundKills + 'x)! 🎯' : 'CS2 Frag! 🎯')
      })
    }
  }
  lastCS2Kills = kills

  if (data.round && data.round.phase === 'over' && data.round.win_team) {
    const playerTeam = data.player.team
    if (playerTeam && data.round.win_team === playerTeam) {
      if (settings.autoClipCS2Wins && canTriggerClip(settings.autoClipCooldownSeconds || 20)) {
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
}

export function initAutoClipService(getMainWindow: () => BrowserWindow | null) {
  getWindowRef = getMainWindow
}

export function onGameStartedAutoClip(gameName: string, settings: any) {
  if (settings.autoClipEnabled === false) return

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
