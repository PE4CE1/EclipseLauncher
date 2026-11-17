const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

test('renderer trust is limited to application pages and the exact development origin', () => {
  const policy = loadTs()('electron/securityPolicy.ts')
  const dist = path.resolve('dist')
  assert.equal(policy.isTrustedRendererUrl(pathToFileURL(path.join(dist, 'index.html')).href + '#friends', dist), true)
  assert.equal(policy.isTrustedRendererUrl('http://127.0.0.1:5173/overlay.html', dist, 'http://127.0.0.1:5173/'), true)
  for (const url of ['https://evil.invalid/index.html', 'http://127.0.0.1:51730/', 'http://127.0.0.1:5173/remote.html', pathToFileURL(path.resolve('package.json')).href]) {
    assert.equal(policy.isTrustedRendererUrl(url, dist, 'http://127.0.0.1:5173/'), false)
  }
  for (const url of ['file:///C:/Windows/system32/calc.exe', 'javascript:alert(1)', 'ms-msdt:/id', 'https://user:secret@example.com', 'https://example.com\n']) {
    assert.equal(policy.isAllowedExternalUrl(url), false)
  }
  assert.equal(policy.isAllowedExternalUrl('steam://rungameid/730'), true)
})

test('media paths ignore cache queries, reject traversal, and only expose media inside clip directories', () => {
  const { resolveLocalMediaPath } = loadTs()('electron/securityPolicy.ts')
  const directory = path.resolve('tests/clips')
  const clip = path.join(directory, 'clip one.mp4')
  assert.equal(resolveLocalMediaPath('local-media://file/' + encodeURIComponent(clip) + '?v=42', [directory]), clip)
  for (const target of [path.resolve('settings.json'), path.join(directory, 'script.js'), path.resolve('tests/clips-other/clip.mp4')]) {
    assert.equal(resolveLocalMediaPath('local-media://file/' + encodeURIComponent(target), [directory]), null)
  }
  assert.equal(resolveLocalMediaPath('local-media://file/%ZZ', [directory]), null)
  assert.equal(resolveLocalMediaPath('local-media://evil/' + encodeURIComponent(clip), [directory]), null)
})

test('controller asset protocol exposes only its bundled resource subtree', () => {
  const { resolveBundledAssetPath } = loadTs()('electron/securityPolicy.ts')
  const dist = path.resolve('dist')
  assert.equal(resolveBundledAssetPath('eclipse-asset://bundle/controller-skins/ps5_white/base.png', dist), path.join(dist, 'controller-skins/ps5_white/base.png'))
  for (const url of ['eclipse-asset://remote/controller-skins/controller.js', 'eclipse-asset://bundle/settings.json', 'eclipse-asset://bundle/controller-skins/%2e%2e%2fsettings.json', 'eclipse-asset://bundle/controller-skins/%5c..%5csecret.js', 'file:///controller-skins/controller.js']) {
    assert.equal(resolveBundledAssetPath(url, dist), null)
  }
})

test('privileged IPC rejects remote windows and child frames, and application navigation is guarded', () => {
  const handlers = new Map()
  const nativeIpc = Object.assign(new EventEmitter(), { handle: (channel, handler) => handlers.set(channel, handler) })
  const { ipcMain, secureAppWindow } = loadTs({ electron: { ipcMain: nativeIpc, shell: { openExternal: async () => {} } } })('electron/ipcSecurity.ts')
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    getURL: () => pathToFileURL(path.resolve('dist/index.html')).href,
    setWindowOpenHandler: handler => { contents.windowOpen = handler },
    mainFrame: { url: pathToFileURL(path.resolve('dist/index.html')).href },
  })
  const event = { sender: contents, senderFrame: contents.mainFrame }
  ipcMain.handle('test:secret', () => 42)
  assert.throws(() => handlers.get('test:secret')(event), /Untrusted/)
  secureAppWindow({ webContents: contents })
  assert.equal(handlers.get('test:secret')(event), 42)
  assert.throws(() => handlers.get('test:secret')({ ...event, senderFrame: { url: contents.getURL() } }), /Untrusted/)
  let prevented = false
  contents.emit('will-navigate', { preventDefault: () => { prevented = true } }, 'https://evil.invalid/')
  assert.equal(prevented, true)
  assert.deepEqual(contents.windowOpen({ url: 'file:///C:/Windows/notepad.exe' }), { action: 'deny' })
})

test('playtime preserves fractions, canonical IDs and rejects invalid increments', t => {
  const directory = fs.mkdtempSync(path.join(__dirname, '.core-playtime-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const service = loadTs({ electron: { app: { getPath: () => directory } } })('electron/playtimeService.ts')
  service.addPlaytimeRecord('steam-730', 'Counter-Strike 2', 0.25, 730)
  let db = service.addPlaytimeRecord('steam-730', 'Counter-Strike 2', 0.25, 730)
  assert.equal(db.steam_730.playTimeMinutes, 0.5)
  db = service.addPlaytimeRecord('steam-730', 'Counter Strike renamed', 0.5, 730)
  assert.equal(db.steam_730.playTimeMinutes, 1)
  assert.equal(service.addPlaytimeRecord('steam-730', 'Counter Strike renamed', NaN, 730).steam_730.playTimeMinutes, 1)
  assert.equal(service.addPlaytimeRecord('steam-730', 'Counter Strike renamed', -2, 730).steam_730.playTimeMinutes, 1)
  db = service.addPlaytimeRecord('custom', '日本語ゲーム', 0.1)
  assert.equal(db['日本語ゲーム'].playTimeMinutes, 0.1)
  service.addPlaytimeRecord('roblox', 'Roblox', 5, 999001)
  service.addPlaytimeRecord('roblox_exp_1234', 'Experience', 2)
  const recent = service.getDeduplicatedRecentGames().find(game => game.platform === 'Roblox')
  assert.equal(recent.playTimeMinutes, 5)
  assert.deepEqual(fs.readdirSync(directory), ['playtime.json'])
})

test('failed atomic settings writes retain the original document', t => {
  const directory = fs.mkdtempSync(path.join(__dirname, '.core-atomic-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'settings.json')
  fs.writeFileSync(file, '{"preserved":true}')
  const mockedFs = { ...fs, renameSync: () => { throw new Error('disk unavailable') } }
  const { writeJsonAtomicSync } = loadTs({ 'node:fs': mockedFs })('electron/jsonStorage.ts')
  assert.throws(() => writeJsonAtomicSync(file, { changed: true }), /disk unavailable/)
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { preserved: true })
  assert.deepEqual(fs.readdirSync(directory), ['settings.json'])
})

test('different Roblox experience IDs do not share playtime through the same placeholder title', t => {
  const directory = fs.mkdtempSync(path.join(__dirname, '.core-experience-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const service = loadTs({ electron: { app: { getPath: () => directory } } })('electron/playtimeService.ts')
  service.addPlaytimeRecord('roblox_exp_1001', 'Roblox Experience', 2)
  service.addPlaytimeRecord('roblox_exp_2002', 'Roblox Experience', 3)
  let db = service.addPlaytimeRecord('roblox_exp_1001', 'Roblox Experience', 0.5)
  assert.equal(db.roblox_exp_1001.playTimeMinutes, 2.5)
  assert.equal(db.roblox_exp_2002.playTimeMinutes, 3)
  db = service.setPlaytimeRecord('roblox_exp_3003', 'Roblox Experience', 4)
  assert.equal(db.roblox_exp_1001.playTimeMinutes, 2.5)
  assert.equal(db.roblox_exp_2002.playTimeMinutes, 3)
  assert.equal(db.roblox_exp_3003.playTimeMinutes, 4)
})

test('executable launch waits for OS success, sets its working directory and never buffers game output', async () => {
  const executable = path.resolve('tests/Game.EXE')
  let child
  let options
  let exits = 0
  const { launchExecutable } = loadTs({
    'node:fs': { promises: { stat: async () => ({ isFile: () => true }) } },
    'node:child_process': { spawn: (file, args, config) => {
      assert.equal(file, executable)
      assert.deepEqual(args, [])
      options = config
      child = new EventEmitter()
      queueMicrotask(() => child.emit('spawn'))
      return child
    } },
  })('electron/gameLaunchService.ts')
  assert.equal(await launchExecutable(executable, () => { exits++ }), child)
  assert.equal(options.cwd, path.dirname(executable))
  assert.equal(options.stdio, 'ignore')
  child.emit('exit', 0)
  assert.equal(exits, 1)
  await assert.rejects(launchExecutable('relative.exe', () => {}), /absolute/)
  const broken = loadTs({
    'node:fs': { promises: { stat: async () => ({ isFile: () => true }) } },
    'node:child_process': { spawn: () => { const proc = new EventEmitter(); queueMicrotask(() => proc.emit('error', new Error('EACCES'))); return proc } },
  })('electron/gameLaunchService.ts')
  await assert.rejects(broken.launchExecutable(executable, () => {}), /EACCES/)
})

test('network bridge enforces web schemes, safe methods, size limits and abort propagation', async t => {
  const originalFetch = global.fetch
  t.after(() => { global.fetch = originalFetch })
  const { requestText } = loadTs({ './ipcSecurity': { ipcMain: {} } })('electron/networkService.ts')
  await assert.rejects(requestText({ url: 'file:///secret' }), /HTTP/)
  await assert.rejects(requestText({ url: 'https://example.com', method: 'POST' }), /HTTP/)
  await assert.rejects(requestText({ url: 'https://example.com', headers: { Host: 'evil.invalid' } }), /header/)
  global.fetch = async (_url, options) => {
    assert.equal(options.method, 'GET')
    return new Response('hello', { status: 429, headers: { 'Retry-After': '5' } })
  }
  const result = await requestText({ url: 'https://example.com' })
  assert.equal(result.status, 429)
  assert.equal(result.body, 'hello')
  assert.equal(new Headers(result.headers).get('Retry-After'), '5')
  global.fetch = async () => new Response('no', { headers: { 'Content-Length': '999999999' } })
  await assert.rejects(requestText({ url: 'https://example.com' }), /maximum size/)
  const abort = new AbortController()
  global.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  const pending = requestText({ url: 'https://example.com' }, abort.signal)
  abort.abort()
  await assert.rejects(pending, /aborted/)
})

test('closing the desktop overlay preserves controller input for an open stream studio', () => {
  let stops = 0
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.kill = () => { stops++ }
  const load = loadTs({
    electron: { app: { getAppPath: () => '/app', getPath: () => '/user' } },
    fs: { existsSync: () => true },
    child_process: { spawn: () => child },
    './ipcSecurity': { ipcMain: { handle() {}, on() {} } },
    './metricsService': { stopMetricsService() {} },
    './inputService': { stopInputService() {} },
    './streamManager': {},
  })
  const gamepad = load('electron/gamepadService.ts')
  gamepad.acquireGamepadService('stream')
  gamepad.acquireGamepadService('overlay')
  const service = load('electron/overlayManager.ts')
  service.hideOverlay(true)
  assert.equal(stops, 0)
  gamepad.releaseGamepadService('stream')
  assert.equal(stops, 1)
})
