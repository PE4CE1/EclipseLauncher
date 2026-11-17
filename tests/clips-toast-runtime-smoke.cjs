const { app, session, protocol } = require('electron'), path = require('node:path'), assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..'), started = []
const load = require('./download-loader.cjs')({
  './metricsService': { startMetricsService() { started.push('metrics') }, stopMetricsService() {} },
  './inputService': { startInputService() { started.push('input') }, stopInputService() {} },
  './gamepadService': { acquireGamepadService() { started.push('gamepad') }, releaseGamepadService() {} },
  './streamManager': { updateStreamGameTitle() {} },
}, { dirname: path.join(root, 'dist-electron') })
const assets = load('electron/assetProtocol.ts')
protocol.registerSchemesAsPrivileged([assets.ASSET_SCHEME])
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP); app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const until = async callback => { for (let i = 0; i < 160; i++) { if (await callback()) return; await wait(50) } throw Error('Clips toast runtime timed out') }
app.whenReady().then(async () => {
  assets.initAssetProtocol(path.join(root, 'dist'))
  const security = load('electron/ipcSecurity.ts')
  security.ipcMain.on('account:get-identity-sync', event => { event.returnValue = null })
  security.ipcMain.handle('settings:get',()=>({language:'en'}))
  security.ipcMain.handle('rl:get-state',()=>null)
  session.defaultSession.webRequest.onBeforeRequest((request, done) => done({ cancel: /^https?:/.test(request.url) }))
  const manager = load('electron/overlayManager.ts')
  const clipsOnly=!process.env.ECLIPSE_TOAST_FULL
  manager.initOverlayManager(undefined, clipsOnly?'clips':'launcher')
  const requestId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  manager.showClipSavedToast({ requestId, status:'saving', title: 'Highlight', gameTitle: 'Fortnite', duration: 30, language: 'en' })
  const window = manager.getOverlayWindow(), errors = []
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  await until(() => window.isVisible())
  const evaluate = code => window.webContents.executeJavaScript(code, true)
  await until(() => evaluate('!!document.getElementById("eclipse-clip-toast")'))
  assert.equal(await evaluate('document.querySelector(".clip-toast-heading strong").textContent'),'Saving clip…')
  await evaluate('window.__initialClipToast = document.getElementById("eclipse-clip-toast"); true')
  assert.equal(await evaluate('window.electronAPI.appMode'), clipsOnly?'clips':'launcher')
  assert.equal(window.isFocusable(), false)
  assert.deepEqual(started, [])
  const resources = await evaluate('performance.getEntriesByType("resource").map(entry=>entry.name)')
  if(clipsOnly)assert.equal(resources.some(value => /\/(?:OverlayApp|ControllerOverlay|Performance)-[^/]+\.js/.test(value)), false)
  const preview=await evaluate('(()=>{const canvas=document.createElement("canvas");canvas.width=160;canvas.height=90;const ctx=canvas.getContext("2d");ctx.fillStyle="#385363";ctx.fillRect(0,0,160,90);ctx.fillStyle="#e3bb83";ctx.fillRect(48,20,64,50);return canvas.toDataURL("image/jpeg")})()')
  manager.showClipSavedToast({requestId,status:'saving',previewOnly:true,thumbnailUrl:preview})
  await until(()=>evaluate('document.querySelector(".clip-toast-art img")?.naturalWidth === 160'))
  assert.equal(await evaluate('document.getElementById("eclipse-clip-toast") === window.__initialClipToast'),true,'The image must update without replaying the notification')
  manager.showClipSavedToast({requestId,status:'saved',gameTitle:'Fortnite',duration:28})
  await until(() => evaluate('document.querySelector(".clip-toast-heading strong")?.textContent === "Clip Saved"'))
  assert.equal(await evaluate('document.getElementById("eclipse-clip-toast") === window.__initialClipToast'),true,'Saving must update in place without a second spawn animation')
  manager.showClipSavedToast({requestId,status:'saving',previewOnly:true,thumbnailUrl:preview})
  assert.equal(await evaluate('document.querySelector(".clip-toast-heading strong").textContent'),'Clip Saved','A delayed thumbnail cannot turn a saved clip back into saving')
  manager.showClipSavedToast({requestId:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',status:'saved',gameTitle:'Old game'})
  assert.equal(await evaluate('document.querySelector(".clip-toast-copy p").textContent'),'Fortnite','An older completed save must not replace the current clip')
  await until(() => !window.isVisible())
  assert.deepEqual(errors, [])
  manager.showClipSavedToast({requestId,status:'saved'})
  manager.showClipSavedToast({requestId,status:'saving',previewOnly:true,thumbnailUrl:preview})
  assert.equal(window.isVisible(),false,'Late completion must not replay a dismissed clip notification')
  manager.hideOverlay(true)
  console.log((clipsOnly?'Clips-only':'Full launcher')+' toast passed: immediate saving status, in-place completion, stale completion ignored, automatic dismissal, no extra HUD services')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
setTimeout(() => app.exit(1), 20000).unref()
