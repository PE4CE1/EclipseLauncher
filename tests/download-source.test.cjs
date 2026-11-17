const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const loadTs = require('./download-loader.cjs')

function sourceFixture(t, fetchSource) {
  const directory = fs.mkdtempSync(path.join(__dirname, '.download-source-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  let fetches = 0
  const session = { setUserAgent() {}, fetch: async (...args) => { fetches++; return fetchSource(...args) } }
  const service = loadTs({ electron: { app: { getPath: () => directory }, session: { fromPartition: () => session } } })('electron/sourceFetcherService.ts')
  return { service, directory, fetches: () => fetches }
}

test('source fetch uses its persistent session, validates rows and atomically saves the cache', async t => {
  const { service, directory, fetches } = sourceFixture(t, async () => ({ ok: true, text: async () => JSON.stringify({
    name: 'Games', downloads: [null, { title: { invalid: true }, uris: [] }, { title: 'Valid Game', uris: ['https://example.com/game.zip'] }],
  }) }))
  const result = await service.fetchAndCacheSource('https://example.com/source.json')
  assert.equal(result.success, true)
  assert.equal(result.data.length, 1)
  assert.equal(result.data[0].title, 'Valid Game')
  assert.equal(fetches(), 1)
  assert.equal(service.getCachedSource('https://example.com/source.json').name, 'Games')
  assert.equal(service.getAllCachedSources().length, 1)
  service.saveCachedSource('https://example.com/source.json', 'Updated Games', result.data)
  assert.equal(service.getCachedSource('https://example.com/source.json').name, 'Updated Games')
  assert.deepEqual(fs.readdirSync(path.join(directory, 'sources_cache')).filter(file => file.endsWith('.tmp')), [])
})

test('source URLs cannot load local files or unsupported schemes', async t => {
  const { service, fetches } = sourceFixture(t, () => { throw new Error('Unexpected fetch') })
  for (const url of ['file:///C:/Users/secret', 'javascript:alert(1)', 'ftp://example.com/source.json']) {
    assert.equal((await service.fetchAndCacheSource(url)).success, false)
  }
  assert.equal(fetches(), 0)
})
