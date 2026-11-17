const { app, BrowserWindow, ipcMain, session } = require('electron')
const path = require('node:path'), assert = require('node:assert/strict')
const { registerSocialStateRelay } = require('./download-loader.cjs')()('electron/socialStateRelay.ts')
app.setPath('userData', process.env.ECLIPSE_SMOKE_TEMP)
app.setPath('sessionData', process.env.ECLIPSE_SMOKE_TEMP)
let main, friends
const evaluate = (window, script) => window.webContents.executeJavaScript(script, true)
app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({ cancel: /^https?:/.test(details.url) }))
  ipcMain.on('account:get-identity-sync', event => { event.returnValue = { canonicalUid: 'fixture', friendCode: 'ECL-TEST1' } })
  registerSocialStateRelay(ipcMain, () => main?.webContents, () => friends?.webContents)
  const options = { show: false, webPreferences: { preload: path.resolve('dist-electron/preload.js'), sandbox: true, contextIsolation: true, nodeIntegration: false } }
  main = new BrowserWindow(options); friends = new BrowserWindow(options)
  const errors = []
  for (const window of [main, friends]) window.webContents.on('preload-error', (_event, _path, error) => errors.push(error.message))
  await Promise.all([main.loadURL('data:text/html,<title>Social owner test</title>'), friends.loadURL('data:text/html,<title>Friends test</title>')])
  await evaluate(main, `window.refreshes=0; window.electronAPI.socialState.onRefresh(request=>{window.refreshes++; window.electronAPI.socialState.publish({uid:'fixture',settings:{userUid:'fixture',username:'Updated',eclipseFriends:[]},activeGame:null,permissionDenied:false}); window.electronAPI.socialState.completeRefresh({id:request.id,success:true})}); window.electronAPI.socialState.publish({uid:'fixture',settings:{userUid:'fixture',username:'Initial',accountSecret:'DO-NOT-RELAY',eclipseFriends:[]},activeGame:null,permissionDenied:false}); true`)
  let initial
  for (let attempt = 0; attempt < 50; attempt++) {
    initial = await evaluate(friends, 'window.electronAPI.socialState.getSnapshot()')
    if (initial) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  assert.equal(initial.settings.username, 'Initial')
  assert.equal(initial.settings.accountSecret, undefined)
  await evaluate(friends, 'window.updates=[];window.electronAPI.socialState.onSnapshot(state=>window.updates.push(state));true')
  const updated = await evaluate(friends, 'window.electronAPI.socialState.refresh(true)')
  assert.equal(updated.settings.username, 'Updated')
  assert.equal(await evaluate(main, 'window.refreshes'), 1)
  assert.equal(await evaluate(friends, 'window.updates.at(-1).settings.username'), 'Updated')
  await evaluate(friends, `window.electronAPI.socialState.publish({uid:'fixture',settings:{userUid:'fixture',username:'FORGED'},activeGame:null,permissionDenied:false});true`)
  assert.equal((await evaluate(friends, 'window.electronAPI.socialState.getSnapshot()')).settings.username, 'Updated')
  const reloaded = new Promise(resolve => main.webContents.once('did-finish-load', resolve))
  main.reload(); await reloaded
  assert.equal(await evaluate(friends, 'window.electronAPI.socialState.getSnapshot()'), null)
  assert.deepEqual(errors, [])
  console.log('PASS real Electron IPC: initial state, live delivery, manual refresh, secret filtering, sender isolation and main-window reload')
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
