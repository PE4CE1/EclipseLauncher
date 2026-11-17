const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const loadTs = require('./download-loader.cjs')

const guard = { ipcMain: { handle() {}, on() {} } }
function childProcess() {
  const child = new EventEmitter()
  child.stdin = new PassThrough()
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = () => { child.emit('exit', 0); child.emit('close', 0); return true }
  return child
}

test('gamepad process restarts after exit, survives spawn errors, and can stop pending retries', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const children = []
  const service = loadTs({
    './ipcSecurity': guard,
    electron: { app: { getAppPath: () => '/app', getPath: () => '/user' }, BrowserWindow: { getAllWindows: () => [] } },
    fs: { existsSync: () => true },
    child_process: { spawn: () => { const child = childProcess(); children.push(child); return child } },
  })('electron/gamepadService.ts')
  service.startGamepadService()
  service.startGamepadService()
  assert.equal(children.length, 1)
  children[0].emit('exit', 1)
  t.mock.timers.tick(1000)
  assert.equal(children.length, 2)
  children[0].emit('exit', 1)
  children[1].emit('error', new Error('spawn failed'))
  service.stopGamepadService()
  t.mock.timers.tick(2000)
  assert.equal(children.length, 2)
  service.startGamepadService()
  assert.equal(children.length, 3)
  service.stopGamepadService()
})

test('voice listener accepts packaged unpacked executable paths and ignores a stopped child exit', t => {
  const resourcesPath = process.resourcesPath
  process.resourcesPath = path.resolve('resources')
  t.after(() => { if (resourcesPath === undefined) delete process.resourcesPath; else process.resourcesPath = resourcesPath })
  const children = []
  const service = loadTs({
    './ipcSecurity': guard,
    electron: { app: { getPath: () => '/user', getAppPath: () => '/app' } },
    fs: { existsSync: file => String(file).includes('app.asar.unpacked') },
    child_process: { spawn: file => {
      assert.match(file, /app\.asar\.unpacked/)
      const child = childProcess(); children.push(child); return child
    } },
  })('electron/voiceService.ts')
  service.startVoiceListener()
  assert.equal(children.length, 1)
  service.stopVoiceListener()
  service.startVoiceListener()
  children[0].emit('exit', 0)
  service.startVoiceListener()
  assert.equal(children.length, 2)
  assert.ok(children[1].stdin.listenerCount('error') > 0)
  service.stopVoiceListener()
})

test('media status polling never presses play/pause while the daemon is starting', async () => {
  const app = new EventEmitter()
  const child = childProcess()
  let fallbackCalls = 0
  const service = loadTs({
    './ipcSecurity': guard,
    electron: { app, globalShortcut: { unregister() {} } },
    child_process: { spawn: () => child, exec: () => { fallbackCalls++ } },
  })('electron/mediaService.ts')
  const pending = service.detectActiveMedia()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(fallbackCalls,0)
  child.stdin.on('data',line=>{const id=Number(String(line).split(' ')[0]);child.stdout.write('JSON:'+JSON.stringify({Id:id,Success:true,App:null,SessionId:''})+'\n')})
  child.stdout.write('READY\n')
  const status = await pending
  assert.equal(status.isPlaying, false)
  assert.equal(fallbackCalls, 0)
  service.stopMediaService()
})

test('account identity reads are cached, returned objects are isolated, and queued partial saves merge', async () => {
  const seed = { canonicalUid: 'player-1', friendCode: 'ECL-123', accountSecret: 'secret', deviceAnchorId: 'anchor', username: 'Initial', createdAt: 1, lastUpdated: 2 }
  const files = new Map([[path.join(os.homedir(), '.eclipse_launcher_identity.json'), JSON.stringify(seed)]])
  let reads = 0
  let identityVersion = 1
  const service = loadTs({
    './ipcSecurity': guard,
    fs: {
      existsSync: file => files.has(file),
      statSync: file => ({mtimeMs:identityVersion,ctimeMs:0,size:files.get(file)?.length||0,ino:1}),
      readFileSync: file => { reads++; return files.get(file) },
      writeFileSync: (file, data) => files.set(file, data),
      renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); identityVersion++ },
      unlinkSync: file => files.delete(file),
    },
    child_process: {
      execFileSync: () => 'MachineGuid REG_SZ aabbccdd-1122-3344-5566-778899aabbcc',
      execFile: (_exe, _args, _options, callback) => queueMicrotask(() => callback(null, '')),
    },
  })('electron/accountPersistenceService.ts')
  const identity = service.loadPersistentIdentitySync()
  identity.username = 'Mutated by caller'
  assert.equal(service.loadPersistentIdentitySync().username, 'Initial')
  assert.equal(reads, 1)
  await Promise.all([service.savePersistentIdentity({ username: 'Updated' }), service.savePersistentIdentity({ accountSecret: 'new-secret' })])
  const saved = service.loadPersistentIdentitySync()
  assert.equal(saved.username, 'Updated')
  assert.equal(saved.accountSecret, 'new-secret')
  await assert.rejects(service.savePersistentIdentity({ username: 42 }), /Invalid identity field/)
})

test('concurrent controller battery callers share a native query', async () => {
  let queries = 0
  const result = { connected: true, model: 'DualSense', vendor: 'sony', connectionType: 'usb', level: 60, charging: false, hasExactLevel: true }
  const service = loadTs({
    './ipcSecurity': guard,
    electron: { app: { getAppPath: () => '/app', getPath: () => '/user' } },
    fs: { existsSync: () => true },
    child_process: { execFile: (_file, _args, _options, callback) => { queries++; setImmediate(() => callback(null, JSON.stringify(result))) } },
  })('electron/controllerBatteryService.ts')
  const [first, second] = await Promise.all([service.queryControllerBattery(), service.queryControllerBattery()])
  assert.deepEqual(first, result)
  assert.deepEqual(second, result)
  assert.equal(queries, 1)
})

test('updater only accepts executable assets from the Eclipse GitHub releases', () => {
  const service = loadTs({ './ipcSecurity': guard, 'electron-updater': {}, electron: {} })('electron/updaterService.ts')
  assert.equal(service.isTrustedUpdateUrl('https://github.com/PE4CE1/EclipseLauncher/releases/download/v1.3.3/Eclipse.Launcher.Setup.1.3.3.exe'), true)
  for (const url of [
    'http://github.com/PE4CE1/EclipseLauncher/releases/latest/download/setup.exe',
    'https://github.com/attacker/repo/releases/latest/download/setup.exe',
    'https://github.com.evil.test/PE4CE1/EclipseLauncher/releases/latest/download/setup.exe',
    'https://github.com/PE4CE1/EclipseLauncher/releases/latest',
    'file:///C:/setup.exe', null,
  ]) assert.equal(service.isTrustedUpdateUrl(url), false)
})

test('installer downloads handle relative redirects, flush the full file, and preserve old files after failure', async t => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'service-download-'))
  const body = Buffer.alloc(1024 * 1024, 7)
  const server = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { location: '/file' }); res.end(); return }
    if (req.url === '/broken') {
      res.writeHead(200, { 'content-length': body.length })
      res.write(body.subarray(0, 100))
      setImmediate(() => res.destroy())
      return
    }
    if (req.url === '/insecure') { res.writeHead(302, { location: 'http://example.test/file' }); res.end(); return }
    res.end(body)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const load = loadTs({ https: { get: (url, options, callback) => http.get(`http://127.0.0.1:${server.address().port}${url.pathname}`, options, callback) } })
  const { downloadServiceFile } = load('electron/serviceDownload.ts')
  const destination = path.join(directory, 'installer.bin')
  await downloadServiceFile('https://example.test/redirect', destination)
  assert.deepEqual(fs.readFileSync(destination), body)
  await assert.rejects(downloadServiceFile('https://example.test/broken', destination))
  assert.deepEqual(fs.readFileSync(destination), body)
  assert.deepEqual(fs.readdirSync(directory), ['installer.bin'])
  await assert.rejects(downloadServiceFile('https://example.test/insecure', destination), /HTTPS/)
})

test('legacy worker rejects invalid JSON, oversized bodies, fake friend acceptance, and hides database errors', async () => {
  const worker = loadTs()('worker/src/index.ts').default
  const env = { DB: { prepare: () => ({ bind() { return this }, first: async () => null }) } }
  const post = (path, body) => new Request(`https://api.test${path}`, { method: 'POST', body })
  assert.equal((await worker.fetch(post('/api/user/sync', '{'), env)).status, 400)
  assert.equal((await worker.fetch(post('/api/user/sync', JSON.stringify({ uid: 1 })), env)).status, 400)
  assert.equal((await worker.fetch(post('/api/user/sync', JSON.stringify({ data: 'x'.repeat(70000) })), env)).status, 413)
  assert.equal((await worker.fetch(post('/api/friends/accept', JSON.stringify({ myUid: 'me', fromUid: 'stranger' })), env)).status, 404)
  const failingEnv = { DB: { prepare: () => { throw new Error('PRIVATE_DATABASE_DETAILS') } } }
  const response = await worker.fetch(new Request('https://api.test/api/user/player'), failingEnv)
  assert.equal(response.status, 500)
  assert.equal((await response.json()).error, 'Internal Server Error')
})
