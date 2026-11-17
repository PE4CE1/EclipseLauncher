const { app, session, BrowserWindow, net } = require('electron')
const path = require('node:path'), fs = require('node:fs')
const loadTs = require('./download-loader.cjs')
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  const entry = JSON.parse(fs.readFileSync(path.join(__dirname, '../.cache/cyberpunk-source-entry.json'), 'utf8'))[0]
  if (!entry?.uris?.length) throw new Error('Public source metadata is missing')
  let visibleWindows = 0, cursor = 0
  app.on('browser-window-created', (_event, window) => window.on('show', () => visibleWindows++))
  const loader = loadTs({ electron: { app, session, BrowserWindow, net } })
  const { prepareDownloadMirror } = loader('electron/downloadMirrors.ts')
  const { downloadIssue } = loader('electron/downloadErrors.ts')
  const { describeDownloadHost } = loader('src/services/downloadPresentation.ts')
  const uris = [...entry.uris].sort((a,b) => describeDownloadHost(a).priority - describeDownloadHost(b).priority)
  const results = [], signal = AbortSignal.timeout(45_000)
  await Promise.all(Array.from({ length: 2 }, async () => {
    while (cursor < uris.length && !signal.aborted) {
      const url = uris[cursor++], host = new URL(url).hostname, started = Date.now()
      try {
        const result = await prepareDownloadMirror(url, 'Cyberpunk 2077', signal)
        results.push({ host, verifiedFile: true, fileHost: new URL(result.streamUrl).hostname, milliseconds: Date.now() - started })
      } catch (error) {
        const issue = downloadIssue(error, url)
        results.push({ host, verifiedFile: false, reason: issue.code, httpStatus: issue.httpStatus, milliseconds: Date.now() - started })
      }
    }
  }))
  const report = { metadataOnly: true, title: entry.title, visibleWindows, results }
  fs.writeFileSync(path.join(__dirname, '../.cache/download-cyberpunk-validation.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report)); app.exit(0)
}).catch(error => { console.error(error.message); app.exit(1) })
