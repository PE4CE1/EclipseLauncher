// Run with `npm run test:electron` after building. Uses isolated data and blocked remote networking.
const { app, BrowserWindow, ipcMain, session } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const loadTs = require('./download-loader.cjs')
const assetProtocol = loadTs()('electron/assetProtocol.ts')
require('electron').protocol.registerSchemesAsPrivileged([assetProtocol.ASSET_SCHEME])

const root = path.resolve(__dirname, '..')
const bundle = process.env.ECLIPSE_SMOKE_ASAR ? path.resolve(process.env.ECLIPSE_SMOKE_ASAR) : root
const bundleRequire = createRequire(path.join(bundle, 'package.json'))
const temporary = process.env.ECLIPSE_SMOKE_TEMP || fs.mkdtempSync(path.join(__dirname, '.electron-smoke-'))
app.setPath('userData', temporary)
app.setPath('sessionData', temporary)
if (process.env.ECLIPSE_SMOKE_ATMOSPHERE_GPU !== '1') app.commandLine.appendSwitch('disable-gpu')
if (process.env.ECLIPSE_SMOKE_SCROLL || process.env.ECLIPSE_SMOKE_SMOOTHNESS || process.env.ECLIPSE_SMOKE_DIAGNOSTICS === '1') app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.on('window-all-closed', () => {})
const realFetch = global.fetch
global.fetch = (url, options) => {
  const address=String(url)
  if(process.env.ECLIPSE_SMOKE_GLASS==='1') {
    if(address.includes('IStoreBrowseService/GetItems')) {
      const ids=JSON.parse(new URL(address).searchParams.get('input_json')).ids
      return Promise.resolve(Response.json({response:{store_items:ids.map(({appid})=>[3883570,4356780].includes(appid)
        ? {appid,assets:{asset_url_format:`steam/apps/${appid}/\${FILENAME}`,library_capsule:'fixture/library_capsule.jpg'}}
        : {appid:0,success:15})}}))
    }
    if(address.includes('/api/storesearch/')) {
      const name=new URL(address).searchParams.get('term')
      const id={'Invokyr':3883570,'Screen Stocks':4356780}[name]
      return Promise.resolve(Response.json({total:id?1:0,items:id?[{id,name}]:[]}))
    }
  }
  return /^http:\/\/127\.0\.0\.1:\d+\//.test(address) ? realFetch(url, options) : Promise.resolve(new Response('{}', { status: 503 }))
}
let server
const errors = []
const report = { electron: process.versions.electron, native: [], pages: [], errors }
const libraryFixture = process.env.ECLIPSE_SMOKE_LIBRARY === '1'
const stressStartup = process.env.ECLIPSE_SMOKE_STRESS === '1'
const navigationFixture = process.env.ECLIPSE_SMOKE_NAVIGATION === '1'
const pageMotionFixture = process.env.ECLIPSE_SMOKE_PAGES === '1'
const glassFixture = process.env.ECLIPSE_SMOKE_GLASS === '1'
const diagnosticsFixture = process.env.ECLIPSE_SMOKE_DIAGNOSTICS === '1'
const fixtureIds = Array.from({ length: stressStartup ? 590 : 9 }, (_, index) => 980001 + index)
let coverRequests = 0
let coversSent = 0
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(contents, expression, timeout = 15000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await contents.executeJavaScript(expression)) return
    await wait(100)
  }
  throw new Error('Renderer readiness timeout: ' + expression)
}

app.whenReady().then(async () => {
  try {
    assetProtocol.initAssetProtocol(path.join(bundle, 'dist'))
    // Loading a native module must work with the new Electron without a local C++ toolchain.
    for (const name of ['uiohook-napi', 'utp-native', 'node-datachannel']) {
      bundleRequire(name)
      report.native.push(name)
    }
    // Use one loader instance so window and network handlers share the same trusted-window set.
    const load = loadTs({}, { dirname: path.join(bundle, 'dist-electron') })
    const security = load('electron/ipcSecurity.ts')
    load('electron/networkService.ts').initNetworkIPC()
    let settings = { language: 'de', username: 'Smoke Test', clipsEnabled: false, autoCheckUpdates: false, welcomeCompleted: true }
    const startupView = process.env.ECLIPSE_SMOKE_STARTUP_VIEW
    if (startupView === 'clips' || startupView === 'library') settings = { ...settings, launchInClips: startupView === 'clips', launchInLibrary: startupView === 'library' }
    let fpsAccessReady = false
    let freeGamesChecks = 0
    const freeGamesFixture = process.env.ECLIPSE_SMOKE_FREE_GAMES === '1'
    let radarGames = freeGamesFixture ? require('./free-games-smoke.cjs').offers : []
    const freeGameLinks = []
    let failFreeGameLink = true
    const empty = {
      'window:get-state': event => { const owner = BrowserWindow.fromWebContents(event.sender); return { visible: owner?.isVisible() ?? false, minimized: owner?.isMinimized() ?? false, focused: owner?.isFocused() ?? false } },
      'system:get-auto-launch': () => ({ supported: false, registered: false, enabled: false, blocked: false, minimized: false }),
      'settings:get': () => settings,
      'app:switch-mode': (_event, mode) => { report.modeSwitches ||= []; report.modeSwitches.push(mode); return { success: true } },
      'open-friends-window': () => { report.friendWindowOpens = (report.friendWindowOpens || 0) + 1; return { success: true } },
      'overlay:show-clip-toast': () => { report.clipToastTests = (report.clipToastTests || 0) + 1; return { success: true } },
      'clips:capture-active': () => ({ success: true }),
      'games:register-installed': () => ({ registered: 0 }),
      'app:get-default-download-path': () => path.join(temporary, 'Downloads'),
      'fps:get-access': () => ({supported:true,ready:fpsAccessReady,pending:false,status:'idle'}),
      'fps:enable-access': () => {fpsAccessReady=true;report.fpsAccessRequests=(report.fpsAccessRequests||0)+1;return{success:true}},
      'settings:set': (_event, patch) => { settings = { ...settings, ...patch }; return { success: true } },
      'games:scan': () => ({ success: true, games: libraryFixture ? [...fixtureIds.map((id, index) => ({
        id: `steam_${id}`, steamId: id, appId: String(id), name: navigationFixture && index === 0 ? 'Rocket League' : `Startup Game ${index + 1}`,
        platform: 'steam', installPath: '', launchUrl: `steam://rungameid/${id}`, installed: true,
      })), ...(glassFixture ? [{id:'steam_4704030',steamId:4704030,name:'Invokyr Demo',platform:'steam',installed:true}, {id:'steam_5124200',steamId:5124200,name:'Screen Stocks Demo',platform:'steam',installed:true}] : [])] : [] }),
      'games:current': () => null,
      'rl:get-state': () => null,
      'playtime:get': () => ({}),
      'theme:get-pending': () => null,
      'util:fetch': () => null,
      'system:get-hardware-specs': () => null,
      'account:get-identity': () => null,
      'account:get-device-anchor': () => null,
      'account:save-identity': (_event, identity) => identity,
      'sources:get-all-cached': () => [],
      'clips:list': () => [],
      'clips:get-settings': () => ({ enabled: false, hotkey: 'F8', quality: '720p', fps: 30, replayDurationSeconds: 30 }),
      'overlay:get-current-state': () => ({ gameData: { name: 'Smoke Test', startTime: Date.now(), settings: { crosshair: true, overlayController: true, rlControllerSkin: 'ps5_white' } }, isEditMode: false }),
      'controller:get-battery': () => ({ connected: false }),
      'stream:status': () => ({ isOpen: false, title: 'Smoke Test' }),
      'stream:get-sources': () => [],
      'clips:get-sources': () => [],
      'storage:get-drives': () => [],
      'freegames:get-cached': () => radarGames,
      'system:open-url': (_event, url, fallbackUrl) => {
        const success = !(freeGamesFixture && failFreeGameLink && url.includes('gog.com'))
        if (!success) failFreeGameLink = false
        freeGameLinks.push({ url, fallbackUrl, success })
        return { success }
      },
      'freegames:check-now': () => {
        freeGamesChecks++
        if (freeGamesFixture) {
          radarGames = radarGames.map(game => ({ ...game, id: game.id + '-refreshed' }))
          return { success: true, games: radarGames, found: radarGames.length, newAlerts: 0 }
        }
        if(freeGamesChecks===2) return {success:false,games:[],found:0,newAlerts:0}
        radarGames=freeGamesChecks===3?[]:[{id:'radar-fixture',title:'Giveaway Fixture',platform:'Epic Games',url:'https://store.epicgames.com/p/fixture',originalPrice:'19,99 €'}]
        return {success:true,games:radarGames,found:radarGames.length,newAlerts:0}
      },
      'vpn:detect': () => [],
      'vpn:status': () => ({ isConnected: false }),
    }
    const channels = new Set()
    for (const file of fs.readdirSync(path.join(root, 'electron')).filter(file => file.endsWith('.ts'))) {
      for (const match of fs.readFileSync(path.join(root, 'electron', file), 'utf8').matchAll(/(?:ipcMain\.handle|ipcRenderer\.invoke)\('([^']+)'/g)) channels.add(match[1])
    }
    channels.delete('network:request')
    channels.delete('artwork:prefetch')
    if (diagnosticsFixture) channels.delete('capture:prepare')
    for (const channel of channels) {
      security.ipcMain.handle(channel, empty[channel] || (() => ({ success: true })))
    }
    security.ipcMain.on('account:get-identity-sync', event => { event.returnValue = null })
    // Test pages cannot sign in, sync profiles, download assets or mutate any live account.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const diagnosticImage = diagnosticsFixture && /\/steam\/apps\/(990001|990002)\/library_600x900\.jpg$/.exec(details.url)
      if (diagnosticImage) { callback({}); return }
      const demoPoster=glassFixture && /\/steam\/apps\/(3883570|4356780)\/fixture\/library_capsule.jpg$/.exec(details.url)
      if(demoPoster){callback({});return}
      if (pageMotionFixture && /\/games_db\.json$/.test(details.url)) {
        callback({ redirectURL: `http://127.0.0.1:${server.address().port}/catalogue-db` })
        return
      }
      const poster = /\/apps\/(\d+)\/library_600x900\.jpg$/.exec(details.url)
      if (libraryFixture && poster && fixtureIds.includes(Number(poster[1]))) {
        callback({})
        return
      }
      callback({ cancel: /^https?:/.test(details.url) && !details.url.startsWith('http://127.0.0.1:') })
    })
    session.defaultSession.setPermissionCheckHandler((contents, permission) => diagnosticsFixture && security.isTrustedWebContents(contents) && ['media','display-capture'].includes(permission))
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(diagnosticsFixture && security.isTrustedWebContents(contents) && ['media','display-capture'].includes(permission)))
    server = http.createServer((request, response) => {
      if (diagnosticsFixture && request.url.startsWith('/diagnostic-image/')) {
        const available = request.url.endsWith('/990001')
        response.writeHead(available ? 200 : 404, { 'Content-Type': available ? 'image/svg+xml' : 'text/plain' })
        response.end(available ? '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#db6226"/></svg>' : 'Not found')
        return
      }
      if(glassFixture && request.url.startsWith('/demo-cover/')) {
        response.writeHead(200,{'Content-Type':'image/svg+xml','Access-Control-Allow-Origin':'*','Cache-Control':'public, max-age=3600'})
        response.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#692d1a"/><circle cx="300" cy="420" r="180" fill="#d26935"/></svg>')
        return
      }
      if (pageMotionFixture && request.url === '/catalogue-db') {
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })
          response.end(JSON.stringify(Array.from({length:process.env.ECLIPSE_SMOKE_I18N==='1'?1234:90}, (_, index) => ({
            id: 16000001 + index, name: `Catalogue Motion ${index + 1}`, developer: 'Motion Studio',
            publisher: 'Motion Publisher', positive: 1000-index, negative: 1, ccu: 500-index,
            price: '999', initialprice: '999', discount: '0', year: 2025,
          }))))
        }, 900)
        return
      }
      if (libraryFixture && request.url.startsWith('/cover/')) {
        coverRequests++
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' })
          response.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#db6226"/></svg>')
          coversSent++
            }, stressStartup ? 5 : 2500)
        return
      }
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"smoke":true}')
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    // Serve fixture responses without HTTP redirects: production prefetch
    // deliberately rejects redirects to keep requests on public Steam hosts.
    session.defaultSession.protocol.handle('https', request => {
      const poster = /\/apps\/(\d+)\/library_600x900\.jpg$/.exec(request.url)
      const demo = /\/steam\/apps\/(3883570|4356780)\/fixture\/library_capsule.jpg$/.exec(request.url)
      const diagnostic = /\/steam\/apps\/(990001|990002)\/library_600x900\.jpg$/.exec(request.url)
      const route = diagnosticsFixture && diagnostic ? `/diagnostic-image/${diagnostic[1]}`
        : glassFixture && demo ? `/demo-cover/${demo[1]}`
        : libraryFixture && poster && fixtureIds.includes(Number(poster[1])) ? `/cover/${poster[1]}` : null
      return route ? require('electron').net.fetch(`http://127.0.0.1:${server.address().port}${route}`) : new Response('Not found', { status: 404 })
    })
    if (process.env.ECLIPSE_BENCHMARK) {
      const samples = []
      for (let run = 0; run < 3; run++) {
        await session.defaultSession.clearStorageData()
        const window = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: {
          preload: path.join(bundle, 'dist-electron/preload.js'), contextIsolation: true,
          nodeIntegration: false, sandbox: true, webSecurity: true, backgroundThrottling: true,
        } })
        security.secureAppWindow(window)
        const start = performance.now()
        await window.loadFile(path.join(bundle, 'dist/index.html'))
        await waitFor(window.webContents, `!document.querySelector('.splash-screen-overlay') && !!document.querySelector('#nav-home') && !!document.querySelector('main h2')`)
        const interactiveMs = Math.round(performance.now() - start)
        await wait(6000)
        window.webContents.debugger.attach('1.3')
        await window.webContents.debugger.sendCommand('Performance.enable')
        const getMetrics = async () => Object.fromEntries((await window.webContents.debugger.sendCommand('Performance.getMetrics')).metrics.map(m => [m.name, m.value]))
        const before = await getMetrics()
        await wait(2000)
        const after = await getMetrics()
        samples.push({ run: run + 1, interactiveMs, heapMiB: Math.round(after.JSHeapUsedSize / 1048576 * 10) / 10, idleMainThreadMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000) })
        window.destroy()
      }
      const result = { mode: 'isolated offline renderer, GPU disabled, fresh storage per run; file cache may be warm', samples }
      const target = path.join(root, 'tests', `performance-${process.env.ECLIPSE_BENCHMARK}.json`)
      fs.writeFileSync(target, JSON.stringify(result, null, 2))
      console.log(JSON.stringify(result, null, 2))
      app.exit(0)
      return
    }
    for (const [page, hash, selector] of [
      ['index.html', '', '#root'],
      ['index.html', 'friends', '#root'],
      ['index.html', 'steam-monitor', '#root'],
      ['overlay.html', '', '#overlay-root'],
      ['stream.html', '', '#stream-root'],
    ]) {
      const window = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: {
        additionalArguments: process.env.ECLIPSE_SMOKE_CLIPS_MODE === '1' ? ['--eclipse-clips-mode'] : [],
        preload: path.join(bundle, 'dist-electron/preload.js'), contextIsolation: true, nodeIntegration: false,
        sandbox: true, webSecurity: true, backgroundThrottling: false,
      } })
      const firstPaint = new Promise(resolve => window.once('ready-to-show', resolve))
      security.secureAppWindow(window)
      window.webContents.on('console-message', event => {
        if (event.level === 'error' && !/ERR_BLOCKED_BY_CLIENT|Firebase|auth\/network-request-failed|Firestore|social|HLS|network-request-failed|fetchSteamProfile/.test(event.message)) errors.push({ page, hash, message: event.message })
      })
      window.webContents.on('preload-error', (_event, _preload, error) => errors.push({ page, hash, message: error.message }))
      window.webContents.on('render-process-gone', (_event, detail) => errors.push({ page, hash, message: detail.reason }))
      if (libraryFixture && page === 'index.html' && !hash) {
        window.webContents.on('dom-ready', () => { void window.webContents.executeJavaScript(`(() => {
          window.__launchNodes=[];window.__launchPeak=0;window.__forcedDecodes=0;window.__postStartupDecodes=0;window.__maxStartupLag=0;
          const originalDecode=HTMLImageElement.prototype.decode;
          // The visible store banner deliberately decodes its hero and logo
          // after handoff. Only active library preparation must avoid bitmaps.
          HTMLImageElement.prototype.decode=function(...args){if(document.querySelector('.splash-screen-overlay:not([data-closing])'))window.__forcedDecodes++;else window.__postStartupDecodes++;return originalDecode.apply(this,args)};
          const observe=()=>{const nodes=[...document.querySelectorAll('.launch-screen')];window.__launchPeak=Math.max(window.__launchPeak,nodes.length);nodes.forEach(n=>{if(!window.__launchNodes.includes(n))window.__launchNodes.push(n)})};
          new MutationObserver(observe).observe(document.body,{childList:true,subtree:true});observe();
          let last=performance.now();window.__lagTimer=setInterval(()=>{const now=performance.now();window.__maxStartupLag=Math.max(window.__maxStartupLag,now-last-50);last=now},50);
        })()`).catch(error => errors.push({page,message:error.message})) })
      }
      const manualStart = process.env.ECLIPSE_SMOKE_MANUAL === '1' && page === 'index.html' && !hash
      if (manualStart) {
        await window.loadFile(path.join(bundle, 'dist/index.html'), { hash: 'launch-preview' })
        await window.webContents.executeJavaScript(`localStorage.setItem('gamehub-store',JSON.stringify({version:0,state:{settings:{language:'de',username:'Smoke Test',autoScanSplash:false,autoCheckUpdates:false,autoScan:false,scanUninstalledSteam:false,welcomeCompleted:true}}}))`)
      }
      await window.loadFile(path.join(bundle, 'dist', page), { hash })
      await waitFor(window.webContents, `document.querySelector(${JSON.stringify(selector)})?.childElementCount > 0`)
      // DOM readiness can precede GPU surface creation in an initially hidden window.
      // Capturing before the first paint can fail with Electron's UnknownVizError.
      await Promise.race([firstPaint, wait(2000)])
      if (process.env.ECLIPSE_SMOKE_CLIPS_MODE === '1' && page === 'index.html' && !hash) {
        report.clipsMode = await require('./clips-mode-smoke.cjs')(window, path.join(root, '.cache/clips-mode'), report)
        assert.deepEqual(errors, [])
        window.destroy(); bundleRequire('node-datachannel').cleanup(); await wait(50)
        server.closeAllConnections(); server.close()
        fs.writeFileSync(path.join(root, '.cache/clips-mode/result.json'), JSON.stringify(report, null, 2))
        console.log(JSON.stringify(report, null, 2)); app.exit(0); return
      }
      if (process.env.ECLIPSE_SMOKE_ATMOSPHERE === '1') {
        if (page === 'index.html' && !hash) {
          await waitFor(window.webContents, `!!document.querySelector('.launcher-atmosphere')`)
          assert.equal(await window.webContents.executeJavaScript(`(() => {window.__startupAtmosphere=document.querySelector('.launcher-atmosphere');return !window.__startupAtmosphere.hasAttribute('data-visible')})()`), true, 'The atmosphere must remain hidden while loading')
        } else assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.launcher-atmosphere')`), false, 'Standalone windows must not allocate the launcher background')
      }
      if (page === 'overlay.html' && process.env.ECLIPSE_SMOKE_OVERLAY === '1') {
        const config = { performance:true, crosshair:true, overlayController:true, metrics:{fps:true,cpu:true,gpu:true,ram:true,time:true}, language:'de' }
        // The only initial snapshot may arrive before React mounts the widget.
        window.webContents.send('metrics:update', {cpu:63,gpu:57,ram:96,idleTime:0,gameFps:144,gameFpsPid:123,gameFpsStatus:'ready',gameFpsSource:'presentmon'})
        window.webContents.send('overlay:update', {name:'Fixture Game',pid:123,settings:config})
        await waitFor(window.webContents, `!!document.getElementById('widget-performance')`)
        await waitFor(window.webContents, `document.getElementById('widget-performance')?.innerText.includes('144')`)
        const widgetRect = await window.webContents.executeJavaScript(`(()=>{const r=document.querySelector('#widget-performance [data-fps-status]').getBoundingClientRect();return{x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)}})()`)
        fs.mkdirSync(path.join(root,'.cache/overlay-audit'),{recursive:true})
        fs.writeFileSync(path.join(root,'.cache/overlay-audit/widget-ready.png'),(await window.webContents.capturePage(widgetRect)).toPNG())
        window.webContents.send('overlay:update', {name:'Another Game',pid:456,settings:config})
        await waitFor(window.webContents, `document.getElementById('widget-performance') && !document.getElementById('widget-performance').innerText.includes('144')`)
        window.webContents.send('overlay:update', {name:'Fixture Game',pid:123,settings:config})
        assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.getElementById('overlay-root'),'::after').content`), 'none', 'Film grain must never cover the transparent game window')
        window.webContents.send('metrics:update', {cpu:63,gpu:57,ram:96,idleTime:0,gameFpsPid:123,gameFpsStatus:'permission-required'})
        await waitFor(window.webContents, `document.querySelector('#widget-performance [data-fps-status="permission-required"]')?.innerText.includes('Zugriff')`)
        const deniedWidth=await window.webContents.executeJavaScript(`document.querySelector('#widget-performance [data-fps-status]').getBoundingClientRect().width`)
        assert.ok(Math.abs(deniedWidth-widgetRect.width)<=1,'Permission status must not resize the widget')
        fs.writeFileSync(path.join(root,'.cache/overlay-audit/widget-access.png'),(await window.webContents.capturePage(widgetRect)).toPNG())
        window.webContents.send('overlay:edit-start', {name:'Fixture Game',settings:config})
        await wait(100)
        const drag=await window.webContents.executeJavaScript(`(() => {const widget=document.getElementById('widget-performance');const rect=widget.getBoundingClientRect();widget.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,clientX:rect.x+8,clientY:rect.y+8,button:0}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:150,clientY:100}));window.dispatchEvent(new MouseEvent('mousemove',{clientX:400,clientY:200}));window.dispatchEvent(new MouseEvent('mouseup',{clientX:700,clientY:260}));return {expectedX:692,expectedY:252}})()`)
        await wait(100)
        const actual=await window.webContents.executeJavaScript(`(() => {const r=document.getElementById('widget-performance').getBoundingClientRect();return{x:r.x,y:r.y}})()`)
        assert.ok(Math.abs(actual.x-drag.expectedX)<2 && Math.abs(actual.y-drag.expectedY)<2, `Drag must commit the final pointer coordinate: ${JSON.stringify(actual)}`)
        window.webContents.send('overlay:edit-end')
        report.overlayWidgets={fpsDisplay:true,initialSnapshotReplayed:true,noPreviousGameFps:true,permissionStatus:true,finalDragPosition:true,noFullscreenGrain:true}
      }
      if (page === 'index.html' && !hash) {
        if (manualStart) {
          await waitFor(window.webContents, `[...document.querySelectorAll('.launch-screen button')].some(b=>b.textContent.includes('Eclipse starten'))`)
          await window.webContents.executeJavaScript(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
          await waitFor(window.webContents, `!document.body.classList.contains('performance-mode')`)
          window.setSize(1024, 640)
          await wait(400)
          assert.equal(await window.webContents.executeJavaScript(`(() => {const button=[...document.querySelectorAll('.launch-screen button')].find(b=>b.textContent.includes('Eclipse starten'));return button.getBoundingClientRect().bottom < innerHeight})()`), true, 'Manual start button remains visible at minimum window size')
          fs.mkdirSync(path.join(root, '.cache/launch-preview'), { recursive: true })
          fs.writeFileSync(path.join(root, '.cache/launch-preview/manual-start.png'), (await window.webContents.capturePage()).toPNG())
          await window.webContents.executeJavaScript(`[...document.querySelectorAll('.launch-screen button')].find(b=>b.textContent.includes('Eclipse starten')).click()`)
          window.setSize(1400, 900)
          report.manualStart = 'passed at 1024x640'
        }
        if (libraryFixture) {
          if (!stressStartup) await waitFor(window.webContents, `document.querySelector('.launch-screen__status')?.textContent.includes('/ ${fixtureIds.length + (glassFixture ? 2 : 0)}')`)
          else await waitFor(window.webContents, `!!document.querySelector('.splash-screen-overlay')`)
          await window.webContents.executeJavaScript(`Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'))`)
          if (!stressStartup) {
            await wait(3800)
            assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.splash-screen-overlay')`), true, 'The screen must outlive its minimum duration while posters are still loading')
            assert.ok(coversSent < fixtureIds.length)
          }
          fs.mkdirSync(path.join(root, '.cache/launch-preview'), { recursive: true })
          fs.writeFileSync(path.join(root, '.cache/launch-preview/preparing-library.png'), (await window.webContents.capturePage()).toPNG())
        }
        await waitFor(window.webContents, `!document.querySelector('.splash-screen-overlay') && !!document.querySelector('#nav-home')`)
        if (startupView === 'clips' || startupView === 'library') {
          await waitFor(window.webContents, `!!document.querySelector('[data-view-scene="${startupView}"]')`)
          await window.webContents.executeJavaScript('document.getElementById("nav-home").click()')
          await waitFor(window.webContents, '!!document.querySelector(\'[data-view-scene="home"]\')')
          report.startupView = { restoredFromSavedSettings: startupView, subsequentNavigationWorks: true }
        }
        if (libraryFixture) {
          assert.equal(coversSent, fixtureIds.length)
          const stability = await window.webContents.executeJavaScript(`(() => {clearInterval(window.__lagTimer);return {surfaces:window.__launchNodes.length,peak:window.__launchPeak,forcedDecodes:window.__forcedDecodes,postStartupDecodes:window.__postStartupDecodes,maxLagMs:Math.round(window.__maxStartupLag)}})()`)
          assert.equal(stability.surfaces, 1, 'Bootstrap and progress must reuse one loading surface')
          assert.equal(stability.peak, 1)
          assert.equal(stability.forcedDecodes, 0, 'Preloading must not force-decode the entire library')
          if (stressStartup) assert.ok(stability.maxLagMs < 1500, 'Large-library startup must remain responsive')
          report.libraryReadiness = { postersReady: coversSent, heldBeyondMinimum: !stressStartup, ...stability }
        }
        await wait(300)
        await window.webContents.executeJavaScript(`(() => { if(document.body.innerText.includes('Versionshinweise')) [...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Schließen')?.click() })()`)
        if (pageMotionFixture) {
          report.pageMotion=await require('./page-motion-smoke.cjs')(window,path.join(root,'.cache/page-motion'))
        }
        if(process.env.ECLIPSE_SMOKE_I18N==='1') report.translations=await require('./translations-smoke.cjs')(window,path.join(root,'.cache/i18n'))
        if(process.env.ECLIPSE_SMOKE_PROFILE==='1') report.profileControls=await require('./profile-controls-smoke.cjs')(window,path.join(root,'.cache/profile-controls'))
        if(diagnosticsFixture) report.startupDiagnostics=await require('./startup-diagnostics-smoke.cjs')(window,path.join(root,'.cache/startup-diagnostics'))
        if(process.env.ECLIPSE_SMOKE_SCROLL) report.scrollPerformance=await require('./scroll-performance-smoke.cjs')(window,path.join(root,'.cache',`scroll-${process.env.ECLIPSE_SMOKE_SCROLL==='before'?'before':'after'}`))
        if(process.env.ECLIPSE_SMOKE_SMOOTHNESS) {
          await require('./smoothness-smoke.cjs')(window,path.join(root,'.cache/smoothness-20261108',process.env.ECLIPSE_SMOKE_SMOOTHNESS))
          window.destroy();server.closeAllConnections();server.close();app.exit(0);return
        }
        if(glassFixture) report.glassRadar=await require('./glass-radar-smoke.cjs')(window,path.join(root,'.cache/glass-radar'))
        if(freeGamesFixture) report.freeGameClaims=await require('./free-games-smoke.cjs')(window,path.join(root,'.cache/free-games'),freeGameLinks)
        if (process.env.ECLIPSE_SMOKE_ATMOSPHERE === '1') {
          report.atmosphere = await require('./launcher-atmosphere-smoke.cjs')(window, path.join(root, '.cache/launcher-atmosphere'))
        }
        if (navigationFixture && libraryFixture) {
          report.installedGameHomeNavigation=await require('./game-preview-navigation.cjs')(window)
        }
        if(process.env.ECLIPSE_SMOKE_MOTION==='1') {
          report.uiMotion=await require('./ui-motion-smoke.cjs')(window,path.join(root,'.cache/launcher-atmosphere'))
        }
        for (const view of ['catalogue', 'library', 'downloads', 'settings', 'home']) {
          assert.equal(await window.webContents.executeJavaScript(`(() => { const button=document.getElementById('nav-${view}'); if(!button)return false; button.click(); return true })()`), true)
          await wait(400)
          if(view==='settings' && process.env.ECLIPSE_SMOKE_OVERLAY==='1'){
            await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Gameplay Overlay').click()`)
            await waitFor(window.webContents,`!!document.getElementById('overlay-performance-toggle')`)
            await window.webContents.executeJavaScript(`document.getElementById('overlay-performance-toggle').click()`)
            await waitFor(window.webContents,`!!document.getElementById('fps-enable-access')`)
            assert.equal(report.fpsAccessRequests||0,0,'Opening settings must not trigger elevation')
            await window.webContents.executeJavaScript(`document.getElementById('fps-enable-access').click()`)
            await waitFor(window.webContents,`document.getElementById('fps-enable-access')?.textContent.includes('Bereit')`)
            assert.equal(report.fpsAccessRequests,1)
          }
          if (libraryFixture && view === 'library') {
            window.webContents.invalidate()
            await window.webContents.capturePage()
            try {
              await waitFor(window.webContents, `(() => {const imgs=[...document.querySelectorAll('main img[alt^="Startup Game"], main img[alt="Rocket League"]')];return imgs.length>=${stressStartup ? 6 : fixtureIds.length} && imgs.slice(0,${stressStartup ? 6 : fixtureIds.length}).every(img=>img.complete&&img.naturalWidth>0&&img.src.includes('library_600x900.jpg'))})()`)
            } catch (error) {
              console.error(await window.webContents.executeJavaScript(`({text:document.querySelector('main')?.innerText,images:[...document.querySelectorAll('main img')].map(img=>({alt:img.alt,src:img.src.slice(0,140),width:img.naturalWidth,complete:img.complete}))})`))
              throw error
            }
            assert.equal(coverRequests, fixtureIds.length, 'The library must reuse the prepared poster cache')
            report.libraryReadiness.reusedPreparedPosters = true
          }
          assert.equal(await window.webContents.executeJavaScript(`document.body.innerText.includes('Ein unerwarteter Fehler ist aufgetreten')`), false, view)
        }
        report.views = ['home', 'catalogue', 'library', 'downloads', 'settings']
        // Verify the focused UI keeps its effects, then exercise the native
        // minimize/restore notifications without showing a desktop window.
        await window.webContents.executeJavaScript(`Object.defineProperty(document,'hidden',{configurable:true,value:false}); Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}); window.dispatchEvent(new Event('focus'))`)
        await waitFor(window.webContents, `!document.body.classList.contains('performance-mode')`)
        window.webContents.send('app:minimized')
        await waitFor(window.webContents, `document.body.classList.contains('app-minimized')`)
        if (process.env.ECLIPSE_SMOKE_ATMOSPHERE === '1') assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.launcher-atmosphere__ember')).animationPlayState`), 'paused')
        assert.equal(await window.webContents.executeJavaScript(`(() => { const probe=document.createElement('div');probe.id='performance-probe';probe.style.animation='spin 1s linear infinite';document.body.append(probe);return getComputedStyle(probe).animationPlayState })()`), 'paused')
        window.webContents.send('app:restored')
        await waitFor(window.webContents, `!document.body.classList.contains('app-minimized')`)
        assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.getElementById('performance-probe')).animationPlayState`), 'running')
        await window.webContents.executeJavaScript(`document.getElementById('performance-probe').remove()`)
        for (let cycle = 0; cycle < 12; cycle++) {
          window.webContents.send('app:minimized')
          await waitFor(window.webContents, `document.body.classList.contains('app-minimized')`)
          await window.webContents.executeJavaScript(`window.dispatchEvent(new Event('focus'))`)
          await waitFor(window.webContents, `!document.body.classList.contains('app-minimized')`)
        }
        report.missedRestoreRecovery = { cycles: 12, repairedByFocus: true }
        report.performanceStates = ['focused effects', 'minimized animations paused', 'restored animations running']
        if (libraryFixture) {
          const previousRequests = coverRequests
          window.reload()
          await waitFor(window.webContents, `!!document.querySelector('.splash-screen-overlay')`)
          await waitFor(window.webContents, `!document.querySelector('.splash-screen-overlay') && !!document.querySelector('#nav-home')`)
          assert.equal(coverRequests, previousRequests, 'A renderer restart must reuse the persisted HTTP image cache')
          report.libraryReadiness.reusedAfterReload = true
        }
      }
      const ipc = await window.webContents.executeJavaScript(`window.electronAPI.requestText({id:crypto.randomUUID(),url:'http://127.0.0.1:${server.address().port}/smoke'}).then(r => JSON.parse(r.body).smoke)`)
      assert.equal(ipc, true, 'Guarded HTTP bridge must work from each application page')
      assert.equal(await window.webContents.executeJavaScript('typeof require'), 'undefined')
      report.pages.push({ page, hash, title: await window.webContents.executeJavaScript('document.title') })
      await wait(800)
      if (page === 'index.html' && !hash) {
        const capture = await window.webContents.capturePage()
        fs.writeFileSync(path.join(root, 'tests/electron-smoke.png'), capture.toPNG())
      }
      window.destroy()
    }
    // Exercise each real controller iframe under exactly the application CSP.
    const controllerWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, webSecurity: true } })
    await controllerWindow.loadFile(path.join(bundle, 'dist/index.html'))
    // Stop application initialization in this window: only the iframe behavior is under test here.
    await controllerWindow.webContents.executeJavaScript(`document.body.innerHTML=''; window.controllerErrors=[]; window.addEventListener('securitypolicyviolation',e=>window.controllerErrors.push(e.violatedDirective));`)
    await controllerWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const f=document.createElement('iframe');f.sandbox='allow-scripts';f.src='eclipse-asset://bundle/controller-skins/controller.html?skin=ps5_white';f.onload=()=>resolve(true);f.onerror=reject;document.body.append(f)})`)
    await wait(500)
    const frames = controllerWindow.webContents.mainFrame.frames
    assert.equal(frames.length, 1)
    await controllerWindow.webContents.executeJavaScript(`document.querySelector('iframe').contentWindow.postMessage({type:'gamepad-state',buttons:[{pressed:true,value:1}],axes:[0,0,0,0]},'*')`)
    await wait(100)
    const controllerState = await frames[0].executeJavaScript(`({script:!!document.querySelector('script[src]'),skin:document.getElementById('controller').className,pressed:document.getElementById('btn-a').classList.contains('pressed')})`)
    report.controller = controllerState
    assert.equal(controllerState.script, true)
    assert.equal(controllerState.pressed, true)
    assert.deepEqual(await controllerWindow.webContents.executeJavaScript('window.controllerErrors'), [])
    controllerWindow.destroy()
    assert.deepEqual(errors, [])
    // Native WebRTC owns background workers even in this import-only test.
    // Release them before Electron tears down Node's environment.
    bundleRequire('node-datachannel').cleanup()
    // Native thread-safe callbacks finish releasing on the next libuv turn.
    // Exiting Electron synchronously here can deadlock Node environment teardown.
    await wait(50)
    report.nativeCleanup = true
    server?.closeAllConnections()
    server?.close()
    console.log(JSON.stringify(report, null, 2))
    fs.writeFileSync(path.join(root, 'tests/electron-smoke-result.json'), JSON.stringify(report, null, 2))
    app.exit(0)
  } catch (error) {
    console.error(error)
    console.error(JSON.stringify(report, null, 2))
    app.exit(1)
  } finally {
    server?.close()
  }
}).catch(error => { console.error(error); app.exit(1) })

// The optional page suite adds twenty-seven UI transitions and captured frames.
setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1) }, pageMotionFixture || glassFixture || process.env.ECLIPSE_SMOKE_SMOOTHNESS || process.env.ECLIPSE_SMOKE_PROFILE==='1' ? 120_000 : 60_000).unref()
