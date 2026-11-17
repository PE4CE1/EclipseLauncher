// Isolated cache-retention audit. GC is used only by this measurement, not by
// the application's automatic relief policy. This is not a whole-app RAM claim.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const cache = require('./download-loader.cjs')()('src/services/gameDatabaseCache.ts')
if (!global.gc) throw Error('Run with node --expose-gc tests/catalogue-memory-audit.cjs')
const heap = async () => { await new Promise(setImmediate); global.gc(); await new Promise(setImmediate); global.gc(); return process.memoryUsage().heapUsed }
;(async () => {
  const baseline = await heap()
  let count = 0
  await (async () => {
    const release = cache.retainGameDatabase()
    await cache.loadGameDatabase(async () => {
      const db = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/games_db.json'), 'utf8'))
      count = db.length
      return { db, devs: [], pubs: [] }
    })
    release()
  })()
  const retained = await heap()
  cache.releaseInactiveGameDatabase()
  const released = await heap()
  const mb = value => Math.round(value / 1024 ** 2 * 10) / 10
  const report = { scope: 'Only retained catalogue-data heap in an isolated Node process; benchmark GC; no forced working-set trimming', entries: count, baselineMB: mb(baseline), retainedMB: mb(retained), releasedMB: mb(released), freedMB: mb(retained - released) }
  assert.ok(retained - released > 10 * 1024 ** 2, 'The actual catalogue data should be reclaimable after closing it')
  fs.mkdirSync(path.resolve(__dirname, '../.cache'), { recursive: true })
  fs.writeFileSync(path.resolve(__dirname, '../.cache/catalogue-memory-audit.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
