const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const loadTs = require('./download-loader.cjs')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function fixture(t, handler, extractArchive = async (_archive, targetDir) => ({ targetDir, mainExe: null }), resolver = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-download-test-'))
  const server = http.createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/game.zip`
  const load = loadTs({
    electron: { app: { getPath: () => directory } },
    './linkResolverService': { resolveDownloadLink: async rawUrl => ({ streamUrl: rawUrl }), ...resolver },
    './extractService': { extractArchive },
  })
  const service = load('electron/httpDownloadService.ts')
  const downloader = new service.HttpDownloader('1234567890', url, 'Test Game', directory, false, false)
  t.after(async () => {
    await downloader.cancel()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return { ...service, downloader, directory, url }
}

function completed(downloader, timeout = 8000) {
  const events = []
  const promise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Download timed out')), timeout)
    downloader.start(payload => {
      events.push(payload)
      if (payload.status === 'done' || payload.status === 'error') { clearTimeout(timer); resolve(payload) }
    })
  })
  return { promise, events }
}

test('HTTP streams flush fully before extraction and report the extracted installation directory', async t => {
  const body = Buffer.alloc(2 * 1024 * 1024, 42)
  let extracted = false
  const { downloader } = await fixture(t, (_req, res) => res.end(body), async (archive, targetDir) => {
    assert.deepEqual(fs.readFileSync(archive), body)
    extracted = true
    return { targetDir, mainExe: path.join(targetDir, 'game.exe') }
  })
  downloader.autoExtract = true
  const result = await completed(downloader).promise
  assert.equal(result.status, 'done')
  assert.equal(result.length, body.length)
  assert.equal(result.downloaded, body.length)
  assert.equal(result.installPath, path.join(downloader.targetDir, 'Test Game'))
  assert.equal(extracted, true)
})

test('HTTP resume honors Content-Range total when a chunked 206 has no Content-Length', async t => {
  const body = Buffer.from('0123456789')
  const { downloader } = await fixture(t, (req, res) => {
    assert.equal(req.headers.range, 'bytes=4-')
    res.writeHead(206, { 'Content-Range': 'bytes 4-9/10' })
    res.write(body.subarray(4, 7)); res.end(body.subarray(7))
  })
  fs.writeFileSync(downloader.targetPath, body.subarray(0, 4))
  const result = await completed(downloader).promise
  assert.equal(result.status, 'done')
  assert.equal(result.length, 10)
  assert.deepEqual(fs.readFileSync(downloader.targetPath), body)
})

test('HTTP server ignoring Range replaces the old partial file', async t => {
  const { downloader } = await fixture(t, (_req, res) => res.end('complete file'))
  fs.writeFileSync(downloader.targetPath, 'partial')
  assert.equal((await completed(downloader).promise).status, 'done')
  assert.equal(fs.readFileSync(downloader.targetPath, 'utf8'), 'complete file')
})

test('an already complete partial file can finish after a 416 response', async t => {
  const { downloader } = await fixture(t, (_req, res) => {
    res.writeHead(416, { 'Content-Range': 'bytes */8' }); res.end()
  })
  fs.writeFileSync(downloader.targetPath, 'complete')
  const result = await completed(downloader).promise
  assert.equal(result.status, 'done')
  assert.equal(result.downloaded, 8)
})

test('disk write failures become download errors without crashing or retrying', async t => {
  let requests = 0
  const { downloader, directory } = await fixture(t, (_req, res) => { requests++; res.end('data') })
  downloader.targetPath = directory
  const result = await completed(downloader).promise
  assert.equal(result.status, 'error')
  assert.equal(requests, 1)
})

test('HTTP rejects mismatched partial ranges without appending corrupt bytes', async t => {
  const { downloader } = await fixture(t, (_req, res) => {
    res.writeHead(206, { 'Content-Range': 'bytes 0-9/10' }); res.end('0123456789')
  })
  fs.writeFileSync(downloader.targetPath, '0123')
  const result = await completed(downloader).promise
  assert.equal(result.status, 'error')
  assert.match(result.errorMessage, /invalid partial/)
  assert.equal(fs.readFileSync(downloader.targetPath, 'utf8'), '0123')
})

test('HTTP redirects are bounded', async t => {
  let calls = 0
  const { downloader } = await fixture(t, (_req, res) => {
    calls++; res.writeHead(302, { Location: '/game.zip' }); res.end()
  })
  const result = await completed(downloader).promise
  assert.equal(result.status, 'error')
  assert.equal(calls, 11)
})

test('HTTP extraction failures report an error and retain the archive', async t => {
  const { downloader } = await fixture(t, (_req, res) => res.end('archive'), async () => { throw new Error('Bad archive') })
  downloader.autoExtract = true
  const { promise, events } = completed(downloader)
  const result = await promise
  assert.equal(result.status, 'error')
  assert.match(result.errorMessage, /Bad archive/)
  assert.equal(events.some(event => event.status === 'done'), false)
  assert.equal(fs.readFileSync(downloader.targetPath, 'utf8'), 'archive')
})

test('HTTP pause/resume preserves bytes and resumes periodic progress notifications', async t => {
  const body = Buffer.alloc(100 * 1024, 7)
  const { downloader } = await fixture(t, (req, res) => {
    let offset = Number(/bytes=(\d+)-/.exec(req.headers.range || '')?.[1] || 0)
    res.writeHead(offset ? 206 : 200, { 'Content-Length': body.length - offset, ...(offset ? { 'Content-Range': `bytes ${offset}-${body.length - 1}/${body.length}` } : {}) })
    const interval = setInterval(() => {
      res.write(body.subarray(offset, offset + 1024)); offset += 1024
      if (offset >= body.length) { clearInterval(interval); res.end() }
    }, 20)
    res.on('close', () => clearInterval(interval))
  })
  const { promise, events } = completed(downloader)
  await delay(150)
  downloader.pause()
  const pausedEvents = events.length
  await delay(30)
  assert.equal(downloader.status, 'paused')
  downloader.resume()
  const result = await promise
  assert.equal(result.status, 'done')
  assert.ok(events.length >= pausedEvents + 3)
  assert.deepEqual(fs.readFileSync(downloader.targetPath), body)
  assert.equal(events.some(event => event.status === 'error'), false)
})

test('cancelling while a link resolves prevents a late download and deduplicates concurrent starts', async t => {
  let resolveLink
  let resolutions = 0
  let requests = 0
  const { initHttpDownloadIPC, url, directory } = await fixture(t, (_req, res) => { requests++; res.end('data') }, undefined, {
    resolveDownloadLink: () => { resolutions++; return new Promise(resolve => { resolveLink = resolve }) },
  })
  const handlers = new Map()
  const events = []
  initHttpDownloadIPC({ handle: (name, fn) => handlers.set(name, fn) }, { isDestroyed: () => false, webContents: { send: (_name, payload) => events.push(payload) } })
  const first = await handlers.get('http-download:start')({}, url, 'Game', directory, false)
  const second = await handlers.get('http-download:start')({}, url, 'Game', directory, false)
  assert.equal(first.infoHash, second.infoHash)
  assert.equal(resolutions, 1)
  await handlers.get('http-download:cancel')({}, first.infoHash)
  resolveLink({ streamUrl: url })
  await delay(50)
  assert.equal(requests, 0)
  assert.equal(events.length, 2)
  assert.equal(events[1].resolution.attempt, 1)
})
