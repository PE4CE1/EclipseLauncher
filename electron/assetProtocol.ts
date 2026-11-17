import { net, protocol } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveBundledAssetPath } from './securityPolicy'

export const ASSET_SCHEME: Electron.CustomScheme = {
  scheme: 'eclipse-asset',
  privileges: { standard: true, secure: true, supportFetchAPI: true },
}

/** Opaque sandboxed frames cannot read file:// subresources; expose only bundled skin assets. */
export function initAssetProtocol(distDirectory = path.join(__dirname, '../dist')): void {
  protocol.handle('eclipse-asset', async request => {
    const filePath = resolveBundledAssetPath(request.url, distDirectory)
    if (!filePath || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 })
    try {
      return await net.fetch(pathToFileURL(filePath).href, { method: request.method })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
