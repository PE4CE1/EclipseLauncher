const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

test('generic archive links resolve without buffering the archive as a MediaFire page', async t => {
  const previousFetch = global.fetch
  global.fetch = async () => { throw new Error('Archive resolution must not fetch the file') }
  t.after(() => { global.fetch = previousFetch })
  const { resolveDownloadLink } = loadTs({ electron: { app: { getPath: () => __dirname } } })('electron/linkResolverService.ts')
  const result = await resolveDownloadLink('https://example.com/game.zip', 'Game')
  assert.equal(result.streamUrl, 'https://example.com/game.zip')
  assert.equal(result.provider, 'Direct HTTP')
  await assert.rejects(resolveDownloadLink('file:///C:/secret', 'Game'))
})

test('Buzzheavier, MediaFire and Qiwi use bounded public-page resolution and propagate its network session', async () => {
  const calls = []
  const { resolveDownloadLink } = loadTs({ electron: { app: { getPath: () => __dirname } }, './automaticHosterResolver': {
    resolveAutomaticHoster: async url => { calls.push(url); return { streamUrl: 'https://cdn.example.com/archive.zip', partition: 'same-session' } },
  } })('electron/linkResolverService.ts')
  for (const url of ['https://buzzheavier.com/f/example', 'https://mediafire.com/file/example/archive.zip', 'https://qiwi.gg/file/example']) {
    const result = await resolveDownloadLink(url, 'Game')
    assert.equal(calls.at(-1), url, 'Preserve the source URL rather than guessing an endpoint')
    assert.equal(result.partition, 'same-session')
    assert.equal(result.streamUrl, 'https://cdn.example.com/archive.zip')
  }
})

test('simultaneous browser resolvers have independent interception hooks and remove download listeners', async () => {
  const sessions = []
  const windows = []
  function makeSession(partition) {
    const ses = new EventEmitter()
    ses.partition = partition
    ses.setUserAgent = () => {}
    ses.cookies = { get: async () => [] }
    ses.webRequest = { onHeadersReceived: (...args) => { ses.headerHook = args.length === 1 ? null : args[1] } }
    sessions.push(ses)
    return ses
  }
  class BrowserWindow extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.destroyed = false
      this.webContents = new EventEmitter()
      Object.assign(this.webContents, { setUserAgent() {}, setWindowOpenHandler() {}, insertCSS: async () => '', executeJavaScript: async () => {} })
      windows.push(this)
    }
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true; this.emit('closed') }
    loadURL() { return Promise.resolve() }
  }
  const { resolveBackgroundStream } = loadTs({ electron: { session: { fromPartition: makeSession }, BrowserWindow } })('electron/automaticHosterResolver.ts')
  const first = resolveBackgroundStream('https://example.com/first')
  const second = resolveBackgroundStream('https://example.com/second')
  assert.equal(sessions.length, 2)
  assert.notEqual(sessions[0].partition, sessions[1].partition)
  assert.equal(windows.every(window => window.options.show === false), true)
  assert.equal(windows[0].options.webPreferences.contextIsolation, true)
  assert.equal(windows[0].options.webPreferences.sandbox, true)
  sessions[0].headerHook({ url: 'https://cdn.example.com/first.zip', statusCode: 200, responseHeaders: { 'content-type': ['application/zip'] } }, () => {})
  const result = await first
  assert.equal(result.streamUrl, 'https://cdn.example.com/first.zip')
  assert.equal(sessions[0].headerHook, null)
  assert.equal(sessions[0].listenerCount('will-download'), 0)
  assert.equal(typeof sessions[1].headerHook, 'function')
  windows[1].destroy()
  assert.equal(await second, null)
  assert.equal(sessions[1].headerHook, null)
  assert.equal(sessions[1].listenerCount('will-download'), 0)
})
