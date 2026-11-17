const { app, session, protocol } = require('electron')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const loadTs = require('./download-loader.cjs')
const root = path.resolve(__dirname, '..'), output = path.join(root, '.cache/overlay-runtime')
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const work = { inputs: false, controller: false }
const load = loadTs({
  './metricsService': { startMetricsService() {}, stopMetricsService() {} },
  './inputService': { startInputService() { work.inputs = true }, stopInputService() { work.inputs = false } },
  './gamepadService': { acquireGamepadService() { work.controller = true }, releaseGamepadService() { work.controller = false } },
  './streamManager': { updateStreamGameTitle() {} },
}, { dirname: path.join(root, 'dist-electron') })
const assets = load('electron/assetProtocol.ts')
load('electron/overlayWindowEffects.ts').disableChromiumWindowAnimations()
protocol.registerSchemesAsPrivileged([assets.ASSET_SCHEME])
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.on('window-all-closed', () => {})
let manager, hud, settings = { language: 'de', overlayGeneralAlwaysOn: true, overlayPerformance: true }
const errors = [], events = []
let settingsWrites = 0
const mediaCommands = []
let fixtureMedia={isPlaying:false,title:'',artist:'',app:null},mediaDelay=0,mediaFailure=false
const until = async (fn, timeout = 12000) => {
  const end = Date.now() + timeout
  while (Date.now() < end) { if (await fn()) return; await wait(40) }
  throw Error('Overlay runtime timeout: ' + fn)
}
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  assets.initAssetProtocol(path.join(root, 'dist'))
  const security = load('electron/ipcSecurity.ts')
  security.ipcMain.on('account:get-identity-sync', event => { event.returnValue = null })
  security.ipcMain.handle('settings:get', () => settings)
  security.ipcMain.handle('rl:get-state', () => null)
  security.ipcMain.handle('settings:set', (_event, patch) => { settingsWrites++; settings = { ...settings, ...patch }; return { success: true } })
  security.ipcMain.handle('sources:get-all-cached', () => [])
  security.ipcMain.handle('media:get-status', () => fixtureMedia)
  security.ipcMain.handle('media:set-filter',()=>({success:true}))
  security.ipcMain.handle('media:subscribe', () => true)
  security.ipcMain.handle('media:unsubscribe', () => true)
  security.ipcMain.handle('rl:fetch-steam-avatar', () => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="56" height="56" fill="#e8a56e"/></svg>'))
  for (const action of ['play-pause', 'previous', 'next']) security.ipcMain.handle('media:' + action, async (_event,filter,sessionId) => { mediaCommands.push(action);if(process.env.ECLIPSE_MEDIA_WIDGET==='1'){assert.equal(filter,'spotify');assert.equal(sessionId,'Spotify.Session')}if(mediaDelay)await wait(mediaDelay);return {success:!mediaFailure} })
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) && (!process.env.VITE_DEV_SERVER_URL || new URL(details.url).origin !== new URL(process.env.VITE_DEV_SERVER_URL).origin) }))
  const build = load('electron/overlayState.ts').buildOverlayData
  manager = load('electron/overlayManager.ts')
  const update = patch => { settings = { ...settings, ...patch }; manager.showOverlay(build(settings, null)) }
  update({})
  hud = manager.getOverlayWindow()
  hud.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  hud.webContents.on('did-start-loading', () => events.push('loading'))
  hud.webContents.on('did-start-navigation', details => events.push(details.isMainFrame ? 'main-navigation' : 'child-navigation'))
  await until(() => hud.isVisible())
  if(process.platform==='win32')assert.equal(app.commandLine.hasSwitch('wm-window-animations-disabled'),true,'Cold native window shows must skip Aura compositor animations')
  if(process.platform==='win32') await load('electron/overlayWindowEffects.ts').disableOverlayWindowTransitions(hud)
  const evaluate = code => hud.webContents.executeJavaScript(code, true)
  const capture = async (name, widget = 'performance') => {
    const rect = await evaluate(`(()=>{const r=document.getElementById('widget-${widget}').getBoundingClientRect();return{x:Math.max(0,Math.floor(r.x)-6),y:Math.max(0,Math.floor(r.y)-6),width:Math.ceil(r.width)+12,height:Math.ceil(r.height)+12}})()`)
    for (let attempt = 0; attempt < 12; attempt++) {
      try { hud.webContents.invalidate(); fs.writeFileSync(path.join(output, name), (await hud.webContents.capturePage(rect)).toPNG()); return }
      catch (error) { if (!/UnknownVizError/.test(String(error)) || attempt === 11) throw error; await wait(100) }
    }
  }
  const geometry = () => evaluate(`Array.from(document.querySelectorAll('.overlay-widget')).filter(el=>el.firstElementChild).map(el=>{const r=el.getBoundingClientRect();return{id:el.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})`)
  if(process.env.ECLIPSE_MEDIA_WIDGET==='1'){
    const result=await require('./media-widget-smoke.cjs')({hud,evaluate,until,wait,capture,update,errors,mediaCommands,
      media:state=>{fixtureMedia=state;hud.webContents.send('media:update',state)},commandOptions:(delay,failed)=>{mediaDelay=delay;mediaFailure=failed}})
    fs.writeFileSync(path.join(output,'media-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));manager.hideOverlay(true);app.exit(0);return
  }
  if(process.env.ECLIPSE_OVERLAY_APPEARANCE==='1'){
    const probe=`(()=>{window.__appearance=[];let active=true;window.__stopAppearance=()=>{active=false};const sample=()=>{if(!active)return;const el=document.querySelector('.performance-hud');if(el){const rect=el.getBoundingClientRect(),s=getComputedStyle(el);window.__appearance.push({t:performance.now(),width:rect.width,height:rect.height,x:rect.x,y:rect.y,opacity:s.opacity,zoom:s.zoom,transform:s.transform,transition:s.transition,animations:el.getAnimations({subtree:true}).map(a=>a.animationName||'transition'),fonts:document.fonts.status})}requestAnimationFrame(sample)};requestAnimationFrame(sample);return true})()`
    const verify=frames=>{
      assert.ok(frames.length>=10)
      for(const frame of frames){
        assert.equal(frame.opacity,'1','Performance HUD starts at full opacity')
        assert.equal(Number(frame.zoom),1,'No separate CSS zoom layer')
        assert.equal(frame.transform,'none');assert.deepEqual(frame.animations,[])
        for(const dimension of ['width','height','x','y'])assert.ok(Math.abs(frame[dimension]-frames[0][dimension])<.1,JSON.stringify({dimension,first:frames[0],frame}))
      }
    }
    update({overlayCrosshair:true,overlayPerformance:false,overlayMetrics:{layout:'horizontal',background:'clear',scale:110}})
    await until(()=>evaluate('!!document.getElementById("widget-crosshair")&&!document.getElementById("widget-performance")'))
    const appearances=[]
    for(let index=0;index<3;index++){
      await evaluate(probe)
      update({overlayPerformance:true})
      await until(()=>evaluate('window.__appearance.length>=10&&window.__appearance.at(-1).t-window.__appearance[0].t>=400'))
      const frames=await evaluate('window.__stopAppearance();window.__appearance')
      verify(frames)
      appearances.push(frames)
      update({overlayPerformance:false})
      await until(()=>evaluate('!document.getElementById("widget-performance")'))
    }
    fs.writeFileSync(path.join(output,'appearance.json'),JSON.stringify(appearances,null,2))
    console.log(JSON.stringify(appearances.map(frames=>({frames:frames.length,first:frames[0],last:frames.at(-1)}))))
    update({overlayCrosshair:false,overlayPerformance:false})
    await until(()=>manager.getOverlayWindow()===null)
    update({overlayPerformance:true})
    hud=manager.getOverlayWindow()
    let shows=0
    hud.on('show',()=>shows++)
    hud.webContents.once('dom-ready',()=>{void evaluate(probe).catch(error=>errors.push(String(error)))})
    await until(()=>hud.isVisible())
    await until(()=>evaluate('window.__appearance?.length>=10&&window.__appearance.at(-1).t-window.__appearance[0].t>=400'))
    const coldFrames=await evaluate('window.__stopAppearance();window.__appearance')
    verify(coldFrames)
    update({overlayCrosshair:true})
    await until(()=>evaluate('!!document.getElementById("widget-crosshair")'))
    assert.equal(shows,1,'Adding the second widget must not show the native window again')
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(output,'cold-appearance.json'),JSON.stringify({chromiumWindowAnimationsDisabled:app.commandLine.hasSwitch('wm-window-animations-disabled'),nativeShows:shows,first:coldFrames[0],last:coldFrames.at(-1),frames:coldFrames.length,secondWidgetInstant:true,errors},null,2))
    console.log('Cold start and second widget passed')
    manager.hideOverlay(true);app.exit(0);return
  }
  await until(() => evaluate('!!document.getElementById("widget-performance")'))
  assert.equal(security.isTrustedWebContents(hud.webContents), true)
  assert.equal(hud.isFocusable(), false)
  update({ overlayController: true, rlControllerSkin: 'ps5_black' })
  await until(() => hud.webContents.mainFrame.frames.some(frame => frame.url.includes('controller.html')))
  await wait(800)
  const blackFrame = hud.webContents.mainFrame.frames.find(frame => frame.url.includes('skin=ps5_black'))
  await until(() => blackFrame.executeJavaScript('document.getElementById("controller").dataset.ready === "true"'))
  const blackSkin = await blackFrame.executeJavaScript(`(async()=>{
    const root=document.getElementById('controller'),style=getComputedStyle(root),size=root.getBoundingClientRect();
    const urls=[...new Set([root,...root.querySelectorAll('*')].map(el=>getComputedStyle(el).backgroundImage.match(/^url\\(["']?(.*?)["']?\\)$/)?.[1]).filter(Boolean))];
    const images=await Promise.all(urls.map(url=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve({url,width:image.naturalWidth,height:image.naturalHeight});image.onerror=()=>resolve({url,width:0,height:0});image.src=url})));
    return {width:size.width,height:size.height,visible:style.visibility,background:style.backgroundImage,images};
  })()`)
  assert.equal(blackSkin.width,794);assert.equal(blackSkin.height,639)
  assert.equal(blackSkin.visible,'visible')
  assert.ok(blackSkin.background.includes('/ps5_black/base.png'))
  assert.equal(blackSkin.images.length,7)
  for(const sprite of blackSkin.images){assert.ok(sprite.url.startsWith('eclipse-asset://bundle/controller-skins/ps5_black/'));assert.ok(sprite.width>0&&sprite.height>0,JSON.stringify(sprite))}
  await capture('ps5-midnight-black.png','rlController')
  assert.equal(hud.isVisible(), true, 'Loading a controller iframe must not hide the entire overlay')
  assert.equal(await evaluate('!!document.getElementById("widget-performance")'), true)
  assert.ok(events.includes('child-navigation'))
  for (const skin of ['ps5_white', 'xbox_one', 'ps5_black']) {
    update({ rlControllerSkin: skin })
    await until(() => hud.webContents.mainFrame.frames.some(frame => frame.url.includes('skin=' + skin)))
    await wait(180)
    assert.equal(hud.isVisible(), true)
  }
  let controller = hud.webContents.mainFrame.frames.find(frame => frame.url.includes('controller.html'))
  const buttons = Array.from({length: 17}, (_, index) => ({pressed: index === 0, value: index === 0 ? 1 : 0}))
  hud.webContents.send('overlay:gamepad-state', {connected: true, buttons, axes: [0, 0, 0, 0]})
  await until(() => controller.executeJavaScript('document.getElementById("btn-a").classList.contains("pressed")'))
  update({ rlControllerSkin: 'ps5_white' })
  await until(() => hud.webContents.mainFrame.frames.some(frame => frame.url.includes('skin=ps5_white')))
  controller = hud.webContents.mainFrame.frames.find(frame => frame.url.includes('controller.html'))
  await until(() => controller.executeJavaScript('document.getElementById("btn-a").classList.contains("pressed")'))
  hud.webContents.send('overlay:gamepad-state', {connected: false, buttons: [], axes: []})
  await until(async () => !await controller.executeJavaScript('document.getElementById("btn-a").classList.contains("pressed")'))
  await evaluate(`Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{connected:false,buttons:[{pressed:true,value:1}],axes:[0,0,0,0]}]});true`)
  await wait(1800)
  assert.equal(await controller.executeJavaScript('document.getElementById("btn-a").classList.contains("pressed")'),false,'A stale disconnected browser gamepad must not flash pressed buttons')
  assert.equal(await evaluate('document.getAnimations().length'), 0, 'Permanent widgets appear without entry animations')
  assert.equal(await evaluate('localStorage.getItem("gamehub-store")'), null, 'The HUD must not hydrate or rewrite the launcher library')
  assert.equal(settingsWrites, 0)
  const fixtureGame = { name: 'Fixture Game', startTime: Date.now() - 120000 }
  manager.showOverlay(build(settings, fixtureGame, 42))
  hud.webContents.send('metrics:update', { cpu: 24, gpu: 31, ram: 50, idleTime: 0, gameFps: 144, gameFpsPid: 42, gameFpsStatus: 'ready' })
  await until(() => evaluate('document.querySelector("[data-metric=FPS]")?.textContent.includes("144")'))
  await wait(100)
  await capture('performance-vertical.png')
  await evaluate(`(()=>{window.__hudPaint={received:0,changes:0};const observer=new MutationObserver(records=>window.__hudPaint.changes+=records.length);document.querySelectorAll('.performance-hud__stat:not([data-metric=TIME])').forEach(el=>observer.observe(el,{subtree:true,childList:true,characterData:true,attributes:true}));const off=window.electronAPI.onMetricsUpdate(()=>window.__hudPaint.received++);window.__hudPaint.received=0;window.__hudPaint.stop=()=>{off();observer.disconnect()};return true})()`)
  for(let sample=0;sample<300;sample++)hud.webContents.send('metrics:update',{cpu:24+(sample%3)/10,gpu:31,ram:50,idleTime:sample,gameFps:144+(sample%3)/10,frameTimeMs:6.9+sample/10000,gameFpsPid:42,gameFpsStatus:'ready'})
  await until(()=>evaluate('window.__hudPaint.received===300'))
  await wait(150)
  const unchangedValues=await evaluate('window.__hudPaint.stop();({received:window.__hudPaint.received,changes:window.__hudPaint.changes})')
  assert.equal(unchangedValues.changes,0,'Invisible precision and idle ticks must not repaint the performance widget')
  for(const surface of ['clear','solid','glass']){
    update({overlayMetrics:{background:surface}})
    manager.showOverlay(build(settings,fixtureGame,42))
    await until(()=>evaluate(`document.querySelector('.performance-hud')?.dataset.surface==='${surface}'`))
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".performance-hud")).backdropFilter'),'none')
    if(surface==='clear')assert.equal(await evaluate('getComputedStyle(document.querySelector(".performance-hud")).backgroundColor'),'rgba(0, 0, 0, 0)')
    await wait(150)
    await capture('performance-'+surface+'.png')
  }
  const normalWidth = await evaluate('document.getElementById("widget-performance").getBoundingClientRect().width')
  hud.webContents.send('metrics:update', { cpu: 24, gpu: 31, ram: 50, idleTime: 0, gameFpsPid: 42, gameFpsStatus: 'permission-required' })
  await until(() => evaluate('document.querySelector("[data-metric=FPS]")?.textContent.includes("Zugriff")'))
  assert.equal(await evaluate('document.getElementById("widget-performance").getBoundingClientRect().width'), normalWidth)
  await capture('performance-access.png')
  update({ overlayMetrics: { layout: 'horizontal', scale: 150 }, overlayCps: true,
    overlayPositions: { performance: { xPct: 1, yPct: 1 }, rlController: { xPct: 1, yPct: 1 }, robloxCps: { xPct: 1, yPct: 1 } } })
  await until(() => evaluate('!!document.querySelector(".performance-hud--horizontal")&&!!document.querySelector(".cps-hud")'))
  hud.webContents.send('overlay:cps-update', { lmb: 8, rmb: 3 })
  await until(() => evaluate('document.querySelector(".cps-hud__value")?.textContent==="8"'))
  await wait(120)
  for (const box of await geometry()) assert.ok(box.x >= -1 && box.y >= -1 && box.right <= box.width + 1 && box.bottom <= box.height + 1, JSON.stringify(box))
  update({ overlayPositions: { performance: { xPct: .02, yPct: .03 }, robloxCps: { xPct: .02, yPct: .3 } } })
  manager.showOverlay(build(settings, fixtureGame, 42))
  hud.webContents.send('metrics:update', { cpu: 24, gpu: 31, ram: 50, idleTime: 0, gameFps: 144, gameFpsPid: 42, gameFpsStatus: 'ready' })
  await until(() => evaluate('document.querySelector("[data-metric=FPS]")?.textContent.includes("144")'))
  await wait(100)
  await capture('performance-horizontal.png')
  await capture('click-counter.png', 'robloxCps')
  hud.webContents.reload()
  await until(() => hud.isVisible() && !hud.webContents.isLoading())
  await until(() => evaluate('!!document.querySelector(".performance-hud--horizontal")'))
  await wait(300)
  assert.equal(hud.isVisible(), true, 'Reloading the main document re-establishes the trusted renderer handshake')
  update({ overlayMedia: true, overlayMediaAutoHide: false })
  await wait(100)
  hud.webContents.send('media:update', {isPlaying: true, title: 'Fixture track', artist: 'Test artist', app: 'spotify'})
  await until(() => evaluate('!!document.querySelector(".media-hud__track strong")'))
  assert.equal(await evaluate('document.querySelector(".media-hud__track strong").textContent'), 'Fixture track')
  assert.equal(await evaluate('document.getAnimations().filter(a=>a.animationName!=="media-playing").length'), 0)
  for(const index of [0,1,2]){
    await evaluate(`document.querySelectorAll('.media-hud__controls button')[${index}].click();true`)
    await until(()=>evaluate('!document.querySelector(".media-hud").getAttribute("aria-busy")||document.querySelector(".media-hud").getAttribute("aria-busy")==="false"'))
  }
  await until(() => mediaCommands.length === 3)
  assert.deepEqual(mediaCommands, ['previous', 'play-pause', 'next'])
  await capture('media-player.png', 'media')
  update({ overlayController: false, overlayCps: false, overlayGeneralAlwaysOn: false, overlayMedia: false })
  assert.equal(hud.isVisible(), false)
  update({ overlayGeneralAlwaysOn: true })
  await until(() => hud.isVisible())
  assert.equal(manager.getOverlayWindow(), hud)
  update({overlayGeneralAlwaysOn: false, overlayPerformance: false, overlayRLSteam: true, steamProfileUrl: 'https://steamcommunity.com/id/fixture'})
  manager.showOverlay(build(settings, {name: 'Rocket League', startTime: Date.now()}, 42))
  await until(() => hud.isVisible())
  assert.equal(work.inputs, true); assert.equal(work.controller, true)
  const avatarVisible = () => evaluate('!!document.querySelector("#widget-rlSteamAvatar img")')
  await until(() => evaluate('!!document.getElementById("widget-rlSteamAvatar")'))
  hud.webContents.send('rl:scoreboard-toggle', true)
  await until(avatarVisible)
  await wait(600)
  assert.equal(await avatarVisible(), true, 'An idle controller cannot clear a held keyboard binding')
  hud.webContents.send('rl:scoreboard-toggle', false)
  await until(async () => !await avatarVisible())
  const scoreboardButtons = Array.from({length: 17}, (_, index) => ({pressed: index === 8, value: index === 8 ? 1 : 0}))
  hud.webContents.send('overlay:gamepad-state', {connected: true, buttons: scoreboardButtons, axes: [0, 0, 0, 0]})
  await until(avatarVisible)
  hud.webContents.send('rl:scoreboard-toggle', true)
  hud.webContents.send('overlay:gamepad-state', {connected: false, buttons: [], axes: []})
  await wait(100); assert.equal(await avatarVisible(), true)
  hud.webContents.send('rl:scoreboard-toggle', false)
  await until(async () => !await avatarVisible())
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ actualIpcSecurity: true, controllerKeepsOverlayVisible: true,
    skinChanges: true, blackSkinOffline: blackSkin, controllerStateReplayedAfterLoad: true, disconnectedControllerReleasesButtons: true, staleBrowserButtonsIgnored: true,
    noSpawnAnimation: true, noLauncherStoreHydration: true, settingsWrites, fpsPid: 42, unchangedValues, surfaceModes:true, noBackdropBlur:true,
    permissionWidthStable: true, scaleAndHorizontalLayout: true, edgePositionsStayVisible: true, mainDocumentReload: true,
    rapidToggleReuse: true, standaloneRlAvatarInputs: true, combinedKeyboardAndController: true,
    mediaControls: mediaCommands, events, errors }, null, 2))
  assert.deepEqual(errors, [])
  manager.hideOverlay(true)
  app.exit(0)
}).catch(error => { console.error(error); console.error({ events, errors }); manager?.hideOverlay(true); app.exit(1) })
setTimeout(() => { console.error('Overlay runtime timeout'); app.exit(1) }, 60000).unref()
