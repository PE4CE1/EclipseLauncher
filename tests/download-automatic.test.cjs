const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const loadTs = require('./download-loader.cjs')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function resolverFixture(fetch) {
  let windows = 0
  const resolver = loadTs({ './hosterRequest': { requestHosterPage: (ses, url, init) => ses.fetch(url, init) }, electron: {
    session: { fromPartition: () => ({ setUserAgent() {}, fetch, cookies: { get: async () => [{ name: 'session', value: 'test' }] } }) },
    BrowserWindow: class { constructor() { windows++; throw new Error('No window allowed in the HTTP resolver') } },
  } })('electron/automaticHosterResolver.ts')
  return { ...resolver, windows: () => windows }
}

const component = (extra = '') => `<download-countdown :code='"file123"' :rand='"nonce"' :name='"Example.7z"' :free-method='"Free Download"' :has-captcha="false" :has-password="false" :size-gated="false" ${extra}></download-countdown>`

test('modern hoster free forms preserve nonces, file names and the actual server countdown', () => {
  const { parseHosterPage } = resolverFixture()
  const page = parseHosterPage(component(':has-countdown="true" :countdown="7" :dl-token=\'"token"\''), 'https://datanodes.to/file123')
  assert.equal(page.kind, 'form')
  assert.equal(page.wait, 7)
  assert.equal(page.fileName, 'Example.7z')
  assert.equal(page.fields.get('op'), 'download2')
  assert.equal(page.fields.get('rand'), 'nonce')
  assert.equal(page.fields.get('dl_token'), 'token')
  assert.equal(page.fields.get('method_free'), 'Free Download')
})

test('captcha, password, premium gates and excessive waits are skipped without bypassing them', () => {
  const { parseHosterPage } = resolverFixture()
  for (const attr of [':has-captcha="true"', ':has-password="true"', ':size-gated="true"', ':has-countdown="true" :countdown="90"']) {
    assert.equal(parseHosterPage(component(attr), 'https://datanodes.to/file123').kind, 'blocked')
  }
})

test('hoster parser ignores decoy comments/scripts, login forms and cross-origin submission forms', () => {
  const { parseHosterPage } = resolverFixture()
  const form = '<form><input name="op" type="hidden" value="download1"><input type="hidden" name="id" value="real"></form>'
  const page = parseHosterPage(`<!--${component()}--><script>${component()}</script><form><input type="password"></form>${form}`, 'https://example.com/file')
  assert.equal(page.kind, 'form')
  assert.equal(page.fields.get('id'), 'real')
  assert.equal(parseHosterPage(form.replace('<form>', '<form action="https://ads.example.com/">'), 'https://example.com/file').kind, 'unknown')
})

test('binary interception accepts archive attachments and rejects HTML, images and ad installers', () => {
  const { isArchiveResponse } = resolverFixture()
  assert.equal(isArchiveResponse('https://cdn.example.com/file', 'application/octet-stream', 'attachment; filename="game.7z"; size=2048'), true)
  assert.equal(isArchiveResponse('https://cdn.example.com/game.zip', 'text/html'), false)
  assert.equal(isArchiveResponse('https://cdn.example.com/file', 'image/png'), false)
  assert.equal(isArchiveResponse('https://cdn.example.com/installer.exe', 'application/zip'), false)
})

test('modern free-download HTTP flow resolves encoded JSON links without opening a browser', async () => {
  const requests = []
  const fixture = resolverFixture(async (url, init) => {
    requests.push({ url, ...init })
    if (init.method === 'GET') return new Response(component(), { headers: { 'Content-Type': 'text/html' } })
    assert.equal(init.body.get('rand'), 'nonce')
    assert.equal(init.headers['X-Dn-Dl'], '1')
    return Response.json({ url: encodeURIComponent('https://cdn.example.com/file.7z?token=xyz') })
  })
  const result = await fixture.resolveAutomaticHoster('https://datanodes.to/file123')
  assert.equal(requests.length, 2)
  assert.equal(result.streamUrl, 'https://cdn.example.com/file.7z?token=xyz')
  assert.equal(result.fileName, 'Example.7z')
  assert.equal(result.headers.Cookie, 'session=test')
  assert.equal(fixture.windows(), 0)
})

test('expired links, network failures, gates and cancelled waits never open browser windows', async () => {
  for (const fetch of [async () => new Response('', { status: 404 }), async () => { throw new Error('Network unavailable') }, async () => new Response(component(':has-captcha="true"'))]) {
    const fixture = resolverFixture(fetch)
    assert.equal(await fixture.resolveAutomaticHoster('https://datanodes.to/file123'), null)
    assert.equal(fixture.windows(), 0)
  }
  let requests = 0
  const fixture = resolverFixture(async () => { requests++; return new Response(component(':has-countdown="true" :countdown="30"')) })
  const controller = new AbortController()
  const promise = fixture.resolveAutomaticHoster('https://datanodes.to/file123', { signal: controller.signal })
  await delay(10); controller.abort()
  assert.equal(await promise, null)
  assert.equal(requests, 1)
  assert.equal(fixture.windows(), 0)
})

test('hoster HTML responses have a fixed memory limit', async () => {
  const fixture = resolverFixture(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)))
  assert.equal(await fixture.resolveAutomaticHoster('https://datanodes.to/file123'), null)
  assert.equal(fixture.windows(), 0)
})

test('public HTMX downloads use only the published path and follow HX-Redirect with the same session', async () => {
  const requests = []
  const fixture = resolverFixture(async (url, options) => {
    requests.push({ url, ...options })
    if (requests.length === 1) return new Response('<button id="download" hx-get="/f/example/free?token=abc">Download</button>', { headers: { 'Content-Type': 'text/html' } })
    if (requests.length === 2) {
      assert.equal(url, 'https://buzzheavier.com/f/example/free?token=abc')
      assert.equal(options.headers['HX-Request'], 'true')
      assert.equal(options.headers['HX-Current-URL'], 'https://buzzheavier.com/f/example')
      return new Response(null, { status: 204, headers: { 'HX-Redirect': 'https://cdn.example.com/archive.zip' } })
    }
    assert.equal(options.headers['HX-Request'], undefined)
    return new Response(null, { headers: { 'Content-Type': 'application/zip' } })
  })
  const result = await fixture.resolveAutomaticHoster('https://buzzheavier.com/f/example', { partition: 'same-session' })
  assert.equal(result.streamUrl, 'https://cdn.example.com/archive.zip')
  assert.equal(result.partition, 'same-session')
  assert.equal(fixture.windows(), 0)
  const { parseHosterPage } = fixture
  assert.equal(parseHosterPage('<button hx-get="https://ads.example.com/">Download</button>', 'https://buzzheavier.com/f/example').kind, 'unknown')
  assert.equal(parseHosterPage('<button hx-get="/delete">Delete file</button>', 'https://buzzheavier.com/f/example').kind, 'unknown')
})

test('a denied HTTP request is not presented as proof of a CAPTCHA', async () => {
  for (const [headers, expected] of [[{}, 'forbidden'], [{ 'cf-mitigated': 'challenge' }, 'verification']]) {
    let issue
    const fixture = resolverFixture(async () => new Response(null, { status: 403, headers }))
    assert.equal(await fixture.resolveAutomaticHoster('https://buzzheavier.com/f/example', { onFailure: code => { issue = code } }), null)
    assert.equal(issue, expected)
    assert.equal(fixture.windows(), 0)
  }
})

async function downloadFixture(t, handler, resolver = async streamUrl => ({ streamUrl })) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-mirror-test-'))
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const handlers = new Map(), events = []
  const load = loadTs({
    electron: { app: { getPath: () => directory } },
    './linkResolverService': { resolveDownloadLink: resolver },
    './extractService': { extractArchive: async () => { throw new Error('Extraction is disabled in this test') } },
  })
  const service = load('electron/httpDownloadService.ts')
  service.initHttpDownloadIPC({ handle: (name, fn) => handlers.set(name, fn) }, { isDestroyed: () => false, webContents: { send: (_channel, payload) => events.push(payload) } })
  t.after(async () => {
    service.stopHttpDownloads()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })
  })
  const invoke = (name, ...args) => handlers.get('http-download:' + name)({}, ...args)
  const until = async predicate => {
    const deadline = Date.now() + 8000
    while (!predicate(events) && Date.now() < deadline) await delay(10)
    assert.equal(!!predicate(events), true, JSON.stringify(events.at(-1)))
    return events.at(-1)
  }
  return { directory, invoke, events, until, primary: `http://127.0.0.1:${port}/primary.zip`, mirror: `http://127.0.0.2:${port}/mirror.zip`, load }
}

test('mirror candidates stay within the release, bound work and never silently switch to P2P', () => {
  const { downloadCandidates } = loadTs({ './linkResolverService': {} })('electron/downloadMirrors.ts')
  const urls = downloadCandidates('https://one.example.com/a', ['https://one.example.com/part2', 'magnet:?xt=x', 'file:///private', 'https://two.example.com/b'])
  assert.deepEqual(urls, ['https://one.example.com/a', 'https://one.example.com/part2', 'https://two.example.com/b'])
  assert.throws(() => downloadCandidates('https://one.example.com/a', 'wrong'), /Invalid/)
  assert.throws(() => downloadCandidates('file:///private', []), /HTTP/)
})

test('HTTP IPC falls back from an expired mirror and downloads the exact file with a stable ID', async t => {
  const body = Buffer.from('PK\x03\x04 synthetic archive bytes')
  const seen = []
  const fixture = await downloadFixture(t, (req, res) => {
    seen.push(req.method + req.url)
    if (req.url === '/primary.zip') { res.writeHead(404); return res.end() }
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': body.length })
    res.end(body)
  }, async raw => ({ streamUrl: raw.replace('127.0.0.2', '127.0.0.1') }))
  const result = await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false, false, [fixture.mirror])
  const done = await fixture.until(events => events.some(e => e.status === 'done'))
  assert.equal(done.infoHash, result.infoHash)
  assert.deepEqual(fs.readFileSync(path.join(fixture.directory, fs.readdirSync(fixture.directory)[0])), body)
  assert.deepEqual(fixture.events.filter(e => e.resolution).map(e => e.resolution.attempt), [1, 2])
  assert.equal(fixture.events.some(e => e.status === 'error'), false)
  assert.equal(done.resolution, undefined)
  assert.equal(seen.filter(request => request.startsWith('GET')).length, 1)
})

test('HTTP mirror verification uses a bounded GET when HEAD is not supported', async t => {
  const seen = []
  const fixture = await downloadFixture(t, (req, res) => {
    seen.push({ method: req.method, range: req.headers.range })
    if (req.method === 'HEAD') { res.writeHead(405); return res.end() }
    res.writeHead(200, { 'Content-Type': 'application/zip' }); res.end('test file')
  })
  await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false)
  await fixture.until(events => events.some(e => e.status === 'done'))
  assert.deepEqual(seen.map(request => request.range), [undefined, 'bytes=0-0', undefined])
})

test('HTTP verification tolerates hosts that serve HTML for HEAD but a file for GET', async t => {
  const fixture = await downloadFixture(t, (req, res) => {
    res.writeHead(200, { 'Content-Type': req.method === 'HEAD' ? 'text/html' : 'application/zip' })
    res.end('real file')
  })
  await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false)
  await fixture.until(events => events.some(e => e.status === 'done'))
  assert.equal(fs.readFileSync(path.join(fixture.directory, fs.readdirSync(fixture.directory)[0]), 'utf8'), 'real file')
})

test('GET landing pages are rejected even when HEAD claims a binary file, then an alternate mirror is used', async t => {
  const fixture = await downloadFixture(t, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    res.end(req.url === '/primary.zip' ? '<!doctype html><html>Not a download</html>' : 'real file')
  }, async raw => ({ streamUrl: raw.replace('127.0.0.2', '127.0.0.1') }))
  await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false, false, [fixture.mirror])
  await fixture.until(events => events.some(e => e.status === 'done'))
  assert.equal(fs.readFileSync(path.join(fixture.directory, fs.readdirSync(fixture.directory)[0]), 'utf8'), 'real file')
  assert.equal(fixture.events.some(e => e.status === 'error'), false)
})

test('pause while resolving is visible, prevents transfer, and resumes without losing the job', async t => {
  let resolveLink, transfers = 0
  const fixture = await downloadFixture(t, (req, res) => {
    if (req.method === 'GET') transfers++
    res.writeHead(200, { 'Content-Type': 'application/zip' }); res.end('file')
  }, raw => new Promise(resolve => { resolveLink = () => resolve({ streamUrl: raw }) }))
  const result = await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false)
  await fixture.invoke('pause', result.infoHash)
  assert.equal(fixture.events.at(-1).status, 'paused')
  resolveLink()
  await delay(80)
  assert.equal(transfers, 0)
  assert.equal(fixture.events.at(-1).status, 'paused')
  await fixture.invoke('resume', result.infoHash)
  resolveLink() // Resume resolves a fresh link; the pre-pause result is obsolete.
  await fixture.until(events => events.some(e => e.status === 'done'))
  assert.equal(transfers, 1)
})

test('exhausted mirrors report an actionable error and retry can restart the same job', async t => {
  let available = false
  const fixture = await downloadFixture(t, (_req, res) => {
    res.writeHead(available ? 200 : 404, { 'Content-Type': 'application/zip' }); res.end('file')
  })
  const result = await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false)
  const error = await fixture.until(events => events.some(e => e.status === 'error'))
  assert.match(error.errorMessage, /No automatic mirror/)
  assert.equal(error.mirrorFailures[0].code, 'unavailable')
  assert.equal(error.mirrorFailures[0].httpStatus, 404)
  assert.equal(fs.readdirSync(fixture.directory).length, 0)
  available = true
  await fixture.invoke('resume', result.infoHash)
  const done = await fixture.until(events => events.some(e => e.status === 'done'))
  assert.equal(done.infoHash, result.infoHash)
})

test('rapid pause/resume during resolution invalidates old attempts without advancing mirrors or duplicating transfers', async t => {
  const attempts = []; let transfers = 0
  const fixture = await downloadFixture(t, (req, res) => {
    if (req.method === 'GET') transfers++
    res.writeHead(200, { 'Content-Type': 'application/zip' }); res.end('complete file')
  }, (url, _title, options) => new Promise(resolve => attempts.push({ signal: options.signal, resolve: () => resolve({ streamUrl: url }) })))
  const result = await fixture.invoke('start', fixture.primary, 'Rapid fixture', fixture.directory, false)
  await fixture.invoke('pause', result.infoHash); await fixture.invoke('pause', result.infoHash)
  assert.equal(attempts[0].signal.aborted, true)
  await fixture.invoke('resume', result.infoHash); await fixture.invoke('resume', result.infoHash)
  assert.equal(attempts.length, 2)
  await fixture.invoke('pause', result.infoHash)
  attempts[0].resolve(); attempts[1].resolve(); await delay(30)
  assert.equal(transfers, 0)
  assert.equal(fixture.events.at(-1).status, 'paused')
  await fixture.invoke('resume', result.infoHash)
  assert.equal(attempts.length, 3)
  attempts[2].resolve()
  await fixture.until(events => events.some(event => event.status === 'done'))
  assert.equal(transfers, 1)
})

test('cancelling during file verification aborts its request and never starts an alternate transfer', async t => {
  let probing = false, transfers = 0
  const fixture = await downloadFixture(t, (req, res) => {
    if (req.method === 'HEAD') { probing = true; return }
    transfers++; res.end('file')
  })
  const result = await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false, false, [fixture.mirror])
  await fixture.until(() => probing)
  await fixture.invoke('cancel', result.infoHash)
  const count = fixture.events.length
  await delay(80)
  assert.equal(transfers, 0)
  assert.equal(fixture.events.length, count)
  assert.equal(fs.readdirSync(fixture.directory).length, 0)
})

test('a mirror is never changed after partial bytes have been written', async t => {
  const partial = Buffer.alloc(4096, 17)
  let downloads = 0, alternateRequests = 0
  const fixture = await downloadFixture(t, (req, res) => {
    if (req.url === '/mirror.zip') alternateRequests++
    if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': 'application/zip' }); return res.end() }
    if (downloads++) { res.writeHead(403); return res.end() }
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': 100_000 })
    res.write(partial)
    setTimeout(() => res.destroy(), 60)
  }, async raw => ({ streamUrl: raw.replace('127.0.0.2', '127.0.0.1') }))
  await fixture.invoke('start', fixture.primary, 'Example', fixture.directory, false, false, [fixture.mirror])
  const error = await fixture.until(events => events.some(e => e.status === 'error'))
  assert.equal(error.downloaded, partial.length)
  assert.equal(alternateRequests, 0)
  assert.deepEqual(fs.readFileSync(path.join(fixture.directory, fs.readdirSync(fixture.directory)[0])), partial)
})

test('a second link on the same host is tried instead of being discarded', async t => {
  const fixture = await downloadFixture(t, (req, res) => {
    res.writeHead(req.url === '/primary.zip' ? 404 : 200, { 'Content-Type':'application/zip' }); res.end('complete')
  })
  await fixture.invoke('start', fixture.primary, 'Game', fixture.directory, false, false, [fixture.primary.replace('/primary.zip','/mirror.zip')])
  const done = await fixture.until(events => events.some(event => event.status === 'done'))
  assert.equal(done.mirrorFailures[0].code, 'unavailable')
  assert.deepEqual(fixture.events.filter(event => event.resolution).map(event => event.resolution.attempt), [1,2])
})

test('split-archive parts are rejected before transfer and a complete mirror can be selected', async t => {
  let partialTransfers = 0
  const fixture = await downloadFixture(t, (req, res) => {
    if (req.url === '/primary.zip' && req.method === 'GET') partialTransfers++
    res.writeHead(200, { 'Content-Type':'application/zip', 'Content-Disposition':`attachment; filename="${req.url === '/primary.zip' ? 'game.zip.001' : 'game.zip'}"` }); res.end('complete')
  })
  await fixture.invoke('start', fixture.primary, 'Game', fixture.directory, false, false, [fixture.primary.replace('/primary.zip','/mirror.zip')])
  const done = await fixture.until(events => events.some(event => event.status === 'done'))
  assert.equal(done.mirrorFailures[0].code, 'multipart')
  assert.equal(partialTransfers, 0)
})

test('retry after a rejected transfer resolves a fresh link rather than reusing an expired token', async t => {
  let resolutions = 0
  const fixture = await downloadFixture(t, (req, res) => {
    res.writeHead(req.method === 'GET' && req.url.includes('token-1') ? 403 : 200, { 'Content-Type':'application/zip' }); res.end('complete')
  }, async raw => ({streamUrl:raw.replace('primary.zip',`token-${++resolutions}.zip`)}))
  const started = await fixture.invoke('start', fixture.primary, 'Game', fixture.directory, false)
  await fixture.until(events => events.some(event => event.status === 'error'))
  await fixture.invoke('resume', started.infoHash)
  await fixture.until(events => events.some(event => event.status === 'done'))
  assert.equal(resolutions, 2)
})

test('a full destination disk does not cycle through remote mirrors or write an empty successful download', async t => {
  t.mock.method(fs.promises, 'statfs', async () => ({bavail:0,bsize:1}))
  let alternateRequests = 0
  const fixture = await downloadFixture(t, (req, res) => {
    if (req.url === '/mirror.zip') alternateRequests++
    res.writeHead(200, {'Content-Type':'application/zip','Content-Length':10}); res.end('0123456789')
  })
  await fixture.invoke('start', fixture.primary, 'Game', fixture.directory, false, false, [fixture.primary.replace('/primary.zip','/mirror.zip')])
  const error = await fixture.until(events => events.some(event => event.status === 'error'))
  assert.equal(error.errorCode, 'storage')
  assert.equal(alternateRequests, 0)
  assert.equal(fs.readdirSync(fixture.directory).length, 0)
})

test('starting an exhausted job again applies a new destination instead of falsely reporting an existing start', async t => {
  let available = false
  const fixture = await downloadFixture(t, (_req,res) => {
    res.writeHead(available ? 200 : 404, {'Content-Type':'application/zip'}); res.end('complete')
  })
  const first = await fixture.invoke('start', fixture.primary, 'Game', fixture.directory, false)
  await fixture.until(events => events.some(event => event.status === 'error'))
  available = true
  const destination = path.join(fixture.directory,'retry')
  const again = await fixture.invoke('start', fixture.primary, 'Game', destination, false)
  assert.equal(again.infoHash, first.infoHash)
  const done = await fixture.until(events => events.some(event => event.status === 'done'))
  assert.equal(done.installPath, destination)
  assert.equal(fs.readdirSync(destination).length, 1)
})
