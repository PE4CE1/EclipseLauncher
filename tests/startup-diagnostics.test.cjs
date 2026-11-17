const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')
const poster = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/library_600x900.jpg'

test('Steam image prefetch accepts missing CORS headers while rejecting HTML, HTTP errors and oversized data', async () => {
  let response = () => new Response(new Uint8Array(128), { headers: { 'Content-Type': 'image/jpeg' } })
  const { prefetchSteamImage, isPublicSteamImage } = loadTs({ electron: { net: { fetch: async (_url, options) => {
    assert.equal(options.credentials, 'omit')
    assert.equal(options.redirect, 'error')
    return response()
  } } } })('electron/artworkPrefetch.ts')
  assert.equal(await prefetchSteamImage(poster), true)
  response = () => new Response('not found', { status: 404 })
  assert.equal(await prefetchSteamImage(poster), false)
  response = () => new Response('login page', { headers: { 'Content-Type': 'text/html' } })
  assert.equal(await prefetchSteamImage(poster), false)
  response = () => new Response(new Uint8Array(4*1024*1024+1), { headers: { 'Content-Type': 'image/png' } })
  assert.equal(await prefetchSteamImage(poster), false)
  for (const url of ['file:///secret.jpg', poster.replace('https:', 'http:'), poster.replace('shared.fastly.steamstatic.com','evil.test'), poster.replace('https://','https://user:pass@'), poster.replace('.com/','.com:9443/'), poster.replace('library_600x900.jpg','../../../../secret.jpg')]) {
    assert.equal(isPublicSteamImage(url), false, url)
  }
})

test('cancelled Steam prefetch aborts its native download without hanging startup', async () => {
  let signal
  const { prefetchSteamImage } = loadTs({ electron: { net: { fetch: async (_url, options) => {
    signal = options.signal
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }))
  } } } })('electron/artworkPrefetch.ts')
  const controller = new AbortController()
  const pending = prefetchSteamImage(poster, controller.signal)
  controller.abort()
  assert.equal(await pending, false)
  assert.equal(signal.aborted, true)
})

test('renderer logging keeps warnings distinct and excludes unrelated DevTools contents', t => {
  const calls = []
  t.mock.method(console, 'warn', (...args) => calls.push(['warning', ...args]))
  t.mock.method(console, 'error', (...args) => calls.push(['error', ...args]))
  const trusted = new EventEmitter(), devtools = new EventEmitter()
  const { attachRendererLogging } = loadTs({ './ipcSecurity': { isTrustedWebContents: contents => contents === trusted } })('electron/rendererLogging.ts')
  attachRendererLogging(trusted); attachRendererLogging(devtools)
  devtools.emit('console-message', { level: 'error', message: 'Autofill.enable unavailable' })
  trusted.emit('console-message', { level: 'warning', message: 'Reduced Motion enabled' })
  trusted.emit('console-message', { level: 'error', message: 'Real application error' })
  assert.deepEqual(calls, [['warning','[Renderer]','Reduced Motion enabled'],['error','[Renderer]','Real application error']])
})


