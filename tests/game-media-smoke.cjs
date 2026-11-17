const { app, BrowserWindow, session, ipcMain, net } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')
const root = path.resolve(__dirname, '..')
const output = path.join(root, '.cache/game-media')
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const errors = [], requests = [], permissions = []
let server, window

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  ipcMain.on('account:get-identity-sync', event => { event.returnValue = null })
  ipcMain.handle('settings:set', () => ({ success: true }))
  ipcMain.handle('sources:get-all-cached', () => [])
  ipcMain.handle('storage:get-drives', () => [{ deviceId: 'C:', volumeName: 'Fixture', totalBytes: 100e9, freeBytes: 50e9, usedBytes: 50e9, usedPercentage: 50 }])
  ipcMain.handle('storage:get-game-sizes', (_event, games) => games.map(game => ({ ...game, drive: 'C:', sizeBytes: 100e6, sizeFormatted: '100 MB' })))
  server = http.createServer((req, res) => {
    const source = new URL(req.url, 'http://127.0.0.1').searchParams.get('url') || ''
    const valid = /\/(3883570|4356780)\/fixture\/header\.jpg/.test(source) || /\/730\//.test(source) || source.includes('/images/news.jpg') || /\/images\/42\/[a-f\d]{40}\.png/.test(source)
    res.setHeader('Content-Type', valid ? 'image/svg+xml' : 'text/plain')
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (!valid) { res.writeHead(404); res.end('Missing legacy artwork'); return }
    if (source.includes('picture-two-full.jpg')) { setTimeout(() => res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#242f39"/></svg>'), 300); return }
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#3d2518"/><circle cx="490" cy="150" r="80" fill="#a85624"/><text x="35" y="210" fill="#fff" font-size="28">ECLIPSE ARTWORK</text></svg>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  session.defaultSession.protocol.handle('https', request => net.fetch(`http://127.0.0.1:${port}/image?url=${encodeURIComponent(request.url)}`))
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^http:/.test(details.url) && !details.url.startsWith(`http://127.0.0.1:${port}`) }))
  ipcMain.handle('artwork:prefetch', async (_event, { url }) => { const response = await net.fetch(url); await response.arrayBuffer(); return response.ok && /^image\//.test(response.headers.get('content-type') || '') })
  ipcMain.handle('network:cancel', () => true)
  ipcMain.handle('network:request', (_event, payload) => {
    requests.push(payload.url)
    let body = {}
    if (payload.url.includes('ajaxgetpartnereventspageable')) body = { events: [{ appid:730,published:1,hidden:0,event_type:14,announcement_body:{gid:'1002',clanid:'42'},jsondata:JSON.stringify({localized_capsule_image:['a'.repeat(40)+'.png']}) }] }
    if (payload.url.includes('GetNewsForApp')) body = { appnews: { appid: 730, newsitems: [
      { gid: '1002', date: 1793300000, title: 'Update 2.0 · Patch notes', feedname: 'steam_community_announcements', contents: '[h2]Smoother playback[/h2]\n[list][*]Fixed playback\n[*]Fixed fullscreen[/list]\n[img]{STEAM_CLAN_IMAGE}/news.jpg[/img]<script>window.__newsUnsafe=true</script><a href="javascript:alert(1)">Unsafe link</a><img src="https://evil.test/tracker.png" onerror="window.__newsUnsafe=true">' },
      { gid: '1001', date: 1793200000, title: 'Previous update', feedname: 'steam_community_announcements', contents: '[b]Earlier patch[/b]\nThe previous full announcement.' },
      { gid: '1000', date: 1793100000, title: 'Crossplay has arrived', feedname: 'steam_community_announcements', contents: '[p][img src="{STEAM_CLAN_IMAGE}/images/news.jpg"][/img][/p][h2]Play together, wherever you are[/h2][p]Crossplay is now available for all players. Invite your friends and start a new adventure together.[/p][h3]What is new?[/h3][list][*][p]Join friends across platforms[/p][/*][*][p]Improved room codes and matchmaking[/p][/*][/list][previewyoutube="j8vL7SFJZUM;full"][/previewyoutube]' },
      { gid: '999', date: 1793000000, title: 'Hotfix 2.0.1', feedname: 'steam_community_announcements', contents: '[p][img src="{STEAM_CLAN_IMAGE}/missing.jpg"][/img][/p][p]Small fixes, smoother matches.[/p]' },
    ] } }
    if (payload.url.includes('IStoreBrowseService')) {
      const ids = JSON.parse(new URL(payload.url).searchParams.get('input_json')).ids
      body = { response: { store_items: ids.map(({ appid }) => [3883570,4356780].includes(appid) ? { appid, assets: { asset_url_format: `steam/apps/${appid}/\${FILENAME}`, header: 'fixture/header.jpg' } } : { appid: 0, success: 15 }) } }
    }
    if (payload.url.includes('/api/storesearch/')) {
      const name = new URL(payload.url).searchParams.get('term')
      const id = { Invokyr: 3883570, 'Screen Stocks': 4356780 }[name]
      body = { total: id ? 1 : 0, items: id ? [{ id, name }] : [] }
    }
    return { status: 200, statusText: 'OK', body: JSON.stringify(body), headers: [['content-type','application/json']], url: payload.url }
  })
  window = new BrowserWindow({ show: false, frame: false, width: 1150, height: 880, webPreferences: { preload: path.join(root, 'dist-electron/preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } })
  const trusted = contents => contents === window.webContents && !contents.isDestroyed() && contents.getURL().startsWith('file:')
  const { initRendererPermissions } = loadTs({ './ipcSecurity': { isTrustedWebContents: trusted } })('electron/rendererPermissions.ts')
  initRendererPermissions({
    setPermissionCheckHandler: handler => session.defaultSession.setPermissionCheckHandler((...args) => { permissions.push({ type: args[1], kind: 'check' }); return handler(...args) }),
    setPermissionRequestHandler: handler => session.defaultSession.setPermissionRequestHandler((...args) => { permissions.push({ type: args[1], kind: 'request' }); return handler(...args) }),
  })
  window.webContents.on('console-message', event => { if (event.level === 'error' && !/ERR_|Failed to load resource|404/.test(event.message)) errors.push(event.message) })
  window.webContents.on('render-process-gone', (_event, details) => errors.push(details.reason))
  await window.loadFile(path.join(output, 'fixture/tests/game-media-fixture.html'))
  const evaluate = code => window.webContents.executeJavaScript(code)
  const until = async (code, timeout = 15000) => { const deadline = Date.now()+timeout; while (Date.now()<deadline) { if (await evaluate(code)) return; await wait(40) }; throw new Error('Timed out: '+code) }
  window.webContents.debugger.attach('1.3')
  const click = async (selector, fraction = { x: .5, y: .5 }) => {
    const point = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width*${fraction.x},y:r.y+r.height*${fraction.y}}})()`)
    await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
    await wait(50)
    for (const type of ['mousePressed','mouseReleased']) await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type, button: 'left', clickCount: 1, ...point })
    await wait(80)
  }
  await until('!!window.__gameMediaFixture && !!document.querySelector("video") && document.querySelector("video").readyState>=2', 20000)
  await evaluate('document.querySelector("video").loop=true;true')
  await until('!document.querySelector("video").paused')
  await click('[data-video-player]', { x: .5, y: .2 })
  assert.equal(await evaluate('document.querySelector("video").paused'), true)
  await click('[data-video-player]', { x: .5, y: .76 })
  await until('!document.querySelector("video").paused')
  await click('[data-video-player]', { x: .5, y: .76 })
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'Blank gradient above controls must also pause')
  await click('[data-video-fullscreen]')
  await until('document.fullscreenElement?.matches("[data-video-player]")')
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'Fullscreen must preserve playback state')
  const fullscreenSize = await evaluate('({width:document.fullscreenElement.clientWidth,height:document.fullscreenElement.clientHeight})')
  await click('[data-video-fullscreen]')
  await until('!document.fullscreenElement')
  await click('[data-video-play]')
  await until('!document.querySelector("video").paused')
  await evaluate('window.__gameMediaFixture.detail();true')
  await until('!!document.getElementById("game-updates-open")')
  assert.equal(requests.some(url => url.includes('GetNewsForApp')), false, 'News must load only on demand')
  await click('#game-updates-open')
  await until('document.querySelector("[data-updates-article]")?.textContent.includes("Smoother playback")')
  await until('document.querySelector("[data-updates-hero] img")?.src.includes("/42/") && document.querySelector("[data-updates-hero]")?.textContent.includes("Großes Update")')
  assert.equal(await evaluate('!!window.__newsUnsafe'), false)
  assert.equal(await evaluate('!!document.querySelector("[data-updates-article] script,[data-updates-article] [onerror],[data-updates-article] [href^=javascript],[data-updates-article] img[src*=evil]")'), false)
  assert.equal(await evaluate('document.querySelector(".steam-news-content img").getAttribute("loading")'), 'lazy')
  await wait(200)
  fs.writeFileSync(path.join(output, 'game-updates-de.png'), (await window.webContents.capturePage()).toPNG())
  await click('[data-game-updates] nav button:nth-child(2)')
  await until('document.querySelector("[data-updates-article]")?.textContent.includes("previous full announcement")')
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await until('!document.querySelector("[data-game-updates]")')
  assert.equal(await evaluate('!!document.querySelector(".game-detail-modal-overlay")'), true, 'Closing updates must retain game preview')
  await click('#game-updates-open')
  await until('!!document.querySelector("[data-updates-article]")')
  assert.equal(requests.filter(url => url.includes('GetNewsForApp')).length, 1, 'Reopening updates must reuse the cached request')
  await evaluate('window.__gameMediaFixture.language("en");true')
  await until('document.getElementById("game-updates-title")?.textContent.includes("News & Updates")')
  const newsReader = await require('./game-updates-reader-smoke.cjs')({ window, evaluate, until, click, output })
  await click('[data-updates-close]')
  await evaluate('document.querySelector("[data-video-player]").scrollIntoView({block:"center"});document.querySelector("video").loop=true;document.querySelector("video").play();true')
  await until('!document.querySelector("video").paused')
  await click('[data-media-expand]')
  await until('document.querySelectorAll("video").length===2 && [...document.querySelectorAll("video")].filter(video=>!video.paused).length===1')
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'Inline player must be suspended while the expanded player is active')
  await evaluate('document.querySelectorAll("video")[1].loop=true;window.__overlappingAudio=false;window.__sampling=true;const sample=()=>{if([...document.querySelectorAll("video")].filter(video=>!video.paused).length>1)window.__overlappingAudio=true;if(window.__sampling)requestAnimationFrame(sample)};requestAnimationFrame(sample);true')
  await click('[data-lightbox-close]')
  await until('document.querySelectorAll("video").length===1 && !document.querySelector("video").paused')
  await evaluate('window.__sampling=false;true')
  assert.equal(await evaluate('window.__overlappingAudio'), false, 'The fading lightbox and inline player must never play together')
  await click('[data-video-player]', { x: .5, y: .2 })
  await until('document.querySelector("video").paused')
  await click('[data-media-expand]')
  await until('document.querySelectorAll("video").length===2')
  await click('[data-lightbox-close]')
  await until('document.querySelectorAll("video").length===1')
  assert.equal(await evaluate('document.querySelector("video").paused'), true, 'A video paused by the user must stay paused after closing the lightbox')
  await click('[data-media-index="1"]')
  await evaluate('window.__gameMediaFixture.lightboxStates.length=0;true')
  await click('[data-media-expand]')
  await until('document.querySelector("[data-lightbox-image]")?.complete&&document.querySelector("[data-lightbox-image]").naturalWidth>0')
  assert.deepEqual(await evaluate('window.__gameMediaFixture.lightboxStates'), [true], 'Opening a lightbox must not briefly clear its global state')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".topbar")).opacity'), '1', 'The covered header must not animate out underneath the media')
  const previousPicture = await evaluate('document.querySelector("[data-lightbox-image]").src')
  await click('[data-lightbox-next]')
  assert.equal(await evaluate('document.querySelector("[data-lightbox-image]").src'), previousPicture, 'Retain the decoded picture while its replacement loads')
  await until('document.querySelector("[data-lightbox-image]")?.src.includes("picture-two-full")')
  await click('[data-lightbox-close]')
  await until('!document.querySelector("[data-game-lightbox]")')
  assert.deepEqual(await evaluate('window.__gameMediaFixture.lightboxStates'), [true, false])
  await evaluate('window.__gameMediaFixture.storage();true')
  await until('document.querySelectorAll(".poster-art img").length===2 && [...document.querySelectorAll(".poster-art img")].every(img=>img.complete&&img.naturalWidth>0)')
  const artwork = await evaluate('[...document.querySelectorAll(".poster-art img")].map(img=>({name:img.alt,url:img.src,fit:getComputedStyle(img).objectFit,width:img.parentElement.parentElement.getBoundingClientRect().width,height:img.parentElement.parentElement.getBoundingClientRect().height}))')
  for (const image of artwork) { assert.match(image.url, /\/(3883570|4356780)\/fixture\/header\.jpg/); assert.equal(image.fit, 'cover'); assert.equal(image.width, 104); assert.equal(image.height, 58) }
  fs.writeFileSync(path.join(output, 'storage-artwork.png'), (await window.webContents.capturePage()).toPNG())
  assert.deepEqual(errors, [])
  const result = { imageClicks: 'top and gradient both toggle playback', fullscreen: true, fullscreenSize, officialUpdates: true, sanitization: true, onDemandCache: true, updateEscapeRetainsPreview: true, localized: true, newsReader, lightboxSingleAudio: true, lightboxRestoresPause: true, imageTransitionRetainsDecodedFrame: true, stableHeaderAndLightboxState: true, artwork, permissions, rendererErrors: errors }
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  window.destroy(); server.closeAllConnections(); server.close(); app.exit(0)
}).catch(async error => {
  console.error(error)
  if (window && !window.isDestroyed()) {
    const state = await window.webContents.executeJavaScript('({text:document.body.innerText,images:[...document.images].map(img=>({url:img.src,loaded:img.complete,width:img.naturalWidth}))})').catch(() => null)
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ state, requests, errors }, null, 2))
    fs.writeFileSync(path.join(output, 'failure.png'), (await window.webContents.capturePage()).toPNG())
  }
  app.exit(1)
})
setTimeout(() => { console.error('Game media verification timed out'); app.exit(1) }, 75000).unref()
