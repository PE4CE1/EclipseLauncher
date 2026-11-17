import { net } from 'electron'

const HOSTS = new Set(['shared.fastly.steamstatic.com', 'shared.akamai.steamstatic.com', 'cdn.cloudflare.steamstatic.com'])
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export function isPublicSteamImage(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 4096) return false
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && HOSTS.has(url.hostname) && !url.port && !url.username && !url.password
      && /^\/(?:store_item_assets\/)?steam\/apps\/\d+\/[\w./-]+\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname)
  } catch { return false }
}

/** Fill Chromium's encoded image cache without browser CORS probes or bitmap decoding. */
export async function prefetchSteamImage(url: string, signal?: AbortSignal): Promise<boolean> {
  if (!isPublicSteamImage(url) || signal?.aborted) return false
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, 6000)
  timer.unref()
  try {
    const response = await net.fetch(url, { credentials: 'omit', cache: 'force-cache', redirect: 'error', signal: controller.signal })
    if (!response.ok || !/^image\//i.test(response.headers.get('content-type') || '') || Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
      await response.body?.cancel()
      return false
    }
    const reader = response.body?.getReader()
    if (!reader) return false
    let bytes = 0
    try {
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > MAX_IMAGE_BYTES || controller.signal.aborted) return false
      }
      return bytes > 0 && !controller.signal.aborted
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  } catch { return false }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
