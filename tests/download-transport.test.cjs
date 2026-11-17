const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough, Writable } = require('node:stream')
const { pipeline } = require('node:stream/promises')
const loadTs = require('./download-loader.cjs')

function fixture(run) {
  const requests = [], sessions = new Map()
  const net = { request: options => {
    const request = new EventEmitter()
    request.options = options
    request.abort = () => { request.aborted = true; request.emit('error', new Error('Expected native abort')) }
    request.end = () => queueMicrotask(() => run(request))
    requests.push(request)
    return request
  } }
  const session = { fromPartition: name => {
    if (!sessions.has(name)) sessions.set(name, { name })
    return sessions.get(name)
  } }
  const api = loadTs({ electron: { net, session } })('electron/downloadTransport.ts')
  return { ...api, requests }
}
const sink = () => new Writable({ write(_chunk, _encoding, done) { done() } })
const incoming = () => Object.assign(new PassThrough(), { statusCode: 200, headers: { 'content-type': 'application/zip' } })

test('native transfer retains the resolver session and lets the disk pipeline own reading', async () => {
  const body = Buffer.alloc(256 * 1024, 7), response = incoming()
  const api = fixture(request => { request.emit('response', response); response.end(body) })
  let handle
  const stream = await new Promise((resolve, reject) => {
    handle = api.requestDownloadStream(new URL('https://cdn.example.com/file.zip'), { Referer: 'https://example.com/file' }, resolve, 'resolver-session')
    handle.on('error', reject)
  })
  assert.equal(stream, response)
  assert.equal(stream.listenerCount('data'), 0, 'No early flowing mode or buffering adapter')
  assert.equal(api.requests[0].options.session.name, 'resolver-session')
  assert.equal(api.requests[0].options.credentials, 'include')
  assert.equal(api.requests[0].options.cache, 'no-store')
  let received = 0
  await pipeline(stream, new Writable({ write(chunk, _encoding, done) { received += chunk.length; setImmediate(done) } }))
  assert.equal(received, body.length)
  assert.equal(api.requests[0].aborted, true, 'Close releases the native request')
  handle.destroy()
})

test('native redirects are surfaced for explicit validation without forwarding headers', async () => {
  const api = fixture(request => request.emit('redirect', 302, 'GET', 'https://other.example.com/file.zip'))
  const stream = await new Promise((resolve, reject) => {
    api.requestDownloadStream(new URL('https://example.com/file.zip'), { Cookie: 'private' }, resolve).on('error', reject)
  })
  assert.equal(stream.statusCode, 302)
  assert.equal(stream.headers.location, 'https://other.example.com/file.zip')
  assert.equal(api.requests.length, 1)
  assert.equal(api.requests[0].aborted, true)
  stream.destroy()
})

test('native network failures reject both header requests and active streams exactly once', async () => {
  const initial = fixture(request => request.emit('error', new Error('Connection failed')))
  await assert.rejects(new Promise((resolve, reject) => initial.requestDownloadStream(new URL('https://example.com/file.zip'), {}, resolve).on('error', reject)), /Connection failed/)
  const response = incoming(), errors = []
  const active = fixture(request => request.emit('response', response))
  const stream = await new Promise(resolve => active.requestDownloadStream(new URL('https://example.com/file.zip'), {}, resolve).on('error', error => errors.push(error)))
  const transfer = pipeline(stream, sink())
  active.requests[0].emit('error', new Error('Connection reset'))
  await assert.rejects(transfer, /Connection reset/)
  assert.equal(errors.length, 1)
  assert.equal(active.requests[0].aborted, true)
})

test('a stalled native response is aborted and cannot leave the disk pipeline hanging', async t => {
  const keepAlive = setTimeout(() => {}, 1000)
  t.after(() => clearTimeout(keepAlive))
  const response = incoming()
  const api = fixture(request => request.emit('response', response))
  let handle
  const stream = await new Promise((resolve, reject) => {
    handle = api.requestDownloadStream(new URL('https://example.com/file.zip'), {}, resolve)
    handle.on('error', reject)
    handle.setTimeout(30, () => handle.destroy(new Error('Idle deadline')))
  })
  await assert.rejects(pipeline(stream, sink()), /Idle deadline/)
  assert.equal(api.requests[0].aborted, true)
  assert.equal(response.destroyed, true)
})

test('cancelling an active native transfer stops the stream without a spurious request error', async () => {
  const response = incoming(), errors = []
  const api = fixture(request => request.emit('response', response))
  let handle
  const stream = await new Promise(resolve => {
    handle = api.requestDownloadStream(new URL('https://example.com/file.zip'), {}, resolve)
    handle.on('error', error => errors.push(error))
  })
  const transfer = pipeline(stream, sink())
  handle.destroy()
  await assert.rejects(transfer, { code: 'ERR_STREAM_PREMATURE_CLOSE' })
  assert.equal(errors.length, 0)
  assert.equal(api.requests[0].aborted, true)
})

test('cancelling before native headers settles the pending request instead of leaving it suspended', async () => {
  const api = fixture(() => {})
  let handle
  const headers = new Promise((resolve, reject) => {
    handle = api.requestDownloadStream(new URL('https://example.com/file.zip'), {}, resolve)
    handle.on('error', reject)
  })
  handle.destroy()
  await assert.rejects(headers, { name: 'AbortError', code: 'ABORT_ERR' })
  assert.equal(api.requests[0].aborted, true)
})
