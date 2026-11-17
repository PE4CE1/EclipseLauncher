import { openExternalPath } from './externalLaunch'
import { type BrowserWindow } from 'electron'
import { ipcMain } from './ipcSecurity'
import { spawn, execFile } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { classifySpicetifyError } from '../src/services/spicetifyMessages'
import type { SpicetifyResult } from '../src/types/spicetify'

export interface SpicetifyStatus {
  isSpotifyInstalled: boolean
  isSpicetifyInstalled: boolean
  version?: string
  installPath?: string
  hasMarketplace?: boolean
  isInstalling?: boolean
}

let isCurrentlyInstalling = false
const cleanOutput = (value: string) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0B-\x1F\x7F]/g, '')
const failure = (errorCode: NonNullable<SpicetifyResult['errorCode']>, error: string): SpicetifyResult => ({ success: false, errorCode, error })

function getSpicetifyDir(): string {
  const folders = [path.join(process.env.LOCALAPPDATA || '', 'spicetify'), path.join(process.env.APPDATA || '', 'spicetify'), path.join(process.env.USERPROFILE || '', 'spicetify-cli')]
  return folders.find(dir => fs.existsSync(path.join(dir, 'spicetify.exe'))) || folders[0]
}
const getSpicetifyExe = () => path.join(getSpicetifyDir(), 'spicetify.exe')
function readCommand(exe: string, args: string[]): Promise<string> {
  return new Promise(resolve => execFile(exe, args, { windowsHide: true, timeout: 5000, maxBuffer: 128 * 1024 }, (error, stdout, stderr) => resolve(error ? '' : cleanOutput(String(stdout || '') + String(stderr || '')).trim())))
}
async function checkSpotifyInstalled(): Promise<boolean> {
  const roaming = process.env.APPDATA || '', local = process.env.LOCALAPPDATA || ''
  if ([path.join(roaming, 'Spotify', 'Spotify.exe'), path.join(local, 'Microsoft', 'WindowsApps', 'Spotify.exe')].some(file => fs.existsSync(file))) return true
  try { if (fs.readdirSync(path.join(local, 'Packages')).some(name => name.toLowerCase().startsWith('spotifyab.spotifymusic'))) return true } catch {}
  return new Promise(resolve => execFile('where.exe', ['spotify'], { windowsHide: true, timeout: 3000 }, error => resolve(!error)))
}
export async function getSpicetifyStatus(): Promise<SpicetifyStatus> {
  const isSpotifyInstalled = await checkSpotifyInstalled(), dir = getSpicetifyDir(), exe = path.join(dir, 'spicetify.exe')
  if (!fs.existsSync(exe)) return { isSpotifyInstalled, isSpicetifyInstalled: false, isInstalling: isCurrentlyInstalling }
  // Go's log.Println writes version/config-path responses to stderr, even on success.
  const [versionOutput, config] = await Promise.all([readCommand(exe, ['-v']), readCommand(exe, ['-c'])])
  const configDir = config && path.isAbsolute(config) ? path.dirname(config) : path.join(process.env.APPDATA || '', 'spicetify')
  return { isSpotifyInstalled, isSpicetifyInstalled: true, version: /\bv?\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/.exec(versionOutput)?.[0], installPath: dir,
    hasMarketplace: fs.existsSync(path.join(configDir, 'CustomApps', 'marketplace')), isInstalling: isCurrentlyInstalling }
}

function broadcast(getWindows: () => BrowserWindow[], channel: string, data: string) {
  for (const win of getWindows()) {
    try { if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, data) } catch {}
  }
}

export function runSpicetifyProcess(exe: string, args: string[], getWindows: () => BrowserWindow[]): Promise<SpicetifyResult> {
  return new Promise(resolve => {
    let settled = false, output = ''
    const finish = (result: SpicetifyResult) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }
    const env = { ...process.env }, pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH'
    env[pathKey] = getSpicetifyDir() + path.delimiter + (env[pathKey] || '')
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    const timer = setTimeout(() => { finish({ ...failure('timeout', 'Spicetify operation timed out'), details: output }); child.kill() }, 5 * 60 * 1000)
    const log = (data: Buffer) => {
      if (settled) return
      const text = cleanOutput(data.toString()); output = (output + text).slice(-8192)
      broadcast(getWindows, 'spicetify:log', text)
    }
    child.stdout?.on('data', log); child.stderr?.on('data', log)
    child.once('error', error => finish({ ...failure('start_failed', 'Spicetify could not start'), details: String(error.message).slice(0, 2048) }))
    child.once('close', code => finish(code === 0 ? { success: true } : {
      success: false, errorCode: classifySpicetifyError(output), error: 'Spicetify operation failed', details: output,
      ...(typeof code === 'number' ? { exitCode: code } : {}),
    }))
  })
}

async function applyWithRecovery(getWindows: () => BrowserWindow[]): Promise<SpicetifyResult> {
  const exe = getSpicetifyExe()
  let result = await runSpicetifyProcess(exe, ['apply', '--no-restart'], getWindows)
  // Only recover CLI-diagnosed backup problems. Unknown errors must not cause
  // a restore, configuration reset, or deletion of a user's customizations.
  if (result.errorCode === 'backup_required' || result.errorCode === 'preprocess_outdated') {
    broadcast(getWindows, 'spicetify:status', 'repairing')
    const args = result.errorCode === 'preprocess_outdated' ? ['restore', 'backup', 'apply', '--no-restart'] : ['backup', 'apply', '--no-restart']
    result = await runSpicetifyProcess(exe, args, getWindows)
  }
  return result
}

export function initSpicetifyIPC(getWindows: () => BrowserWindow[]) {
  const operation = async (phase: string, work: () => Promise<SpicetifyResult>): Promise<SpicetifyResult> => {
    if (isCurrentlyInstalling) return failure('busy', 'A Spicetify operation is already running')
    isCurrentlyInstalling = true; broadcast(getWindows, 'spicetify:status', phase)
    let result: SpicetifyResult
    try { result = await work() }
    catch (error) { result = { ...failure('failed', 'Spicetify operation failed'), details: String(error).slice(0, 2048) } }
    finally { isCurrentlyInstalling = false }
    broadcast(getWindows, 'spicetify:status', result.success ? 'done' : 'error')
    return result
  }
  const withInstalled = (phase: string, work: () => Promise<SpicetifyResult>) => operation(phase, () => fs.existsSync(getSpicetifyExe()) ? work() : Promise.resolve(failure('not_installed', 'Spicetify is not installed')))
  const script = (command: string) => runSpicetifyProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; try { ${command}; if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; exit 0 } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`], getWindows)
  ipcMain.handle('spicetify:get-status', () => getSpicetifyStatus())
  ipcMain.handle('spicetify:install', () => operation('installing-cli', async () => {
    if (!fs.existsSync(getSpicetifyExe())) {
      const cli = await script('iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/dists/get.ps1 | iex')
      if (!cli.success) return cli
    }
    if (!fs.existsSync(getSpicetifyExe())) return failure('not_installed', 'Spicetify executable is missing after installation')
    broadcast(getWindows, 'spicetify:status', 'installing-marketplace')
    const marketplace = await script('iwr -useb https://raw.githubusercontent.com/spicetify/marketplace/main/resources/install.ps1 | iex')
    if (!marketplace.success) return marketplace
    broadcast(getWindows, 'spicetify:status', 'applying')
    return applyWithRecovery(getWindows)
  }))
  ipcMain.handle('spicetify:apply', () => withInstalled('applying', () => applyWithRecovery(getWindows)))
  ipcMain.handle('spicetify:restore', () => withInstalled('restoring', () => runSpicetifyProcess(getSpicetifyExe(), ['restore', '--no-restart'], getWindows)))
  ipcMain.handle('spicetify:upgrade', () => withInstalled('upgrading', async () => {
    const result = await runSpicetifyProcess(getSpicetifyExe(), ['upgrade', '--no-restart'], getWindows)
    if (!result.success) return result
    broadcast(getWindows, 'spicetify:status', 'applying')
    return applyWithRecovery(getWindows)
  }))
  ipcMain.handle('spicetify:open-folder', async () => {
    const dir = getSpicetifyDir()
    if (!fs.existsSync(dir)) return failure('folder_missing', 'Spicetify directory does not exist')
    await openExternalPath(dir); return { success: true }
  })
}
