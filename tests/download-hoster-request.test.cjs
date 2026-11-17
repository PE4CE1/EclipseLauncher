const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter, getEventListeners } = require('node:events')
const loadTs = require('./download-loader.cjs')

function fixture(run) {
  const requests = []
  const net = { request: options => {
    const request = new EventEmitter()
    request.options = options
    request.abort = () => { request.aborted = true; request.emit('close') }
    request.end = body => queueMicrotask(() => run(request, body))
    requests.push(request)
    return request
  } }
  return { ...loadTs({ electron: { net } })('electron/hosterRequest.ts'), requests }
}
const options = signal => ({ method: 'GET', headers: {}, signal: signal || new AbortController().signal })
function incoming(status = 200, type = 'text/html') {
  return Object.assign(new EventEmitter(), { statusCode: status, headers: { 'content-type': type } })
}

test('native hoster requests return manual redirects and clean up instead of following them', async () => {
  const signal = new AbortController().signal
  const api = fixture(request => request.emit('redirect', 307, 'POST', 'https://cdn.example.com/file.zip'))
  const response = await api.requestHosterPage({}, 'https://example.com/file', options(signal))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'https://cdn.example.com/file.zip')
  assert.equal(api.requests[0].options.redirect, 'manual')
  assert.equal(api.requests[0].options.credentials, 'include')
  assert.equal(api.requests[0].aborted, true)
  assert.equal(getEventListeners(signal, 'abort').length, 0)
})

test('native hoster requests reject non-HTTP redirect destinations', async () => {
  const api = fixture(request => request.emit('redirect', 302, 'GET', 'file:///C:/private'))
  await assert.rejects(api.requestHosterPage({}, 'https://example.com/file', options()), /HTTP/)
  assert.equal(api.requests[0].aborted, true)
})

test('native hoster requests buffer bounded metadata and abort binary streams at their headers', async () => {
  let response
  const api = fixture(request => {
    response = incoming()
    request.emit('response', response)
    response.emit('data', Buffer.from('<html>Metadata</html>'))
    response.emit('end')
  })
  const result = await api.requestHosterPage({}, 'https://example.com/file', options())
  assert.equal(await result.text(), '<html>Metadata</html>')
  const binary = fixture(request => {
    response = incoming(200, 'application/zip')
    request.emit('response', response)
  })
  const archive = await binary.requestHosterPage({}, 'https://example.com/file.zip', options())
  assert.equal(archive.body, null)
  assert.equal(binary.requests[0].aborted, true)
  assert.equal(response.listenerCount('data'), 0)
})

test('native metadata limit and cancellation close the request and reject their promises', async () => {
  const api = fixture(request => {
    const response = incoming()
    request.emit('response', response)
    response.emit('data', Buffer.alloc(2 * 1024 * 1024 + 1))
  })
  await assert.rejects(api.requestHosterPage({}, 'https://example.com/file', options()), /too large/)
  assert.equal(api.requests[0].aborted, true)
  const controller = new AbortController(), pending = fixture(() => {})
  const promise = pending.requestHosterPage({}, 'https://example.com/file', options(controller.signal))
  controller.abort()
  await assert.rejects(promise, /aborted/)
  assert.equal(pending.requests[0].aborted, true)
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0)
})

test('native empty responses do not construct forbidden response bodies', async () => {
  const api = fixture(request => request.emit('response', incoming(204)))
  const response = await api.requestHosterPage({}, 'https://example.com/file', options())
  assert.equal(response.status, 204)
  assert.equal(response.body, null)
})
