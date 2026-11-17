const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const load = require('./download-loader.cjs'), flush = () => new Promise(setImmediate)
const { normalizeSourceUrl, parseSourceUrls } = load()('src/services/sourceUrls.ts')
const body = name => JSON.stringify({ name, downloads: [{ title: name + ' Game', uris: ['https://example.com/game.zip'] }] })
const response = name => ({ ok: true, status: 200, text: async () => body(name) })

test('replacement sources are fetched and validated before replacing a failed source', async t => {
  let result={success:false,error:'net::ERR_SSL_PROTOCOL_ERROR'}
  const store=storeFixture(t,async()=>result),old='https://example.com/old.json',next='https://example.com/new.json'
  await store.getState().addSource(old)
  const before=store.getState().sources[0]
  await assert.rejects(store.getState().replaceSource(old,next),/SSL/)
  assert.deepEqual(store.getState().sources,[before])
  result={success:true,name:'Replacement',data:[{title:'Verified Game',uris:['https://example.com/game.zip']}],lastSynced:200}
  await store.getState().replaceSource(old,next)
  assert.equal(store.getState().sources.length,1);assert.equal(store.getState().sources[0].url,next)
  assert.equal(store.getState().sources[0].status,'up_to_date');assert.equal(store.getState().sources[0].optionsCount,1)
})

test('removing a source during replacement cannot resurrect it',async t=>{
  let resolve
  const store=storeFixture(t,async()=>({success:false,error:'TLS error'})),old='https://example.com/old.json'
  await store.getState().addSource(old)
  window.electronAPI.fetchAndCacheSource=()=>new Promise(done=>{resolve=done})
  const pending=store.getState().replaceSource(old,'https://example.com/new.json');await flush()
  store.getState().removeSource(old)
  resolve({success:true,name:'Fresh',data:[{title:'Game',uris:['https://example.com/game.zip']}],lastSynced:200})
  await pending;assert.deepEqual(store.getState().sources,[])
})

test('source repair suggestions cover verified website feeds without rewriting unrelated URLs',()=>{
  const {getSourceRepair}=load()('src/services/sourceRepairs.ts')
  const providers = ['dodi', 'fitgirl', 'kaoskrew', 'onlinefix', 'gog', 'empress', 'xatab']
  for (const name of providers) {
    const original = `https://hydralinks.cloud/sources/${name}.json`, repair = getSourceRepair(original)
    assert.ok(repair?.provider); assert.notEqual(repair.url, original)
    assert.equal(new URL(repair.url).protocol, 'https:')
    assert.equal(new URL(repair.url).pathname.split('/').pop(), `${name}.json`)
  }
  for (const name of ['kaoskrew', 'gog', 'empress']) {
    assert.match(getSourceRepair(`https://hydralinks.pages.dev/sources/${name}.json`).url, /raw\.githubusercontent\.com\/ArnamentGames\//)
  }
  for(const value of ['https://hydralinks.cloud.evil.example/sources/fitgirl.json', 'https://hydralinks.cloud/sources/atmos.json', 'https://example.com/fitgirl.json', 'https://hydralinks.cloud/sources/fitgirl.json?token=x', 'https://user:pass@hydralinks.cloud/sources/fitgirl.json', 'http://hydralinks.cloud/sources/fitgirl.json', 'https://hydralinks.cloud:444/sources/fitgirl.json']) assert.equal(getSourceRepair(value),undefined)
})

test('manual replacement rejects invalid, empty and stale feeds without losing the original source', async t => {
  const store = storeFixture(t, async () => ({ success: false, error: 'HTTP 403' })), old = 'https://example.com/old.json'
  await store.getState().addSource(old)
  const previous = store.getState().sources[0]
  for (const url of ['file:///C:/secret', 'https://user:password@example.com/feed']) {
    await assert.rejects(store.getState().replaceSource(old, url))
    assert.deepEqual(store.getState().sources, [previous])
  }
  for (const result of [
    { success: true, name: 'Empty', data: [] },
    { success: true, stale: true, name: 'Stale', data: JSON.parse(body('Stale')).downloads },
    { success: true, name: 'Unsafe', data: [{ title: 'Unsafe', uris: ['javascript:alert(1)'] }] },
  ]) {
    window.electronAPI.fetchAndCacheSource = async () => result
    await assert.rejects(store.getState().replaceSource(old, 'https://example.com/new.json'))
    assert.deepEqual(store.getState().sources, [previous])
  }
})

test('replacing with an already imported URL merges duplicate rows and removes old errors', async t => {
  const store = storeFixture(t, async () => ({ success: true, name: 'Current', data: JSON.parse(body('Current')).downloads, lastSynced: 100 }))
  const old = 'https://example.com/old.json', next = 'https://example.com/new.json'
  await store.getState().addSource(`${old}\n${next}`)
  await store.getState().replaceSource(old, next)
  assert.equal(store.getState().sources.length, 1)
  assert.equal(store.getState().sources[0].url, next)
  assert.equal(store.getState().sources[0].lastError, undefined)
  assert.equal(store.getState().sources[0].status, 'up_to_date')
})

test('an older destination sync cannot overwrite a validated source replacement', async t => {
  const fresh = { success: true, name: 'Current', data: JSON.parse(body('Current')).downloads, lastSynced: 200 }
  const store = storeFixture(t, async () => fresh), old = 'https://example.com/old.json', next = 'https://example.com/new.json'
  await store.getState().addSource(old)
  let finish
  window.electronAPI.fetchAndCacheSource = () => new Promise(resolve => { finish = resolve })
  const importing = store.getState().addSource(next); await flush()
  window.electronAPI.fetchAndCacheSource = async () => fresh
  await store.getState().replaceSource(old, next)
  finish({ success: false, error: 'Older request failed' }); await importing
  assert.equal(store.getState().sources.length, 1)
  assert.equal(store.getState().sources[0].url, next)
  assert.equal(store.getState().sources[0].status, 'up_to_date')
  assert.equal(store.getState().sources[0].lastError, undefined)
})

test('TLS failures stop automatic retries and preserve validated cached source data', async t => {
  const f = nativeFixture(t, async () => { throw new Error('net::ERR_SSL_PROTOCOL_ERROR') })
  const url = 'https://example.com/feed.json'
  f.service.saveCachedSource(url, 'Previous', [{title:'Cached Game',uris:['https://example.com/game.zip']}])
  const result = await f.service.fetchAndCacheSource(url)
  assert.equal(result.success,true);assert.equal(result.stale,true);assert.equal(result.data.length,1)
  assert.equal(f.calls(),1);assert.equal(f.windows(),0);assert.match(result.error,/ERR_SSL_PROTOCOL_ERROR/)
})

test('source HTTPS errors receive localized explanations without masking unrelated errors', () => {
  const {sourceErrorMessage,isSourceTlsError}=load()('src/services/sourceErrors.ts')
  assert.match(sourceErrorMessage('net::ERR_SSL_PROTOCOL_ERROR','de'),/HTTPS-Verbindung/)
  assert.match(sourceErrorMessage('net::ERR_CERT_DATE_INVALID','en'),/secure HTTPS/)
  assert.equal(isSourceTlsError('write EPROTO'),true)
  assert.equal(isSourceTlsError('Source returned HTTP 503'),false)
  assert.equal(sourceErrorMessage('Source returned HTTP 404','en'),'Source returned HTTP 404')
})

function nativeFixture(t, fetch, windowClass) {
  const directory = fs.mkdtempSync(path.join(__dirname, '.source-reliability-'))
  t.after(() => { assert.equal(path.dirname(path.resolve(directory)), __dirname); fs.rmSync(directory, { recursive: true, force: true }) })
  let calls = 0, windows = 0
  const session = { setUserAgent() {}, fetch: (...args) => { calls++; return fetch(...args) } }
  const service = load({ electron: { app: { getPath: () => directory }, session: { fromPartition: () => session }, BrowserWindow: windowClass || class { constructor() { windows++; throw new Error('Unexpected source verification window') } } } })('electron/sourceFetcherService.ts')
  return { service, directory, calls: () => calls, windows: () => windows }
}

test('multiple source URLs normalize GitHub pages without changing case-sensitive paths', () => {
  assert.deepEqual(parseSourceUrls('https://EXAMPLE.com/Feed.json#top\nhttps://example.com/Feed.json\nhttps://github.com/User/Repo/blob/main/source.json'), ['https://example.com/Feed.json', 'https://raw.githubusercontent.com/User/Repo/main/source.json'])
  assert.notEqual(normalizeSourceUrl('https://example.com/Feed.json'), normalizeSourceUrl('https://example.com/feed.json'))
  for (const value of ['file:///C:/secret', 'https://user:pass@example.com/feed', 'javascript:alert(1)']) assert.throws(() => normalizeSourceUrl(value))
  assert.throws(() => parseSourceUrls('https://example.com/feed.json\ninvalid'))
})

test('native source fetch shares concurrent requests and strips UTF-8 BOM', async t => {
  let finish
  const f = nativeFixture(t, () => new Promise(resolve => { finish = resolve }))
  const first = f.service.fetchAndCacheSource('https://example.com/feed.json#one')
  const second = f.service.fetchAndCacheSource('https://example.com/feed.json#two')
  assert.equal(first, second); await flush(); assert.equal(f.calls(), 1)
  finish({ ok: true, status: 200, text: async () => '\uFEFF' + body('BOM') })
  assert.equal((await first).name, 'BOM'); assert.equal(f.windows(), 0)
})

test('a missing source uses an explicitly stale cache without altering its original timestamp', async t => {
  const f = nativeFixture(t, async () => ({ ok: false, status: 404, text: async () => '<html>Not found</html>' }))
  f.service.saveCachedSource('https://example.com/feed.json', 'Cached', JSON.parse(body('Cached')).downloads)
  const previous = f.service.getCachedSource('https://example.com/feed.json').lastSynced
  const result = await f.service.fetchAndCacheSource('https://example.com/feed.json')
  assert.equal(result.success, true); assert.equal(result.stale, true); assert.equal(result.lastSynced, previous)
  assert.match(result.error, /404/); assert.equal(f.calls(), 1); assert.equal(f.windows(), 0)
})

test('invalid source bodies fail immediately without launching a verification window or erasing valid cache', async t => {
  const f = nativeFixture(t, async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ name: 'Broken', downloads: [{ title: 'Bad', uris: ['javascript:alert(1)'] }] }) }))
  f.service.saveCachedSource('https://example.com/feed.json', 'Previous', JSON.parse(body('Previous')).downloads)
  const result = await f.service.fetchAndCacheSource('https://example.com/feed.json')
  assert.equal(result.stale, true); assert.equal(result.name, 'Previous'); assert.match(result.error, /no usable/)
  assert.equal(f.service.getCachedSource('https://example.com/feed.json').name, 'Previous'); assert.equal(f.windows(), 0)
})

test('oversized source payloads cancel the response without retrying or buffering it', async t => {
  let cancelled = 0
  const f = nativeFixture(t, async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': 81 * 1024 * 1024 }), body: { cancel: () => { cancelled++ } }, text: () => assert.fail('Oversized body must not be read') }))
  const result = await f.service.fetchAndCacheSource('https://example.com/big.json')
  assert.equal(result.success, false); assert.match(result.error, /80 MiB/); assert.equal(cancelled, 1); assert.equal(f.calls(), 1)
})

test('a transient HTTP failure retries while permanent errors do not', async t => {
  let calls = 0
  const f = nativeFixture(t, async () => ++calls === 1 ? { ok: false, status: 503 } : response('Recovered'))
  const result = await f.service.fetchAndCacheSource('https://example.com/feed.json')
  assert.equal(result.success, true); assert.equal(result.name, 'Recovered'); assert.equal(f.calls(), 2); assert.equal(f.windows(), 0)
})

test('source request deadlines include a stalled body and release its reader', async t => {
  const timeout = global.setTimeout
  t.mock.method(global, 'setTimeout', (fn, ms) => timeout(fn, ms > 1000 ? 5 : ms))
  let released = 0
  const f = nativeFixture(t, async (_url, options) => ({ ok: true, status: 200, body: { getReader: () => ({
    read: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('Body aborted')), { once: true })),
    releaseLock() { released++ },
  }) } }))
  const result = await f.service.fetchAndCacheSource('https://example.com/stalled.json')
  assert.equal(result.success, false); assert.match(result.error, /timed out/); assert.equal(released, 1); assert.equal(f.calls(), 1)
})

test('clearing all source caches removes only owned cache files', t => {
  const f = nativeFixture(t, async () => response('Unused'))
  f.service.saveCachedSource('https://example.com/one', 'One', [])
  const marker = path.join(f.directory, 'sources_cache', 'keep.txt'); fs.writeFileSync(marker, 'keep')
  f.service.clearCachedSources()
  assert.equal(f.service.getAllCachedSources().length, 0); assert.equal(fs.readFileSync(marker, 'utf8'), 'keep')
})

test('simultaneous verification requests are queued; closing one does not destroy another', async t => {
  const { EventEmitter } = require('node:events'), windows = []
  class Window extends EventEmitter {
    constructor() {
      super(); this.destroyed = false; this.text = ''; this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = () => {}
      this.webContents.executeJavaScript = async () => this.text
      windows.push(this)
    }
    isDestroyed() { return this.destroyed }
    destroy() { this.destroyed = true; this.emit('closed') }
    loadURL(url) { this.url = url; queueMicrotask(() => this.webContents.emit('did-finish-load')); return Promise.resolve() }
  }
  t.after(() => { for (const window of windows) if (!window.destroyed) window.destroy() })
  const f = nativeFixture(t, async () => ({ ok: false, status: 403, text: async () => '<!doctype html><html><div>Just a moment</div><script src="/cdn-cgi/challenge-platform/cf-chl-test"></script></html>' }), Window)
  const first = f.service.fetchAndCacheSource('https://example.com/one.json')
  const second = f.service.fetchAndCacheSource('https://example.com/two.json')
  await flush(); assert.equal(windows.length, 1)
  windows[0].destroy(); await flush(); assert.equal(windows.length, 2)
  assert.equal(windows[1].destroyed, false)
  windows[1].text = body('Verified'); windows[1].webContents.emit('did-finish-load')
  assert.equal((await first).success, false); assert.equal((await second).name, 'Verified')
  assert.ok(windows.every(window => window.destroyed))
})

function storeFixture(t, fetchAndCacheSource) {
  const previous = global.window
  global.window = { electronAPI: { fetchAndCacheSource, clearSourceCache: async () => ({ success: true }) } }
  t.after(() => { if (previous === undefined) delete global.window; else global.window = previous })
  return load({ 'zustand/middleware': { persist: configure => configure }, '../assets/kaos.json': { name: 'Fixture', downloads: [] }, '../services/httpClient': { desktopFetch: () => assert.fail('Native failures must not trigger a second browser request') } })('src/store/sourceStore.ts').useSourceStore
}

test('bulk source import validates before mutation, limits concurrency and shares duplicate sync work', async t => {
  let active = 0, maximum = 0, calls = 0
  const releases = []
  const store = storeFixture(t, url => new Promise(resolve => { calls++; active++; maximum = Math.max(maximum, active); releases.push(() => { active--; resolve({ success: true, name: url, data: [], lastSynced: 100 }) }) }))
  await assert.rejects(store.getState().addSource('https://example.com/a\ninvalid'))
  assert.equal(store.getState().sources.length, 0)
  const imported = store.getState().addSource(Array.from({ length: 7 }, (_, i) => 'https://example.com/' + i).join('\n'))
  await flush(); assert.equal(calls, 3)
  const duplicate = store.getState().syncSource('https://example.com/0')
  while (releases.length) { releases.shift()(); await flush() }
  await Promise.all([imported, duplicate])
  assert.equal(calls, 7); assert.equal(maximum, 3); assert.ok(store.getState().sources.every(source => source.status === 'up_to_date'))
})

test('native errors and cached responses remain visible instead of becoming falsely up to date', async t => {
  let result = { success: false, error: 'Source returned HTTP 404' }
  const store = storeFixture(t, async () => result)
  await store.getState().addSource('https://example.com/feed.json')
  assert.equal(store.getState().sources[0].status, 'error')
  result = { success: true, stale: true, name: 'Old data', data: [{ title: 'Game', uris: [] }], lastSynced: 123, error: 'Source verification was closed' }
  await store.getState().syncAll()
  assert.equal(store.getState().sources[0].status, 'cached'); assert.equal(store.getState().sources[0].lastSynced, 123)
  result = { success: true, name: 'Fresh', data: [], lastSynced: 456 }
  await store.getState().syncAll()
  assert.equal(store.getState().sources[0].status, 'up_to_date'); assert.equal(store.getState().sources[0].lastError, undefined)
})

test('late results from a removed source cannot overwrite a re-added source', async t => {
  const releases = []
  const store = storeFixture(t, () => new Promise(resolve => releases.push(resolve)))
  const first = store.getState().addSource('https://example.com/feed.json'); await flush()
  store.getState().removeSource('https://example.com/feed.json')
  const second = store.getState().addSource('https://example.com/feed.json'); await flush()
  releases[1]({ success: true, name: 'New', data: [], lastSynced: 456 }); await second
  releases[0]({ success: true, name: 'Old', data: [], lastSynced: 123 }); await first
  assert.equal(store.getState().sources[0].name, 'New'); assert.equal(store.getState().sources[0].lastSynced, 456)
})

test('refreshing a local source reads its cache once and keeps its real synchronization time', async t => {
  const store = storeFixture(t, () => assert.fail('Local sources must not use the network'))
  let reads = 0
  window.electronAPI.getCachedSources = async () => { reads++; return [{ url: 'local://local.json', name: 'Local', data: [], lastSynced: 123 }] }
  store.setState({ sources: [{ url: 'local://local.json', name: 'Local', data: [], optionsCount: 0, status: 'pending' }] })
  await store.getState().syncAll()
  assert.equal(reads, 1); assert.equal(store.getState().sources[0].lastSynced, 123); assert.equal(store.getState().sources[0].status, 'up_to_date')
})
