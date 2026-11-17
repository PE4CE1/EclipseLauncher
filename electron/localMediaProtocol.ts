import fs from 'node:fs'
import { Readable } from 'node:stream'
import { resolveLocalMediaPath } from './securityPolicy'

export function mediaByteRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || (!match[1] && !match[2]) || size <= 0) throw new RangeError('Invalid media byte range')
  const suffix = !match[1]
  const requested = Number(suffix ? match[2] : match[1])
  if (!Number.isSafeInteger(requested) || requested < 0 || (suffix && requested === 0)) throw new RangeError('Invalid media byte range')
  const start = suffix ? Math.max(0, size - requested) : requested
  const end = suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]))
  if (!Number.isSafeInteger(end) || start >= size || end < start) throw new RangeError('Invalid media byte range')
  return { start, end }
}

export async function serveLocalMedia(request: Request, directories: string[]): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 })
  try {
    const resolved = resolveLocalMediaPath(request.url, directories)
    if (!resolved) return new Response(null, { status: 404 })
    const file = await fs.promises.realpath(resolved)
    const roots = await Promise.all(directories.map(root => fs.promises.realpath(root).catch(() => root)))
    if (!resolveLocalMediaPath(`local-media://file/${encodeURIComponent(file)}`, roots)) return new Response(null, { status: 404 })
    const stat = await fs.promises.stat(file)
    if (!stat.isFile()) return new Response(null, { status: 404 })
    const mime = ({ mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' } as Record<string, string>)[file.split('.').pop()!.toLowerCase()] || 'application/octet-stream'
    const headers = new Headers({ 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' })
    let range
    try { range = mediaByteRange(request.headers.get('Range'), stat.size) }
    catch { headers.set('Content-Range', `bytes */${stat.size}`); return new Response(null, { status: 416, headers }) }
    const start = range?.start || 0, end = range?.end ?? stat.size - 1
    headers.set('Content-Length', String(range ? end - start + 1 : stat.size))
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`)
    if (request.method === 'HEAD' || stat.size === 0) return new Response(null, { status: range ? 206 : 200, headers })
    const stream = fs.createReadStream(file, { start, end, highWaterMark: 256 * 1024 })
    const cancel = () => stream.destroy()
    request.signal.addEventListener('abort', cancel, { once: true })
    stream.once('close', () => request.signal.removeEventListener('abort', cancel))
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status: range ? 206 : 200, headers })
  } catch { return new Response(null, { status: 404 }) }
}
