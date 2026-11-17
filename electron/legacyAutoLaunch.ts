import { execFile } from 'node:child_process'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { writeJsonAtomicSync } from './jsonStorage'

const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
interface StartupEntry { name: string; command: string }
const samePath = (left: string, right: string) => path.win32.normalize(left).toLowerCase() === path.win32.normalize(right).toLowerCase()

export function parseStartupEntries(output: string): StartupEntry[] {
  return Array.from(output.matchAll(/^\s+(.+?)\s+REG_SZ\s+([^\r\n]+)$/gm), match => ({ name: match[1].trim(), command: match[2].trim() }))
}

export function isLegacyEclipseStartup(entry: StartupEntry, executable: string): boolean {
  if (entry.name.toLowerCase() === 'com.eclipse.launcher') return false
  const match = /^(?:"([^"]+\.exe)"|(.+?\.exe))(?:\s+(.*))?$/i.exec(entry.command)
  if (!match || match[3]?.trim()) return false
  const target = match[1] || match[2]
  const legacyInstalled = samePath(target, executable) && path.win32.basename(target).toLowerCase() === 'eclipse launcher.exe'
    && (entry.name === 'Eclipse Launcher' || samePath(entry.name, target))
  // Old development builds registered only their Electron binary, without an
  // app path. Never remove a development command that actually names a project.
  const bareDevelopment = samePath(entry.name, target) && path.win32.basename(target).toLowerCase() === 'electron.exe'
    && (samePath(target, executable) || /\\Eclipse Launcher\\node_modules\\electron\\dist\\electron\.exe$/i.test(path.win32.normalize(target)))
  return legacyInstalled || bareDevelopment
}

function registry(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 3000, maxBuffer: 512 * 1024, encoding: 'utf8' }, (error, stdout) => error ? reject(error) : resolve(stdout))
  })
}

export async function cleanupLegacyAutoLaunch(executable: string, backupDirectory: string, platform = process.platform): Promise<number> {
  if (platform !== 'win32') return 0
  const entries = parseStartupEntries(await registry(['query', runKey])).filter(entry => isLegacyEclipseStartup(entry, executable))
  if (!entries.length) return 0
  writeJsonAtomicSync(path.join(backupDirectory, `startup-entry-backup-${randomUUID()}.json`), { registryKey: runKey, entries })
  let removed = 0
  for (const entry of entries) {
    // Re-read before deletion so a command changed by another instance is kept.
    const current = parseStartupEntries(await registry(['query', runKey, '/v', entry.name]))
    if (!current.some(value => value.name === entry.name && value.command === entry.command)) continue
    await registry(['delete', runKey, '/v', entry.name, '/f'])
    removed++
  }
  return removed
}
