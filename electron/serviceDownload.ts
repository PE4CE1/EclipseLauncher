import fs from 'fs'
import https from 'https'
import { randomUUID } from 'crypto'
import { pipeline } from 'stream/promises'

interface DownloadOptions {
  onProgress?: (received: number, total: number) => void
  fileSystem?: typeof fs
}

/** Publish only a completely received file; a failed replacement keeps the old file usable. */
export async function downloadServiceFile(url: string, destination: string, options: DownloadOptions = {}): Promise<void> {
  const fileSystem = options.fileSystem || fs
  const temporaryPath = `${destination}.${randomUUID()}.part`
  try {
    const response = await requestFile(new URL(url), 5)
    let received = 0
    let lastUpdate = 0
    const total = Number(response.headers['content-length']) || 0
    response.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (Date.now() - lastUpdate >= 250) {
        lastUpdate = Date.now()
        options.onProgress?.(received, total)
      }
    })
    await pipeline(response, fileSystem.createWriteStream(temporaryPath, { flags: 'wx' }))
    if (received === 0 || (total > 0 && received !== total)) throw new Error('Incomplete download')
    await fileSystem.promises.rename(temporaryPath, destination)
    options.onProgress?.(received, total)
  } catch (error) {
    await fileSystem.promises.unlink(temporaryPath).catch(() => {})
    throw error
  }
}

function requestFile(url: URL, redirects: number): Promise<import('http').IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== 'https:' || url.username || url.password) return reject(new Error('Downloads require an HTTPS URL'))
    const request = https.get(url, { headers: { 'User-Agent': 'EclipseLauncher' }, timeout: 30000 }, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        if (redirects <= 0) return reject(new Error('Too many download redirects'))
        try {
          resolve(requestFile(new URL(response.headers.location, url), redirects - 1))
        } catch (error) { reject(error) }
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        return reject(new Error(`Download failed with HTTP ${response.statusCode}`))
      }
      resolve(response)
    })
    request.on('timeout', () => request.destroy(new Error('Download timed out')))
    request.on('error', reject)
  })
}
