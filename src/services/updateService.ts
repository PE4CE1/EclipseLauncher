import { desktopFetch as fetch } from './httpClient'
import { APP_VERSION } from './appVersion'
export { APP_VERSION, APP_DISPLAY_VERSION } from './appVersion'
export const GITHUB_REPO = 'PE4CE1/EclipseLauncher'

export interface AppReleaseInfo {
  version: string
  name: string
  notes: string
  publishedAt: string
  downloadUrl: string
  isNewer: boolean
}

type ParsedVersion = { core: number[]; prerelease: string[] }

function parseVersion(value: string): ParsedVersion | null {
  if (typeof value !== 'string') return null
  const match = /^[vV]?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*))?(?:\+[\da-zA-Z-]+(?:\.[\da-zA-Z-]+)*)?$/.exec(value.trim())
  if (!match) return null
  const core = match.slice(1, 4).map(Number)
  const prerelease = match[4]?.split('.') || []
  if (core.some(part => !Number.isSafeInteger(part)) || prerelease.some(part => /^0\d+$/.test(part))) return null
  return { core, prerelease }
}

export function isNewerVersion(remoteTag: string, currentVersion: string = APP_VERSION): boolean {
  const remote = parseVersion(remoteTag)
  const current = parseVersion(currentVersion)
  if (!remote || !current) return false
  for (let index = 0; index < 3; index++) {
    if (remote.core[index] !== current.core[index]) return remote.core[index] > current.core[index]
  }
  if (remote.prerelease.length === 0 || current.prerelease.length === 0) {
    return remote.prerelease.length === 0 && current.prerelease.length > 0
  }
  for (let index = 0; index < Math.max(remote.prerelease.length, current.prerelease.length); index++) {
    const left = remote.prerelease[index]
    const right = current.prerelease[index]
    if (left === undefined || right === undefined) return left !== undefined
    if (left === right) continue
    const leftNumeric = /^\d+$/.test(left)
    const rightNumeric = /^\d+$/.test(right)
    if (leftNumeric && rightNumeric) return left.length === right.length ? left > right : left.length > right.length
    if (leftNumeric !== rightNumeric) return !leftNumeric
    return left > right
  }
  return false
}

let updateCheckInFlight: Promise<AppReleaseInfo | null> | null = null
let startupUpdateCheck: Promise<AppReleaseInfo | null> | null = null

export function checkStartupUpdates(autoCheckEnabled: boolean): Promise<AppReleaseInfo | null> {
  if (!autoCheckEnabled) return Promise.resolve(null)
  if (!startupUpdateCheck) {
    startupUpdateCheck = Promise.resolve().then(() => {
      if (typeof window !== 'undefined' && window.electronAPI?.checkUpdate) {
        void Promise.resolve().then(() => window.electronAPI.checkUpdate())
          .catch(error => console.warn('[UpdateService] Native check failed:', error))
      }
      return checkForAppUpdates()
    })
  }
  return startupUpdateCheck
}

export function checkForAppUpdates(): Promise<AppReleaseInfo | null> {
  if (!updateCheckInFlight) {
    updateCheckInFlight = fetchLatestRelease().finally(() => { updateCheckInFlight = null })
  }
  return updateCheckInFlight
}

async function fetchLatestRelease(): Promise<AppReleaseInfo | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
    if (!response.ok) return null
    const data = await response.json()
    if (controller.signal.aborted || !data || data.draft || data.prerelease || !parseVersion(data.tag_name)) return null
    const tag: string = data.tag_name
    const assets: { name?: string; browser_download_url?: string }[] = Array.isArray(data.assets) ? data.assets : []
    const exeAsset = assets.find(asset => typeof asset?.name === 'string' && asset.name.toLowerCase().endsWith('.exe'))
    return {
      version: tag.replace(/^[vV]/, ''),
      name: typeof data.name === 'string' ? data.name : tag,
      notes: typeof data.body === 'string' ? data.body : '',
      publishedAt: typeof data.published_at === 'string' ? data.published_at : '',
      downloadUrl: exeAsset?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
      isNewer: isNewerVersion(tag, APP_VERSION),
    }
  } catch (error) {
    console.warn('[UpdateService] Update check failed or timed out:', error)
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
