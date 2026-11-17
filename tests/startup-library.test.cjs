const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')

function fixture(t, behavior = () => 'load', overrides = {}) {
  const previousImage = global.Image
  const urls = []
  let active = 0, maximum = 0
  global.Image = class {
    naturalWidth = 600
    set src(url) {
      if (!url) { if (this.busy) { this.busy = false; active-- }; return }
      this.busy = true; active++; maximum = Math.max(maximum, active); urls.push(url)
      const outcome = behavior(url)
      if (outcome === 'hang') return
      setImmediate(() => {
        if (!this.busy) return
        this.busy = false; active--
        if (outcome === 'load') this.onload?.()
        else this.onerror?.()
      })
    }
  }
  t.after(() => { global.Image = previousImage })
  const mocks = {
    './steamArtwork': { getSteamArtwork: async () => null, isSteamArtworkUrl: () => false },
    './relatedArtwork': { getRelatedArtwork: async () => null },
    './assetHelper': { ROBLOX_POSTER: 'roblox.png', getPlaceholderCover: name => `data:image/svg+xml,${name}`, getPlaceholderHero: name => `data:image/svg+xml,wide-${name}` },
    './steamService': { extractAppIdFromPlaceholder: name => Number(/^appid_(\d+)$/.exec(name)?.[1]) || undefined, KNOWN_GAME_PREVIEWS: {} },
    ...overrides,
  }
  const createFixtureLoader = () => {
    const instance = loadTs(mocks)
    t.after(() => instance('src/services/libraryArtworkHistory.ts').flushArtworkHistory())
    return instance
  }
  const load = createFixtureLoader()
  return { art: load('src/services/libraryArtwork.ts'), startup: load('src/services/startupLibrary.ts'), reload: () => createFixtureLoader()('src/services/libraryArtwork.ts'), urls, active: () => active, maximum: () => maximum }
}

const game = id => ({ id: `steam_${id}`, appId: String(id), name: `Game ${id}`, platform: 'steam', installPath: '', launchUrl: '' })

test('storage artwork retries hashed assets and verified parent artwork without changing library posters', async t => {
  const parentHeader = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3883570/hash/header.jpg'
  const { art } = fixture(t, url => url === parentHeader || url.includes('/730/') ? 'load' : 'error', {
    './relatedArtwork': { getRelatedArtwork: async () => ({ appId: 3883570, artwork: { header: parentHeader } }) },
  })
  const demo = { ...game(4704030), name: 'Invokyr Demo' }
  const resolved = await art.resolveLibraryArtwork(demo, undefined, 'landscape')
  assert.equal(resolved.url, parentHeader)
  assert.equal(resolved.isWide, true)
  const portrait = await art.resolveLibraryArtwork(game(730))
  const landscape = await art.resolveLibraryArtwork(game(730), undefined, 'landscape')
  assert.match(portrait.url, /library_600x900/)
  assert.match(landscape.url, /header/)
  assert.notEqual(art.getLibraryArtworkKey(game(730)), art.getLibraryArtworkKey(game(730), 'landscape'))
})

test('library artwork prefers high resolution posters over the scanner header and shares the resolved URL', async t => {
  const { art, urls } = fixture(t)
  const entry = { ...game(730), iconUrl: 'https://cdn.test/header.jpg' }
  assert.equal(art.getLibrarySteamId({ ...game(730), appId: undefined }), 730)
  const first = art.resolveLibraryArtwork(entry)
  assert.equal(first, art.resolveLibraryArtwork(entry))
  const resolved = await first
  assert.match(resolved.url, /730\/library_600x900\.jpg$/)
  assert.equal(resolved.isWide, false)
  assert.equal(resolved.fallback, false)
  assert.deepEqual(art.getCachedLibraryArtwork(entry), resolved)
  await art.resolveLibraryArtwork(entry)
  assert.equal(urls.length, 1)
})

test('startup prepares every unique game beyond the previous 80-cover limit with at most twelve image requests', async t => {
  const { art, maximum } = fixture(t)
  const progress = []
  const games = Array.from({ length: 105 }, (_, index) => game(index + 1))
  const result = await art.warmLibraryArtwork([...games, games[0]], new AbortController().signal, update => progress.push(update))
  assert.deepEqual(result, { completed: 105, total: 105, loaded: 105, failed: 0 })
  assert.ok(maximum() <= 12)
  assert.equal(progress.at(-1).completed, 105)
  assert.ok(progress.every((update, index) => index === 0 || update.completed >= progress[index - 1].completed))
})

test('missing Steam posters fall back to existing headers, while unavailable art remains retryable', async t => {
  const { art, urls } = fixture(t, url => url.includes('library_600x900') || url.includes('/2/') ? 'error' : 'load')
  const first = await art.resolveLibraryArtwork(game(1))
  assert.match(first.url, /header\.jpg$/)
  assert.equal(first.isWide, true)
  const missing = await art.resolveLibraryArtwork(game(2))
  assert.equal(missing.fallback, true)
  const before = urls.length
  await art.resolveLibraryArtwork(game(2))
  assert.equal(urls.length, before)
  art.invalidateLibraryArtwork(game(2))
  await art.resolveLibraryArtwork(game(2))
  assert.ok(urls.length > before)
})

test('startup waits for enriched scan results before preparing the current library', async t => {
  const { startup, urls } = fixture(t)
  let release, scannedOptions
  let games = [game(1)]
  const preparation = startup.prepareStartupLibrary({
    signal: new AbortController().signal,
    scan: options => { scannedOptions = options; return new Promise(resolve => { release = resolve }) },
    getGames: () => games, onProgress() {},
  })
  assert.equal(scannedOptions.awaitEnrichment, true)
  assert.equal(urls.length, 0)
  games = [game(2), game(3)]
  release()
  const result = await preparation
  assert.equal(result.loaded, 2)
  assert.equal(urls.some(url => url.includes('/1/')), false)
})

test('poster downloads overlap slow name enrichment and the final pass prepares only additions', async t => {
  const { startup, urls } = fixture(t)
  let release
  let games = [game(1), game(2)]
  const progress = []
  const preparation = startup.prepareStartupLibrary({
    signal: new AbortController().signal,
    scan: options => { options.onInitialGames(); return new Promise(resolve => { release = resolve }) },
    getGames: () => games, onProgress: update => progress.push(update),
  })
  await new Promise(setImmediate)
  assert.equal(urls.length, 2, 'Posters must load while the scan is still enriching names')
  games = [...games, game(3)]
  release()
  const result = await preparation
  assert.equal(result.loaded, 3)
  assert.equal(urls.length, 3, 'The final pass must reuse covers prepared by the early pass')
  assert.equal(progress.at(-1).completed, 3)
})

test('successful fallback URLs survive a renderer restart and avoid repeating failed poster probes', async t => {
  const previousStorage = global.localStorage
  const stored = new Map()
  global.localStorage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) }
  t.after(() => { global.localStorage = previousStorage })
  const { art, reload, urls } = fixture(t, url => url.includes('library_600x900') ? 'error' : 'load')
  await art.warmLibraryArtwork([game(1)], new AbortController().signal, () => {})
  assert.equal(urls.length, 3)
  assert.equal(stored.size, 1)
  urls.length = 0
  await reload().warmLibraryArtwork([game(1)], new AbortController().signal, () => {})
  assert.equal(urls.length, 1)
  assert.match(urls[0], /header\.jpg$/)
})

test('a stale persisted URL recovers to the current poster and storage failures never block artwork', async t => {
  const previousStorage = global.localStorage
  const stored = new Map()
  let postersAvailable = false
  let writes = 0
  global.localStorage = { getItem: key => stored.get(key) || null, setItem: (key, value) => { writes++; if (writes > 1) throw new Error('Quota exceeded'); stored.set(key, value) } }
  t.after(() => { global.localStorage = previousStorage })
  const { art, reload, urls } = fixture(t, url => (url.includes('library_600x900') ? postersAvailable : !postersAvailable) ? 'load' : 'error')
  await art.warmLibraryArtwork([game(1)], new AbortController().signal, () => {})
  postersAvailable = true
  urls.length = 0
  const next = reload()
  const result = await next.warmLibraryArtwork([game(1)], new AbortController().signal, () => {})
  assert.equal(result.loaded, 1)
  assert.match(urls[0], /header\.jpg$/)
  assert.match(next.getCachedLibraryArtwork(game(1)).url, /library_600x900\.jpg$/)
})

test('favorites and recent games get first choice of the bounded download workers', async t => {
  const { art, urls } = fixture(t)
  const games = Array.from({ length: 20 }, (_, index) => game(index + 1))
  games[19].isFavorite = true
  games[18].lastPlayed = Date.now()
  await art.warmLibraryArtwork(games, new AbortController().signal, () => {})
  assert.match(urls[0], /\/20\//)
  assert.match(urls[1], /\/19\//)
})

test('a hung scan cannot trap startup and its enrichment signal is cancelled at the deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { startup } = fixture(t)
  let signal
  const preparation = startup.prepareStartupLibrary({
    scan: options => { signal = options.signal; return new Promise(() => {}) },
    getGames: () => [game(1)], onProgress() {}, signal: new AbortController().signal, timeoutMs: 1000,
  })
  t.mock.timers.tick(1000)
  assert.equal((await preparation).timedOut, true)
  assert.equal(signal.aborted, true)
})

test('startup cancellation releases hanging image loads without caching failed placeholders', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { startup, art, active } = fixture(t, () => 'hang')
  const preparation = startup.prepareStartupLibrary({
    getGames: () => [game(1), game(2)], onProgress() {}, signal: new AbortController().signal, timeoutMs: 1000,
  })
  assert.equal(active(), 2)
  t.mock.timers.tick(1000)
  assert.equal((await preparation).timedOut, true)
  assert.equal(active(), 0)
  assert.equal(art.getCachedLibraryArtwork(game(1)), undefined)
})

test('the intro has a 3.5 second minimum and an unmounted intro can cancel the wait', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(Date, 'now', () => 1000)
  const { startup } = fixture(t)
  let completed = false
  const controller = new AbortController()
  const waiting = startup.waitForStartupMinimum(1000, controller.signal).then(() => { completed = true })
  t.mock.timers.tick(3499)
  await Promise.resolve()
  assert.equal(completed, false)
  t.mock.timers.tick(1)
  await waiting
  assert.equal(completed, true)
  const abort = new AbortController()
  const cancelled = startup.waitForStartupMinimum(1000, abort.signal)
  abort.abort()
  await cancelled
})

test('large library preloading streams encoded files without allocating or decoding Image bitmaps', async t => {
  const previousWindow = global.window
  const { art } = fixture(t)
  let requests = 0
  global.window = { electronAPI: { prefetchArtwork: async ({ id, url }) => {
    requests++
    assert.match(id,/^artwork-/)
    assert.match(url,/^https:\/\/shared\.fastly\.steamstatic\.com\//)
    return true
  } }, fetch: () => assert.fail('Steam probes must not use renderer fetch/CORS') }
  const originalImage = global.Image
  global.Image = class { constructor() { assert.fail('Encoded prefetch must not create Image objects') } }
  t.after(() => { global.window = previousWindow; global.Image = originalImage })
  const games = Array.from({ length: 590 }, (_, index) => game(index + 1))
  const result = await art.warmLibraryArtwork(games, new AbortController().signal, () => {})
  assert.equal(result.loaded, 590)
  assert.equal(requests, 590)
  assert.equal(art.getCachedLibraryArtwork(games[0]).crossOrigin, undefined)
})

test('a bad content type or broken image host cannot reject the startup queue', async t => {
  const previousWindow = global.window
  const { art } = fixture(t, () => { throw new Error('Invalid host') })
  global.window = { electronAPI: { prefetchArtwork: async () => false }, fetch: () => assert.fail('No CORS probes') }
  t.after(() => { global.window = previousWindow })
  const result = await art.resolveLibraryArtwork(game(1))
  assert.equal(result.fallback, true)
})


test('missing demo posters resolve to verified parent portraits before wide headers', async t => {
  const poster='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/3883570/hash/library_capsule.jpg'
  const {art}=fixture(t,url=>url===poster?'load':'error',{'./relatedArtwork':{getRelatedArtwork:async()=>({appId:3883570,artwork:{poster}})}})
  const result=await art.resolveLibraryArtwork({...game(4704030),name:'Invokyr Demo'})
  assert.equal(result.url,poster)
  assert.equal(result.fallback,false)
  assert.equal(result.isWide,false)
})

test('hash-addressed landscape assets remain available when no poster was published', async t => {
  const header='https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1/hash/header.jpg'
  const {art}=fixture(t,url=>url===header?'load':'error',{'./steamArtwork':{getSteamArtwork:async()=>({header}),isSteamArtworkUrl:()=>true}})
  const result=await art.resolveLibraryArtwork(game(1))
  assert.equal(result.url,header)
  assert.equal(result.isWide,true)
})

test('a decoded image failure skips that URL and continues through the remaining candidates', async t => {
  const {art,urls}=fixture(t)
  const entry=game(730)
  const first=await art.resolveLibraryArtwork(entry)
  art.invalidateLibraryArtwork(entry,first.url)
  urls.length=0
  const next=await art.resolveLibraryArtwork(entry)
  assert.notEqual(first.url,next.url)
  assert.equal(urls.includes(first.url),false)
  assert.equal(next.fallback,false)
})


test('visible artwork retries when the startup request it joined is cancelled', async t => {
  let first=true
  const {art}=fixture(t,()=>{if(first){first=false;return 'hang'}return 'load'})
  const controller=new AbortController(),entry=game(730)
  const startup=art.resolveLibraryArtwork(entry,controller.signal)
  const visible=art.resolveLibraryArtwork(entry)
  controller.abort()
  assert.equal(await startup,null)
  const recovered=await visible
  assert.equal(recovered.fallback,false)
  assert.match(recovered.url,/library_600x900.jpg$/)
})
