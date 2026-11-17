const test = require('node:test')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')

function probeFixture(handler) {
  return loadTs({ electron: { session: { fromPartition: () => ({}) } }, './hosterRequest': { requestHosterPage: handler } })('electron/downloadLinkStatus.ts')
}

test('host probes distinguish a reachable page from a verified downloadable file', async () => {
  const api = probeFixture(async (_session, _url, options) => { assert.equal(options.method, 'HEAD'); return new Response(null, { status: 200, headers: { 'Content-Type': 'text/html' } }) })
  assert.deepEqual(await api.inspectDownloadLink('https://example.com/file'), { state: 'reachable' })
})

test('host probes distinguish access denial, expiration, request limits and network failures', async () => {
  for (const [status, expected] of [[403,{ state:'unknown', reason:'forbidden' }],[404,{ state:'unavailable', reason:'unavailable' }],[429,{ state:'unknown', reason:'rate-limit' }]]) {
    const api = probeFixture(async () => new Response(null, { status }))
    assert.deepEqual(await api.inspectDownloadLink('https://example.com/file'), expected)
  }
  const api = probeFixture(async () => { throw new Error('net::ERR_SSL_PROTOCOL_ERROR') })
  assert.deepEqual(await api.inspectDownloadLink('https://example.com/file'), { state:'unknown', reason:'network' })
})

test('host probes share pending checks, cache results and validate redirects', async () => {
  let calls = 0, release
  const api = probeFixture(async () => { calls++; return new Promise(resolve => { release = resolve }) })
  const one = api.inspectDownloadLink('https://example.com/file'), two = api.inspectDownloadLink('https://example.com/file')
  assert.equal(calls, 1)
  release(new Response(null, { status: 200 }))
  await Promise.all([one,two])
  await api.inspectDownloadLink('https://example.com/file')
  assert.equal(calls, 1)
  const redirect = probeFixture(async () => new Response(null, { status: 302, headers: { Location: 'file:///C:/private' } }))
  assert.equal((await redirect.inspectDownloadLink('https://example.com/file')).state, 'unknown')
})

test('host labels use exact domain boundaries and make no unsupported speed promise', () => {
  const { describeDownloadHost, releaseLabel, downloadIssueLabel } = loadTs()('src/services/downloadPresentation.ts')
  assert.equal(describeDownloadHost('https://gofile.io.evil.example/file').name, 'gofile.io.evil.example')
  assert.equal(describeDownloadHost('https://www.gofile.io/d/id').name, 'Gofile')
  assert.equal(releaseLabel('Cyberpunk 2077 Free Download [v2.5+Build]', 'Cyberpunk 2077'), 'v2.5+Build')
  assert.notEqual(downloadIssueLabel('verification', 'en'), downloadIssueLabel('verification', 'de'))
  assert.match(downloadIssueLabel('storage','en'), /space/)
})

test('download issue classification separates filesystem faults from host/network problems', () => {
  const { downloadIssue, DownloadResolverError } = loadTs()('electron/downloadErrors.ts')
  assert.equal(downloadIssue(Object.assign(new Error('Disk full'), { code:'ENOSPC' })).code, 'storage')
  assert.equal(downloadIssue(Object.assign(new Error('Denied'), { code:'EACCES' })).code, 'permission')
  assert.equal(downloadIssue(new Error('Mirror returned a webpage')).code, 'no-file')
  assert.equal(downloadIssue(new Error('Host returned HTTP 403')).code, 'forbidden')
  assert.equal(downloadIssue(new Error('net::ERR_NAME_NOT_RESOLVED')).code, 'network')
  assert.equal(downloadIssue(new Error('net::ERR_TIMED_OUT')).code, 'timeout')
  assert.equal(downloadIssue(new DownloadResolverError('multipart','Split archive'),'https://example.com/part').host, 'example.com')
})

test('Gofile uses its ordinary isolated page rather than a hardcoded API website token', async () => {
  const calls = []
  const api = loadTs({ electron: { app: { getPath: () => __dirname } }, './automaticHosterResolver': {
    resolveBackgroundStream: async (url, options) => { calls.push({url,partition:options.partition}); return { streamUrl:'https://cdn.gofile.io/file.zip', headers:{Cookie:'fixture'} } },
  } })('electron/linkResolverService.ts')
  const result = await api.resolveDownloadLink('https://gofile.io/d/example', 'Game')
  assert.equal(result.streamUrl, 'https://cdn.gofile.io/file.zip')
  assert.equal(calls[0].partition, 'eclipse_gofile_downloads')
  assert.equal(calls.length, 1)
})

test('downloading an archive alone does not claim a game is installed or ready to play', t => {
  const previous = global.window
  t.after(() => { if (previous === undefined) delete global.window; else global.window = previous })
  let receive
  global.window = { electronAPI: { onTorrentProgress: callback => { receive = callback } } }
  const added = [], notifications = []
  const { useDownloadStore } = loadTs({
    './gameStore': { useGameStore: { getState: () => ({ settings:{language:'en'}, addToLibrary: game => added.push(game) }) } },
    '../services/notificationService': { sendAppNotification: notice => notifications.push(notice) },
    '../i18n/translate': { translate: () => 'Ready to play' },
  })('src/store/downloadStore.ts')
  const initial = { infoHash:'archive',name:'Game',status:'downloading',downloaded:0,length:10,progress:0,downloadSpeed:0,timeRemaining:0 }
  receive(initial); receive({...initial,status:'done',progress:1,downloaded:10})
  assert.equal(added.length, 0)
  assert.match(notifications[0].body, /downloaded/)
  receive({...initial,infoHash:'extracted'}); receive({...initial,infoHash:'extracted',status:'done',mainExe:'C:\\Games\\Game\\Game.exe',installPath:'C:\\Games\\Game'})
  assert.equal(added.length, 1)
  assert.equal(added[0].installed, true)
  assert.equal(useDownloadStore.getState().downloads.archive.status, 'done')
})
