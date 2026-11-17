const { app, session } = require('electron')
const fs = require('node:fs'), path = require('node:path')
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP); app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.whenReady().then(async () => {
  const bundle = process.env.ECLIPSE_SOURCE_URL ? '' : fs.readFileSync(path.join(__dirname, '../.cache/eclipse-download-sources-current.js'), 'utf8')
  let urls = process.env.ECLIPSE_SOURCE_URL ? [process.env.ECLIPSE_SOURCE_URL] : [...new Set([...bundle.matchAll(/url:"(https?:[^"\s]+)"/g)].map(match => match[1]))]
  if (process.env.ECLIPSE_SOURCE_REPAIRS) {
    const { getSourceRepair } = require('./download-loader.cjs')()('src/services/sourceRepairs.ts')
    urls = [...new Set(urls.map(url => getSourceRepair(url)?.url).filter(Boolean))]
    if (urls.length !== 7) throw new Error('Expected seven verified website source repairs')
    urls.push(...urls.map(url => getSourceRepair(url)?.url).filter(Boolean))
  }
  if (!urls.length) throw new Error('No source URLs found')
  const ses = session.fromPartition('source-audit'), results = []
  let cursor = 0
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++], started = Date.now()
      let result = { url }
      try { const response = await ses.fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) }); result = { ...result, http: response.status, type: response.headers.get('content-type') } }
      catch (error) { result.error = error.message }
      result.ms = Date.now() - started; results.push(result); console.log(JSON.stringify(result))
    }
  }))
  fs.writeFileSync(path.join(__dirname, '../.cache/source-native-audit.json'), JSON.stringify(results, null, 2))
  const service = require('./download-loader.cjs')({ electron: { app, session, BrowserWindow: class { constructor() { throw new Error('Interactive verification is disabled during the metadata audit') } } } })('electron/sourceFetcherService.ts')
  const validation = []
  for (const url of (process.env.ECLIPSE_SOURCE_REPAIRS ? urls : [urls[0], urls.find(url => url.includes('/irisihrz/'))]).filter(Boolean)) {
    const started = Date.now(), result = await service.fetchAndCacheSource(url)
    const entry = { url, success: result.success, rows: result.data?.length, stale: !!result.stale, cacheReadable: !!service.getCachedSource(url), ms: Date.now() - started, error: result.error }
    validation.push(entry); console.log(JSON.stringify(entry))
    if (!result.success || result.stale || !entry.rows || !entry.cacheReadable) throw new Error('Native source validation failed')
  }
  fs.writeFileSync(path.join(__dirname, '../.cache/source-native-validation.json'), JSON.stringify(validation, null, 2))
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
