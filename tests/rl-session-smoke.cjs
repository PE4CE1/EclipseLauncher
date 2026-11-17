const { app, protocol, session } = require('electron')
const { WebSocketServer } = require('ws')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), output = path.join(root, '.cache/rl-session')
const load = require('./download-loader.cjs')({
  './metricsService': { startMetricsService() {}, stopMetricsService() {} },
  './inputService': { startInputService() {}, stopInputService() {} },
  './gamepadService': { acquireGamepadService() {}, releaseGamepadService() {} },
  './streamManager': { updateStreamGameTitle() {} },
}, { dirname: path.join(root, 'dist-electron') })
const assets = load('electron/assetProtocol.ts')
protocol.registerSchemesAsPrivileged([assets.ASSET_SCHEME])
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.on('window-all-closed', () => {})
const own = 'Epic|0123456789abcdef0123456789abcdef|0'
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async (fn, timeout = 12000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await wait(40) } throw Error('RL native condition timed out: ' + fn) }
const packet = (guid, playlist = 11) => ({ Event: 'UpdateState', Data: { MatchGuid: guid, Players: [{ PrimaryId: own, Name: 'Eclipse', TeamNum: 0 }], Game: { PlaylistId: playlist, bReplay: false, bHasWinner: false } } })
const errors = []; let manager, service, server, peer, clipSubscription, nativeConnections = 0, commands = 0, clipMessages = 0
const originalSocket = global.WebSocket
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  assets.initAssetProtocol(path.join(root, 'dist'))
  server = new WebSocketServer({ port: 0, host: '127.0.0.1' })
  await new Promise(resolve => server.once('listening', resolve))
  server.on('connection', connection => { peer = connection; nativeConnections++; connection.on('message', () => commands++) })
  global.WebSocket = class extends originalSocket { constructor(url) { assert.equal(url, 'ws://127.0.0.1:49124'); super('ws://127.0.0.1:' + server.address().port) } }
  const settings = { language: 'de', overlayRLHud: true, rlPlayerId: own, rlPlaylist: '2v2', overlayPositions: { rlHud: { xPct: .05, yPct: .05 } } }
  const security = load('electron/ipcSecurity.ts')
  security.ipcMain.on('account:get-identity-sync', event => { event.returnValue = null })
  service = load('electron/rlService.ts')
  security.ipcMain.handle('settings:get', () => settings)
  security.ipcMain.handle('rl:get-state', () => service.getRLState())
  security.ipcMain.handle('rl:reset-session', () => { service.resetRLSession(); return { success: true } })
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }))
  manager = load('electron/overlayManager.ts')
  service.configureRLService(settings)
  service.startRLService(data => manager.getOverlayWindow()?.webContents.send('rl:mmr-update', data))
  clipSubscription = load('electron/rocketLeagueClient.ts').subscribeRocketLeagueStats(() => clipMessages++, () => {})
  await until(() => peer)
  peer.send(JSON.stringify(packet('early')))
  peer.send(JSON.stringify({ Event: 'MatchEnded', Data: { MatchGuid: 'early', WinnerTeamNum: 0 } }))
  await until(() => service.getRLState().sessionWins === 1)
  const build = load('electron/overlayState.ts').buildOverlayData
  manager.showOverlay(build(settings, { name: 'Rocket League', startTime: Date.now() }, 42))
  let hud = manager.getOverlayWindow()
  const watch = window => window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  watch(hud)
  const evaluate = code => manager.getOverlayWindow().webContents.executeJavaScript(code, true)
  const displayed = () => evaluate(`(()=>{const text=key=>document.querySelector('[data-rl-stat="'+key+'"]').textContent;return{wins:text('wins'),losses:text('losses'),streak:text('streak'),best:text('best')}})()`)
  await until(() => hud.isVisible())
  await until(() => evaluate('document.querySelector("[data-rl-stat=wins]")?.textContent === "1"'))
  for (const [index, winner] of [0, 1, 1].entries()) {
    const guid = 'm' + index
    peer.send(JSON.stringify(packet(guid)))
    const end = { Event: 'MatchEnded', Data: { MatchGuid: guid, WinnerTeamNum: winner } }
    peer.send(JSON.stringify(end)); peer.send(JSON.stringify(end))
  }
  await until(() => evaluate('document.querySelector("[data-rl-stat=losses]")?.textContent === "2"'))
  assert.deepEqual(await displayed(), { wins: '2', losses: '2', streak: '2 L', best: '2' })
  assert.equal(await evaluate('document.querySelector(".rl-session-hud__mmr strong").textContent'), '—')
  assert.equal(await evaluate('document.getAnimations().length'), 0)
  const rect = await evaluate(`(()=>{const r=document.getElementById('widget-rlHud').getBoundingClientRect();return{x:Math.floor(r.x)-6,y:Math.floor(r.y)-6,width:Math.ceil(r.width)+12,height:Math.ceil(r.height)+12}})()`)
  for (let attempt = 0; attempt < 10; attempt++) { try { hud.webContents.invalidate(); fs.writeFileSync(path.join(output, 'ranked-session.png'), (await hud.webContents.capturePage(rect)).toPNG()); break } catch(error) { if(attempt===9)throw error;await wait(100) } }
  service.setRLPlaylist('1v1')
  await until(() => evaluate('document.querySelector(".rl-session-hud__header strong").textContent === "1v1"'))
  assert.deepEqual(await displayed(), { wins: '0', losses: '0', streak: '—', best: '0' })
  service.setRLPlaylist('2v2')
  manager.hideOverlay(true)
  manager.showOverlay(build(settings, { name: 'Rocket League' }, 42))
  hud = manager.getOverlayWindow(); watch(hud)
  await until(() => hud.isVisible())
  await until(() => evaluate('document.querySelector("[data-rl-stat=wins]")?.textContent === "2"'))
  await evaluate('window.electronAPI.resetRLSession()')
  await until(() => evaluate('document.querySelector("[data-rl-stat=wins]")?.textContent === "0"'))
  peer.send(JSON.stringify({ Event: 'MatchEnded', Data: { MatchGuid: 'm2', WinnerTeamNum: 0 } }))
  await wait(100); assert.equal(service.getRLState().sessionWins, 0)
  assert.equal(nativeConnections, 1); assert.ok(clipMessages >= 9); assert.equal(commands, 0)
  service.stopRLService(); assert.equal(peer.readyState, 1, 'Stopping the HUD must not disconnect the clip detector')
  clipSubscription.close(); clipSubscription = null
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ officialWebSocketPackets: true, trustedNativeHud: true, initialSnapshot: true, winsLossesStreak: true, separatePlaylists: true, recreatedHudState: true, resetDeduplication: true, noFakeMmr: true, sharedClipConnection: nativeConnections, commands, rendererErrors: errors }, null, 2))
  manager.hideOverlay(true); for (const connection of server.clients) connection.terminate(); server.close(); global.WebSocket = originalSocket; app.exit(0)
}).catch(error => { console.error(error); console.error(errors); service?.stopRLService(); clipSubscription?.close(); manager?.hideOverlay(true); if(server){for(const connection of server.clients)connection.terminate();server.close()}app.exit(1) })
setTimeout(() => { console.error('RL native timeout'); app.exit(1) }, 60000).unref()
