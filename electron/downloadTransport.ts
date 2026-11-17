import { net, session } from 'electron'
import http from 'node:http'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingHttpHeaders } from 'node:http'

export type DownloadStream = Readable & { statusCode?: number; headers: IncomingHttpHeaders }
export interface DownloadRequest {
  on(event: 'error', listener: (error: Error) => void): unknown
  setTimeout(milliseconds: number, listener: () => void): unknown
  destroy(error?: Error): unknown
  touch?(): void
}
export const nativeDownloadNetworkAvailable = () => typeof net?.request === 'function' && typeof session?.fromPartition === 'function'

/** Keep the browser's network/session semantics through the actual file stream.
 * The Node path also supports standalone tests and non-Electron consumers. */
export function requestDownloadStream(url: URL, headers: Record<string,string>, respond: (response: DownloadStream) => void, partition?: string): DownloadRequest {
  if (!nativeDownloadNetworkAvailable()) return (url.protocol === 'https:' ? https : http).get(url, { headers }, respond)
  const request = net.request({ url: url.href, method: 'GET', headers, session: session.fromPartition(partition || 'eclipse_file_transfers'), credentials: 'include', redirect: 'manual', cache: 'no-store' })
  const events = new EventEmitter()
  let timer: ReturnType<typeof setTimeout> | undefined, finished = false
  let response: DownloadStream | undefined
  const clear = () => { clearTimeout(timer); timer = undefined }
  const stop = (error?: Error) => {
    if (finished) return
    const headerError = error || (!response ? Object.assign(new Error('Download cancelled'), { name: 'AbortError', code: 'ABORT_ERR' }) : undefined)
    finished = true; clear()
    // Abort must also reject an already running disk pipeline, including a
    // connection which stalls after the response headers have arrived.
    response?.destroy(error)
    request.abort()
    if (headerError) events.emit('error', headerError)
  }
  const handle: DownloadRequest = {
    on: (event, listener) => events.on(event, listener),
    setTimeout: (milliseconds, listener) => { clear(); timer = setTimeout(listener, milliseconds); timer.unref?.() },
    touch: () => timer?.refresh(),
    destroy: stop,
  }
  request.on('error', stop)
  request.on('redirect', (status, _method, target) => {
    if (finished) return
    finished = true; clear(); request.abort()
    const response = Readable.from([]) as DownloadStream
    response.statusCode = status; response.headers = { location: target }
    respond(response)
  })
  request.on('response', incoming => {
    if (finished) return
    handle.touch?.()
    response = incoming as unknown as DownloadStream
    const complete = () => { finished = true; clear() }
    response.once('end', complete)
    response.once('close', () => { complete(); request.abort() })
    // Electron 45's response is a real Readable with native backpressure. Do
    // not attach a data listener here: the disk pipeline must own consumption.
    respond(response)
  })
  request.end()
  return handle
}
