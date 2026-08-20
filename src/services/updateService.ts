export const APP_VERSION = '1.2.0'
export const GITHUB_REPO = 'PE4CE1/EclipseLauncher'

export interface AppReleaseInfo {
  version: string
  name: string
  notes: string
  publishedAt: string
  downloadUrl: string
  isNewer: boolean
}

export function isNewerVersion(remoteTag: string, currentVersion: string = APP_VERSION): boolean {
  try {
    const cleanRemote = remoteTag.replace(/^[vV]/, '').trim()
    const cleanCurrent = currentVersion.replace(/^[vV]/, '').trim()

    const rParts = cleanRemote.split('.').map(n => parseInt(n, 10) || 0)
    const cParts = cleanCurrent.split('.').map(n => parseInt(n, 10) || 0)

    for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
      const r = rParts[i] ?? 0
      const c = cParts[i] ?? 0
      if (r > c) return true
      if (r < c) return false
    }
  } catch (e) {
    console.warn('[UpdateService] Version compare error:', e)
  }
  return false
}

export async function checkForAppUpdates(): Promise<AppReleaseInfo | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
    clearTimeout(timeoutId)

    if (!response.ok) return null

    const data = await response.json()
    const tag = data.tag_name || data.name || ''
    const isNewer = isNewerVersion(tag, APP_VERSION)

    const exeAsset = data.assets?.find((a: any) => a.name?.endsWith('.exe'))
    const downloadUrl = exeAsset?.browser_download_url || data.html_url || `https://github.com/${GITHUB_REPO}/releases/latest`

    return {
      version: tag.replace(/^[vV]/, ''),
      name: data.name || tag,
      notes: data.body || '',
      publishedAt: data.published_at || '',
      downloadUrl,
      isNewer,
    }
  } catch (err) {
    console.warn('[UpdateService] Update check failed or timed out:', err)
    return null
  }
}
