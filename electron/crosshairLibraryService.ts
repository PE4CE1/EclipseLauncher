import { CrosshairWebpError, inspectCrosshairWebp } from '../src/services/crosshairWebp'

export function isCrosshairAssetUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 500) return false
  try {
    const url = new URL(raw)
    return url.origin === 'https://centerpointgaming.com' && !url.username && !url.password && !url.search && !url.hash && /^\/assets\/crosshairs\/[a-z0-9_-]+\.webp$/i.test(url.pathname)
  } catch { return false }
}

export async function fetchCrosshairImage(url: string, signal?: AbortSignal) {
  if (!isCrosshairAssetUrl(url)) throw new Error('Invalid crosshair image address')
  const timeout = AbortSignal.timeout(15_000)
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error' })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) { await response.body?.cancel(); throw new Error('Crosshair image is unavailable') }
  if (Number(response.headers.get('content-length') || 0) > 2 * 1024 * 1024) { await response.body?.cancel(); throw new CrosshairWebpError('limits') }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty crosshair image')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2 * 1024 * 1024) throw new CrosshairWebpError('limits')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const bytes = Buffer.concat(chunks), details = inspectCrosshairWebp(bytes)
  return { imageData: 'data:image/webp;base64,' + bytes.toString('base64'), ...details }
}
