import { ipcMain } from './ipcSecurity'
import { isHttpUrl } from './securityPolicy'
import { prefetchSteamImage } from './artworkPrefetch'
import { fetchCrosshairImage } from './crosshairLibraryService'
import { CrosshairWebpError } from '../src/services/crosshairWebp'

export interface TextRequest {
  id: string
  url: string
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
}

const MAX_RESPONSE_BYTES = 24 * 1024 * 1024
const MAX_REQUESTS_PER_WINDOW = 24
const requests = new Map<string, AbortController>()
const trackedWindows = new WeakSet<Electron.WebContents>()
const FORBIDDEN_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade', 'proxy-authorization'])

export async function requestText(payload: TextRequest, signal?: AbortSignal) {
  if (!payload || !isHttpUrl(payload.url) || !['GET', 'HEAD'].includes(payload.method || 'GET')) {
    throw new Error('Only HTTP(S) GET and HEAD requests are supported')
  }
  const headers = new Headers()
  if (payload.headers) {
    if (typeof payload.headers !== 'object' || Object.keys(payload.headers).length > 50) throw new Error('Invalid request headers')
    for (const [key, value] of Object.entries(payload.headers)) {
      if (FORBIDDEN_HEADERS.has(key.toLowerCase()) || typeof value !== 'string' || value.length > 8192) throw new Error('Invalid request header')
      headers.set(key, value)
    }
  }
  const controller = new AbortController()
  const cancel = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', cancel, { once: true })
  if (signal?.aborted) controller.abort()
  const timeout = setTimeout(() => controller.abort(new DOMException('Network request timed out after 30 seconds.', 'TimeoutError')), 30_000)
  timeout.unref()
  try {
    const response = await fetch(payload.url, { method: payload.method || 'GET', headers, signal: controller.signal })
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_RESPONSE_BYTES) throw new Error('Response exceeds maximum size')
    const chunks: Uint8Array[] = []
    let size = 0
    if (response.body) {
      const reader = response.body.getReader()
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > MAX_RESPONSE_BYTES) throw new Error('Response exceeds maximum size')
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    }
    return {
      body: Buffer.concat(chunks).toString('utf8'),
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      url: response.url,
    }
  } finally {
    controller.abort()
    clearTimeout(timeout)
    signal?.removeEventListener('abort', cancel)
  }
}

export function initNetworkIPC(): void {
  const request = async (event: Electron.IpcMainInvokeEvent, payload: TextRequest, image: boolean | 'crosshair' = false) => {
    if (!payload || typeof payload.id !== 'string' || !/^[\w-]{1,100}$/.test(payload.id)) throw new Error('Invalid request ID')
    const prefix = `${event.sender.id}:`
    if (!trackedWindows.has(event.sender)) {
      trackedWindows.add(event.sender)
      event.sender.once('destroyed', () => {
        for (const [key, controller] of requests) {
          if (key.startsWith(prefix)) controller.abort()
        }
      })
    }
    if ([...requests.keys()].filter(key => key.startsWith(prefix)).length >= MAX_REQUESTS_PER_WINDOW) throw new Error('Too many network requests')
    const key = prefix + payload.id
    if (requests.has(key)) throw new Error('Duplicate request ID')
    const controller = new AbortController()
    requests.set(key, controller)
    try {
      return image === 'crosshair' ? await fetchCrosshairImage(payload.url, controller.signal) : image ? await prefetchSteamImage(payload.url, controller.signal) : await requestText(payload, controller.signal)
    } catch (error) {
      // Cancelling obsolete work is normal. Rejecting an invoke makes Electron
      // print an error stack even when the renderer already handled the abort.
      if (controller.signal.aborted) return image === true ? false : { aborted: true as const }
      if (image === 'crosshair') return { error: error instanceof CrosshairWebpError ? error.code : 'unavailable' }
      throw error
    } finally {
      requests.delete(key)
    }
  }
  ipcMain.handle('network:request', (event, payload: TextRequest) => request(event, payload))
  ipcMain.handle('artwork:prefetch', (event, payload: TextRequest) => request(event, payload, true))
  ipcMain.handle('crosshair:image', (event, payload: TextRequest) => request(event, payload, 'crosshair'))
  ipcMain.on('network:cancel', (event, id: string) => {
    if (typeof id === 'string') requests.get(`${event.sender.id}:${id}`)?.abort()
  })
}
