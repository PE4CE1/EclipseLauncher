const { app, session, BrowserWindow, net } = require('electron')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const loadTs = require('./download-loader.cjs')

app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.on('window-all-closed', () => {})
const deadline = setTimeout(() => { console.error('Download smoke test timed out'); app.exit(1) }, 40_000)

app.whenReady().then(async () => {
  const body = Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(512 * 1024, 73)])
  const requests = [], windows = [], events = []
  let requireArchiveCookie = true, transferCookieVerified = false
  const ranges = []
  const retryRanges = []
  let flakyTarget
  let visibleWindows = 0
  app.on('browser-window-created', (_event, window) => {
    windows.push(window)
    window.on('show', () => { visibleWindows++ })
  })
  const server = http.createServer(async (req, res) => {
    requests.push(req.method + ' ' + req.url)
    if (req.url === '/expired') { res.writeHead(404); return res.end() }
    if (req.url === '/modern') { res.writeHead(302, { Location: '/modern/ready' }); return res.end() }
    if (req.url === '/modern/ready' || req.url === '/modern/complete') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'download_session=fixture; Path=/; HttpOnly' })
        return res.end(`<download-countdown :code='"fixture"' :rand='"server_nonce"' :name='"Example.7z"' :free-method='"Free Download"' :has-captcha="false" :has-password="false" :size-gated="false"></download-countdown>`)
      }
      let content = ''
      for await (const chunk of req) content += chunk
      const fields = new URLSearchParams(content)
      assert.equal(fields.get('rand'), 'server_nonce')
      assert.equal(req.headers['x-dn-dl'], '1')
      assert.match(req.headers.cookie, /download_session=fixture/)
      if (req.url === '/modern/ready') { res.writeHead(307, { Location: '/modern/complete' }); return res.end() }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ url: encodeURIComponent(base + '/archive.7z') }))
    }
    if (req.url === '/js') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end(`<button onclick="location.href='/archive.7z'">Start Download</button>`)
    }
    if (req.url === '/js.zip') { res.writeHead(302, { Location: '/js' }); return res.end() }
    if (req.url === '/gofile-like') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end('<a download="Example.7z" href="/archive.7z">Download</a><a download="Example.7z" href="/archive.7z">Download again</a>')
    }
    if (req.url === '/multipart') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      return res.end('<a download href="/file.part1.rar">Part 1</a><a download href="/file.part2.rar">Part 2</a>')
    }
    if (req.url === '/htmx') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'htmx_session=public; Path=/; HttpOnly' })
      return res.end('<button id="download" hx-get="/public-free-action">Download</button>')
    }
    if (req.url === '/public-free-action') {
      assert.equal(req.headers['hx-request'], 'true')
      assert.equal(req.headers['hx-current-url'], base + '/htmx')
      assert.match(req.headers.cookie, /htmx_session=public/)
      res.writeHead(204, { 'HX-Redirect': '/archive.7z' }); return res.end()
    }
    if (req.url === '/resumable.7z' || req.url === '/native-flaky.7z') {
      const offset = Number(/^bytes=(\d+)-$/.exec(req.headers.range || '')?.[1]) || 0
      const seen = req.url === '/native-flaky.7z' ? retryRanges : ranges
      seen.push(offset)
      res.writeHead(offset ? 206 : 200, { 'Content-Type': 'application/x-7z-compressed', 'Content-Length': body.length - offset, ...(offset ? { 'Content-Range': `bytes ${offset}-${body.length - 1}/${body.length}` } : {}) })
      if (req.url === '/native-flaky.7z' && seen.length === 1) {
        res.write(body.subarray(0, 32768))
        // Disconnect after bytes are actually on disk. A fixed 70 ms delay
        // can fire before the first write on a busy Windows test machine.
        const deadline = Date.now() + 2000
        const disconnect = setInterval(() => {
          const size = flakyTarget && fs.existsSync(flakyTarget) ? fs.statSync(flakyTarget).size : 0
          if (size >= 32768 || Date.now() > deadline) { clearInterval(disconnect); res.destroy() }
        }, 20)
        res.once('close', () => clearInterval(disconnect))
        return
      }
      let position = offset
      const timer = setInterval(() => {
        const end = Math.min(body.length, position + 8192)
        res.write(body.subarray(position, end)); position = end
        if (position === body.length) { clearInterval(timer); res.end() }
      }, 8)
      res.once('close', () => clearInterval(timer))
      return
    }
    if (req.url === '/archive.7z') {
      if (requireArchiveCookie) {
        assert.match(req.headers.cookie, /download_session=fixture/, 'Resolver cookie must survive preflight and transfer')
        if (req.method === 'GET') { assert.match(req.headers.cookie, /transfer_cookie=preflight/, 'Preflight cookie must survive the actual transfer'); transferCookieVerified = true }
      }
      res.writeHead(200, { 'Content-Type': 'application/x-7z-compressed', 'Content-Disposition': 'attachment; filename="Example.7z"', 'Content-Length': body.length, ...(req.method === 'HEAD' ? { 'Set-Cookie': 'transfer_cookie=preflight; Path=/; HttpOnly' } : {}) })
      return res.end(body)
    }
    res.writeHead(404); res.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  const requestHelper = loadTs({ electron: { app, session, BrowserWindow, net } })('electron/hosterRequest.ts')
  const auditHops = []
  const resolver = loadTs({ electron: { app, session, BrowserWindow, net }, './hosterRequest': {
    requestHosterPage: async (...args) => {
      try {
        const response = await requestHelper.requestHosterPage(...args)
        if (process.env.ECLIPSE_HOSTER_AUDIT === '1' && new URL(args[1]).hostname.endsWith('datanodes.to')) {
          const hop = { method: args[2].method, op: args[2].body?.get('op'), status: response.status, type: response.headers.get('content-type') }
          if (/html|json/i.test(hop.type || '')) {
            const text = await response.clone().text()
            if (text.trimStart().startsWith('{')) {
              try { const value = JSON.parse(text); hop.keys = Object.keys(value); hop.error = typeof value.error === 'string' ? value.error.slice(0, 120) : undefined } catch {}
            } else {
              const page = resolver.parseHosterPage(text, args[1]); hop.page = page.kind
              if (page.kind === 'form') hop.formOp = page.fields.get('op')
              if (page.kind === 'blocked') hop.gates = [...text.matchAll(/:?(has-captcha|has-password|size-gated|has-countdown|countdown)\s*=\s*["']([^"']*)["']/gi)].map(match => [match[1], match[2].slice(0, 20)])
            }
          }
          auditHops.push(hop)
        }
        return response
      }
      catch (error) { console.error('Hoster request failed:', error.message); throw error }
    },
  } })('electron/automaticHosterResolver.ts')
  const handlers = new Map()
  const service = loadTs({
    electron: { app, session, BrowserWindow, net },
    './linkResolverService': {
      resolveDownloadLink: async (url, _name, options) => {
        const result = await resolver.resolveAutomaticHoster(url.replace('127.0.0.2', '127.0.0.1'), options)
        if (!result) throw new Error('Mirror unavailable')
        return { type: 'http', ...result }
      },
    },
    './extractService': { extractArchive: async () => { throw new Error('No game extraction in the fixture') } },
  })('electron/httpDownloadService.ts')
  service.initHttpDownloadIPC({ handle: (name, fn) => handlers.set(name, fn) }, { isDestroyed: () => false, webContents: { send: (_channel, payload) => events.push(payload) } })
  const directory = path.join(process.env.ECLIPSE_SMOKE_TEMP, 'downloads')
  const result = await handlers.get('http-download:start')({}, base + '/expired', 'Synthetic fixture', directory, false, false, [base.replace('127.0.0.1', '127.0.0.2') + '/modern'])
  while (!events.some(event => ['done', 'error'].includes(event.status))) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(events.at(-1).status, 'done', events.at(-1).errorMessage)
  assert.equal(events.at(-1).infoHash, result.infoHash)
  assert.deepEqual(events.filter(event => event.resolution).map(event => event.resolution.attempt), [1, 2])
  const files = fs.readdirSync(directory)
  assert.equal(files.length, 1)
  assert.match(files[0], /\.7z$/)
  assert.deepEqual(fs.readFileSync(path.join(directory, files[0])), body)
  assert.equal(transferCookieVerified, true)
  requireArchiveCookie = false
  assert.equal(windows.length, 0, 'Regular HTTP forms should not create a browser')
  assert.equal((await resolver.resolveAutomaticHoster(base + '/htmx'))?.streamUrl, base + '/archive.7z')
  const progress = []
  const resumed = new service.HttpDownloader('resume-fixture', base + '/resumable.7z', 'Resume fixture', directory, false, false)
  resumed.start(event => progress.push(event))
  while (resumed.downloaded === 0 && resumed.status === 'downloading') await new Promise(resolve => setTimeout(resolve, 10))
  assert.ok(resumed.downloaded > 0 && resumed.downloaded < body.length)
  resumed.pause()
  assert.equal(resumed.status, 'paused')
  await new Promise(resolve => setTimeout(resolve, 30))
  const partialBytes = fs.statSync(resumed.targetPath).size
  resumed.resume()
  while (!progress.some(event => ['done', 'error'].includes(event.status))) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(progress.at(-1).status, 'done', progress.at(-1).errorMessage)
  assert.ok(partialBytes > 0 && ranges.includes(partialBytes), 'Resume starts at the bytes actually flushed to disk')
  assert.deepEqual(fs.readFileSync(resumed.targetPath), body)
  const retried = new service.HttpDownloader('retry-fixture', base + '/native-flaky.7z', 'Native retry fixture', directory, false, false)
  flakyTarget = retried.targetPath
  retried.start(() => {})
  while (!['done', 'error'].includes(retried.status)) await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(retried.status, 'done', retried.errorMessage)
  assert.deepEqual(retryRanges, [0, 32768])
  assert.deepEqual(fs.readFileSync(retried.targetPath), body)
  const jsResult = await resolver.resolveBackgroundStream(base + '/js.zip', { timeoutMs: 5000 })
  assert.equal(jsResult?.streamUrl, base + '/archive.7z')
  assert.equal(windows.length, 1)
  assert.equal(visibleWindows, 0)
  assert.equal(windows[0].isDestroyed(), true)
  assert.equal((await resolver.resolveBackgroundStream(base + '/gofile-like', { timeoutMs: 5000 }))?.streamUrl, base + '/archive.7z')
  let issue
  assert.equal(await resolver.resolveBackgroundStream(base + '/multipart', { timeoutMs: 5000, onFailure: code => { issue = code } }), null)
  assert.equal(issue, 'multipart')
  assert.equal(requests.some(request => /file\.part[12]/.test(request)), false)
  assert.equal(visibleWindows, 0)
  const report = { bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex'), mirrorAttempts: 2, formCookiesVerified: true, transferCookieVerified, htmxFlow: true, nativePauseResume: true, nativeInterruptedResume: true, hiddenJavaScriptFallback: true, gofileLikeLinks: true, multipartGuard: true, visibleWindows, requests }
  const reportPath = path.join(__dirname, '../.cache/download-automatic-smoke.json')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
  if (process.env.ECLIPSE_HOSTER_AUDIT === '1') {
    const auditSession = session.fromPartition('hoster-metadata-audit')
    const urls = ['https://datanodes.to/jqejx3e15fd5', 'https://vikingfile.com/f/aYDEJnTQm6', 'https://filekeeper.net/nf0kf1h2nnru/Potato_Please_-_SteamGG.NET.zip', 'https://akirabox.to/Z9dzBBOVOzk1/file']
    const audit = await Promise.all(urls.map(async url => {
      const entry = { host: new URL(url).hostname }
      try {
        const response = await auditSession.fetch(url, { signal: AbortSignal.timeout(10_000) })
        entry.status = response.status
        entry.type = response.headers.get('content-type')
        if (!/html|json/i.test(entry.type || '')) { await response.body?.cancel(); return entry }
        const reader = response.body.getReader(), chunks = []
        let bytes = 0
        for (;;) {
          const part = await reader.read()
          if (part.done) break
          bytes += part.value.byteLength
          if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Page exceeds metadata limit') }
          chunks.push(Buffer.from(part.value))
        }
        const page = resolver.parseHosterPage(Buffer.concat(chunks).toString('utf8'), url)
        entry.page = page.kind
        if (page.kind === 'form') entry.wait = page.wait
        if (entry.host === 'datanodes.to' && page.kind === 'form' || entry.host === 'filekeeper.net') {
          const resolved = await resolver.resolveAutomaticHoster(url, { timeoutMs: 20_000 })
          entry.resolved = !!resolved
          if (resolved) {
            entry.downloadHost = new URL(resolved.streamUrl).hostname
            entry.sameAsPage = resolved.streamUrl === url
            const mirrors = loadTs({ './linkResolverService': { resolveDownloadLink: async () => resolved } })('electron/downloadMirrors.ts')
            try { await mirrors.prepareDownloadMirror(url, 'Metadata audit', AbortSignal.timeout(10_000)); entry.verified = true }
            catch (error) { entry.verified = false; entry.verificationError = error.message }
          }
        }
      } catch (error) { entry.error = error.message }
      return entry
    }))
    const auditReport = { metadataOnly: true, audit, formSteps: auditHops }
    fs.writeFileSync(path.join(__dirname, '../.cache/download-hoster-audit.json'), JSON.stringify(auditReport, null, 2))
    console.log(JSON.stringify(auditReport))
  }
  service.stopHttpDownloads()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  clearTimeout(deadline)
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
