import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_PAGES = new Set(['/index.html', '/overlay.html', '/stream.html', '/'])
const EXTERNAL_PROTOCOLS = new Set([
  'https:', 'http:', 'steam:', 'com.epicgames.launcher:', 'rockstar:',
  'rockstar-games-launcher:', 'roblox:', 'roblox-player:', 'discord:', 'spotify:',
])

export function isTrustedRendererUrl(rawUrl: string, distDirectory: string, devServerUrl?: string): boolean {
  try {
    const url = new URL(rawUrl)
    if (devServerUrl) {
      const dev = new URL(devServerUrl)
      if (url.origin === dev.origin && APP_PAGES.has(url.pathname)) return true
    }
    if (url.protocol !== 'file:') return false
    const pagePath = path.resolve(fileURLToPath(url))
    return ['index.html', 'overlay.html', 'stream.html'].some(page =>
      pagePath === path.resolve(distDirectory, page),
    )
  } catch {
    return false
  }
}

export function isAllowedExternalUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== 'string' || rawUrl.length > 8192 || /[\u0000-\u001f\u007f]/.test(rawUrl)) return false
  try {
    const url = new URL(rawUrl)
    return EXTERNAL_PROTOCOLS.has(url.protocol) && !url.username && !url.password
  } catch {
    return false
  }
}

export function isHttpUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== 'string' || rawUrl.length > 16384) return false
  try {
    const url = new URL(rawUrl)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch {
    return false
  }
}

export function resolveBundledAssetPath(rawUrl: string, distDirectory: string): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'eclipse-asset:' || url.hostname !== 'bundle' || url.port || url.username || url.password) return null
    const pathname = decodeURIComponent(url.pathname)
    if (!/^\/controller-skins\/(?:[a-z0-9_-]+\/)*[a-z0-9_.-]+\.(?:html|js|css|png|svg|webp|jpe?g)$/i.test(pathname)) return null
    const assetDirectory = path.resolve(distDirectory, 'controller-skins')
    const filePath = path.resolve(distDirectory, '.' + pathname)
    const relative = path.relative(assetDirectory, filePath)
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? filePath : null
  } catch {
    return null
  }
}

/** Cache-busting query strings belong to the URL, never to the filesystem path. */
export function resolveLocalMediaPath(rawUrl: string, allowedDirectories: string[]): string | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'local-media:' || !['file', 'localhost'].includes(url.hostname)) return null
    let decoded = decodeURIComponent(url.pathname).replace(/^\/(?=[a-zA-Z]:)/, '')
    if (!path.isAbsolute(decoded)) return null
    const diskPath = path.resolve(decoded)
    if (!/\.(?:mp4|webm|mkv|mov|m4v|mp3|wav|ogg|m4a|png|jpe?g|webp)$/i.test(diskPath)) return null
    for (const directory of allowedDirectories) {
      const relative = path.relative(path.resolve(directory), diskPath)
      if (relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) return diskPath
    }
  } catch {}
  return null
}
