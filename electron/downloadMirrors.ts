import { downloadUrl } from './downloadPaths'
import { resolveDownloadLink, type ResolvedDownload } from './linkResolverService'
import { DownloadResolverError } from './downloadErrors'
import { describeDownloadHost } from '../src/services/downloadPresentation'
import { session } from 'electron'
import { requestHosterPage } from './hosterRequest'
import { nativeDownloadNetworkAvailable } from './downloadTransport'

export function downloadCandidates(primary: string, alternatives: unknown = []): string[] {
  downloadUrl(primary)
  if (!Array.isArray(alternatives) || alternatives.length > 64 || alternatives.some(value => typeof value !== 'string')) throw new Error('Invalid download mirrors')
  const fallback = alternatives.filter(url => /^https?:\/\//i.test(url)).sort((a, b) => {
    try { return describeDownloadHost(a).priority - describeDownloadHost(b).priority } catch { return 0 }
  })
  const candidates = [primary, ...fallback]
  const seen = new Set<string>(), result: string[] = []
  for (const raw of candidates) {
    let url: URL
    try { url = downloadUrl(raw) } catch { continue }
    if (seen.has(url.href)) continue
    seen.add(url.href); result.push(url.href)
    if (result.length === 12) break
  }
  return result
}

export async function prepareDownloadMirror(url: string, title: string, signal: AbortSignal): Promise<ResolvedDownload> {
  signal.throwIfAborted()
  const resolved = await resolveDownloadLink(url, title, { signal, timeoutMs: 20_000 })
  signal.throwIfAborted()
  if (resolved.type === 'torrent') throw new Error('An HTTP mirror cannot switch to BitTorrent automatically')
  let target = downloadUrl(resolved.streamUrl), headers = { ...resolved.headers }
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)])
  const probe = (method: 'HEAD' | 'GET', requestHeaders: Record<string,string>) => nativeDownloadNetworkAvailable()
    ? requestHosterPage(session.fromPartition(resolved.partition || 'eclipse_file_transfers'), target.href, { method, headers: requestHeaders, signal: deadline })
    : fetch(target, { method, redirect: 'manual', headers: requestHeaders, signal: deadline })
  for (let redirect = 0; redirect < 6; redirect++) {
    let response = await probe('HEAD', headers)
    // Some file hosts serve their landing page for HEAD even when GET is a
    // valid file. Probe one byte and cancel at headers if Range is ignored.
    if ([403, 405, 501].includes(response.status) || response.ok && /html|application\/json/i.test(response.headers.get('content-type') || '')) {
      try { void response.body?.cancel().catch(() => {}) } catch {}
      response = await probe('GET', { ...headers, Range: 'bytes=0-0' })
    }
    try { void response.body?.cancel().catch(() => {}) } catch {}
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Mirror returned an invalid redirect')
      const next = downloadUrl(new URL(location, target).href)
      if (next.origin !== target.origin) for (const key of Object.keys(headers)) if (/^(authorization|cookie|proxy-authorization)$/i.test(key)) delete headers[key]
      target = next; continue
    }
    if (!response.ok) throw new DownloadResolverError([404,410].includes(response.status) ? 'unavailable' : response.status === 429 ? 'rate-limit' : [401,403].includes(response.status) ? 'forbidden' : 'network', 'Mirror returned HTTP ' + response.status, response.status)
    const type = response.headers.get('content-type') || '', disposition = response.headers.get('content-disposition') || ''
    if (/html|application\/json|image\//i.test(type)) throw new DownloadResolverError('no-file', 'Mirror returned a webpage instead of an archive')
    if (!type && !disposition && !/\.(zip|rar|7z|exe|msi|iso|bin)(?:$|[?#])/i.test(target.href)) throw new Error('Mirror did not identify a downloadable file')
    const filename = /filename\*?=(?:UTF-8''|["'])?([^"';]+)/i.exec(disposition)?.[1]
    if ([filename, resolved.fileName, target.pathname].some(file => file && /\.(?:zip|7z)\.\d{3}$|\.part\d+\.(?:rar|zip|7z)$/i.test(file))) throw new DownloadResolverError('multipart', 'A complete mirror is required for this split archive')
    return { ...resolved, streamUrl: target.href, headers, ...(filename ? { fileName: filename } : {}) }
  }
  throw new Error('Mirror returned too many redirects')
}
