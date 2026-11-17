import { net, type Session } from 'electron'
import { downloadUrl } from './downloadPaths'

const MAX_PAGE_BYTES = 2 * 1024 * 1024

/** Session.fetch rejects manual redirects instead of returning their status.
 * Keep redirects visible to the resolver and never buffer a binary archive. */
export function requestHosterPage(ses: Session, url: string, options: {
  method: string; body?: URLSearchParams; signal: AbortSignal; headers: Record<string, string>
}): Promise<Response> {
  downloadUrl(url)
  options.signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: options.method, session: ses, credentials: 'include', redirect: 'manual', headers: options.headers })
    let settled = false
    const finish = (response?: Response, error?: unknown) => {
      if (settled) return
      settled = true
      options.signal.removeEventListener('abort', abort)
      request.abort()
      if (error) reject(error)
      else resolve(response!)
    }
    const abort = () => finish(undefined, options.signal.reason || new Error('Download cancelled'))
    options.signal.addEventListener('abort', abort, { once: true })
    request.on('error', error => finish(undefined, error))
    request.on('redirect', (status, _method, target) => {
      try {
        downloadUrl(target)
        finish(new Response(null, { status, headers: { Location: target } }))
      } catch (error) { finish(undefined, error) }
    })
    request.on('response', incoming => {
      const headers = new Headers()
      for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
      const status = incoming.statusCode
      incoming.on('error', error => finish(undefined, error))
      incoming.on('aborted', () => finish(undefined, new Error('Hoster connection closed early')))
      // Only HTML/JSON/text can be a landing page. Other responses are handed
      // back at headers so obtaining a link never reads the whole game file.
      if (status < 200 || status >= 300 || [204, 205].includes(status) || !/html|json|text\//i.test(headers.get('content-type') || '')) {
        finish(new Response(null, { status, headers }))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      incoming.on('end', () => {
        if (!settled) finish(new Response(Buffer.concat(chunks), { status, headers }))
      })
      incoming.on('data', chunk => {
        if (settled) return
        size += chunk.length
        if (size > MAX_PAGE_BYTES) { finish(undefined, new Error('Hoster page is too large')); return }
        chunks.push(Buffer.from(chunk))
      })
    })
    if (options.signal.aborted) { abort(); return }
    request.end(options.body?.toString())
  })
}
