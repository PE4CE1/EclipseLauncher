import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { getNonSteamGame } from '../src/services/nonSteamGames'

export interface DiscoveredGame {
  id: string
  name: string
  platform: 'epic' | 'custom'
  installPath: string
  launchUrl: string
  executable?: string
  appId?: string
  iconUrl?: string
  installed: boolean
}

const exists = async (file: string, directory = false) => {
  try { const stat = await fs.stat(file); return directory ? stat.isDirectory() : stat.isFile() } catch { return false }
}

export function insideInstallation(root: string, relative: string): string | undefined {
  if (!path.isAbsolute(root) || !relative || path.isAbsolute(relative)) return
  const absolute = path.resolve(root, relative.replace(/[\\/]/g, path.sep))
  const local = path.relative(path.resolve(root), absolute)
  if (!local || local === '..' || local.startsWith(`..${path.sep}`) || path.isAbsolute(local)) return
  return absolute
}

export async function epicManifestDirectory(): Promise<string | undefined> {
  const primary = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests')
  if (await exists(primary, true)) return primary
  if (process.platform !== 'win32') return
  const output = await new Promise<string>(resolve => {
    execFile('reg.exe', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Epic Games\\EpicGamesLauncher', '/v', 'AppDataPath'], { windowsHide: true, timeout: 3000, maxBuffer: 64 * 1024 }, (error, stdout) => resolve(error ? '' : stdout))
  })
  const base = /AppDataPath\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(output)?.[1]?.trim()
  if (base && path.isAbsolute(base)) {
    const directory = path.join(base, 'Manifests')
    if (await exists(directory, true)) return directory
  }
}

export async function discoverEpicGames(shouldContinue = () => true): Promise<DiscoveredGame[]> {
  const directory = await epicManifestDirectory()
  if (!directory || !shouldContinue()) return []
  const files = await fs.readdir(directory)
  const games = new Map<string, DiscoveredGame>()
  for (const file of files.filter(file => file.endsWith('.item'))) {
    if (!shouldContinue()) break
    try {
      const data = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'))
      const { DisplayName: name, InstallLocation: root, CatalogItemId: catalogId, AppName: appName, LaunchExecutable: relative } = data
      if (typeof name !== 'string' || typeof root !== 'string' || typeof catalogId !== 'string' || typeof appName !== 'string' || typeof relative !== 'string') continue
      if (data.bIsIncompleteInstall || data.bIsApplication === false || !/\.exe$/i.test(relative)) continue
      const executable = insideInstallation(root, relative)
      if (!executable || !await exists(executable) || !shouldContinue()) continue
      const known = getNonSteamGame(name)
      const namespace = typeof data.CatalogNamespace === 'string' ? data.CatalogNamespace : ''
      // Preserve the complete Epic launch identity to avoid launching an add-on or another edition.
      const launchId = namespace ? `${namespace}:${catalogId}:${appName}` : appName
      games.set(appName, { id: `epic-${catalogId}`, name: known?.name || name, platform: 'epic', installPath: path.resolve(root), executable,
        launchUrl: `com.epicgames.launcher://apps/${encodeURIComponent(launchId)}?action=launch&silent=true`, appId: catalogId, iconUrl: known?.hero, installed: true })
    } catch { /* A removed or partially written manifest must not hide the other games. */ }
  }
  return [...games.values()]
}

const riotProducts = [
  { product: 'valorant', key: 'valorant', relative: 'VALORANT.exe' },
  { product: 'league_of_legends', key: 'league-of-legends', relative: 'LeagueClient.exe' },
] as const

export function readRiotInstallPath(yaml: string): string | undefined {
  // Read only this scalar, never Riot's authentication files or executable YAML.
  const value = /^product_install_full_path:\s*(.+?)\s*$/m.exec(yaml)?.[1]
  if (!value) return
  let decoded: string
  try { decoded = value.startsWith('"') ? JSON.parse(value) : value.startsWith("'") ? value.slice(1, -1).replace(/''/g, "'") : value.split(/\s+#/)[0] } catch { return }
  return typeof decoded === 'string' && path.isAbsolute(decoded) ? path.resolve(decoded) : undefined
}

export async function riotClientExecutable(): Promise<string | undefined> {
  try {
    const data = JSON.parse(await fs.readFile(path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games', 'RiotClientInstalls.json'), 'utf8'))
    for (const candidate of [data.rc_live, data.rc_default]) {
      if (typeof candidate === 'string' && path.isAbsolute(candidate) && path.basename(candidate).toLowerCase() === 'riotclientservices.exe' && await exists(candidate)) return path.resolve(candidate)
    }
  } catch {}
}

export async function discoverRiotGames(shouldContinue = () => true): Promise<DiscoveredGame[]> {
  const games: DiscoveredGame[] = []
  const metadata = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Riot Games', 'Metadata')
  for (const item of riotProducts) {
    if (!shouldContinue()) break
    try {
      const yaml = await fs.readFile(path.join(metadata, `${item.product}.live`, `${item.product}.live.product_settings.yaml`), 'utf8')
      const root = readRiotInstallPath(yaml)
      if (!root) continue
      const executable = path.join(root, item.relative)
      if (!await exists(executable) || !shouldContinue()) continue
      const game = getNonSteamGame(item.key)!
      games.push({ id: `riot-${item.product}`, name: game.name, platform: 'custom', appId: item.product, installPath: root, executable,
        launchUrl: `eclipse-game://riot/${item.product}`, iconUrl: game.hero, installed: true })
    } catch {}
  }
  return games
}
