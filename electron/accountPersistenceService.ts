import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { execFile, execSync } from 'child_process'
import { ipcMain } from 'electron'

export interface PersistentAccountIdentity {
  canonicalUid: string
  friendCode: string
  accountSecret: string
  deviceAnchorId: string
  username?: string
  createdAt: number
  lastUpdated: number
}

let cachedDeviceAnchorId: string | null = null

const IDENTITY_FILE_PATH = path.join(os.homedir(), '.eclipse_launcher_identity.json')
const REG_KEY = 'HKEY_CURRENT_USER\\Software\\EclipseLauncher\\Identity'

/**
 * Derives a deterministic, hardware-bound machine identifier from Windows MachineGuid.
 * Survives full application uninstalls, user cache wiping, and app data resets.
 */
export function getDeviceAnchorId(): string {
  if (cachedDeviceAnchorId) return cachedDeviceAnchorId

  if (process.platform === 'win32') {
    try {
      const stdout = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        encoding: 'utf-8',
        windowsHide: true,
      })
      const match = stdout.match(/MachineGuid\s+REG_SZ\s+([a-f0-9-]+)/i)
      if (match && match[1]) {
        const rawGuid = match[1].trim().toLowerCase()
        const hashed = crypto.createHash('sha256').update(`eclipse_device_${rawGuid}`).digest('hex')
        cachedDeviceAnchorId = hashed
        return hashed
      }
    } catch (e) {
      console.warn('[AccountPersistence] Failed to read MachineGuid from registry:', e)
    }
  }

  // Fallback anchor based on hostname and CPU architecture
  const fallback = crypto.createHash('sha256').update(`fallback_${os.hostname()}_${os.arch()}`).digest('hex')
  cachedDeviceAnchorId = fallback
  return fallback
}

/**
 * Reads identity from Windows UserProfile root directory (~/.eclipse_launcher_identity.json).
 */
function readFromFile(): PersistentAccountIdentity | null {
  try {
    if (fs.existsSync(IDENTITY_FILE_PATH)) {
      const raw = fs.readFileSync(IDENTITY_FILE_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.canonicalUid && parsed.friendCode) {
        return parsed as PersistentAccountIdentity
      }
    }
  } catch (e) {
    console.warn('[AccountPersistence] Failed to read identity file:', e)
  }
  return null
}

/**
 * Writes identity to Windows UserProfile root directory (~/.eclipse_launcher_identity.json).
 */
function writeToFile(identity: PersistentAccountIdentity): void {
  try {
    fs.writeFileSync(IDENTITY_FILE_PATH, JSON.stringify(identity, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[AccountPersistence] Failed to write identity file:', e)
  }
}

/**
 * Reads identity from Windows Registry (HKEY_CURRENT_USER\Software\EclipseLauncher\Identity).
 */
function readFromRegistry(): Promise<PersistentAccountIdentity | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null)

    execFile('reg.exe', ['query', REG_KEY, '/v', 'Payload'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null)

      try {
        const match = stdout.match(/Payload\s+REG_SZ\s+([A-Za-z0-9+/=]+)/)
        if (match && match[1]) {
          const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
          const parsed = JSON.parse(decoded)
          if (parsed && parsed.canonicalUid && parsed.friendCode) {
            return resolve(parsed as PersistentAccountIdentity)
          }
        }
      } catch (e) {
        console.warn('[AccountPersistence] Failed to parse registry payload:', e)
      }
      resolve(null)
    })
  })
}

/**
 * Writes identity to Windows Registry (HKEY_CURRENT_USER\Software\EclipseLauncher\Identity).
 */
function writeToRegistry(identity: PersistentAccountIdentity): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false)

    try {
      const base64 = Buffer.from(JSON.stringify(identity), 'utf-8').toString('base64')
      execFile('reg.exe', ['add', REG_KEY, '/v', 'Payload', '/t', 'REG_SZ', '/d', base64, '/f'], { windowsHide: true }, (err) => {
        if (err) {
          console.warn('[AccountPersistence] Failed to write to registry:', err)
          return resolve(false)
        }
        resolve(true)
      })
    } catch {
      resolve(false)
    }
  })
}

/**
 * Loads persistent identity with multi-tier fallback (Registry -> UserProfile file).
 * Auto-synchronizes across both tiers if one was missing.
 */
export async function loadPersistentIdentity(): Promise<PersistentAccountIdentity | null> {
  // 1. Try Windows Registry
  const fromReg = await readFromRegistry()
  // 2. Try UserProfile file
  const fromFile = readFromFile()

  const chosen = fromReg || fromFile

  if (chosen) {
    // Ensure deviceAnchorId is always populated
    if (!chosen.deviceAnchorId) {
      chosen.deviceAnchorId = getDeviceAnchorId()
    }
    // Auto-sync to both tiers if one was wiped
    if (!fromReg) writeToRegistry(chosen).catch(() => {})
    if (!fromFile) writeToFile(chosen)
    return chosen
  }

  return null
}

/**
 * Saves persistent identity redundantly to both Registry and UserProfile file.
 */
export async function savePersistentIdentity(data: Partial<PersistentAccountIdentity>): Promise<PersistentAccountIdentity> {
  const existing = await loadPersistentIdentity()
  const anchor = getDeviceAnchorId()
  const now = Date.now()

  const finalIdentity: PersistentAccountIdentity = {
    canonicalUid: data.canonicalUid || existing?.canonicalUid || '',
    friendCode: data.friendCode || existing?.friendCode || '',
    accountSecret: data.accountSecret || existing?.accountSecret || crypto.randomBytes(24).toString('hex').toUpperCase(),
    deviceAnchorId: anchor,
    username: data.username || existing?.username || '',
    createdAt: existing?.createdAt || now,
    lastUpdated: now,
  }

  // Write to both tiers
  writeToFile(finalIdentity)
  await writeToRegistry(finalIdentity)

  return finalIdentity
}

/**
 * Initializes IPC handlers for account persistence.
 */
export function initAccountPersistenceIPC(): void {
  ipcMain.handle('account:get-identity', async () => {
    return await loadPersistentIdentity()
  })

  ipcMain.handle('account:save-identity', async (_event, data: Partial<PersistentAccountIdentity>) => {
    return await savePersistentIdentity(data)
  })

  ipcMain.handle('account:get-device-anchor', async () => {
    return getDeviceAnchorId()
  })
}
