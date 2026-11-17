const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const loadTs = require('./download-loader.cjs')

function fakeChild() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { child.killed = true; child.emit('close', 0) }
  return child
}

test('controller IPC stays idle until requested and shares the native reader across consumers', () => {
  const handlers = {}
  const children = []
  const service = loadTs({
    './ipcSecurity': { ipcMain: { handle: (name, handler) => { handlers[name] = handler } } },
    electron: { app: { getAppPath: () => '/app', getPath: () => '/user' }, BrowserWindow: { getAllWindows: () => [] } },
    fs: { existsSync: () => true },
    child_process: { spawn: () => { const child = fakeChild(); children.push(child); return child } },
  })('electron/gamepadService.ts')
  service.initGamepadIPC()
  assert.equal(children.length, 0)
  const sender = new EventEmitter(); sender.id = 123
  handlers['gamepad:start-service']({ sender })
  service.acquireGamepadService('stream')
  handlers['gamepad:stop-service']({ sender })
  assert.equal(children.length, 1)
  assert.equal(children[0].killed, undefined)
  service.releaseGamepadService('stream')
  assert.equal(children[0].killed, true)
  handlers['gamepad:start-service']({ sender })
  assert.equal(children.length, 2)
  assert.equal(sender.listenerCount('destroyed'), 1)
  sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
  assert.equal(children[1].killed, undefined)
  sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  assert.equal(children[1].killed, true)
  handlers['gamepad:start-service']({ sender })
  sender.emit('render-process-gone')
  assert.equal(children[2].killed, true)
  sender.emit('destroyed')
})

test('media IPC spawns no daemon until visible subscribed UI needs it and releases it on hide', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const handlers = {}
  const children = []
  const sender = new EventEmitter(); sender.id = 123
  sender.send = () => {}
  const win = new EventEmitter()
  let visible = true
  Object.assign(win, { isDestroyed: () => false, isVisible: () => visible, isMinimized: () => false, webContents: sender })
  const service = loadTs({
    './ipcSecurity': { ipcMain: { handle: (name, handler) => { handlers[name] = handler } } },
    electron: { app: new EventEmitter(), globalShortcut: { unregister() {} }, BrowserWindow: { fromWebContents: () => win } },
    child_process: { spawn: () => { const child = fakeChild(); children.push(child); return child }, exec: () => assert.fail('Polling must not emit media keys') },
  })('electron/mediaService.ts')
  t.after(() => service.stopMediaService())
  service.initMediaIPC(() => [win])
  t.mock.timers.tick(10000)
  assert.equal(children.length, 0)
  handlers['media:subscribe']({ sender })
  t.mock.timers.tick(0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(children.length, 1)
  visible = false; win.emit('hide')
  assert.equal(children[0].killed, true)
  await new Promise(resolve=>setImmediate(resolve))
  t.mock.timers.tick(10000)
  assert.equal(children.length, 1)
  visible = true; win.emit('show')
  t.mock.timers.tick(0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(children.length, 2)
  handlers['media:unsubscribe']({ sender })
  assert.equal(children[1].killed, true)
  t.mock.timers.tick(30000)
  assert.equal(children.length, 2)
})

test('media polling slows when paused or absent and unchanged songs produce no repeated IPC', async t => {
  t.mock.timers.enable({apis:['setTimeout','Date']})
  const handlers={},messages=[],requests=[]
  let reply={Success:true,App:'spotify',SessionId:'spotify',Title:'Track',IsPlaying:true}
  const sender=new EventEmitter();sender.id=123;sender.send=(...args)=>messages.push(args)
  const win=new EventEmitter();Object.assign(win,{isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,webContents:sender})
  const service=loadTs({
    './ipcSecurity':{ipcMain:{handle:(name,handler)=>handlers[name]=handler}},
    electron:{BrowserWindow:{fromWebContents:()=>win}},
    './mediaTransport':{mediaFilter:v=>v==='spotify'||v==='youtube'?v:'all',MediaTransport:class{send(){requests.push(Date.now());return Promise.resolve(reply)}suspend(){}stop(){}}},
  })('electron/mediaCoordinator.ts')
  t.after(()=>service.stopMediaCoordinator())
  service.initMediaCoordinator(()=>[win],()=>{})
  const tick=async ms=>{t.mock.timers.tick(ms);for(let i=0;i<16;i++)await Promise.resolve()}
  handlers['media:subscribe']({sender});await tick(0)
  assert.equal(requests.length,1);assert.equal(messages.length,1)
  await tick(1999);assert.equal(requests.length,1)
  await tick(1);assert.equal(requests.length,2);assert.equal(messages.length,1)
  reply={...reply,IsPlaying:false};await tick(2000)
  await tick(3999);assert.equal(requests.length,3)
  await tick(1);assert.equal(requests.length,4)
  reply={Success:true,App:null,SessionId:''};await tick(4000)
  await tick(5999);assert.equal(requests.length,5)
  await tick(1);assert.equal(requests.length,6)
  reply={Success:false,Error:'unavailable'};await tick(6000)
  await tick(6000);assert.equal(requests.length,8)
  await tick(11999);assert.equal(requests.length,8)
  await tick(1);assert.equal(requests.length,9,'Repeated failures back off instead of repeatedly restarting the Windows helper')
})

test('persistent state skips serialization for transient progress and retries failed disk writes', () => {
  const { createReferenceStorage } = loadTs()('src/store/referenceStorage.ts')
  let writes = 0
  let fail = false
  const storage = createReferenceStorage(() => ({
    getItem: () => null, removeItem() {},
    setItem: () => { if (fail) throw new Error('quota'); writes++ },
  }))
  const library = [{ name: 'Portal' }]
  const settings = { language: 'de' }
  storage.setItem('test', { state: { library, settings }, version: 0 })
  for (let i = 0; i < 100; i++) storage.setItem('test', { state: { library, settings }, version: 0 })
  assert.equal(writes, 1)
  const changed = { state: { library: [...library], settings }, version: 0 }
  fail = true
  assert.throws(() => storage.setItem('test', changed), /quota/)
  fail = false
  storage.setItem('test', changed)
  assert.equal(writes, 2)
  storage.removeItem('test')
  storage.setItem('test', changed)
  assert.equal(writes, 3)
})

test('deferred startup work runs once and cancellation survives the idle callback race', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousWindow = global.window
  let idle
  let calls = 0
  global.window = { requestIdleCallback: callback => { idle = callback; return 1 }, cancelIdleCallback() {} }
  t.after(() => { global.window = previousWindow })
  const { scheduleBackgroundTask } = loadTs()('src/services/startupScheduler.ts')
  const cancel = scheduleBackgroundTask(() => { calls++ })
  t.mock.timers.tick(1500)
  cancel()
  idle()
  await Promise.resolve()
  assert.equal(calls, 0)
  scheduleBackgroundTask(() => { calls++ })
  t.mock.timers.tick(1500)
  idle()
  await Promise.resolve()
  assert.equal(calls, 1)
})

test('presence updates before social startup retain only the latest status', async () => {
  const writes = []
  let starts = 0
  const client = loadTs({ './socialService': {
    initSocialNetwork: async () => { starts++ },
    updateSocialPresence: async (...args) => { writes.push(args) },
  } })('src/services/socialClient.ts')
  await client.updateSocialPresence('online', null)
  await client.updateSocialPresence('ingame', 'Portal')
  assert.equal(starts, 0)
  assert.deepEqual(writes, [])
  await client.initSocialNetwork()
  assert.equal(starts, 1)
  assert.deepEqual(writes, [['ingame', 'Portal']])
})
