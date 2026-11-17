const test = require('node:test'), assert = require('node:assert/strict')
const load = require('./download-loader.cjs')

test('automatic cache relief uses deduplicated working-set estimates without a native limiter process', async () => {
  const metrics = [{ pid: 100, memory: { workingSetSize: 700 * 1024, privateBytes: 900 * 1024 } }, { pid: 100, memory: { workingSetSize: 700 * 1024, privateBytes: 900 * 1024 } }]
  const service = load({ electron: { app: { getAppMetrics: () => metrics }, BrowserWindow: {} } })('electron/memoryOptimizerService.ts')
  const status = await service.getMemoryBudgetStatus()
  assert.equal(status.workingSetMB, 700, 'Duplicate process IDs must not inflate usage')
  assert.equal(status.residentMB, null)
  assert.equal(status.committedMB, 900)
  assert.equal(status.measurement, 'working-set-estimate')
  assert.equal(status.pressure, false)
})

test('an attached memory job routes games, URLs and restarts through the outside broker', async () => {
  const calls = [], handle = { pid: 42 }
  const external = load({ electron: { shell: { openExternal: () => assert.fail('Must not launch inside the job'), openPath: () => assert.fail('Must not launch inside the job') } }, 'node:child_process': { spawn: () => assert.fail('Must not launch inside the job') } })('electron/externalLaunch.ts')
  external.setExternalBroker({ spawn: async (...args) => { calls.push(args); return handle }, open: async value => { calls.push(value) }, relaunch: async (...args) => { calls.push(args) } })
  assert.equal(await external.spawnExternalApplication('game.exe', ['one arg', 'ä'], 'C:/Games'), handle)
  await external.openExternalApplication('steam://run/1'); assert.equal(await external.openExternalPath('C:/Clips'), '')
  assert.equal(await external.relaunchOutsideMemoryJob('eclipse.exe', ['--hidden'], 'C:/Eclipse'), true)
  assert.deepEqual(calls, [['game.exe', ['one arg', 'ä'], 'C:/Games'], 'steam://run/1', 'C:/Clips', ['eclipse.exe', ['--hidden'], 'C:/Eclipse']])
})

test('shutdown waits until a brokered game or installer start is acknowledged', async () => {
  const { EventEmitter } = require('node:events'), application = new EventEmitter()
  let acknowledge, quits = 0, prevented = 0
  application.quit = () => { quits++ }
  const external = load()('electron/externalLaunch.ts')
  external.setExternalBroker({ spawn: () => new Promise(resolve => { acknowledge = resolve }) })
  external.bindExternalLaunchShutdown(application)
  const launch = external.spawnExternalApplication('installer.exe', [], 'C:/Eclipse')
  application.emit('before-quit', { preventDefault() { prevented++ } })
  assert.equal(prevented, 1); assert.equal(quits, 0)
  acknowledge({ pid: 42 }); await launch; await new Promise(setImmediate)
  assert.equal(quits, 1)
})

test('automatic updates in a memory job are handed off before quitting, preserving checksum-based installation', async () => {
  const { EventEmitter } = require('node:events'), application = new EventEmitter(), updater = new EventEmitter()
  let acknowledge, quits = 0, prevented = 0, installs = 0
  application.isPackaged = true; application.quit = () => { quits++ }
  updater.spawnLog = () => assert.fail('Installer must not inherit the Eclipse job')
  const loader = load({ electron: { app: application }, 'electron-updater': { autoUpdater: updater }, './ipcSecurity': { ipcMain: { handle() {} } } })
  const external = loader('electron/externalLaunch.ts')
  external.setExternalBroker({ spawn: () => new Promise(resolve => { acknowledge = resolve }) })
  updater.install = () => { installs++; void updater.spawnLog('C:/installer.exe', ['--updated', '/S']); return true }
  loader('electron/updaterService.ts').initUpdater({ isDestroyed: () => false, webContents: { send() {} } })
  assert.equal(updater.autoInstallOnAppQuit, false, 'The native quit callback is too late for a reliable IPC handoff')
  updater.emit('update-downloaded', { version: require('../package.json').version })
  application.emit('before-quit', { preventDefault() { prevented++ } })
  assert.equal(prevented, 1); assert.equal(installs, 1); assert.equal(quits, 0)
  acknowledge({ pid: 43, unref() {} }); await new Promise(setImmediate)
  assert.equal(quits, 1)
})
