const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

test('fullscreen is granted only to a trusted main frame and automatic fullscreen stays denied', () => {
  let check, request
  const contents = { getURL: () => 'file:///C:/fixture/index.html' }
  const { initRendererPermissions } = loadTs({ './ipcSecurity': { isTrustedWebContents: value => value === contents } })('electron/rendererPermissions.ts')
  initRendererPermissions({ setPermissionCheckHandler: value => { check = value }, setPermissionRequestHandler: value => { request = value } })
  assert.equal(check(contents, 'fullscreen', 'file://', { isMainFrame: true }), true)
  assert.equal(check(contents, 'media', 'file:///', { isMainFrame: true, mediaType:'audio' }), true)
  assert.equal(check(contents, 'media', 'null', { isMainFrame: true, mediaType:'audio' }), true)
  assert.equal(check(contents, 'media', 'https://evil.test', { isMainFrame: true }), false)
  assert.equal(check(contents, 'media', 'file:///', { isMainFrame: false }), false)
  assert.equal(check(contents, 'automatic-fullscreen', 'file://', {}), false)
  assert.equal(check(contents, 'fullscreen', 'https://evil.test', {}), false)
  assert.equal(check(contents, 'fullscreen', 'file://', { isMainFrame: false }), false)
  assert.equal(check(null, 'fullscreen', 'file://', {}), false)
  let granted
  request(contents, 'fullscreen', value => { granted = value }, { isMainFrame: true, requestingUrl: contents.getURL() })
  assert.equal(granted, true)
  request(contents, 'fullscreen', value => { granted = value }, { isMainFrame: false, requestingUrl: contents.getURL() })
  assert.equal(granted, false)
})

test('Steam updates contain only official posts for the requested game, newest first', () => {
  const { parseSteamNews } = loadTs()('src/services/steamNews.ts')
  const post = (gid, date, extra = {}) => ({ gid, date, title: 'Update', contents: 'Patch notes', feedname: 'steam_community_announcements', ...extra })
  const items = [post('1', 100), post('2', 200), post('2', 200), null, post('3', 300, { feedname: 'external_news' }), post('4', Infinity), post('5', 1e20), post('bad/id', 1)]
  assert.deepEqual(parseSteamNews({ appnews: { appid: 730, newsitems: items } }, 730).map(item => item.id), ['2', '1'])
  assert.deepEqual(parseSteamNews({ appnews: { appid: 2, newsitems: items } }, 730), [])
  assert.deepEqual(parseSteamNews(null, 730), [])
  assert.equal(parseSteamNews({ appnews: { appid: 730, newsitems: [post('1', 100, { url: 'javascript:alert(1)' })] } }, 730)[0].url, 'https://store.steampowered.com/news/app/730/view/1')
})

test('Steam updates use a cancellable full-content request and reject HTTP failures', async () => {
  const calls = []
  const { fetchSteamNews } = loadTs({ './httpClient': { desktopFetch: async (url, options) => { calls.push({ url, signal: options.signal }); return { ok: false, status: 503 } } } })('src/services/steamNews.ts')
  assert.deepEqual(await fetchSteamNews(-1, 'de'), [])
  await assert.rejects(fetchSteamNews(730, 'de'), /503/)
  const url = new URL(calls[0].url)
  assert.equal(url.searchParams.get('maxlength'), '0')
  assert.equal(url.searchParams.get('feeds'), 'steam_community_announcements')
  assert.equal(url.searchParams.get('l'), 'german')
  const controller = new AbortController()
  const { fetchSteamNews: cancellable } = loadTs({ './httpClient': { desktopFetch: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) } })('src/services/steamNews.ts')
  const pending = cancellable(730, 'en', controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('native notifications report Windows acceptance and retain working click callbacks', async () => {
  let latest, supported = true, fail = false, clicks = 0
  class MockNotification extends EventEmitter {
    static isSupported() { return supported }
    constructor(options) { super(); this.options = options; latest = this }
    show() { this.emit(fail ? 'failed' : 'show', {}, 'test delivery failure') }
    close() { this.emit('close') }
  }
  const { showDesktopNotification } = loadTs({ electron: { Notification: MockNotification } })('electron/nativeNotifications.ts')
  assert.equal(await showDesktopNotification({ title: 'Free game', body: 'New offer' }, () => clicks++), true)
  latest.emit('click'); assert.equal(clicks, 1)
  latest.emit('click'); assert.equal(clicks, 1)
  supported = false
  assert.equal(await showDesktopNotification({ title: 'Unsupported' }), false)
  supported = true; fail = true
  const warn = console.warn; console.warn = () => {}
  try { assert.equal(await showDesktopNotification({ title: 'Failed' }), false) } finally { console.warn = warn }
})

test('Free Games notifies new offers once, retries failed delivery and respects its setting on manual checks', async () => {
  const files = new Map(), notices = [], originalFetch = global.fetch
  let enabled = true, deliver = true, title = 'Fixture Game', opened = 0
  global.fetch = async url => ({ ok: true, json: async () => String(url).includes('freeGamesPromotions')
    ? { data: { Catalog: { searchStore: { elements: [{ id: title, title, productSlug: 'fixture', price: { totalPrice: { discountPrice: 0, originalPrice: 1000 } } }] } } } } : [] })
  const service = loadTs({
    electron: { app: { getPath: () => 'C:/fixture' } },
    fs: { existsSync: file => file.endsWith('settings.json') || files.has(file), readFileSync: file => file.endsWith('settings.json') ? JSON.stringify({ language: 'en', freeGamesNotifications: enabled }) : files.get(file), writeFileSync: (file, value) => files.set(file, value) },
    './nativeNotifications': { showDesktopNotification: async (options, callback) => { notices.push({ options, callback }); return deliver } },
  })('electron/freeGamesService.ts')
  service.configureFreeGameNotifications({ updated() {}, open() { opened++ } })
  try {
    assert.equal((await service.checkFreeGames()).newAlerts, 1)
    assert.match(notices[0].options.title, /Free on Epic Games/)
    notices[0].callback(); assert.equal(opened, 1)
    assert.equal((await service.checkFreeGames(true)).newAlerts, 0)
    assert.equal(notices.length, 1, 'Manual refresh must not repeat existing offers')
    title = 'New offer'; deliver = false
    assert.equal((await service.checkFreeGames()).newAlerts, 0)
    deliver = true
    assert.equal((await service.checkFreeGames()).newAlerts, 1, 'Failed Windows delivery must remain retryable')
    enabled = false; title = 'Disabled offer'
    const count = notices.length
    assert.equal((await service.checkFreeGames(true)).found, 1)
    assert.equal(notices.length, count, 'Manual refresh must respect notification settings')
  } finally { global.fetch = originalFetch }
})
