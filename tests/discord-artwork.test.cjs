const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

function fixture() {
  const calls = []
  const https = { get(options, callback) {
    const request = new EventEmitter()
    request.destroy = () => {}
    calls.push({ options, request, respond(body, status = 200) {
      const response = new EventEmitter()
      response.statusCode = status; response.resume = () => {}; response.destroy = () => {}
      callback(response)
      if (status === 200) { response.emit('data', typeof body === 'string' ? body : JSON.stringify(body)); response.emit('end') }
    } })
    return request
  } }
  return { calls, ...loadTs({ https })('electron/discordGameArtwork.ts') }
}

test('Steam icon lookup coalesces app ID requests, validates identity and caches success', async () => {
  const f = fixture()
  const first = f.fetchSteamGameIcon(777), second = f.fetchSteamGameIcon(777)
  assert.equal(first, second)
  assert.equal(f.calls.length, 1)
  const { options } = f.calls[0]
  assert.equal(options.hostname, 'api.steampowered.com')
  const input = JSON.parse(new URL('https://example.com' + options.path).searchParams.get('input_json'))
  assert.deepEqual(input.ids, [{ appid: 777 }])
  f.calls[0].respond({ response: { store_items: [
    { appid: 666, assets: { community_icon: 'b'.repeat(40) } },
    { appid: 777, assets: { community_icon: 'a'.repeat(40) } },
  ] } })
  const result = await first
  assert.equal(result.imageUrl, 'https://shared.fastly.steamstatic.com/community_assets/images/apps/777/' + 'a'.repeat(40) + '.jpg')
  assert.deepEqual(await f.fetchSteamGameIcon(777), result)
  assert.equal(f.calls.length, 1)
})

test('invalid IDs and malicious icon paths never become external image URLs', async () => {
  const f = fixture()
  for (const id of [NaN, -1, 0, 3.5, Infinity]) assert.equal(await f.fetchSteamGameIcon(id), null)
  assert.equal(f.calls.length, 0)
  for (const hash of ['https://example.com/icon.png', '../icon', 'a'.repeat(41), null, 'xyz']) assert.equal(f.steamIconUrl(777, hash), undefined)
  const result = f.fetchSteamGameIcon(777)
  f.calls[0].respond({ response: { store_items: [{ appid: 777, assets: { community_icon: 'https://example.com/icon.png', header: 'header.jpg' } }] } })
  assert.equal(await result, null, 'Wide headers are not a square icon fallback')
})

test('bad responses, timeouts and oversized bodies fall back and avoid immediate retry loops', async () => {
  for (const kind of ['status', 'json', 'size', 'timeout', 'error', 'identity']) {
    const f = fixture(), result = f.fetchSteamGameIcon(777)
    const call = f.calls[0]
    if (kind === 'status') call.respond({}, 503)
    if (kind === 'json') call.respond('{invalid')
    if (kind === 'size') call.respond('x'.repeat(2 * 1024 * 1024 + 1))
    if (kind === 'timeout') call.request.emit('timeout')
    if (kind === 'error') call.request.emit('error', new Error('Offline'))
    if (kind === 'identity') call.respond({ response: { store_items: [{ appid: 888, assets: { community_icon: 'a'.repeat(40) } }] } })
    assert.equal(await result, null, kind)
    assert.equal(await f.fetchSteamGameIcon(777), null)
    assert.equal(f.calls.length, 1, kind)
  }
})
