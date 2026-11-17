import { session } from 'electron'
import { requestHosterPage } from './hosterRequest'
import { downloadUrl } from './downloadPaths'
import { downloadIssue } from './downloadErrors'
import type { DownloadLinkStatus } from '../src/types/downloads'

const cache = new Map<string, { expires: number; value: DownloadLinkStatus }>()
const pending = new Map<string, Promise<DownloadLinkStatus>>()

export function inspectDownloadLink(raw: string): Promise<DownloadLinkStatus> {
  if (typeof raw !== 'string' || raw.length > 8192) return Promise.resolve({ state: 'unknown' })
  if (raw.startsWith('magnet:')) return Promise.resolve({ state: 'unknown' })
  let url: string
  try { url = downloadUrl(raw).href } catch { return Promise.resolve({ state: 'unavailable' }) }
  const saved = cache.get(url)
  if (saved && saved.expires > Date.now()) return Promise.resolve(saved.value)
  const existing = pending.get(url)
  if (existing) return existing
  const task = probe(url).then(value => {
    cache.set(url, { value, expires: Date.now() + 30_000 })
    while (cache.size > 256) cache.delete(cache.keys().next().value!)
    return value
  }).finally(() => pending.delete(url))
  pending.set(url, task)
  return task
}

async function probe(raw: string): Promise<DownloadLinkStatus> {
  const ses = session.fromPartition('eclipse_link_status'), signal = AbortSignal.timeout(7000)
  let url = raw
  try {
    for (let hop = 0; hop < 5; hop++) {
      const response = await requestHosterPage(ses, url, { method: 'HEAD', signal, headers: { 'User-Agent': `Mozilla/5.0 Chrome/${process.versions.chrome || '144.0.0.0'}` } })
      if ([301,302,303,307,308].includes(response.status)) {
        const location = response.headers.get('location')
        if (!location) return { state: 'unknown' }
        url = downloadUrl(new URL(location, url).href).href; continue
      }
      if ([404,410].includes(response.status)) return { state: 'unavailable', reason: 'unavailable' }
      if ([401,403].includes(response.status)) return { state: 'unknown', reason: 'forbidden' }
      if (response.status === 429) return { state: 'unknown', reason: 'rate-limit' }
      // Reachable is deliberately not a promise that an archive can be fetched.
      return { state: response.ok || response.status === 405 ? 'reachable' : 'unknown' }
    }
    return { state: 'unknown' }
  } catch (error) { return { state: 'unknown', reason: downloadIssue(error).code } }
}
