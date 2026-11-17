const test = require('node:test'), assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs')
function fixture(packaged = true) {
  const handlers = new Map(), events = [], calls = { checks: 0, downloads: 0, installs: 0 }
  const updater = Object.assign(new EventEmitter(), {
    checkForUpdates: async () => { calls.checks++; return { isUpdateAvailable: true } },
    downloadUpdate: async () => { calls.downloads++; updater.emit('download-progress', { percent: 0 }); updater.emit('update-downloaded', { version: '2.0.0', downloadedFile: 'verified.exe' }); return ['verified.exe'] },
    quitAndInstall: (...args) => { calls.installs++; assert.deepEqual(args, [false, true]) },
  })
  load({ 'electron-updater': { autoUpdater: updater }, electron: { app: { isPackaged: packaged } }, './ipcSecurity': { ipcMain: { handle: (key, fn) => handlers.set(key, fn) } } })('electron/updaterService.ts').initUpdater({ isDestroyed: () => false, webContents: { send: (_channel, event) => events.push(event) } })
  return { updater, calls, events, invoke: (name, ...args) => handlers.get('updater:' + name)({}, ...args) }
}
test('packaged startup asset URLs still use the checksum-verifying updater; install requires a completed download', async () => {
  const f = fixture()
  f.updater.checkForUpdates = async () => {
    f.calls.checks++
    f.updater.emit('checking-for-update'); f.updater.emit('update-available', { version: '2.0.0' })
    return { isUpdateAvailable: true }
  }
  assert.equal((await f.invoke('install')).success, false); assert.equal(f.calls.installs, 0)
  assert.equal((await f.invoke('download', 'https://github.com/PE4CE1/EclipseLauncher/releases/download/v2.0.0/Eclipse.Launcher.Setup.2.0.0.exe')).success, true)
  assert.equal(f.calls.checks, 1); assert.equal(f.calls.downloads, 1)
  assert.ok(!f.events.some(event => ['checking', 'available'].includes(event.status)), 'Revalidating a download must not replace the active update card')
  assert.ok(f.events.some(event => event.status === 'downloading' && event.data.percent === 0))
  assert.equal((await f.invoke('install')).success, true)
  assert.equal((await f.invoke('install')).success, false); assert.equal(f.calls.installs, 1)
  assert.equal(f.updater.allowDowngrade, false); assert.equal(f.updater.disableWebInstaller, true)
})
test('failed checks, old versions and failed downloads never unlock installation and can be retried', async () => {
  const f = fixture()
  f.updater.checkForUpdates = async () => ({ isUpdateAvailable: false })
  assert.equal((await f.invoke('download')).success, false); assert.equal(f.calls.downloads, 0)
  f.updater.checkForUpdates = async () => { throw new Error('Metadata unavailable') }
  assert.match((await f.invoke('download')).error, /Metadata unavailable/)
  f.updater.checkForUpdates = async () => ({ isUpdateAvailable: true })
  f.updater.downloadUpdate = async () => { throw new Error('SHA-512 mismatch') }
  assert.match((await f.invoke('download')).error, /SHA-512/)
  assert.equal((await f.invoke('install')).success, false)
  f.updater.downloadUpdate = async () => f.updater.emit('update-downloaded', { version: '2.0.0' })
  assert.equal((await f.invoke('download')).success, true)
  assert.equal((await f.invoke('install')).success, true)
})
test('concurrent downloads, development installs and untrusted asset URLs are rejected without executing anything', async () => {
  const f = fixture(), dev = fixture(false)
  let finish
  f.updater.checkForUpdates = () => new Promise(resolve => { finish = resolve })
  const first = f.invoke('download')
  assert.equal((await f.invoke('download')).success, false)
  finish({ isUpdateAvailable: true }); assert.equal((await first).success, true)
  assert.equal((await f.invoke('download', 'https://attacker.example/setup.exe')).success, false)
  assert.equal((await dev.invoke('download')).success, false)
  assert.equal((await dev.invoke('install')).success, false); assert.equal(dev.calls.installs, 0)
})
