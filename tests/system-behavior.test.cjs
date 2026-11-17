const test = require('node:test'), assert = require('node:assert/strict'), { EventEmitter } = require('node:events')
const load = require('./download-loader.cjs'), flush = () => new Promise(setImmediate)

test('RAM targets are bounded and relief is requested before the target with a cooldown', () => {
  const { normalizeMemoryTarget, memoryReliefDue } = load()('src/services/memoryBudget.ts')
  for (const value of [undefined, -1, 12, NaN, Infinity, '512', 99999]) assert.equal(normalizeMemoryTarget(value), 1024)
  for (const value of [0, 128, 192, 256, 768, 8192]) assert.equal(normalizeMemoryTarget(value), value)
  assert.equal(memoryReliefDue(460, 512, 1000, null), false)
  assert.equal(memoryReliefDue(461, 512, 1000, null), true)
  assert.equal(memoryReliefDue(900, 0, 1000, null), false)
  assert.equal(memoryReliefDue(900, 512, 2000, 1000), false)
  assert.equal(memoryReliefDue(900, 512, 61000, 1000), true)
})

test('automatic memory relief never empties working sets or repeatedly interrupts an active window', async t => {
  let tick, target = 512, now = 100000, sent = 0
  t.mock.method(Date, 'now', () => now)
  t.mock.method(global, 'setInterval', fn => { tick = fn; return { unref() {} } })
  t.mock.method(global, 'clearInterval', () => {})
  const service = load({ electron: {
    app: { getAppMetrics: () => [{ pid: 123, memory: { workingSetSize: 600 * 1024, privateBytes: 500 * 1024 } }] },
    BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { isDestroyed: () => false, isCrashed: () => false, send: channel => { assert.equal(channel, 'memory:pressure'); sent++ } } }] },
  }, child_process: { execFile: () => assert.fail('Automatic relief must not page out Electron working sets') } })('electron/memoryOptimizerService.ts')
  service.startMemoryOptimizer(() => null, () => target)
  await Promise.all([tick(), tick()]); assert.equal(sent, 1)
  now += 60000; await tick(); assert.equal(sent, 2)
  target = 0; now += 60000; await tick(); assert.equal(sent, 2)
  assert.equal((await service.getMemoryBudgetStatus()).targetMB, 0)
  service.stopMemoryOptimizer()
})

test('memory pressure releases only inactive idle queries, preserving visible data and pending requests', async t => {
  const { QueryClient, QueryObserver } = require('@tanstack/react-query')
  const previousWindow = global.window, previousDocument = global.document
  let callback, cancelled = 0, media = 0, browsing = 0, finish
  global.window = { electronAPI: { onMemoryPressure: fn => { callback = fn; return () => cancelled++ } } }
  global.document = { hidden: true }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  client.setQueryData(['visible'], 'keep'); client.setQueryData(['disabled-visible'], 'also keep'); client.setQueryData(['steam', 'old'], 'release')
  const observer = new QueryObserver(client, { queryKey: ['visible'], queryFn: () => 'keep', staleTime: Infinity })
  const unsubscribe = observer.subscribe(() => {})
  const disabledObserver = new QueryObserver(client, { queryKey: ['disabled-visible'], enabled: false })
  const unsubscribeDisabled = disabledObserver.subscribe(() => {})
  const pending = client.fetchQuery({ queryKey: ['pending'], queryFn: () => new Promise(resolve => { finish = resolve }) })
  const { observeMemoryPressure } = load({ '../store/uiStore': { useUIStore: { getState: () => ({ activeView: 'home' }) } }, './steamService': { releaseSteamBrowsingCaches: () => browsing++ }, './mediaMemory': { requestUnusedMediaRelease: () => media++ } })('src/services/rendererMemoryBudget.ts')
  const dispose = observeMemoryPressure(client)
  t.after(() => { dispose(); unsubscribe(); unsubscribeDisabled(); client.clear(); global.window = previousWindow; global.document = previousDocument })
  callback(); callback(); await new Promise(resolve => setTimeout(resolve, 15)); await flush()
  assert.equal(client.getQueryData(['visible']), 'keep'); assert.equal(client.getQueryData(['steam', 'old']), undefined)
  assert.equal(client.getQueryData(['disabled-visible']), 'also keep')
  assert.equal(client.getQueryState(['pending']).fetchStatus, 'fetching')
  assert.equal(media, 1); assert.equal(browsing, 1)
  finish('done'); await pending; dispose(); assert.ok(cancelled > 0)
})

function startupFixture(packaged = true) {
  const { createAutoLaunchSettings } = load()('electron/autoLaunchSettings.ts')
  const writes = [], queries = []
  let value = { openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [] }
  const application = { isPackaged: packaged, setLoginItemSettings: options => { writes.push(options); value = { openAtLogin: options.openAtLogin, executableWillLaunchAtLogin: options.openAtLogin && options.enabled, launchItems: options.openAtLogin ? [{ name: options.name, path: options.path, args: [], enabled: options.enabled, scope: 'user' }] : [] } }, getLoginItemSettings: options => { queries.push(options); return value } }
  return { service: createAutoLaunchSettings(application, 'C:\\Program Files\\Eclipse Launcher\\Eclipse Launcher.exe', 'win32'), writes, queries, state: next => { value = next } }
}
test('Windows startup writes and verifies the exact executable and flags, including minimized startup', () => {
  const f = startupFixture()
  assert.equal(f.service.apply(true, true).enabled, true)
  assert.deepEqual(f.writes[0].args, ['--autostart', '--hidden'])
  assert.equal(f.writes[0].path, 'C:\\Program Files\\Eclipse Launcher\\Eclipse Launcher.exe')
  assert.deepEqual(f.queries[0], { name: 'com.eclipse.launcher', path: f.writes[0].path, args: f.writes[0].args })
  f.service.apply(true, false); assert.deepEqual(f.writes[1].args, ['--autostart'])
  assert.equal(f.service.apply(false, false).registered, false)
  const dev = startupFixture(false); assert.equal(dev.service.apply(true, true).supported, false); assert.equal(dev.writes.length, 0)
})
test('reconciling startup respects Windows-disabled entries instead of re-enabling them', () => {
  const f = startupFixture()
  f.state({ openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [{ name: 'com.eclipse.launcher', path: 'C:\\Program Files\\Eclipse Launcher\\Eclipse Launcher.exe', args: [], enabled: false }] })
  assert.equal(f.service.reconcile(true, true).blocked, true); assert.equal(f.writes.length, 0)
})
test('startup only hides for an actual startup invocation and preferences roll back on failure', () => {
  const { shouldStartHidden, commitStartupSettings } = load()('electron/autoLaunchSettings.ts')
  assert.equal(shouldStartHidden(true, ['app.exe'], true), false)
  assert.equal(shouldStartHidden(true, ['app.exe', '--autostart'], true), true)
  assert.equal(shouldStartHidden(true, ['app.exe', '--autostart'], false), false)
  assert.equal(shouldStartHidden(false, ['electron.exe', '--hidden'], true), false)
  const calls = [], before = { startOnBoot: false, startMinimized: false }
  assert.throws(() => commitStartupSettings(before, { startOnBoot: true }, () => { throw Error('Disk full') }, (...args) => calls.push(args)), /Disk full/)
  assert.deepEqual(calls, [[true, false], [false, false]])
  assert.equal(before.startOnBoot, false)
  let disabledRestored = false
  assert.throws(() => commitStartupSettings(before, { startOnBoot: true }, () => { throw Error('Disk full') }, () => {}, () => { disabledRestored = true }))
  assert.equal(disabledRestored, true)
  assert.throws(() => commitStartupSettings(before, { startOnBoot: 'yes' }, () => assert.fail('Invalid settings must not save'), () => {}))
})

function fakeWindow() {
  const window = new EventEmitter(), contents = new EventEmitter(), events = []
  Object.assign(contents, { isDestroyed: () => false, isCrashed: () => false, send: (...data) => events.push(data), invalidate() {} })
  Object.assign(window, { webContents: contents, visible: false, minimized: false, focused: false, destroyed: false, reloads: 0,
    isDestroyed: () => window.destroyed, isVisible: () => window.visible, isMinimized: () => window.minimized, isFocused: () => window.focused,
    restore() { window.minimized = false; window.emit('restore') }, show() { window.visible = true; window.emit('show') }, focus() { window.focused = true; window.emit('focus') }, setSkipTaskbar() {}, reload() { window.reloads++ },
  })
  return { window, events }
}
test('delayed startup callbacks cannot reopen a minimized or hidden window; tray reveal always restores it', t => {
  let fallback
  t.mock.method(global, 'setTimeout', callback => { fallback = callback; return { unref() {} } })
  t.mock.method(global, 'clearTimeout', () => {})
  const { bindMainWindowLifecycle } = load()('electron/mainWindowLifecycle.ts'), f = fakeWindow()
  const lifecycle = bindMainWindowLifecycle(f.window, false)
  f.window.emit('ready-to-show'); assert.equal(f.window.visible, true)
  f.window.visible = false; f.window.minimized = true; f.window.emit('minimize')
  fallback(); f.window.webContents.emit('did-finish-load'); assert.equal(f.window.visible, false)
  lifecycle.reveal(); assert.equal(f.window.visible, true); assert.equal(f.window.minimized, false); assert.equal(f.window.focused, true)
  assert.equal(f.events.at(-1)[0], 'app:restored')
  f.window.emit('closed'); assert.equal(f.window.listenerCount('restore'), 0)
})
test('startup in tray stays hidden and renderer crash recovery is bounded', t => {
  t.mock.method(global, 'setTimeout', () => ({ unref() {} })); t.mock.method(global, 'clearTimeout', () => {})
  const { bindMainWindowLifecycle } = load()('electron/mainWindowLifecycle.ts'), f = fakeWindow()
  const lifecycle = bindMainWindowLifecycle(f.window, true)
  f.window.emit('ready-to-show'); f.window.webContents.emit('did-finish-load'); assert.equal(f.window.visible, false)
  for (let n = 0; n < 6; n++) f.window.webContents.emit('render-process-gone', {}, { reason: 'oom' })
  assert.equal(f.window.reloads, 2)
  lifecycle.reveal(); assert.equal(f.window.visible, true); f.window.emit('closed')
})

test('focus or visibility repairs a missed restore event and ignores a stale initial snapshot', async t => {
  const previousWindow = global.window, previousDocument = global.document
  const classes = new Set(), document = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => true, body: { classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name) } } })
  const callbacks = {}; let finish
  global.document = document
  global.window = Object.assign(new EventTarget(), { electronAPI: { onAppMinimized: fn => { callbacks.min = fn; return () => {} }, onAppRestored: fn => { callbacks.res = fn; return () => {} }, getWindowState: () => new Promise(resolve => { finish = resolve }) } })
  const { observeWindowActivity } = load()('src/hooks/useWindowActivity.ts'), states = [], dispose = observeWindowActivity(value => states.push(value))
  t.after(() => { dispose(); global.window = previousWindow; global.document = previousDocument })
  callbacks.min(); assert.equal(classes.has('app-minimized'), true)
  global.window.dispatchEvent(new Event('focus')); assert.equal(classes.has('app-minimized'), false)
  finish({ visible: false, minimized: true, focused: false }); await flush(); assert.equal(classes.has('app-minimized'), false)
  for (let i = 0; i < 10; i++) { callbacks.min(); document.dispatchEvent(new Event('visibilitychange')); assert.equal(classes.has('app-minimized'), false) }
  assert.equal(states.at(-1), true)
})

test('an out-of-memory renderer releases its cap before reload and coalesces repeated crash events', async () => {
  const { bindMainWindowLifecycle } = load()('electron/mainWindowLifecycle.ts'), f = fakeWindow()
  let finish, attempts = 0
  bindMainWindowLifecycle(f.window, true, async () => { attempts++; return new Promise(resolve => { finish = resolve }) })
  f.window.webContents.emit('render-process-gone', {}, { reason: 'oom' })
  f.window.webContents.emit('render-process-gone', {}, { reason: 'oom' })
  assert.equal(attempts, 1); assert.equal(f.window.reloads, 0)
  finish(true); await flush(); await flush()
  assert.equal(f.window.reloads, 1)
  f.window.emit('closed')
})

test('brief renderer stalls cancel recovery once responsive and persistent stalls release memory first', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { bindMainWindowLifecycle } = load()('electron/mainWindowLifecycle.ts'), f = fakeWindow()
  let attempts = 0
  bindMainWindowLifecycle(f.window, true, async () => { attempts++; return true })
  f.window.emit('unresponsive'); t.mock.timers.tick(2000); f.window.emit('responsive'); t.mock.timers.tick(2000)
  assert.equal(attempts, 0)
  f.window.emit('unresponsive'); t.mock.timers.tick(3001); await flush(); await flush()
  assert.equal(attempts, 1); assert.equal(f.window.reloads, 1)
  f.window.emit('closed')
})
