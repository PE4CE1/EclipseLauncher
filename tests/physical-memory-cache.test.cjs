const test = require('node:test'), assert = require('node:assert/strict'), load = require('./download-loader.cjs')
const snapshot = () => ({ db: [{ id: 1, name: 'Portal' }], devs: ['Valve'], pubs: ['Valve'] })
test('memory pressure preserves a visible catalogue and releases its data after the final reader leaves', async () => {
  const cache = load()('src/services/gameDatabaseCache.ts')
  let fetches = 0
  const fetchData = async () => { fetches++; return snapshot() }
  const releaseFirst = cache.retainGameDatabase(), releaseSecond = cache.retainGameDatabase()
  await cache.loadGameDatabase(fetchData)
  assert.equal(cache.releaseInactiveGameDatabase(), false)
  releaseFirst(); assert.equal(cache.peekGameDatabase().db[0].name, 'Portal')
  releaseSecond(); releaseSecond(); assert.equal(cache.peekGameDatabase(), null)
  const releaseNext = cache.retainGameDatabase()
  await cache.loadGameDatabase(fetchData)
  assert.equal(fetches, 2, 'Neither a cache nor a resolved promise may retain the old database')
  releaseNext(); assert.equal(cache.peekGameDatabase(), null)
})
test('leaving during a pending catalogue load does not pin its result after completion', async () => {
  const cache = load()('src/services/gameDatabaseCache.ts')
  let finish, calls = 0
  const release = cache.retainGameDatabase()
  const first = cache.loadGameDatabase(() => { calls++; return new Promise(resolve => { finish = resolve }) })
  const second = cache.loadGameDatabase(() => assert.fail('Concurrent readers must share their request'))
  await new Promise(setImmediate)
  release(); cache.releaseInactiveGameDatabase(); finish(snapshot())
  await Promise.all([first, second]); assert.equal(calls, 1); assert.equal(cache.peekGameDatabase(), null)
  const releaseNew = cache.retainGameDatabase()
  await cache.loadGameDatabase(async () => snapshot())
  assert.equal(cache.peekGameDatabase().db.length, 1); releaseNew()
})
test('failed catalogue loads can be retried without retaining a rejected promise', async () => {
  const cache = load()('src/services/gameDatabaseCache.ts'), release = cache.retainGameDatabase()
  await assert.rejects(cache.loadGameDatabase(async () => { throw Error('offline') }), /offline/)
  await cache.loadGameDatabase(async () => snapshot())
  assert.equal(cache.peekGameDatabase().db.length, 1); release()
})
test('download-result caches are bounded, rebuild after release and preserve source data', () => {
  const data = { title: 'Portal 2', uris: ['https://example.invalid/file.zip'], fileSize: '1 GB', uploadDate: '' }
  const state = { sources: [{ name: 'Test', url: 'https://example.invalid/source', data: [data] }] }
  const engine = load({ '../store/sourceStore': { useSourceStore: { getState: () => state } } })('src/services/downloadEngine.ts')
  const initial = engine.getDownloadsForGame('Portal')
  assert.equal(engine.getDownloadsForGame('Portal'), initial)
  for (let i = 0; i < 100; i++) engine.getDownloadsForGame('Missing game ' + i)
  assert.notEqual(engine.getDownloadsForGame('Portal'), initial, 'Old search results must be evicted')
  engine.releaseDownloadLookupCache()
  assert.deepEqual(engine.getDownloadsForGame('Portal'), initial)
  assert.equal(state.sources[0].data[0], data)
  assert.equal(engine.hasGameInSource('Portal', 'Test'), true)
})
test('resource registration replaces old development copies without retaining their cache closures', () => {
  const registry = load()('src/services/memoryResources.ts'), calls = []
  const old = registry.registerMemoryResource('cache', () => calls.push('old'))
  registry.registerMemoryResource('cache', context => calls.push(context.catalogueActive))
  old(); registry.releaseMemoryResources({ catalogueActive: true })
  assert.deepEqual(calls, [true])
})
