import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { app } from 'electron'
import { subscribeRocketLeagueStats } from './rocketLeagueClient'
import { rocketPlayerId } from './rocketLeagueEvents'
import { createRLSession } from './rlSession'
import type { AppSettings } from '../src/types/game'
import type { RLPlaylist, RLRankData } from '../src/types/rocketLeague'
export type { RLPlaylist, RLRankData } from '../src/types/rocketLeague'

const model = createRLSession()
let subscription: ReturnType<typeof subscribeRocketLeagueStats> | undefined
let timer: ReturnType<typeof setInterval> | undefined
let updateCallback: ((data: RLRankData) => void) | undefined
let currentPlaylist: RLPlaylist = '2v2', selectedPlayer = '', detectedPlayer = ''
let lastPacketAt = 0, lastSignature = ''
let revision = 0

export function extractPlayerFromLog(): { platform: 'steam' | 'epic'; id: string; name: string; primaryId: string } | null {
  let documents = path.join(os.homedir(), 'Documents')
  try { documents = app.getPath('documents') } catch {}
  const roots = [...new Set([documents, path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'OneDrive', 'Documents')])]
  for (const root of roots) {
    const file = path.join(root, 'My Games', 'Rocket League', 'TAGame', 'Logs', 'Launch.log')
    let fd: number | undefined
    try {
      const size = fs.statSync(file).size
      fd = fs.openSync(file, 'r')
      const head = Buffer.alloc(Math.min(size, 192 * 1024))
      const read = fs.readSync(fd, head, 0, head.length, 0)
      const text = head.subarray(0, read).toString('utf8')
      const epic = text.match(/-epicuserid=([a-f0-9]{32})(?=[\s&?]|$)/i)
      if (epic) {
        const raw = text.match(/-epicusername=(?:"([^"]{1,128})"|([^\s&?]{1,128}))/i)
        let name = raw?.[1] || raw?.[2] || ''
        try { name = decodeURIComponent(name) } catch {}
        return { platform: 'epic', id: epic[1], name, primaryId: `Epic|${epic[1]}|0` }
      }
      // A random Steam ID in a network log may belong to an opponent.
      const steam = text.match(/(?:logged\s*in|login|localplayer)[^\r\n]{0,180}Steam\|(\d{17})\|0/i)
      if (steam) return { platform: 'steam', id: steam[1], name: '', primaryId: `Steam|${steam[1]}|0` }
    } catch {} finally { if (fd !== undefined) fs.closeSync(fd) }
  }
  return null
}
function savedClipPlayer(): string {
  try {
    const file = path.join(app.getPath('userData'), 'clip_settings.json')
    if (fs.statSync(file).size > 128 * 1024) return ''
    const id = JSON.parse(fs.readFileSync(file, 'utf8')).autoClipRocketLeaguePlayerId
    return rocketPlayerId(id) ? id : ''
  } catch { return '' }
}
function publish() {
  const data = model.snapshot(), signature = JSON.stringify(data)
  if (signature !== lastSignature) { lastSignature = signature; updateCallback?.(data) }
}
export function configureRLService(settings: Partial<AppSettings>) {
  if (['1v1', '2v2', '3v3'].includes(settings.rlPlaylist || '')) currentPlaylist = settings.rlPlaylist as RLPlaylist
  if (settings.rlPlayerId !== undefined) selectedPlayer = rocketPlayerId(settings.rlPlayerId) ? settings.rlPlayerId : ''
  model.select(selectedPlayer || detectedPlayer, currentPlaylist)
  publish()
}
export function getRLState(): RLRankData { return model.snapshot() }
export function startRLService(onUpdate: (data: RLRankData) => void, playlist: RLPlaylist = '2v2', _legacyApiKey = '') {
  stopRLService()
  const version = ++revision
  updateCallback = onUpdate; lastSignature = ''; lastPacketAt = 0
  detectedPlayer = selectedPlayer ? '' : extractPlayerFromLog()?.primaryId || savedClipPlayer()
  configureRLService({ rlPlaylist: playlist })
  model.connection('waiting'); publish()
  subscription = subscribeRocketLeagueStats(message => {
    if (version !== revision) return
    if (model.accept(message)) { lastPacketAt = Date.now(); publish() }
  }, connected => { if (version === revision) { model.connection(connected ? 'waiting' : 'disconnected'); publish() } })
  timer = setInterval(() => {
    if (!selectedPlayer && !detectedPlayer) {
      detectedPlayer = extractPlayerFromLog()?.primaryId || savedClipPlayer()
      model.select(detectedPlayer, currentPlaylist)
    }
    if (model.snapshot().connection === 'live' && Date.now() - lastPacketAt > 35000) model.connection('waiting')
    publish()
  }, 5000)
  timer.unref()
}
export function stopRLService() {
  revision++
  subscription?.close(); subscription = undefined
  if (timer) clearInterval(timer)
  timer = undefined; model.connection('disabled'); publish(); updateCallback = undefined
}
export function setRLPlaylist(playlist: RLPlaylist) { configureRLService({ rlPlaylist: playlist }) }
export function resetRLSession() { model.reset(); publish() }
