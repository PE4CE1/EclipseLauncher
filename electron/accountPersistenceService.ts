import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import * as crypto from 'crypto'
import { execFile, execFileSync } from 'child_process'
import { ipcMain } from './ipcSecurity'
import { validRecoveryKey } from '../src/services/recoveryKey'

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
let cachedIdentity: PersistentAccountIdentity | null | undefined
let registryChecked = false
let saveQueue: Promise<unknown> = Promise.resolve()
let fileSnapshot: PersistentAccountIdentity | null | undefined
let fileSignature = ''

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
      const stdout = execFileSync('reg.exe', ['query', 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 2000,
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
      const stat = fs.statSync(IDENTITY_FILE_PATH)
      const signature = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}:${stat.ino}`
      if (signature === fileSignature && fileSnapshot !== undefined) return fileSnapshot ? { ...fileSnapshot } : null
      const raw = fs.readFileSync(IDENTITY_FILE_PATH, 'utf-8')
      const parsed = JSON.parse(raw)
      if (isIdentity(parsed)) {
        fileSignature = signature; fileSnapshot = parsed as PersistentAccountIdentity
        return { ...fileSnapshot }
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
  const temporaryPath = `${IDENTITY_FILE_PATH}.${crypto.randomBytes(6).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(identity, null, 2), { encoding: 'utf-8', mode: 0o600 })
    fs.renameSync(temporaryPath, IDENTITY_FILE_PATH)
  } catch (e) {
    console.warn('[AccountPersistence] Failed to write identity file:', e)
    try { fs.unlinkSync(temporaryPath) } catch {}
  }
}

function isIdentity(value: unknown): value is PersistentAccountIdentity {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.canonicalUid === 'string' && !!candidate.canonicalUid && candidate.canonicalUid.length <= 128 &&
    typeof candidate.friendCode === 'string' && !!candidate.friendCode && candidate.friendCode.length <= 128 &&
    (candidate.accountSecret === undefined || typeof candidate.accountSecret === 'string') &&
    (candidate.username === undefined || typeof candidate.username === 'string')
}

/**
 * Reads identity from Windows Registry synchronously.
 */
function readFromRegistrySync(): PersistentAccountIdentity | null {
  if (process.platform !== 'win32') return null
  try {
    const stdout = execFileSync('reg.exe', ['query', REG_KEY, '/v', 'Payload'], { encoding: 'utf-8', windowsHide: true, timeout: 2000 })
    const match = stdout.match(/Payload\s+REG_SZ\s+([A-Za-z0-9+/=]+)/)
    if (match && match[1]) {
      const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
      const parsed = JSON.parse(decoded)
      if (isIdentity(parsed)) {
        return parsed as PersistentAccountIdentity
      }
    }
  } catch {}
  return null
}

/**
 * Rechecks the small local file so an administrator-assisted recovery can be adopted.
 */
export function loadPersistentIdentitySync(): PersistentAccountIdentity | null {
  const fromFile = readFromFile()
  if (cachedIdentity !== undefined && (!fromFile || Number(fromFile.lastUpdated) <= Number(cachedIdentity?.lastUpdated || 0))) return cachedIdentity ? { ...cachedIdentity } : null
  // 1. Try file directly
  if (fromFile) {
    if (!fromFile.deviceAnchorId) fromFile.deviceAnchorId = getDeviceAnchorId()
    cachedIdentity = fromFile
    return { ...fromFile }
  }
  // 2. Try registry synchronously
  const fromReg = readFromRegistrySync()
  if (fromReg) {
    if (!fromReg.deviceAnchorId) fromReg.deviceAnchorId = getDeviceAnchorId()
    writeToFile(fromReg)
    cachedIdentity = fromReg
    return { ...fromReg }
  }
  cachedIdentity = null
  return null
}

/**
 * Reads identity from Windows Registry (HKEY_CURRENT_USER\Software\EclipseLauncher\Identity).
 */
function readFromRegistry(): Promise<PersistentAccountIdentity | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null)

    execFile('reg.exe', ['query', REG_KEY, '/v', 'Payload'], { windowsHide: true, timeout: 2000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null)

      try {
        const match = stdout.match(/Payload\s+REG_SZ\s+([A-Za-z0-9+/=]+)/)
        if (match && match[1]) {
          const decoded = Buffer.from(match[1], 'base64').toString('utf-8')
          const parsed = JSON.parse(decoded)
          if (isIdentity(parsed)) {
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
      execFile('reg.exe', ['add', REG_KEY, '/v', 'Payload', '/t', 'REG_SZ', '/d', base64, '/f'], { windowsHide: true, timeout: 2000 }, (err) => {
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
  // 1. Try UserProfile file first (fastest)
  const fromFile = readFromFile()
  if (registryChecked && cachedIdentity !== undefined && (!fromFile || Number(fromFile.lastUpdated) <= Number(cachedIdentity?.lastUpdated || 0))) return cachedIdentity ? { ...cachedIdentity } : null
  // 2. Try Windows Registry
  const fromReg = await readFromRegistry()
  registryChecked = true

  const chosen = fromFile && fromReg
    ? (Number(fromReg.lastUpdated) > Number(fromFile.lastUpdated) ? fromReg : fromFile)
    : fromFile || fromReg
  cachedIdentity = chosen

  if (chosen) {
    // Ensure deviceAnchorId is always populated
    if (!chosen.deviceAnchorId) {
      chosen.deviceAnchorId = getDeviceAnchorId()
    }
    // Auto-sync to both tiers if one was wiped
    if (!fromReg || fromReg.lastUpdated !== chosen.lastUpdated) await writeToRegistry(chosen)
    if (!fromFile || fromFile.lastUpdated !== chosen.lastUpdated) writeToFile(chosen)
    return { ...chosen }
  }

  return null
}

/**
 * Saves persistent identity redundantly to both Registry and UserProfile file.
 */
export function savePersistentIdentity(data: Partial<PersistentAccountIdentity>): Promise<PersistentAccountIdentity> {
  const save = saveQueue.then(() => saveIdentityNow(data))
  saveQueue = save.catch(() => {})
  return save
}

async function saveIdentityNow(data: Partial<PersistentAccountIdentity>): Promise<PersistentAccountIdentity> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError('Invalid account identity')
  for (const field of ['canonicalUid', 'friendCode', 'accountSecret', 'username'] as const) {
    if (data[field] !== undefined && (typeof data[field] !== 'string' || data[field]!.length > 512)) {
      throw new TypeError(`Invalid identity field: ${field}`)
    }
  }
  const existing = loadPersistentIdentitySync() || await loadPersistentIdentity()
  const anchor = getDeviceAnchorId()
  const now = Date.now()
  const sameAccount = !data.canonicalUid || data.canonicalUid === existing?.canonicalUid
  const preserveSecureKey = sameAccount && validRecoveryKey(existing?.accountSecret || '') && !validRecoveryKey(data.accountSecret || '')

  const finalIdentity: PersistentAccountIdentity = {
    canonicalUid: data.canonicalUid || existing?.canonicalUid || '',
    friendCode: data.friendCode || existing?.friendCode || '',
    accountSecret: preserveSecureKey ? existing!.accountSecret : data.accountSecret || existing?.accountSecret || crypto.randomBytes(24).toString('hex').toUpperCase(),
    deviceAnchorId: anchor,
    username: (data.username !== undefined && data.username.trim() !== '') ? data.username : (existing?.username || ''),
    createdAt: existing?.createdAt || now,
    lastUpdated: now,
  }
  if (!isIdentity(finalIdentity)) throw new TypeError('Account UID and friend code are required')

  // Write to both tiers immediately
  writeToFile(finalIdentity)
  await writeToRegistry(finalIdentity)
  cachedIdentity = finalIdentity
  registryChecked = true
  return { ...finalIdentity }
}

let isAccountPersistenceInitialized = false

/**
 * Initializes IPC handlers for account persistence.
 */
export function initAccountPersistenceIPC(): void {
  if (isAccountPersistenceInitialized) return
  isAccountPersistenceInitialized = true

  // Synchronous identity resolution for preload initialization
  ipcMain.on('account:get-identity-sync', (event) => {
    event.returnValue = loadPersistentIdentitySync()
  })

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

