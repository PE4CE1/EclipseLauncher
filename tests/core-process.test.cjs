const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const loadTs = require('./download-loader.cjs')

const noops = new Proxy({}, { get: () => () => null })
const csv = (...processes) => processes.map(([exe, pid]) => `"${exe}","${pid}","Console","1","1,000 K"`).join('\r\n')

function fakeClock(t) {
  let now = 1_000_000
  const intervals = new Map()
  let nextTimer = 0
  t.mock.method(Date, 'now', () => now)
  t.mock.method(global, 'setInterval', callback => { const id = ++nextTimer; intervals.set(id, callback); return id })
  t.mock.method(global, 'clearInterval', id => intervals.delete(id))
  t.mock.method(global, 'setTimeout', () => ++nextTimer)
  t.mock.method(global, 'clearTimeout', () => {})
  return { intervals, advance: milliseconds => { now += milliseconds } }
}

function monitorFixture(t, options = {}) {
  const platform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { ...platform, value: 'win32' })
  t.after(() => Object.defineProperty(process, 'platform', platform))
  const clock = fakeClock(t)
  const pending = []
  const records = []
  const events = []
  const module = loadTs({
    electron: { app: { getPath: () => __dirname } },
    fs: options.fs || { existsSync: () => false, promises: { readdir: async () => [] } },
    child_process: { execSync: () => { throw new Error('No installed launchers in fixture') }, execFile: (binary, args, _options, callback) => {
      if (binary === 'reg.exe') { queueMicrotask(() => callback(options.steamPath ? null : new Error('No Steam in fixture'), options.steamPath ? `SteamPath    REG_SZ    ${options.steamPath}` : '')); return }
      pending.push({ args, callback })
    } },
    './discordRPC': options.discordRPC || noops, './overlayManager': noops, './rlService': options.rlService || noops,
    './metricsService': noops, './gameFpsService': noops, './robloxService': options.robloxService || noops,
    './autoClipService': noops, './robloxAntiAfkService': noops, './memoryOptimizerService': noops,
    './main': noops,
    './nonSteamDiscovery': { epicManifestDirectory: async () => 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests', discoverRiotGames: async () => [], insideInstallation: (root, exe) => require('node:path').join(root, exe) },
    './playtimeService': { addPlaytimeRecord: (...record) => records.push(record) },
  })('electron/processMonitor.ts')
  const window = { webContents: { send: (...event) => events.push(event), setFrameRate() {} }, isDestroyed: () => false, isMinimized: () => false }
  module.updateSettingsInMemory({ discordEnabled: false, showIdle: false, showDownloads: false, gamePerformanceMode: false, autoRestoreOnGameStop: false })
  module.startProcessMonitor(() => window)
  t.after(module.stopProcessMonitor)
  const tick = () => [...clock.intervals.values()][0]()
  const snapshot = async (body, error = null) => {
    tick()
    const request = pending.shift()
    assert.ok(request, 'A process snapshot should be requested')
    await request.callback(error, body)
  }
  return { ...module, clock, pending, records, events, tick, snapshot }
}

function steamDiscoveryFixture(t) {
  let release, started, completed
  const waiting = new Promise(resolve => { release = resolve })
  const scanning = new Promise(resolve => { started = resolve })
  const finished = new Promise(resolve => { completed = resolve })
  let fileReads = 0
  const dir = name => ({ name, isFile: () => false, isDirectory: () => true })
  const exe = name => ({ name, isFile: () => true, isDirectory: () => false })
  const monitor = monitorFixture(t, {
    steamPath: 'C:\\Steam',
    fs: {
      existsSync: () => false,
      readFileSync: () => assert.fail('Bulk startup discovery must use asynchronous file reads'),
      readdirSync: () => assert.fail('Bulk startup discovery must use asynchronous directory reads'),
      promises: {
        readdir: async location => {
          if (location.endsWith('steamapps')) {
            started()
            await waiting
            return Array.from({ length: 590 }, (_, index) => `appmanifest_${index + 1}.acf`)
          }
          if (location.includes('EpicGamesLauncher')) { completed(); return [] }
          if (location.endsWith('bin')) return [exe('fixture-game.exe')]
          return [dir('bin'), dir('_CommonRedist')]
        },
        readFile: async () => { fileReads++; return '"name" "Fixture Steam Game" "installdir" "Fixture"' },
      },
    },
  })
  return { ...monitor, release, scanning, finished, fileReads: () => fileReads }
}

test('large asynchronous startup discovery allows process snapshots while disk access is pending', async t => {
  const monitor = steamDiscoveryFixture(t)
  await monitor.scanning
  await monitor.snapshot(csv(['fixture-game.exe', 123]))
  assert.equal(monitor.getCurrentDetectedGame(), null)
  monitor.release()
  await monitor.finished
  assert.equal(monitor.fileReads(), 590)
  await monitor.snapshot(csv(['fixture-game.exe', 123]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Fixture Steam Game')
})

test('stopping startup discovery during disk access prevents subsequent manifest reads and late registration', async t => {
  const monitor = steamDiscoveryFixture(t)
  await monitor.scanning
  monitor.stopProcessMonitor()
  monitor.release()
  await new Promise(setImmediate)
  assert.equal(monitor.fileReads(), 0)
  assert.equal(monitor.getCurrentDetectedGame(), null)
  assert.equal(monitor.events.some(([channel]) => channel === 'games:started'), false)
})

test('process monitoring preserves a session across bootstrap transitions and records it once', async t => {
  const monitor = monitorFixture(t)
  monitor.registerGameExe('test-bootstrap.exe', 'Test Game')
  monitor.registerGameExe('test-shipping.exe', 'Test Game')
  await monitor.snapshot(csv(['test-bootstrap.exe', 10000]))
  const startTime = monitor.getCurrentDetectedGame().startTime
  monitor.clock.advance(60_000)
  await monitor.snapshot(csv(['test-shipping.exe', 200]))
  assert.equal(monitor.getCurrentDetectedGame().startTime, startTime)
  assert.equal(monitor.getCurrentDetectedGame().exeName, 'test-shipping.exe')
  assert.equal(monitor.getCurrentDetectedGamePid(), 200)
  assert.equal(monitor.records.length, 0)
  assert.equal(monitor.events.filter(([channel]) => channel === 'games:started').length, 1)
  monitor.clock.advance(60_000)
  monitor.stopProcessMonitor()
  monitor.stopProcessMonitor()
  assert.equal(monitor.records.length, 1)
  assert.equal(monitor.records[0][2], 2)
})

test('failed process snapshots do not clear a running game or consume the process-exit grace period', async t => {
  const monitor = monitorFixture(t)
  monitor.registerGameExe('test-game.exe', 'Test Game')
  await monitor.snapshot(csv(['test-game.exe', 200]))
  for (let index = 0; index < 3; index++) await monitor.snapshot('', new Error('tasklist temporarily unavailable'))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Test Game')
  assert.equal(monitor.records.length, 0)
  await monitor.snapshot('')
  await monitor.snapshot('')
  assert.equal(monitor.getCurrentDetectedGame().name, 'Test Game')
  await monitor.snapshot('')
  assert.equal(monitor.getCurrentDetectedGame(), null)
  assert.equal(monitor.records.length, 1)
})

test('stopping while Roblox window verification is pending invalidates the asynchronous snapshot', async t => {
  const monitor = monitorFixture(t)
  monitor.tick()
  const snapshot = monitor.pending.shift().callback(null, csv(['RobloxPlayerBeta.exe', 123]))
  assert.equal(monitor.pending.length, 1)
  monitor.stopProcessMonitor()
  const verbose = '"RobloxPlayerBeta.exe","123","Console","1","1,000 K","Running","User","0:00:01","Roblox"'
  monitor.pending.shift().callback(null, verbose)
  await snapshot
  assert.equal(monitor.getCurrentDetectedGame(), null)
  assert.equal(monitor.getCurrentDetectedGamePid(), 0)
  assert.equal(monitor.events.some(([channel]) => channel === 'games:started'), false)
  assert.equal(monitor.records.length, 0)
})

test('generic Java processes cannot claim a Minecraft gaming session', async t => {
  const monitor = monitorFixture(t)
  await monitor.snapshot(csv(['java.exe', 100], ['javaw.exe', 200]))
  assert.equal(monitor.getCurrentDetectedGame(), null)
  assert.equal(monitor.events.some(([channel]) => channel === 'games:started'), false)
})

test('saved custom games publish their actual PID and known Steam artwork without a hardcoded game profile', async t => {
  const activities = []
  const discordRPC = new Proxy({}, { get: (_target, key) => (...args) => { if (key === 'setDiscordActivity') activities.push(args) } })
  const monitor = monitorFixture(t, { discordRPC })
  monitor.updateSettingsInMemory({ discordRpc: true, discordActivityStyle: 'playing' })
  assert.equal(monitor.registerInstalledGameRecords([
    { name: 'Independent Game', executable: 'D:\\Games\\Independent\\independent.exe', steamId: 123456 },
    { name: 'Installer', executable: 'setup.exe' },
    { name: 'Remote', executable: 'https://example.com/game.exe' },
  ]), 1)
  await monitor.snapshot(csv(['independent.exe', 34567]))
  assert.equal(activities.at(-1)[0], 'Independent Game')
  assert.equal(activities.at(-1)[4], 123456)
  assert.equal(activities.at(-1)[10], 34567)
  const started = activities.at(-1)[1]
  await monitor.snapshot(csv(['independent.exe', 45678]))
  assert.equal(activities.at(-1)[10], 45678)
  assert.equal(activities.at(-1)[1], started)
})

test('launch fallback cannot replace the friendly title of a registered game with its binary name', async t => {
  const monitor = monitorFixture(t)
  monitor.registerGameExe('D:\\Games\\named-shipping.exe', 'Friendly Game Title')
  assert.equal(monitor.registerGameExe('named-shipping.exe', 'named-shipping', undefined, true), false)
  await monitor.snapshot(csv(['named-shipping.exe', 54321]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Friendly Game Title')
  assert.throws(() => monitor.registerInstalledGameRecords(Array(2049).fill({})), /Invalid/)
})

test('Fortnite bootstrap and shipping processes form one uninterrupted session', async t => {
  const monitor = monitorFixture(t)
  monitor.registerGameExe('FortniteGame/Binaries/Win64/FortniteBootstrapper.exe', 'Fortnite')
  await monitor.snapshot(csv(['FortniteBootstrapper.exe', 5696], ['FortniteLauncher.exe', 21772]))
  const started = monitor.getCurrentDetectedGame().startTime
  monitor.clock.advance(12_000)
  for (let i = 0; i < 4; i++) await monitor.snapshot('')
  assert.equal(monitor.getCurrentDetectedGame().name, 'Fortnite')
  await monitor.snapshot(csv(['FortniteBootstrapper.exe', 5696], ['FortniteClient-Win64-Shipping_EAC_EOS.exe', 27176], ['FortniteClient-Win64-Shipping.exe', 28408]))
  assert.equal(monitor.getCurrentDetectedGame().startTime, started)
  assert.equal(monitor.getCurrentDetectedGamePid(), 28408)
  assert.equal(monitor.events.filter(([event]) => event === 'games:started').length, 1)
  for (let i = 0; i < 8; i++) await monitor.snapshot(csv(['FortniteBootstrapper.exe', 5696], ['FortniteClient-Win64-Shipping.exe', 28408]))
  assert.equal(monitor.getCurrentDetectedGamePid(), 28408)
  for (let i = 0; i < 3; i++) await monitor.snapshot(csv(['FortniteBootstrapper.exe', 5696], ['FortniteClient-Win64-Shipping_EAC_EOS.exe', 27176]))
  assert.equal(monitor.getCurrentDetectedGame(), null, 'Leftover bootstrap processes cannot keep Fortnite playing')
  await monitor.snapshot(csv(['FortniteBootstrapper.exe', 5696]))
  assert.equal(monitor.getCurrentDetectedGame(), null)
})

test('Valorant transitions to its protected game process without treating Riot Client as gameplay', async t => {
  const monitor = monitorFixture(t)
  await monitor.snapshot(csv(['RiotClientServices.exe', 20], ['LeagueClient.exe', 30]))
  assert.equal(monitor.getCurrentDetectedGame(), null)
  await monitor.snapshot(csv(['VALORANT.exe', 500]))
  const started = monitor.getCurrentDetectedGame().startTime
  await monitor.snapshot(csv(['VALORANT.exe', 500], ['VALORANT-Win64-Shipping.exe', 200]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'VALORANT')
  assert.equal(monitor.getCurrentDetectedGame().startTime, started)
  assert.equal(monitor.getCurrentDetectedGamePid(), 200)
})

test('process snapshots accept LF line endings and preserve a verified PID among duplicate names', async t => {
  const monitor = monitorFixture(t)
  await monitor.snapshot(csv(['FortniteClient-Win64-Shipping.exe', 400]))
  await monitor.snapshot(csv(['FortniteClient-Win64-Shipping.exe', 200], ['FortniteClient-Win64-Shipping.exe', 400], ['explorer.exe', 30]).replaceAll('\r\n', '\n'))
  assert.equal(monitor.getCurrentDetectedGamePid(), 400)
  for (let i = 0; i < 4; i++) await monitor.snapshot('invalid truncated process output')
  assert.equal(monitor.getCurrentDetectedGamePid(), 400)
})

test('nested manifest executables register by basename and canceled Fortnite launches expire', async t => {
  const monitor = monitorFixture(t)
  monitor.registerGameExe('Binaries/Win64/fixture-shipping.exe', 'Nested Epic Game')
  await monitor.snapshot(csv(['fixture-shipping.exe', 100]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Nested Epic Game')
  monitor.resetCurrentDetectedGame()
  await monitor.snapshot(csv(['FortniteBootstrapper.exe', 300]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Fortnite')
  monitor.clock.advance(95_000)
  for (let i = 0; i < 3; i++) await monitor.snapshot(csv(['FortniteBootstrapper.exe', 300]))
  assert.equal(monitor.getCurrentDetectedGame(), null)
})

test('newly observed games can displace a session despite having smaller reused Windows PIDs', async t => {
  const monitor = monitorFixture(t)
  monitor.registerGameExe('test-first.exe', 'First Game')
  monitor.registerGameExe('test-second.exe', 'Second Game')
  await monitor.snapshot(csv(['test-first.exe', 50000]))
  await monitor.snapshot(csv(['test-first.exe', 50000], ['test-second.exe', 100]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Second Game')
  await monitor.snapshot(csv(['test-first.exe', 50000], ['test-second.exe', 100]))
  assert.equal(monitor.getCurrentDetectedGame().name, 'Second Game')
})

function robloxFixture(t) {
  const originalLocalAppData = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = __dirname
  t.after(() => {
    if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA
    else process.env.LOCALAPPDATA = originalLocalAppData
  })
  const clock = fakeClock(t)
  const records = []
  let log = 'placeid:987654321 universeid:876543210'
  let delayDetails = false
  const pending = []
  const module = loadTs({
    electron: {}, './ipcSecurity': { ipcMain: {} },
    fs: { existsSync: () => true, readdirSync: () => ['Player_fixture.log'], statSync: () => ({ mtimeMs: Date.now() }), readFileSync: () => log },
    './processMonitor': { isRobloxRunning: () => true },
    './playtimeService': { addPlaytimeRecord: (...record) => records.push(record) },
    https: { get: (url, _options, callback) => {
      const respond = () => {
        const response = new EventEmitter(); response.statusCode = 200; callback(response)
        response.emit('data', JSON.stringify(url.includes('games.roblox.com') ? { data: [{ name: 'Test Experience' }] } : { data: [{ imageUrl: 'https://example.com/icon.png' }] }))
        response.emit('end')
      }
      if (delayDetails) pending.push(respond)
      else queueMicrotask(respond)
      const request = new EventEmitter(); request.destroy = () => {}; return request
    } },
  })('electron/robloxService.ts')
  t.after(module.stopRobloxTracker)
  return { ...module, clock, records, pending, setLog: value => { log = value }, delayDetails: () => { delayDetails = true } }
}

test('Roblox minute ticks, explicit flush and tracker stop persist each elapsed interval once', async t => {
  const tracker = robloxFixture(t)
  await tracker.syncRobloxExperience()
  tracker.clock.advance(90_000)
  await tracker.syncRobloxExperience()
  tracker.flushRobloxExperiencePlaytime()
  tracker.flushRobloxExperiencePlaytime()
  tracker.stopRobloxTracker()
  assert.equal(tracker.records.length, 2)
  assert.equal(tracker.records.reduce((sum, record) => sum + record[2], 0), 1.5)
})

test('stopping during an experience switch cannot count the previous Roblox interval twice or resurrect tracking', async t => {
  const tracker = robloxFixture(t)
  await tracker.syncRobloxExperience()
  tracker.clock.advance(90_000)
  tracker.delayDetails()
  tracker.setLog('placeid:987654322 universeid:876543211')
  const pending = tracker.syncRobloxExperience()
  assert.equal(tracker.pending.length, 2)
  tracker.stopRobloxTracker()
  for (const respond of tracker.pending) respond()
  await pending
  assert.equal(tracker.getCurrentRobloxExperience(), null)
  assert.equal(tracker.records.reduce((sum, record) => sum + record[2], 0), 1.5)
})

test('concurrent Roblox experience refreshes share one lookup and one active session', async t => {
  const tracker = robloxFixture(t)
  tracker.delayDetails()
  const first = tracker.syncRobloxExperience()
  const second = tracker.syncRobloxExperience()
  assert.equal(first, second)
  assert.equal(tracker.pending.length, 2)
  for (const respond of tracker.pending) respond()
  await Promise.all([first, second])
  tracker.clock.advance(60_000)
  tracker.stopRobloxTracker()
  assert.equal(tracker.records.length, 1)
  assert.equal(tracker.records[0][2], 1)
})

test('Rocket League HUD can start and stop immediately during an already running game',async t=>{
  const starts=[],configured=[];let stops=0
  const monitor=monitorFixture(t,{rlService:{configureRLService:settings=>configured.push(settings),startRLService:(callback,playlist)=>starts.push({callback,playlist}),stopRLService(){stops++}}})
  monitor.registerGameExe('fixture-rocket.exe','Rocket League')
  await monitor.snapshot(csv(['fixture-rocket.exe',123]))
  assert.equal(starts.length,0)
  monitor.syncOverlaySettingsLive({overlayRLHud:true,rlPlaylist:'2v2',rlPlayerId:'Epic|fixture|0',discordEnabled:false})
  assert.equal(starts.length,1)
  await monitor.snapshot(csv(['fixture-rocket.exe',123]))
  assert.equal(starts.length,1,'Process polling must reuse the running stats service')
  monitor.syncOverlaySettingsLive({overlayRLHud:false})
  assert.equal(stops,1)
  monitor.syncOverlaySettingsLive({overlayRLHud:true,rlPlaylist:'1v1'})
  assert.equal(starts.length,2);assert.equal(starts[1].playlist,'1v1')
})

test('Discord settings take effect immediately and only native games outrank launcher downloads', async t => {
  const calls = []
  const discordRPC = Object.fromEntries(['setDiscordEnabled', 'setDiscordVersionVisible', 'setDiscordActivity', 'setDiscordIdleActivity', 'setDiscordDownloadActivity', 'clearDiscordActivity', 'refreshDiscordActivity'].map(name => [name, (...args) => calls.push({ name, args })]))
  const monitor = monitorFixture(t, { discordRPC })
  const latest = () => calls.filter(call => ['setDiscordActivity', 'setDiscordIdleActivity', 'setDiscordDownloadActivity', 'clearDiscordActivity'].includes(call.name)).at(-1)
  monitor.syncOverlaySettingsLive({ discordRpc: true, discordRpcIdle: true, discordRpcShowDownloads: true })
  assert.equal(latest().name, 'setDiscordIdleActivity')
  monitor.setLauncherDownloadActivity('Downloaded Game')
  assert.equal(latest().name, 'setDiscordDownloadActivity')
  assert.equal(latest().args[0], 'Downloaded Game')
  monitor.registerGameExe('fixture-first.exe', 'Rocket League')
  monitor.registerGameExe('fixture-second.exe', 'VALORANT')
  await monitor.snapshot(csv(['fixture-first.exe', 100]))
  assert.equal(latest().args[0], 'Rocket League')
  const started = latest().args[1]
  monitor.syncOverlaySettingsLive({ discordRpcPrivacyMode: true, discordActivityStyle: 'playing', discordRpcAnimatedText: true })
  assert.deepEqual(latest().args.slice(0, 4), ['Rocket League', started, true, 'playing'])
  assert.equal(latest().args[9], true)
  monitor.setLauncherDownloadActivity('Other Download')
  assert.equal(latest().args[0], 'Rocket League')
  monitor.syncOverlaySettingsLive({ discordRpc: false })
  assert.equal(latest().name, 'clearDiscordActivity')
  monitor.setLauncherDownloadActivity(null)
  await monitor.snapshot(csv(['fixture-first.exe', 100]))
  assert.equal(latest().name, 'clearDiscordActivity')
  monitor.syncOverlaySettingsLive({ discordRpc: true })
  assert.equal(latest().args[0], 'Rocket League')
  assert.equal(latest().args[1], started)
  monitor.clock.advance(3000)
  await monitor.snapshot(csv(['fixture-first.exe', 100], ['fixture-second.exe', 200]))
  assert.equal(latest().args[0], 'VALORANT')
  assert.ok(latest().args[1] > started)
  monitor.resetCurrentDetectedGame()
  assert.equal(latest().name, 'setDiscordIdleActivity', 'Manual reset clears the previous game immediately')
  monitor.setLauncherDownloadActivity('Fresh Download')
  monitor.syncOverlaySettingsLive({ discordRpcShowDownloads: false })
  assert.equal(latest().name, 'setDiscordIdleActivity')
  monitor.syncOverlaySettingsLive({ discordRpcIdle: false })
  assert.equal(latest().name, 'clearDiscordActivity')
})

test('removing the Discord Roblox subscriber preserves other subscribers and experience playtime', async t => {
  const tracker = robloxFixture(t), first = [], second = []
  const discord = value => first.push(value)
  const studio = value => second.push(value)
  tracker.startRobloxTracker(studio)
  await tracker.syncRobloxExperience()
  tracker.startRobloxTracker(discord)
  await flushMicrotasks()
  const experience = tracker.getCurrentRobloxExperience()
  assert.ok(experience)
  tracker.stopRobloxTracker(discord)
  assert.equal(tracker.getCurrentRobloxExperience(), experience)
  assert.equal(tracker.clock.intervals.size, 1)
  tracker.clock.advance(60_000)
  await tracker.syncRobloxExperience()
  tracker.stopRobloxTracker(studio)
  assert.equal(tracker.getCurrentRobloxExperience(), null)
  assert.equal(tracker.clock.intervals.size, 0)
  assert.equal(tracker.records.reduce((sum, record) => sum + record[2], 0), 1)
})

function flushMicrotasks() { return new Promise(setImmediate) }

test('re-enabling Roblox detail detection cannot revive a stale experience or update a stopped game', async t => {
  const calls = [], subscribers = []
  const discordRPC = Object.fromEntries(['setDiscordEnabled', 'setDiscordVersionVisible', 'setDiscordActivity', 'setDiscordIdleActivity', 'setDiscordDownloadActivity', 'clearDiscordActivity', 'refreshDiscordActivity'].map(name => [name, (...args) => calls.push({ name, args })]))
  const monitor = monitorFixture(t, { discordRPC, robloxService: {
    startRobloxTracker: callback => subscribers.push(callback), stopRobloxTracker() {}, flushRobloxExperiencePlaytime() {},
  } })
  const latest = () => calls.filter(call => ['setDiscordActivity', 'setDiscordIdleActivity', 'clearDiscordActivity'].includes(call.name)).at(-1)
  monitor.syncOverlaySettingsLive({ discordRpc: true, discordRpcIdle: true, discordRpcRobloxSubGame: true })
  monitor.registerGameExe('fixture-player.exe', 'Roblox')
  await monitor.snapshot(csv(['fixture-player.exe', 100]))
  subscribers[0]({ name: 'Previous Experience', placeId: '123', universeId: '456', iconUrl: 'https://example.com/previous.png' })
  assert.equal(latest().args[0], 'Previous Experience')
  monitor.syncOverlaySettingsLive({ discordRpc: false })
  assert.equal(latest().name, 'clearDiscordActivity')
  monitor.syncOverlaySettingsLive({ discordRpc: true })
  assert.equal(latest().args[0], 'Roblox', 'Use base game until the current experience has actually resolved')
  subscribers.at(-1)({ name: 'Current Experience', placeId: '234', universeId: '567' })
  assert.equal(latest().args[0], 'Current Experience')
  subscribers.at(-1)(null)
  assert.equal(latest().args[0], 'Roblox')
  monitor.resetCurrentDetectedGame()
  subscribers[0]({ name: 'Late Experience', placeId: '345', universeId: '678' })
  assert.equal(latest().name, 'setDiscordIdleActivity')
})
