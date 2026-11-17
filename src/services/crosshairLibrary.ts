import { desktopFetch } from './httpClient'
import { validCrosshairImage } from './crosshairConfig'
import { compactStaticCrosshairWebp } from './crosshairImage'

export const CROSSHAIR_LIBRARY_ORIGIN = 'https://centerpointgaming.com'
export interface LibraryCategory { path: string; name: string; group: 'style' | 'game' | 'color' | 'collection' }
export interface LibraryCrosshair { name: string; page: string; thumbnail: string }
export interface LibraryPage { items: LibraryCrosshair[]; next: string | null; previous: string | null }
export class LibraryImageError extends Error { constructor(public code: 'limits' | 'invalid' | 'unavailable') { super(code) } }
const cache = new Map<string, { time: number; html: string }>()

export function libraryPageUrl(path: string): string {
  const url = new URL(path, CROSSHAIR_LIBRARY_ORIGIN)
  if (url.origin !== CROSSHAIR_LIBRARY_ORIGIN || url.username || url.password || url.search || url.hash || !/^\/crosshairs\/(?:(?:collection\/)?[a-z0-9-]+\/(?:page\/[1-9]\d{0,3}\/)?)?$/.test(url.pathname)) throw new Error('Invalid library page')
  return url.href
}
function assetUrl(raw: string) {
  const url = new URL(raw, CROSSHAIR_LIBRARY_ORIGIN)
  return url.origin === CROSSHAIR_LIBRARY_ORIGIN && !url.search && !url.hash && !url.username && !url.password && /^\/assets\/crosshairs\/[a-z0-9_-]+\.webp$/i.test(url.pathname) ? url.href : null
}
export function parseLibraryCategories(html: string): LibraryCategory[] {
  const doc = new DOMParser().parseFromString(html, 'text/html'), categories = new Map<string, LibraryCategory>()
  for (const section of doc.querySelectorAll('.cxc-section')) {
    const heading = section.querySelector('h2')?.id || ''
    const group = heading === 'browse-by-style' ? 'style' : heading === 'browse-by-game' ? 'game' : heading === 'browse-by-color' ? 'color' : 'collection'
    for (const link of section.querySelectorAll<HTMLAnchorElement>('.cxc-cat-tiles a, .cxc-chips a')) {
      try {
        const path = new URL(libraryPageUrl(link.getAttribute('href') || '')).pathname, name = (link.querySelector('strong')?.textContent || link.textContent)?.replace(/\s*\([\d,]+\)\s*$/, '').trim().slice(0, 60)
        if (name && path !== '/crosshairs/all/') categories.set(path, { path, name, group })
      } catch { /* A changed or unrelated link is not a category. */ }
    }
  }
  return [...categories.values()]
}
export function parseLibraryPage(html: string): LibraryPage {
  const doc = new DOMParser().parseFromString(html, 'text/html'), items = new Map<string, LibraryCrosshair>()
  for (const card of doc.querySelectorAll<HTMLAnchorElement>('a.cxc-card--crosshair')) {
    try {
      const page = libraryPageUrl(card.getAttribute('href') || ''), thumbnail = assetUrl(card.querySelector('img')?.getAttribute('src') || '')
      const name = card.querySelector('.cxc-card-name')?.textContent?.trim().slice(0, 80)
      if (thumbnail && name) items.set(page, { name, page, thumbnail })
    } catch { /* Only provider-owned image and detail addresses are accepted. */ }
  }
  const pagination = [...doc.querySelectorAll<HTMLAnchorElement>('nav a')]
  const direction = (label: string) => {
    const link = pagination.find(link => new RegExp(label, 'i').test(link.textContent || ''))
    try { return link ? new URL(libraryPageUrl(link.getAttribute('href') || '')).pathname : null } catch { return null }
  }
  return { items: [...items.values()].slice(0, 60), next: direction('Next'), previous: direction('Prev') }
}
export function parseLibraryImage(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const img of doc.querySelectorAll<HTMLImageElement>('img')) {
    const url = assetUrl(img.getAttribute('src') || '')
    if (url && !/-320\.webp$/.test(url)) return url
  }
  throw new Error('Original image is unavailable')
}
export async function getLibraryHtml(path: string, signal: AbortSignal): Promise<string> {
  const url = libraryPageUrl(path), cached = cache.get(url)
  if (cached && Date.now() - cached.time < 10 * 60_000) return cached.html
  const response = await desktopFetch(url, { signal })
  if (!response.ok) throw new Error('Library unavailable')
  const html = await response.text()
  if (html.length > 3_000_000) throw new Error('Library response is too large')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  cache.delete(url); cache.set(url, { time: Date.now(), html })
  while (cache.size > 8) cache.delete(cache.keys().next().value!)
  return html
}
export async function selectLibraryCrosshair(item: LibraryCrosshair, signal: AbortSignal) {
  const url = parseLibraryImage(await getLibraryHtml(item.page, signal)), bridge = window.electronAPI
  if (!bridge?.getCrosshairImage) throw new Error('Desktop app required')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const id = crypto.randomUUID(), cancel = () => bridge.cancelRequest?.(id)
  signal.addEventListener('abort', cancel, { once: true })
  try {
    const result = await bridge.getCrosshairImage({ id, url })
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    if ('error' in result) throw new LibraryImageError(result.error)
    // Electron nativeImage cannot decode WebP on Windows. Chromium's async
    // bitmap decoder can resize it directly, preserving alpha without a subprocess.
    const imageData = !result.animated && (result.width > 256 || result.height > 256 || result.imageData.length > 180000) ? await compactStaticCrosshairWebp(result.imageData) : result.imageData
    if (!validCrosshairImage(imageData)) throw new Error('Invalid crosshair image')
    const image = new Image(); image.src = imageData
    await image.decode()
    return { imageData, imageName: item.name, imageSource: item.page, imageSize: Math.max(1, Math.min(192, Math.max(result.width, result.height))) }
  } finally { signal.removeEventListener('abort', cancel) }
}
