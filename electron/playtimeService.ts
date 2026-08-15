import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export interface GamePlaytimeRecord {
  name: string
  playTimeMinutes: number
  lastPlayed: number
  platform?: string
  steamId?: number
}

export type PlaytimeDatabase = Record<string, GamePlaytimeRecord>

const normalize = (str?: string) => str?.toLowerCase().replace(/[^a-z0-9]/g, '') || ''

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
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch (err) {
    console.error('[PlaytimeService] Failed to read playtime.json:', err)
  }
  return {}
}

export function savePlaytimeDb(db: PlaytimeDatabase): boolean {
  try {
    const filePath = getPlaytimeFilePath()
    fs.writeFileSync(filePath, JSON.stringify(db, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error('[PlaytimeService] Failed to write playtime.json:', err)
    return false
  }
}

export function addPlaytimeRecord(gameIdOrName: string, name: string, minutes: number, steamId?: number): PlaytimeDatabase {
  const db = loadPlaytimeDb()
  const cleanName = name || gameIdOrName
  const normKey = normalize(cleanName)
  
  if (!normKey) return db

  const existing = db[normKey] || {
    name: cleanName,
    playTimeMinutes: 0,
    lastPlayed: Date.now(),
    steamId
  }

  existing.playTimeMinutes = Math.max(0, Math.round(((existing.playTimeMinutes || 0) + minutes) * 10) / 10)
  existing.lastPlayed = Date.now()
  if (cleanName) existing.name = cleanName
  if (steamId) existing.steamId = steamId

  db[normKey] = existing
  if (steamId) {
    db[`steam_${steamId}`] = existing
  }

  savePlaytimeDb(db)
  return db
}
