import { authenticate, sha256 } from './auth'

type Share = { id: string; owner: string; title: string; bytes: number; created: number; expires: number; status: string }
class HttpError extends Error { constructor(public status: number, message: string) { super(message) } }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })
const escaped = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))

async function owner(request: Request, env: Env) {
  try { return await authenticate(request, env.FIREBASE_PROJECT_ID) }
  catch { throw new HttpError(401, 'Authentication required') }
}

async function limitedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new HttpError(400, 'Missing body')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0
  while (true) {
    const { value, done } = await reader.read(); if (done) break
    size += value.length
    if (size > 4096) { await reader.cancel(); throw new HttpError(413, 'Request too large') }
    chunks.push(value)
  }
  const buffer = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(buffer))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value as Record<string, unknown>
  } catch { throw new HttpError(400, 'Invalid JSON') }
}

function token() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') }
function viewer(share: Share, origin: string, secret: string) {
  const title = escaped(share.title), media = escaped(origin + '/m/' + secret)
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>' + title + ' · Eclipse</title><meta property="og:title" content="' + title + '"><meta property="og:type" content="video.other"><meta property="og:video" content="' + media + '"><meta property="og:video:type" content="video/mp4"><meta property="og:site_name" content="Eclipse Clips"><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#101011;color:#ece8e2;font:14px system-ui}main{max-width:1120px;margin:6vh auto;padding:24px}header{display:flex;align-items:center;gap:10px;margin-bottom:24px;color:#bd9169;font-size:12px;letter-spacing:2px}i{width:16px;height:16px;border-radius:50%;border:2px solid #d79a5c}video{display:block;width:100%;max-height:72vh;background:#050505;border:1px solid #29282a;border-radius:8px}h1{font-size:20px;font-weight:600;margin:20px 0 8px}p{color:#87827b;font-size:12px}a{color:#d6aa81}</style><main><header><i></i>ECLIPSE CLIPS</header><video controls playsinline preload="metadata" src="' + media + '"></video><h1>' + title + '</h1><p>Shared with a link · Expires ' + new Date(share.expires).toISOString().slice(0, 10) + '</p><a href="' + media + '" download="Eclipse-clip.mp4">Download clip</a></main></html>'
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" } })
}

async function serve(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url), now = Date.now(), parts = url.pathname.split('/').filter(Boolean)
  if (url.pathname === '/health' && request.method === 'GET') return json({ service: 'eclipse-clips', version: 1 })
  if (parts.length === 2 && ['s', 'm'].includes(parts[0]) && ['GET', 'HEAD'].includes(request.method)) {
    if (!/^[\w-]{43}$/.test(parts[1])) throw new HttpError(404, 'Clip unavailable')
    const share = await env.DB.prepare("SELECT * FROM shares WHERE token_hash=? AND status='ready' AND expires>?").bind(await sha256(parts[1]), now).first<Share>()
    if (!share) throw new HttpError(404, 'This clip is unavailable or has expired')
    if (parts[0] === 's') { const response = viewer(share, url.origin, parts[1]); return request.method === 'HEAD' ? new Response(null, response) : response }
    const meta = await env.CLIPS.head(share.id); if (!meta) throw new HttpError(404, 'Clip unavailable')
    const headers = new Headers({ 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(meta.size), 'ETag': meta.httpEtag, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; sandbox" })
    const range = !request.headers.has('if-range') || request.headers.get('if-range') === meta.httpEtag ? request.headers.get('range') : null; let selected: { offset: number; length: number } | undefined
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      const invalid = () => new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + meta.size } })
      if (!match || !match[1] && !match[2]) return invalid()
      const offset = match[1] ? Number(match[1]) : Math.max(0, meta.size - Number(match[2]))
      const end = match[1] && match[2] ? Math.min(meta.size - 1, Number(match[2])) : meta.size - 1
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset >= meta.size || end < offset) return invalid()
      selected = { offset, length: end - offset + 1 }
      headers.set('Content-Range', 'bytes ' + offset + '-' + end + '/' + meta.size); headers.set('Content-Length', String(selected.length))
    }
    if (request.method === 'HEAD') return new Response(null, { status: selected ? 206 : 200, headers })
    const object = await env.CLIPS.get(share.id, selected ? { range: selected } : undefined)
    return object ? new Response(object.body, { status: selected ? 206 : 200, headers }) : new Response(null, { status: 404 })
  }
  if (parts[0] !== 'v1' || parts[1] !== 'shares') throw new HttpError(404, 'Not found')
  const uid = await owner(request, env)
  if (parts.length === 2 && request.method === 'POST') {
    const body = await limitedJson(request), size = body.bytes, days = body.days ?? 7, title = body.title
    if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > Number(env.MAX_CLIP_BYTES) || typeof title !== 'string' || !title.trim() || title.length > 500 || days !== 1 && days !== 7 && days !== 30) throw new HttpError(400, 'Invalid clip details')
    const id = crypto.randomUUID(), secret = token(), expires = now + Number(days) * 86400000
    const [result] = await env.DB.batch([
      env.DB.prepare("INSERT INTO upload_reservations(id,owner,created) SELECT ?,?,? WHERE (SELECT COALESCE(SUM(bytes),0) FROM shares WHERE owner=? AND expires>? AND (status='ready' OR created>?))+?<=? AND (SELECT COUNT(*) FROM upload_reservations WHERE owner=? AND created>?)<10 AND (SELECT COALESCE(SUM(bytes),0) FROM shares WHERE expires>?)+?<=?").bind(id,uid,now,uid,now,now-900000,size,Number(env.MAX_OWNER_BYTES),uid,now-86400000,now,size,Number(env.MAX_TOTAL_BYTES)),
      env.DB.prepare("INSERT INTO shares(id,token_hash,owner,title,bytes,created,expires,status) SELECT ?,?,?,?,?,?,?,'reserved' WHERE EXISTS(SELECT 1 FROM upload_reservations WHERE id=?)").bind(id,await sha256(secret),uid,title.trim(),size,now,expires,id),
    ])
    if (!result.meta.changes) throw new HttpError(429, 'Clip storage or daily upload limit reached')
    return json({ id, url: url.origin + '/s/' + secret, expires, upload: url.origin + '/v1/shares/' + id }, 201)
  }
  if (parts.length !== 3 || !/^[a-f\d-]{36}$/.test(parts[2])) throw new HttpError(404, 'Not found')
  const share = await env.DB.prepare('SELECT * FROM shares WHERE id=? AND owner=?').bind(parts[2], uid).first<Share>()
  if (!share) throw new HttpError(404, 'Not found')
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shares WHERE id=? AND owner=?').bind(share.id, uid).run()
    await env.CLIPS.delete(share.id); return json({ success: true })
  }
  if (request.method === 'PUT') {
    if (share.status !== 'reserved' || share.created < now - 900000 || share.expires <= now) throw new HttpError(409, 'Upload reservation expired or already used')
    if (request.headers.get('Content-Type') !== 'video/mp4' || Number(request.headers.get('Content-Length')) !== share.bytes || !request.body) throw new HttpError(400, 'Upload size or format mismatch')
    const locked = await env.DB.prepare("UPDATE shares SET status='uploading' WHERE id=? AND status='reserved'").bind(share.id).run()
    if (!locked.meta.changes) throw new HttpError(409, 'Upload already started')
    try {
      const fixed = new FixedLengthStream(share.bytes)
      const transferring = request.body.pipeTo(fixed.writable)
      const [objectResult, transferResult] = await Promise.allSettled([env.CLIPS.put(share.id, fixed.readable, { httpMetadata: { contentType: 'video/mp4' } }), transferring])
      if (objectResult.status === 'rejected' || transferResult.status === 'rejected') throw new Error('Upload stream was incomplete')
      const stored = objectResult.value
      if (!stored || stored.size !== share.bytes) throw new Error('Incomplete upload')
      const ready = await env.DB.prepare("UPDATE shares SET status='ready' WHERE id=? AND owner=? AND status='uploading' AND expires>?").bind(share.id, uid, Date.now()).run()
      if (!ready.meta.changes) throw new Error('Upload revoked')
      return json({ success: true, bytes: stored.size })
    } catch (error) {
      console.error(JSON.stringify({ event: 'clip_upload_failed', message: error instanceof Error ? error.message.slice(0, 200) : 'Unknown upload failure' }))
      await env.CLIPS.delete(share.id); await env.DB.prepare('DELETE FROM shares WHERE id=?').bind(share.id).run()
      throw new HttpError(400, 'Upload failed or was incomplete')
    }
  }
  throw new HttpError(405, 'Method not allowed')
}

export default {
  async fetch(request, env) {
    try { return await serve(request, env) }
    catch (error) { return error instanceof HttpError ? json({ error: error.message }, error.status) : json({ error: 'Clip service unavailable' }, 503) }
  },
  async scheduled(_event, env) {
    for (let batch = 0; batch < 20; batch++) {
      const { results } = await env.DB.prepare("SELECT id FROM shares WHERE expires<=? OR status!='ready' AND created<? LIMIT 100").bind(Date.now(), Date.now() - 900000).all<{ id: string }>()
      if (!results.length) break
      for (const item of results) { await env.CLIPS.delete(item.id); await env.DB.prepare('DELETE FROM shares WHERE id=?').bind(item.id).run() }
    }
    await env.DB.prepare('DELETE FROM upload_reservations WHERE created<?').bind(Date.now()-2*86400000).run()
  },
} satisfies ExportedHandler<Env>
